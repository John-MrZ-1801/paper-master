// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,describe,it,expect } from "vitest";
import { Sidebar } from "../src/components/Sidebar";
import { InMemoryPaperRepository } from "../src/repositories/InMemoryPaperRepository";
import { analysisVersionLabel } from "../src/domain/paper/AnalysisSource";
import type { AnalysisVersion } from "../src/services/AnalysisVersionsService";
import { RelationshipGraphPage } from "../src/pages/RelationshipGraphPage";
import type { RelationshipGraphService } from "../src/services/RelationshipGraphService";
import { sortPapers, type PaperSort } from "../src/features/library/paperSorting";
import { TaskCenter } from "../src/components/TaskProgress";
import { progressService } from "../src/services/ProgressService";
import type { Paper } from "../src/domain/paper/Paper";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT:boolean }).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{for(const task of progressService.snapshot()) if(task.status==="running") progressService.finish(task.id,"cancelled");progressService.clearFinished();});

describe("library controls",()=>{
  it("keeps all keyword checkboxes visible and supports intersecting multiple tags",async()=>{
    const repository=new InMemoryPaperRepository();
    expect((await repository.list({tags:["scientific NLP","local LLM"]})).map(p=>p.id)).toEqual(["demo-section-aware"]);
    expect(await repository.list({tags:["local LLM","privacy"]})).toHaveLength(0);
    const container=document.createElement("div");const root=createRoot(container);const tags=[{name:"ISAC",count:20},{name:"UAV",count:10},{name:"Other",count:5}];let selected:string[]=[];
    const render=()=>root.render(<Sidebar view="library" filter="all" tags={tags} activeTags={selected} onView={()=>{}} onFilter={()=>{}} onTag={tag=>{selected=selected.includes(tag)?selected.filter(t=>t!==tag):[...selected,tag];render();}} onClearTags={()=>{selected=[];render();}}/>);
    try { await act(async()=>render());await act(async()=>container.querySelectorAll<HTMLInputElement>('.tag-nav-item input')[0].click());await act(async()=>container.querySelectorAll<HTMLInputElement>('.tag-nav-item input')[1].click());expect(selected).toEqual(["ISAC","UAV"]);expect(container.querySelectorAll('.tag-nav-item')).toHaveLength(3);expect(container.querySelectorAll('input:checked')).toHaveLength(2); } finally {await act(async()=>root.unmount());}
  });
  it("labels actual models and summary times while marking unknown historical identities honestly",()=>{
    const v={provider:"lmstudio",model:"qwen-local-27b",created_at:"2026-10-25T10:00:00Z",updated_at:"2026-10-25T11:00:00Z",edited:true,revision:2} as AnalysisVersion;
    expect(analysisVersionLabel(v)).toContain("LM Studio · qwen-local-27b");expect(analysisVersionLabel(v)).toContain("总结时间：2026");expect(analysisVersionLabel(v)).toContain("修订 2");
    expect(analysisVersionLabel({...v,provider:"codex",model:"Codex CLI default"})).toContain("具体模型未记录");
    expect(analysisVersionLabel({...v,provider:"extractive"})).toContain("原文摘录（非模型）");
    expect(analysisVersionLabel({...v,provider:"legacy"})).toContain("总结时间未记录");
  });
  it("sorts papers by added time, name, and first author without mutating the source list",()=>{
    const paper=(id:string,title:string,author:string,created_at:string)=>({id,title,authors:author?[author]:[],created_at,file_name:`${id}.pdf`,file_path:id,tags:[],analysis_status:"not_analyzed",updated_at:created_at}) as Paper;
    const source=[paper("b","Beta","Zhang","2026-01-02T00:00:00Z"),paper("a","Alpha","Alice","2026-01-03T00:00:00Z"),paper("c","Gamma","","2026-01-01T00:00:00Z")];
    const ids=(sort:PaperSort)=>sortPapers(source,sort).map(item=>item.id);
    expect(ids("created-desc")).toEqual(["a","b","c"]);expect(ids("title-asc")).toEqual(["a","b","c"]);expect(ids("author-asc")).toEqual(["a","b","c"]);expect(ids("author-desc")).toEqual(["b","a","c"]);expect(source.map(item=>item.id)).toEqual(["b","a","c"]);
  });
  it("sorts a filtered keyword by its independent innovation score and keeps missing scores last",()=>{
    const paper=(id:string,value?:number)=>({id,title:id,authors:[],created_at:"2026-01-01T00:00:00Z",file_name:`${id}.pdf`,file_path:id,tags:["ISAC"],analysis_status:"not_analyzed",updated_at:"2026-01-01T00:00:00Z",score:value===undefined?undefined:{schema_version:"1",overall_score:60,innovation_score:60,rigor_score:60,reference_value_score:60,venue_score:60,highlights:["亮点"],deficiencies:["缺陷"],keyword_scores:[{keyword:"ISAC",innovation_score:value}],provider:"mock",model:"mock",generated_at:"now",updated_at:"now",revision:0,edited:false}}) as Paper;
    const source=[paper("medium",67),paper("missing"),paper("high",82),paper("low",51)];
    expect(sortPapers(source,"keyword-score-desc","ISAC").map(item=>item.id)).toEqual(["high","medium","low","missing"]);
    expect(sortPapers(source,"keyword-score-asc","ISAC").map(item=>item.id)).toEqual(["low","medium","high","missing"]);
  });
  it("docks the collapsed task center at the right edge and expands on demand",async()=>{
    progressService.begin("library-sort","analysis","排序任务","处理中");
    const container=document.createElement("div");const root=createRoot(container);
    try {await act(async()=>root.render(<TaskCenter/>));const center=container.querySelector(".task-center")!;expect(center.classList.contains("collapsed")).toBe(true);expect(center.querySelector(".task-center-content")).toBeNull();await act(async()=>center.querySelector<HTMLButtonElement>(".task-center-toggle")!.click());expect(center.classList.contains("expanded")).toBe(true);expect(center.querySelector(".task-center-content")).not.toBeNull();}finally{await act(async()=>root.unmount());}
  });
  it("changes node positions without scaling text on zoom",async()=>{
    const graph={mode:"keywords",nodes:[{id:"tag:a",label:"ISAC",kind:"keyword",value:3,paperIds:[],x:650,y:400,color:"#4468d8"}],edges:[],totalPapers:1,taggedPapers:1,omittedNodes:0,omittedEdges:0};
    const service={build:async()=>({graph,papers:[]})} as unknown as RelationshipGraphService;
    const container=document.createElement("div");const root=createRoot(container);
    try {await act(async()=>root.render(<RelationshipGraphPage service={service} onPaper={()=>{}}/>));const text=container.querySelector('.graph-node text')!;const font=text.getAttribute('font-size');const x=Number(text.getAttribute('x'));const radius=container.querySelector('.graph-node circle')!.getAttribute('r');await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="放大关系图"]')!.click());expect(Number(container.querySelector('.graph-node text')!.getAttribute('x'))).toBeGreaterThan(x);expect(container.querySelector('.graph-node text')!.getAttribute('font-size')).toBe(font);expect(container.querySelector('.graph-node circle')!.getAttribute('r')).toBe(radius);expect(container.querySelector('[data-testid="graph-coordinate-layer"]')!.getAttribute('transform')).toBeNull();}finally {await act(async()=>root.unmount());}
  });
});
