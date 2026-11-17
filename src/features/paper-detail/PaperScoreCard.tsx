import { useEffect, useState } from "react";
import type { Paper, PaperScoreResult } from "../../domain/paper/Paper";
import type { ScoringService } from "../../services/ScoringService";
import { InlineTaskProgress } from "../../components/TaskProgress";

interface Props {
  paper: Paper;
  service: ScoringService;
  scoring: boolean;
  requestId?: string;
  onScore(): void;
  onCancel(): void;
  onChanged(): void;
}

const scoreFields = [
  ["innovation_score", "创新性", "37%"],
  ["rigor_score", "严谨性", "32%"],
  ["reference_value_score", "参考价值", "23%"],
  ["venue_score", "期刊 / 会议档次", "8%"],
] as const;

function scoreValue(value:string){const parsed=Number(value);return Number.isFinite(parsed)?Math.max(0,Math.min(100,Math.round(parsed))):0;}

export function PaperScoreCard({paper,service,scoring,requestId,onScore,onCancel,onChanged}:Props){
  const [draft,setDraft]=useState<PaperScoreResult>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string>();
  useEffect(()=>{setDraft(undefined);setError(undefined);},[paper.id,paper.score?.revision]);
  const score=paper.score;
  const perform=async(action:()=>Promise<unknown>)=>{setBusy(true);setError(undefined);try{await action();setDraft(undefined);onChanged();}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy(false);}};
  return <section className={`paper-score-card ${score?"has-score":"empty-score"}`} aria-labelledby="paper-score-heading">
    <div className="paper-score-heading"><div><span className="eyebrow">INDEPENDENT AI REVIEW</span><h2 id="paper-score-heading">论文评分</h2><p>评分与论文解析分开生成；AI 总分按创新性 37%、严谨性 32%、参考价值 23%、期刊 / 会议档次 8% 计算。</p></div>
      <div className="paper-score-actions">{scoring?<button className="button secondary" onClick={onCancel}>取消评分</button>:<button className="button primary" onClick={onScore}>{score?"重新评分":"AI 评分"}</button>}{score&&!draft&&<button className="button secondary" disabled={busy} onClick={()=>setDraft({schema_version:"1",overall_score:score.overall_score,innovation_score:score.innovation_score,rigor_score:score.rigor_score,reference_value_score:score.reference_value_score,venue_score:score.venue_score,highlights:[...score.highlights],deficiencies:[...score.deficiencies],keyword_scores:score.keyword_scores.map(item=>({...item}))})}>人工修改</button>}{score?.edited&&!draft&&<button className="button secondary" disabled={busy} onClick={()=>void perform(()=>service.restore(paper))}>恢复 AI 原始评分</button>}</div>
    </div>
    {scoring&&<InlineTaskProgress id={requestId} fallback="正在独立评估论文与关键词创新性。"/>}
    {error&&<p className="analysis-error" role="alert">{error}</p>}
    {!score&&!scoring&&<div className="paper-score-empty"><strong>尚未评分</strong><p>点击“AI 评分”生成论文总分、三个分项、关键词创新分以及最重要的亮点与缺陷。</p></div>}
    {score&&!draft&&<>
      <div className="paper-score-summary"><div className="overall-score"><strong>{score.overall_score}</strong><span>/ 100</span><small>{score.edited?"人工修订总分":"AI 综合总分"}</small></div><div className="score-dimensions">{scoreFields.map(([key,label,weight])=><div key={key}><span>{label}<small>{weight}</small></span><strong>{score[key]}</strong><i><b style={{width:`${score[key]}%`}}/></i></div>)}</div></div>
      <div className="score-review-grid"><div><h3>最重要的亮点</h3><ul>{score.highlights.map((item,index)=><li key={index}>{item}</li>)}</ul></div><div className="score-deficiencies"><h3>最重要的缺陷</h3><ul>{score.deficiencies.map((item,index)=><li key={index}>{item}</li>)}</ul></div></div>
      <div className="keyword-score-block"><div><h3>关键词创新分</h3><span>独立于论文总分</span></div>{score.keyword_scores.length?<div className="keyword-score-list">{score.keyword_scores.map(item=><span key={item.keyword}><em>{item.keyword}</em><strong>{item.innovation_score}</strong></span>)}</div>:<p>这篇论文当前没有可评分的关键词；完成论文分析或补充关键词后可重新评分。</p>}</div>
      <footer className="paper-score-source">{score.provider}{score.model?` · ${score.model}`:""} · {new Date(score.updated_at).toLocaleString("zh-CN")}{score.edited?` · 人工修订 ${score.revision} 次`:""}</footer>
    </>}
    {draft&&<form className="score-editor" onSubmit={event=>{event.preventDefault();void perform(()=>service.edit(paper,draft));}}>
      <div className="score-edit-grid"><label>总分<input type="number" min="0" max="100" value={draft.overall_score} onChange={event=>setDraft({...draft,overall_score:scoreValue(event.target.value)})}/></label>{scoreFields.map(([key,label])=><label key={key}>{label}<input type="number" min="0" max="100" value={draft[key]} onChange={event=>setDraft({...draft,[key]:scoreValue(event.target.value)})}/></label>)}</div>
      <label>最重要的亮点（每行一条，1–2 条）<textarea rows={3} value={draft.highlights.join("\n")} onChange={event=>setDraft({...draft,highlights:event.target.value.split("\n").map(v=>v.trim()).filter(Boolean).slice(0,2)})}/></label>
      <label>最重要的缺陷（每行一条，1–2 条）<textarea rows={3} value={draft.deficiencies.join("\n")} onChange={event=>setDraft({...draft,deficiencies:event.target.value.split("\n").map(v=>v.trim()).filter(Boolean).slice(0,2)})}/></label>
      {!!draft.keyword_scores.length&&<fieldset><legend>关键词创新分</legend><div className="keyword-score-editor">{draft.keyword_scores.map((item,index)=><label key={item.keyword}><span>{item.keyword}</span><input type="number" min="0" max="100" value={item.innovation_score} onChange={event=>{const keyword_scores=draft.keyword_scores.map((current,currentIndex)=>currentIndex===index?{...current,innovation_score:scoreValue(event.target.value)}:current);setDraft({...draft,keyword_scores});}}/></label>)}</div></fieldset>}
      <div className="analysis-edit-actions"><button className="button primary" disabled={busy||!draft.highlights.length||!draft.deficiencies.length}>保存人工修改</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setDraft(undefined)}>取消</button></div>
    </form>}
  </section>;
}
