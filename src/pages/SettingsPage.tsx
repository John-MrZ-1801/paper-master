import { useEffect, useState } from "react";
import type { AIProvider } from "../providers/ai/AIProvider";
import type { AppSettings, SettingsStorage } from "../settings/types";
import { DEFAULT_SETTINGS } from "../settings/InMemorySettingsStorage";
import { CheckIcon, ShieldIcon } from "../components/Icons";
import type { ConnectionResult } from "../domain/ai/types";
import { InlineTaskProgress } from "../components/TaskProgress";
import { progressService,taskId } from "../services/ProgressService";

interface Props {
  storage: SettingsStorage;
  providers: Record<string, AIProvider>;
  onSaved(settings: AppSettings): void;
  onNotify(tone: "success" | "error" | "info", title: string, message?: string): void;
}

export function SettingsPage({ storage, providers, onSaved, onNotify }: Props) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [models, setModels] = useState<string[]>([]);
  const [connection, setConnection] = useState<ConnectionResult>();
  const [busy, setBusy] = useState(false);
  const [initializing,setInitializing] = useState(true);
  const [progressId,setProgressId] = useState<string>();

  useEffect(() => {
    let current=true;setInitializing(true);
    void storage.get().then(value=>{if(current)setSettings(value);}).catch(()=>{if(current)setSettings(DEFAULT_SETTINGS);}).finally(()=>{if(current)setInitializing(false);});
    return()=>{current=false;};
  },[storage]);

  const provider = providers[settings.ai_provider];
  async function testConnection() {
    setBusy(true); setConnection(undefined);
    const id=taskId("settings");setProgressId(id);progressService.begin(id,"settings","检查 AI 服务","正在检查连接与登录状态");
    try {
      const discovered = await provider.checkConnection(settings);
      if (settings.ai_provider === "openai") { setModels(discovered.models);setConnection(discovered);progressService.finish(id,discovered.state === "connected"?"completed":"failed",discovered.message);return; }
      if (settings.ai_provider === "codex") { setConnection(discovered);progressService.finish(id,discovered.state === "connected"?"completed":"failed",discovered.message); return; }
      setModels(discovered.models);
      const selectedModel = discovered.models.includes(settings.model) ? settings.model : discovered.models[0] ?? "";
      const nextSettings = { ...settings, model: selectedModel };
      setSettings(nextSettings);
      progressService.update({id,kind:"settings",stage:"模型列表已读取，正在加载并检查所选模型"});
      const result = selectedModel ? await provider.loadModel(nextSettings) : discovered;
      setConnection(result);
      progressService.finish(id,result.state === "connected"?"completed":"failed",result.message);
    } catch (error) {
      progressService.finish(id,"failed",error instanceof Error?error.message:String(error));
      setConnection({ state: "connection_failed", message: error instanceof Error ? error.message : String(error), models: [], loaded_models: [] });
    } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true);
    const id=taskId("settings");setProgressId(id);progressService.begin(id,"settings","保存应用设置","正在校验并保存配置");
    try {
      const saved = await storage.save(settings);
      onSaved(saved); onNotify("success", "Settings saved", "Provider settings remain on this computer.");
      progressService.finish(id,"completed","设置已保存");
    } catch (error) { progressService.finish(id,"failed",error instanceof Error?error.message:String(error)); onNotify("error", "Settings were not saved", error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  return (
    <main className="page-shell settings-page">
      <header className="page-header"><div><span className="eyebrow">APPLICATION PREFERENCES</span><h1>设置</h1><p>按服务、隐私和模型参数分组管理；未保存的改动仅保留在当前会话。</p></div><button className="button primary" disabled={busy||initializing} onClick={save}>保存更改</button></header>
      <div className="settings-grid">
        {progressId&&<div className="settings-operation-progress"><InlineTaskProgress id={progressId}/></div>}
        <section className="settings-panel settings-main-panel">
          <div className="panel-heading"><div><span className="settings-step">01</span><h2>AI 与工作流</h2><p>先选择服务，再配置仅对该服务生效的连接方式。</p></div></div>
          <fieldset className="form-grid" disabled={busy||initializing}>
            <section className="settings-section full">
              <div className="settings-section-heading"><div><span>服务</span><h3>连接与自动化</h3></div><p>连接检查不会自动保存配置。</p></div>
              <div className="settings-section-fields">
                <label><span>AI Provider</span><select value={settings.ai_provider} onChange={(event) => { setConnection(undefined); setModels([]); setSettings({ ...settings, ai_provider: event.target.value as AppSettings["ai_provider"] }); }}><option value="lmstudio">LM Studio（本机）</option><option value="openai">其他 API（OpenAI 兼容）</option><option value="codex">Codex CLI（在线）</option><option value="mock">Mock（开发）</option></select></label>
                <label className="auto-analysis-toggle"><span><input type="checkbox" checked={settings.auto_analyze_on_import} onChange={(event) => setSettings({ ...settings, auto_analyze_on_import: event.target.checked })}/>首次导入后自动分析</span><small>任务进入持久队列，关闭应用后可在下次启动继续。</small></label>
                {settings.ai_provider !== "codex" && settings.ai_provider !== "openai" && <label className="full"><span>Base URL</span><input value={settings.base_url} disabled={settings.ai_provider === "mock"} onChange={(event) => setSettings({ ...settings, base_url: event.target.value })}/><small>LM Studio 仅允许 localhost 和 127.0.0.1。</small></label>}
                {settings.ai_provider === "openai" && <>
                  <label className="full"><span>API 地址（包含服务要求的前缀）</span><input placeholder="https://api.example.com/v1" value={settings.api_base_url} onChange={e=>setSettings({...settings,api_base_url:e.target.value})}/></label>
                  <label className="full"><span>API Key</span><input type="password" autoComplete="off" value={settings.api_key} onChange={e=>setSettings({...settings,api_key:e.target.value})}/><small>仅保存在本机应用设置；不会写入论文缓存、日志或发布包。</small></label>
                  <label className="full"><span>API 模型名称</span><input list="api-models" value={settings.api_model} onChange={e=>setSettings({...settings,api_model:e.target.value})}/><datalist id="api-models">{models.map(model=><option key={model} value={model}/>)}</datalist><small>可以手动填写；服务没有 /models 端点时仍可直接使用。</small></label>
                  <label><span>API 输出格式</span><select value={settings.api_response_format} onChange={e=>setSettings({...settings,api_response_format:e.target.value as AppSettings["api_response_format"]})}><option value="json_object">JSON Object（兼容）</option><option value="json_schema">JSON Schema（严格）</option></select></label>
                  <label className="auto-analysis-toggle"><span><input type="checkbox" checked={settings.api_reasoning_supported} onChange={e=>setSettings({...settings,api_reasoning_supported:e.target.checked})}/>支持 reasoning_effort</span></label>
                  <div className="settings-inline-action"><button className="button secondary" disabled={busy||settings.privacy_mode!=="codex_online"} onClick={testConnection}>测试 API 连接 / 读取模型</button><small>{settings.privacy_mode==="codex_online"?"将使用当前未保存的连接参数。":"先在下方启用联网授权。"}</small></div>
                </>}
                {settings.ai_provider === "lmstudio" && <label className="full auto-analysis-toggle"><span><input type="checkbox" checked={settings.adaptive_analysis} onChange={e=>setSettings({...settings,adaptive_analysis:e.target.checked})}/>启用自适应分析</span><small>整体语义基准 → 高参数直接分析 → 分级降参 → 全文分段；失败不会覆盖已有结果。</small></label>}
                {settings.ai_provider === "codex" ? <div className="full settings-provider-note"><p>使用本机已登录的 Codex CLI 默认模型；本地模型的温度和加载上下文不适用。</p><button className="button secondary" disabled={busy} onClick={testConnection}>检查 Codex 登录状态</button></div> : settings.ai_provider === "openai" ? null : <label className="full"><span>Model</span><div className="input-with-action"><select value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })}><option value="" disabled>请选择本地模型</option>{settings.model && !models.includes(settings.model) && <option value={settings.model}>{settings.model}</option>}{models.map((model) => <option key={model} value={model}>{model}</option>)}</select><button className="button secondary" disabled={busy} onClick={testConnection}>{busy ? <span className="mini-spinner"/> : null}加载并测试</button></div></label>}
                {connection && <div className={`connection-result full ${connection.state}`}><span className="connection-icon">{connection.state === "connected" ? <CheckIcon/> : "!"}</span><div><strong>{connection.state === "connected" ? settings.ai_provider === "openai" || settings.ai_provider === "codex" ? "连接成功" : "模型已加载" : connection.state === "model_not_loaded" ? "模型尚未加载" : "连接失败"}</strong><p>{connection.message}</p></div>{connection.latency_ms !== undefined && <span>{connection.latency_ms} ms</span>}</div>}
              </div>
            </section>

            <section className="settings-section full privacy-settings-section">
              <div className="settings-section-heading"><div><span>隐私</span><h3>联网授权边界</h3></div><strong className={settings.privacy_mode === "codex_online" ? "online" : "local"}>{settings.privacy_mode === "codex_online" ? "联网已授权" : "仅本地"}</strong></div>
              <label className="full auto-analysis-toggle privacy-toggle"><span><input type="checkbox" checked={settings.privacy_mode === "codex_online"} onChange={(event) => setSettings({ ...settings, privacy_mode: event.target.checked ? "codex_online" : "local_only" })}/>启用联网检索与在线 AI 服务</span><small>检索只发送需求和所选参考论文的有界题名/作者信息；在线分析会发送有界论文证据。API 密钥、数据库和完整原文不会进入诊断日志。</small></label>
            </section>

            <section className="settings-section full">
              <div className="settings-section-heading"><div><span>高级</span><h3>推理与资源上限</h3></div><p>控制单次请求的时间、输入和输出预算。</p></div>
              <div className="settings-section-fields">
                <label><span>Temperature</span><div className="range-row"><input type="range" min="0" max="1" step="0.05" value={settings.temperature} onChange={(event) => setSettings({ ...settings, temperature: Number(event.target.value) })}/><output>{settings.temperature.toFixed(2)}</output></div></label>
                <label><span>推理强度</span><select value={settings.reasoning_effort} onChange={(event) => setSettings({ ...settings, reasoning_effort: event.target.value as AppSettings["reasoning_effort"] })}><option value="none">关闭（推荐批量分析）</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="xhigh">极高</option></select><small>仅适用于支持该参数的服务。</small></label>
                <label><span>请求超时</span><div className="unit-input"><input type="number" min="30" max="600" value={settings.request_timeout_ms / 1000} onChange={(event) => setSettings({ ...settings, request_timeout_ms: Number(event.target.value) * 1000 })}/><span>秒</span></div></label>
                <label><span>最大分析输入</span><div className="unit-input"><input type="number" min="4000" max="100000" step="1000" value={settings.max_analysis_input_characters} onChange={(event) => setSettings({ ...settings, max_analysis_input_characters: Number(event.target.value) })}/><span>字符</span></div></label>
                <label><span>模型加载上下文</span><div className="unit-input"><input type="number" min="4096" max="131072" step="1024" value={settings.model_context_length} onChange={(event) => setSettings({ ...settings, model_context_length: Number(event.target.value) })}/><span>tokens</span></div><small>已加载模型需要在 LM Studio 卸载后重新加载。</small></label>
                <label><span>最大 AI 输出</span><div className="unit-input"><input type="number" min="512" max="32768" step="256" value={settings.max_output_tokens} onChange={(event) => setSettings({ ...settings, max_output_tokens: Number(event.target.value) })}/><span>tokens</span></div></label>
                <label><span>日志级别</span><select value={settings.log_level} onChange={(event) => setSettings({ ...settings, log_level: event.target.value as AppSettings["log_level"] })}>{["TRACE", "DEBUG", "INFO", "WARN", "ERROR"].map((level) => <option key={level}>{level}</option>)}</select></label>
              </div>
            </section>
          </fieldset>
        </section>
        <aside className="settings-side-stack">
          <section className="privacy-panel"><div className="privacy-icon"><ShieldIcon/></div><div><span className="eyebrow">PRIVACY STATUS</span><h2>{settings.privacy_mode === "codex_online" ? "联网服务已授权" : "本地分析"}</h2><p>{settings.privacy_mode === "codex_online" ? "联网检索、Codex 与外部 API 可处理明确授权的有界信息；关闭并保存后会阻止新的外部请求。" : "联网功能已关闭；外部 API 请求会被阻止，既有结果仍可查看和编辑。"}</p></div><ul><li><CheckIcon/>导入的原 PDF 保留原位置</li><li><CheckIcon/>API 密钥只保存在本机设置</li><li><CheckIcon/>无应用遥测或行为跟踪</li><li><CheckIcon/>日志不记录论文、提示词和密码</li></ul></section>
          <section className="settings-summary-card"><span className="eyebrow">CURRENT DRAFT</span><h2>当前配置摘要</h2><dl><dt>服务</dt><dd>{{lmstudio:"LM Studio",openai:"OpenAI 兼容 API",codex:"Codex CLI",mock:"Mock"}[settings.ai_provider]}</dd><dt>导入后分析</dt><dd>{settings.auto_analyze_on_import?"开启":"关闭"}</dd><dt>输出上限</dt><dd>{settings.max_output_tokens.toLocaleString()} tokens</dd><dt>日志</dt><dd>{settings.log_level}</dd></dl><p>点击“保存更改”后才会写入本机设置。</p></section>
        </aside>
      </div>
    </main>
  );
}
