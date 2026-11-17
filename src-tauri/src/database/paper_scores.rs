use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};

use crate::{
    domain::paper::{PaperScore, PaperScoreResult},
    error::{AppError, AppResult, ErrorCode},
};

fn read_failure() -> AppError {
    AppError::new(ErrorCode::DatabaseReadFailed, "论文评分记录无法读取。")
}

fn write_failure() -> AppError {
    AppError::new(ErrorCode::DatabaseWriteFailed, "论文评分记录无法保存。")
}

fn validate(result: &PaperScoreResult) -> AppResult<()> {
    let valid_scores = [
        result.overall_score,
        result.innovation_score,
        result.rigor_score,
        result.scenario_score.unwrap_or_default(),
        result.reference_value_score,
        result.venue_score,
    ]
    .into_iter()
    .chain(
        result
            .keyword_scores
            .iter()
            .map(|item| item.innovation_score),
    )
    .all(|score| score <= 100);
    let unique_keywords = result
        .keyword_scores
        .iter()
        .map(|item| item.keyword.trim().to_lowercase())
        .collect::<std::collections::HashSet<_>>();
    let compatible_schema = matches!(result.schema_version.as_str(), "1" | "2")
        && (result.schema_version == "1" || result.scenario_score.is_some());
    if !compatible_schema
        || !valid_scores
        || !(1..=2).contains(&result.highlights.len())
        || !(1..=2).contains(&result.deficiencies.len())
        || result
            .highlights
            .iter()
            .chain(result.deficiencies.iter())
            .any(|item| item.trim().is_empty())
        || unique_keywords.len() != result.keyword_scores.len()
        || result
            .keyword_scores
            .iter()
            .any(|item| item.keyword.trim().is_empty())
    {
        return Err(AppError::new(
            ErrorCode::AiSchemaValidationFailed,
            "评分必须为 0–100，且亮点、缺陷各保留 1–2 条。",
        ));
    }
    Ok(())
}

pub fn get(connection: &Connection, paper_id: &str) -> AppResult<Option<PaperScore>> {
    connection
        .query_row(
            "SELECT provider,model,generated_at,updated_at,revision,edited,result_json FROM paper_scores WHERE paper_id=?1",
            [paper_id],
            |row| {
                let json: String = row.get(6)?;
                let result = serde_json::from_str(&json).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        6,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
                Ok(PaperScore {
                    result,
                    provider: row.get(0)?,
                    model: row.get(1)?,
                    generated_at: row.get(2)?,
                    updated_at: row.get(3)?,
                    revision: row.get(4)?,
                    edited: row.get::<_, i64>(5)? != 0,
                })
            },
        )
        .optional()
        .map_err(|_| read_failure())
}

pub fn table_exists(connection: &Connection) -> bool {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='paper_scores')",
            [],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false)
}

pub fn replace_generated(
    connection: &Connection,
    paper_id: &str,
    provider: &str,
    model: &str,
    result: &PaperScoreResult,
) -> AppResult<PaperScore> {
    validate(result)?;
    let now = Utc::now().to_rfc3339();
    let json = serde_json::to_string(result).map_err(|_| write_failure())?;
    connection
        .execute(
            "INSERT INTO paper_scores(paper_id,provider,model,generated_at,updated_at,revision,edited,result_json,original_json) VALUES(?1,?2,?3,?4,?4,0,0,?5,NULL) ON CONFLICT(paper_id) DO UPDATE SET provider=excluded.provider,model=excluded.model,generated_at=excluded.generated_at,updated_at=excluded.updated_at,revision=0,edited=0,result_json=excluded.result_json,original_json=NULL",
            params![paper_id, provider, model, now, json],
        )
        .map_err(|_| write_failure())?;
    get(connection, paper_id)?.ok_or_else(write_failure)
}

pub fn restore_cached(
    connection: &Connection,
    paper_id: &str,
    score: &PaperScore,
) -> AppResult<()> {
    validate(&score.result)?;
    connection
        .execute(
            "INSERT OR IGNORE INTO paper_scores(paper_id,provider,model,generated_at,updated_at,revision,edited,result_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![paper_id,score.provider,score.model,score.generated_at,score.updated_at,score.revision,i64::from(score.edited),serde_json::to_string(&score.result).map_err(|_| write_failure())?],
        )
        .map_err(|_| write_failure())?;
    Ok(())
}

