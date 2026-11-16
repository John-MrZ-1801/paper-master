import { useEffect, useState } from "react";
import { invokeCommand, isTauriRuntime } from "../adapters/tauri/invokeCommand";
import type { DiagnosticSnapshot } from "../diagnostics/types";
import { ExternalIcon } from "../components/Icons";
import { LibraryCachePanel } from "../features/library/LibraryCachePanel";
import { APP_CONFIG } from "../config/appConfig";

const browserSnapshot: DiagnosticSnapshot = {
  application_version: APP_CONFIG.version, environment: "Browser preview", database_path: "Not available in browser preview", database_status: "Preview data", migration_version: 0,
  lm_studio_base_url: "http://127.0.0.1:1234/v1", lm_studio_status: "disconnected", current_model: "paper-master-mock-v1", paper_count: 4, analyzed_paper_count: 2,
  last_ai_request_status: "Mock analysis succeeded", last_import_status: "No import in this session", recent_errors: [], log_file_location: "Available in Tauri development mode",
};

export function DiagnosticsPage({ onNotify, active = true }: { active?: boolean; onNotify(tone: "success" | "error" | "info", title: string, message?: string): void }) {
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot>(browserSnapshot);
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    try { setSnapshot(isTauriRuntime() ? await invokeCommand<DiagnosticSnapshot>("get_diagnostics") : browserSnapshot); }
    catch (error) { onNotify("error", "Diagnostics unavailable", error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (active) void refresh(); }, [active]);

  async function action(command: string, success: string) {
    try { if (isTauriRuntime()) await invokeCommand(command); onNotify("success", success); await refresh(); }
    catch (error) { onNotify("error", `${success} failed`, error instanceof Error ? error.message : String(error)); }
  }
  const stat = (label: string, value: React.ReactNode, tone?: string) => <div className="diagnostic-stat"><span>{label}</span><strong className={tone}>{value}</strong></div>;
  const analyzedRatio = snapshot.paper_count ? Math.round(snapshot.analyzed_paper_count / snapshot.paper_count * 100) : 0;
  return (
    <main className="page-shell diagnostics-page">
      <header className="page-header"><div><span className="eyebrow">LOCAL HEALTH & SUPPORT</span><h1>Diagnostics</h1><p>仅展示运行状态与计数，不暴露论文内容、提示词或密钥。</p></div><button className="button secondary" disabled={busy} onClick={refresh}>{busy && <span className="mini-spinner"/>}刷新状态</button></header>
      <section className="diagnostic-commandbar"><div><strong>快速检查</strong><span>遇到问题时先运行检查，再复制摘要。</span></div><div className="diagnostic-actions"><button className="button secondary" onClick={() => action("test_database", "Database check completed")}>检查数据库</button><button className="button secondary" onClick={() => action("check_ai_connection", "LM Studio check completed")}>检查 LM Studio</button><button className="button secondary" onClick={() => action("open_log_folder", "Log folder opened")}><ExternalIcon/>打开日志目录</button><button className="button primary" onClick={() => action("copy_diagnostic_summary", "Diagnostic summary copied")}>复制诊断摘要</button></div></section>
      <section className="diagnostics-overview" aria-label="系统状态概览">
        <article><span className={`health-dot ${snapshot.database_status === "OK" ? "good" : "warn"}`}/><div><small>DATABASE</small><strong>{snapshot.database_status}</strong><p>Schema v{snapshot.migration_version}</p></div></article>
        <article><span className={`health-dot ${snapshot.lm_studio_status === "connected" ? "good" : "warn"}`}/><div><small>LOCAL AI</small><strong>{snapshot.lm_studio_status.replaceAll("_", " ")}</strong><p>{snapshot.current_model || "未选择模型"}</p></div></article>
        <article><div className="diagnostic-ring" style={{"--progress":`${analyzedRatio*3.6}deg`} as React.CSSProperties}><strong>{analyzedRatio}%</strong></div><div><small>LIBRARY</small><strong>{snapshot.analyzed_paper_count} / {snapshot.paper_count}</strong><p>论文已完成 AI 分析</p></div></article>
      </section>
      <div className="diagnostics-grid">
        <LibraryCachePanel/>
        <section className="diagnostic-card application-card"><div className="diagnostic-card-heading"><div><span>01</span><h2>应用与数据</h2></div><small>本机运行环境</small></div>{stat("版本", snapshot.application_version)}{stat("环境", snapshot.environment)}{stat("数据库", snapshot.database_status, snapshot.database_status === "OK" ? "good" : undefined)}{stat("迁移版本", `v${snapshot.migration_version}`)}<div className="diagnostic-path"><span>数据库路径</span><code title={snapshot.database_path}>{snapshot.database_path}</code></div><div className="diagnostic-path"><span>日志文件</span><code title={snapshot.log_file_location}>{snapshot.log_file_location}</code></div></section>
        <section className="diagnostic-card ai-card"><div className="diagnostic-card-heading"><div><span>02</span><h2>本地 AI</h2></div><small>连接与最近请求</small></div>{stat("连接", snapshot.lm_studio_status.replaceAll("_", " "), snapshot.lm_studio_status === "connected" ? "good" : "warn")}{stat("当前模型", snapshot.current_model || "None")}{stat("最近请求", snapshot.last_ai_request_status)}<div className="diagnostic-path"><span>Base URL</span><code>{snapshot.lm_studio_base_url}</code></div></section>
        <section className="diagnostic-card library-card"><div className="diagnostic-card-heading"><div><span>03</span><h2>资料库</h2></div><small>导入与分析覆盖</small></div>{stat("论文", snapshot.paper_count)}{stat("AI 已分析", snapshot.analyzed_paper_count)}{stat("最近导入", snapshot.last_import_status)}<div className="library-analysis-bar"><span style={{width:`${analyzedRatio}%`}}/><small>{analyzedRatio}% 已完成</small></div></section>
        <section className="diagnostic-card errors-card"><div className="diagnostic-card-heading"><div><span>04</span><h2>最近错误</h2></div><strong>{snapshot.recent_errors.length}</strong></div>{snapshot.recent_errors.length ? snapshot.recent_errors.map((error, index) => <article key={`${error.timestamp}-${index}`}><div><strong>{error.error_code ?? error.operation}</strong><time>{new Date(error.timestamp).toLocaleTimeString()}</time></div><p>{error.message}</p><code>{error.module}{error.request_id ? ` · ${error.request_id}` : ""}</code></article>) : <div className="no-errors"><strong>本次会话没有记录错误</strong><span>如问题仍存在，可刷新状态或复制诊断摘要。</span></div>}</section>
      </div>
    </main>
  );
}
