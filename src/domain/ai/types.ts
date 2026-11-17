import { z } from "zod";

export const paperAnalysisSchema = z.object({
  schema_version: z.literal("2").default("2"),
  research_problem: z.string().trim().min(1),
  research_scenario: z.string().trim().min(1),
  core_method: z.string().trim().min(1),
  key_innovations: z.array(z.string().trim().min(1)).min(1),
  key_contributions: z.array(z.string().trim().min(1)).min(1),
  main_results: z.string().trim().min(1),
  limitations: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).min(1).max(8),
  ai_summary: z.string().trim().min(1),
});

export const paperComparisonSchema = z.object({
  schema_version: z.literal("2"),
  common_points: z.array(z.string().trim().min(1)),
  key_differences: z.array(z.string().trim().min(1)),
  problem_comparison: z.string().trim().min(1),
  scenario_comparison: z.string().trim().min(1),
  method_comparison: z.string().trim().min(1),
  contribution_comparison: z.string().trim().min(1),
  results_comparison: z.string().trim().min(1),
  limitations_comparison: z.string().trim().min(1),
  evidence: z.array(z.object({ paper_number: z.number().int().min(1).max(8), quote: z.string().min(20).max(180) })),
  summary: z.string().trim().min(1),
});

const score = z.number().int().min(0).max(100);
const legacyPaperScoreResultSchema = z.object({
  schema_version: z.literal("1"),
  overall_score: score,
  innovation_score: score,
  rigor_score: score,
  scenario_score: score.optional(),
  reference_value_score: score,
  venue_score: score,
  highlights: z.array(z.string().trim().min(1)).min(1).max(2),
  deficiencies: z.array(z.string().trim().min(1)).min(1).max(2),
  keyword_scores: z.array(z.object({ keyword: z.string().trim().min(1), innovation_score: score })),
});
const currentPaperScoreResultSchema = z.object({
  schema_version: z.literal("2"),
  overall_score: score,
  innovation_score: score,
  rigor_score: score,
  scenario_score: score,
  reference_value_score: score,
  venue_score: score,
  highlights: z.array(z.string().trim().min(1)).min(1).max(2),
  deficiencies: z.array(z.string().trim().min(1)).min(1).max(2),
  keyword_scores: z.array(z.object({ keyword: z.string().trim().min(1), innovation_score: score })),
});
export const paperScoreResultSchema = z.union([legacyPaperScoreResultSchema,currentPaperScoreResultSchema]);

const scoreMetadata = {provider:z.string(),model:z.string(),generated_at:z.string(),updated_at:z.string(),revision:z.number().int().min(0),edited:z.boolean()};
export const paperScoreSchema = z.union([
  legacyPaperScoreResultSchema.extend(scoreMetadata),
  currentPaperScoreResultSchema.extend(scoreMetadata),
]);

export type PaperAnalysisResultV2 = z.infer<typeof paperAnalysisSchema>;
export type PaperComparisonResult = z.infer<typeof paperComparisonSchema>;

export type ConnectionState = "connected" | "disconnected" | "model_not_loaded" | "connection_failed";

export interface ConnectionResult {
  state: ConnectionState;
  message: string;
  latency_ms?: number;
  models: string[];
  loaded_models: string[];
}

export interface AnalysisRequest {
  paper_id: string;
  request_id: string;
  ensure_only?: boolean;
}

export interface CompareRequest {
  paper_ids: string[];
  request_id: string;
}

export interface ScoreRequest {
  paper_id: string;
  request_id: string;
}
