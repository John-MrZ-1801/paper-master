use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    ai::{
        input_builder::PaperAnalysisInputBuilder, registry::AIRequestRegistry, AIProviderRegistry,
    },
    database::{
        paper_repository::{PaperRepository, SqlitePaperRepository},
        paper_scores,
        settings_storage::{SettingsStorage, SqliteSettingsStorage},
        Database,
    },
    domain::{
        ai::ScoreRequest,
        paper::{PaperScore, PaperScoreResult},
    },
    error::{AppError, AppResult, ErrorCode},
    services::progress::TaskProgress,
};

#[derive(Debug, Deserialize)]
pub struct ScoreBatchRequest {
    pub paper_ids: Vec<String>,
    pub request_id: String,
}

#[derive(Debug, Serialize)]
pub struct ScoreBatchSummary {
    pub scored: usize,
    pub skipped: usize,
    pub failed: usize,
}

#[tauri::command]
pub async fn score_paper(
    database: State<'_, Database>,
    providers: State<'_, AIProviderRegistry>,
    requests: State<'_, AIRequestRegistry>,
    request: ScoreRequest,
) -> AppResult<PaperScore> {
    let token = requests.register(&request.request_id);
    requests.report(TaskProgress::running(
        &request.request_id,
        "scoring",
        "等待评分资源",
    ));
    let result = async {
        let _permit = requests.acquire(&token).await?;
        requests.report(TaskProgress::running(
            &request.request_id,
            "scoring",
            "正在按严格标准评估论文与关键词",
        ));
        score_one(
            database.inner(),
            providers.inner(),
            &request.paper_id,
            token,
        )
        .await
    }
    .await;
    requests.remove(&request.request_id);
    finish_progress(requests.inner(), &request.request_id, &result);
    result
}

#[tauri::command]
pub async fn score_papers(
    database: State<'_, Database>,
    providers: State<'_, AIProviderRegistry>,
    requests: State<'_, AIRequestRegistry>,
    request: ScoreBatchRequest,
) -> AppResult<ScoreBatchSummary> {
    if request.paper_ids.is_empty() || request.paper_ids.len() > 5000 {
        return Err(AppError::new(
            ErrorCode::InvalidSettings,
            "批量评分需要选择 1–5000 篇论文。",
        ));
    }
    let mut ids = request.paper_ids;
    ids.sort();
    ids.dedup();
    let token = requests.register(&request.request_id);
    let total = ids.len() as u64;
    requests.report(
        TaskProgress::running(&request.request_id, "scoring", "准备批量 AI 评分").counts(
            0,
            Some(total),
            "files",
        ),
    );
    let result = async {
        let _permit = requests.acquire(&token).await?;
        let mut summary = ScoreBatchSummary {
            scored: 0,
            skipped: 0,
            failed: 0,
        };
        for (index, paper_id) in ids.iter().enumerate() {
            if token.is_cancelled() {
                return Err(AppError::new(
                    ErrorCode::AiCancelled,
                    "批量论文评分已取消。",
                ));
            }
            let already_scored = {
                let connection = database.connection()?;
                paper_scores::get(&connection, paper_id)?.is_some()
            };
            if already_scored {
                summary.skipped += 1;
            } else if score_one(database.inner(), providers.inner(), paper_id, token.clone())
                .await
                .is_ok()
            {
                summary.scored += 1;
            } else {
                summary.failed += 1;
            }
            requests.report(
                TaskProgress::running(
                    &request.request_id,
                    "scoring",
                    &format!(
                        "已评分 {}，已跳过 {}，失败 {}",
                        summary.scored, summary.skipped, summary.failed
                    ),
                )
                .counts(index as u64 + 1, Some(total), "files"),
            );
        }
        Ok(summary)
    }
    .await;
    requests.remove(&request.request_id);
    finish_progress(requests.inner(), &request.request_id, &result);
    result
}

async fn score_one(
    database: &Database,
    providers: &AIProviderRegistry,
    paper_id: &str,
    token: tokio_util::sync::CancellationToken,
) -> AppResult<PaperScore> {
    let (settings, paper, extracted_text) = {
        let connection = database.connection()?;
        let repository = SqlitePaperRepository::new(&connection);
        let paper = repository.find_by_id(paper_id)?.ok_or_else(|| {
            AppError::new(ErrorCode::FileNotFound, "所选论文已不在本地文献库中。")
        })?;
        let text = repository.extracted_text(paper_id)?;
        let settings = SqliteSettingsStorage::new(&connection).get()?;
        (settings, paper, text)
    };
    let input = PaperAnalysisInputBuilder::new(settings.max_analysis_input_characters)
        .build(&paper, &extracted_text)?;
    let provider = providers.get(settings.effective_provider())?;
    let response = tokio::select! {
        biased;
        _ = token.cancelled() => return Err(AppError::new(ErrorCode::AiCancelled, "论文评分已取消。")),
        result = provider.score_paper(&input, &paper.tags, &settings, token.clone()) => result?,
    };
    let model = response.model.unwrap_or_else(|| match provider.id() {
        "openai" => settings.api_model.clone(),
        "codex" => String::new(),
        _ => settings.model.clone(),
    });
    let connection = database.connection()?;
    paper_scores::replace_generated(
        &connection,
        paper_id,
        provider.id(),
        &model,
        &response.value,
    )
}

fn finish_progress<T>(requests: &AIRequestRegistry, request_id: &str, result: &AppResult<T>) {
    match result {
        Ok(_) => requests.report(
            TaskProgress::running(request_id, "scoring", "AI 评分已保存").finish("completed"),
        ),
        Err(error) => requests.report(
            TaskProgress::running(request_id, "scoring", &error.message).finish(
                if matches!(error.code, ErrorCode::AiCancelled) {
                    "cancelled"
                } else {
                    "failed"
                },
            ),
        ),
    }
}

#[tauri::command]
pub fn edit_paper_score(
    database: State<'_, Database>,
    paper_id: String,
    revision: i64,
    result: PaperScoreResult,
) -> AppResult<PaperScore> {
    let connection = database.connection()?;
    let paper = SqlitePaperRepository::new(&connection)
        .find_by_id(&paper_id)?
        .ok_or_else(|| AppError::new(ErrorCode::FileNotFound, "所选论文已不存在。"))?;
    ensure_keyword_set(&paper.tags, &result)?;
    paper_scores::edit(&connection, &paper_id, revision, &result)
}

#[tauri::command]
pub fn restore_paper_score(
    database: State<'_, Database>,
    paper_id: String,
    revision: i64,
) -> AppResult<PaperScore> {
    let connection = database.connection()?;
    paper_scores::restore(&connection, &paper_id, revision)
}

fn ensure_keyword_set(keywords: &[String], result: &PaperScoreResult) -> AppResult<()> {
    let normalize = |value: &str| value.trim().to_lowercase();
    let expected = keywords
        .iter()
        .map(|item| normalize(item))
        .collect::<std::collections::HashSet<_>>();
    let actual = result
        .keyword_scores
        .iter()
        .map(|item| normalize(&item.keyword))
        .collect::<std::collections::HashSet<_>>();
    if expected != actual || actual.len() != result.keyword_scores.len() {
        return Err(AppError::new(
            ErrorCode::AiSchemaValidationFailed,
            "关键词评分只能修改分数，不能增删或重命名关键词。",
        ));
    }
    Ok(())
}