pub fn edit(
    connection: &Connection,
    paper_id: &str,
    revision: i64,
    result: &PaperScoreResult,
) -> AppResult<PaperScore> {
    let mut result = result.clone();
    result.schema_version = "2".into();
    if result.scenario_score.is_none() {
        return Err(AppError::new(
            ErrorCode::AiSchemaValidationFailed,
            "请先填写场景合理性评分。",
        ));
    }
    result.overall_score = result.calculated_overall();
    validate(&result)?;
    let changed = connection
        .execute(
            "UPDATE paper_scores SET original_json=COALESCE(original_json,result_json),result_json=?1,updated_at=?2,revision=revision+1,edited=1 WHERE paper_id=?3 AND revision=?4",
            params![serde_json::to_string(&result).map_err(|_| write_failure())?,Utc::now().to_rfc3339(),paper_id,revision],
        )
        .map_err(|_| write_failure())?;
    if changed == 0 {
        return Err(AppError::new(
            ErrorCode::DatabaseWriteFailed,
            "评分已在其他位置更新，请刷新后重试。",
        ));
    }
    get(connection, paper_id)?.ok_or_else(write_failure)
}

pub fn restore(connection: &Connection, paper_id: &str, revision: i64) -> AppResult<PaperScore> {
    let changed = connection
        .execute(
            "UPDATE paper_scores SET result_json=original_json,original_json=NULL,updated_at=?1,revision=revision+1,edited=0 WHERE paper_id=?2 AND revision=?3 AND original_json IS NOT NULL",
            params![Utc::now().to_rfc3339(),paper_id,revision],
        )
        .map_err(|_| write_failure())?;
    if changed == 0 {
        return Err(AppError::new(
            ErrorCode::DatabaseWriteFailed,
            "没有可恢复的 AI 原始评分，或评分已被更新。",
        ));
    }
    get(connection, paper_id)?.ok_or_else(write_failure)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;

    fn result(score: u8) -> PaperScoreResult {
        PaperScoreResult {
            schema_version: "2".into(),
            overall_score: score,
            innovation_score: score,
            rigor_score: score,
            scenario_score: Some(score),
            reference_value_score: score,
            venue_score: score,
            highlights: vec!["亮点明确。".into()],
            deficiencies: vec!["证据范围有限。".into()],
            keyword_scores: vec![],
        }
    }

    #[test]
    fn preserves_generated_baseline_and_rejects_stale_edits() {
        let db = Database::in_memory().unwrap();
        let c = db.connection().unwrap();
        c.execute("INSERT INTO papers(id,file_path,file_name,title,created_at,updated_at) VALUES('p','p','p','p','now','now')", []).unwrap();
        let generated = replace_generated(&c, "p", "mock", "m", &result(62)).unwrap();
        let edited = edit(&c, "p", generated.revision, &result(70)).unwrap();
        assert!(edited.edited);
        assert!(edit(&c, "p", generated.revision, &result(71)).is_err());
        let restored = restore(&c, "p", edited.revision).unwrap();
        assert_eq!(restored.result.overall_score, 62);
        assert!(!restored.edited);
    }

    #[test]
    fn reads_legacy_score_without_inventing_a_scenario_score() {
        let db = Database::in_memory().unwrap();
        let c = db.connection().unwrap();
        c.execute("INSERT INTO papers(id,file_path,file_name,title,created_at,updated_at) VALUES('p','p','p','p','now','now')", []).unwrap();
        c.execute(
            "INSERT INTO paper_scores(paper_id,provider,model,generated_at,updated_at,revision,edited,result_json) VALUES('p','mock','m','now','now',0,0,?1)",
            [r#"{"schema_version":"1","overall_score":62,"innovation_score":62,"rigor_score":62,"reference_value_score":62,"venue_score":62,"highlights":["亮点明确。"],"deficiencies":["证据范围有限。"],"keyword_scores":[]}"#],
        ).unwrap();
        let legacy = get(&c, "p").unwrap().unwrap();
        assert_eq!(legacy.result.schema_version, "1");
        assert_eq!(legacy.result.scenario_score, None);
        assert_eq!(legacy.result.overall_score, 62);
    }
}
