import { invokeCommand, isTauriRuntime } from "../adapters/tauri/invokeCommand";
import { paperScoreSchema, type ScoreRequest } from "../domain/ai/types";
import type { Paper, PaperScore, PaperScoreResult } from "../domain/paper/Paper";
import type { AIProvider } from "../providers/ai/AIProvider";
import type { PaperRepository } from "../repositories/PaperRepository";
import { normalizeAppError } from "../types/errors";
import { createOperationId } from "./PaperService";
import { progressService } from "./ProgressService";

export class ScoringService {
  constructor(private provider:AIProvider,private readonly repository:PaperRepository) {}
  setProvider(provider:AIProvider){this.provider=provider;}

  async score(paper:Paper,requestId=createOperationId("scoring")) {
    progressService.begin(requestId,"scoring");
    try {
      const score=await this.provider.scorePaper({paper_id:paper.id,request_id:requestId});
      if (!isTauriRuntime()) {
        score.keyword_scores=paper.tags.map((keyword,index)=>({keyword,innovation_score:61+(index%5)}));
        await this.repository.update({...paper,score,updated_at:new Date().toISOString()});
      }
      progressService.finish(requestId,"completed","AI 评分已保存");
      return score;
    } catch(error) { const app=normalizeAppError(error);progressService.finish(requestId,app.code==="AI_CANCELLED"?"cancelled":"failed",app.message);throw error; }
  }

  async scoreMissing(papers:Paper[],requestId=createOperationId("scoring")) {
    if(isTauriRuntime()) return invokeCommand<{scored:number;skipped:number;failed:number}>("score_papers",{request:{paper_ids:papers.map(p=>p.id),request_id:requestId}});
    let scored=0,skipped=0,failed=0;
    for(const paper of papers){if(paper.score){skipped++;continue;}try{await this.score(paper,requestId);scored++;}catch{failed++;}}
    return {scored,skipped,failed};
  }

  async edit(paper:Paper,result:PaperScoreResult):Promise<PaperScore>{
    if(isTauriRuntime()) return paperScoreSchema.parse(await invokeCommand("edit_paper_score",{paperId:paper.id,revision:paper.score?.revision??0,result}));
    if(!paper.score)throw new Error("请先生成评分。");
    const score={...result,provider:paper.score.provider,model:paper.score.model,generated_at:paper.score.generated_at,updated_at:new Date().toISOString(),revision:paper.score.revision+1,edited:true};
    await this.repository.update({...paper,score});return score;
  }

  async restore(paper:Paper):Promise<PaperScore>{
    if(!paper.score)throw new Error("请先生成评分。");
    if(isTauriRuntime()) return paperScoreSchema.parse(await invokeCommand("restore_paper_score",{paperId:paper.id,revision:paper.score.revision}));
    throw new Error("浏览器演示不保存原始评分。");
  }

  cancel(requestId:string){return this.provider.cancel(requestId);}
}
