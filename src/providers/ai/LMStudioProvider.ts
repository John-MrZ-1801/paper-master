import { invokeCommand } from "../../adapters/tauri/invokeCommand";
import { paperAnalysisSchema, paperComparisonSchema, paperScoreSchema, type AnalysisRequest, type CompareRequest, type ConnectionResult, type ScoreRequest } from "../../domain/ai/types";
import type { AIProvider } from "./AIProvider";

export class LMStudioProvider implements AIProvider {
  constructor(readonly id: import("../../settings/types").AIProviderId = "lmstudio") {}

  checkConnection(settings?: import("../../settings/types").AppSettings) {
    return invokeCommand<ConnectionResult>("check_ai_connection", { settings });
  }

  getModels(settings?: import("../../settings/types").AppSettings) {
    return invokeCommand<string[]>("get_ai_models", { settings });
  }

  loadModel(settings?: import("../../settings/types").AppSettings) {
    return invokeCommand<ConnectionResult>("load_ai_model", { settings });
  }

  async analyzePaper(request: AnalysisRequest) {
    const result = await invokeCommand<unknown>("analyze_paper", { request });
    return paperAnalysisSchema.parse(result);
  }

  async scorePaper(request: ScoreRequest) {
    const result = await invokeCommand<unknown>("score_paper", { request });
    return paperScoreSchema.parse(result);
  }

  generateTags(paperId: string, requestId: string) {
    return invokeCommand<string[]>("generate_paper_tags", { paperId, requestId });
  }

  async comparePapers(request: CompareRequest) {
    const result = await invokeCommand<unknown>("compare_papers", { request });
    return paperComparisonSchema.parse(result);
  }

  cancel(requestId: string) {
    return invokeCommand<void>("cancel_ai_request", { requestId });
  }
}
