// src/critique.ts
import { z } from "zod";
var PANELIST_ROLES = ["designer", "critic", "brand", "a11y", "copy"];
var FALLBACK_POLICIES = ["ship_best", "ship_last", "fail"];
var CRITIQUE_PROTOCOL_VERSION = 1;
var RoleWeights = z.object({
  designer: z.number().min(0).max(1),
  critic: z.number().min(0).max(1),
  brand: z.number().min(0).max(1),
  a11y: z.number().min(0).max(1),
  copy: z.number().min(0).max(1)
});
var CritiqueConfigSchema = z.object({
  enabled: z.boolean(),
  cast: z.array(z.enum(PANELIST_ROLES)).min(1),
  maxRounds: z.number().int().min(1).max(10),
  scoreScale: z.number().int().min(1).max(100),
  scoreThreshold: z.number().min(0).max(100).describe("Must be <= scoreScale; enforced by cross-field refine"),
  weights: RoleWeights,
  perRoundTimeoutMs: z.number().int().min(1e3),
  totalTimeoutMs: z.number().int().min(1e3),
  parserMaxBlockBytes: z.number().int().min(1024),
  fallbackPolicy: z.enum(FALLBACK_POLICIES),
  protocolVersion: z.number().int().min(1),
  maxConcurrentRuns: z.number().int().min(1)
}).refine(
  // Small epsilon tolerance so a fractional threshold that rounds up against an
  // integer scale (e.g. 8.0 with floating-point slack) still validates. The
  // semantic check is "threshold cannot meaningfully exceed scale".
  (cfg) => cfg.scoreThreshold <= cfg.scoreScale + 1e-9,
  { message: "scoreThreshold must be <= scoreScale" }
);
function defaultCritiqueConfig() {
  return {
    enabled: false,
    cast: [...PANELIST_ROLES],
    maxRounds: 3,
    scoreScale: 10,
    scoreThreshold: 8,
    weights: { designer: 0, critic: 0.4, brand: 0.2, a11y: 0.2, copy: 0.2 },
    perRoundTimeoutMs: 9e4,
    totalTimeoutMs: 24e4,
    parserMaxBlockBytes: 262144,
    fallbackPolicy: "ship_best",
    protocolVersion: CRITIQUE_PROTOCOL_VERSION,
    // Contracts layer cannot call os.cpus(); daemon env layer overrides via OD_CRITIQUE_MAX_CONCURRENT_RUNS.
    maxConcurrentRuns: 4
  };
}
var PANEL_EVENT_TYPE_LIST = [
  "run_started",
  "panelist_open",
  "panelist_dim",
  "panelist_must_fix",
  "panelist_close",
  "round_end",
  "ship",
  "degraded",
  "interrupted",
  "failed",
  "parser_warning"
];
var PANEL_EVENT_TYPES = new Set(PANEL_EVENT_TYPE_LIST);
function isPanelEvent(value) {
  if (!value || typeof value !== "object") return false;
  const obj = value;
  const t = obj["type"];
  if (typeof t !== "string" || !PANEL_EVENT_TYPES.has(t)) return false;
  return typeof obj["runId"] === "string" && obj["runId"].length > 0;
}
var CRITIQUE_SSE_EVENT_NAMES = [
  "critique.run_started",
  "critique.panelist_open",
  "critique.panelist_dim",
  "critique.panelist_must_fix",
  "critique.panelist_close",
  "critique.round_end",
  "critique.ship",
  "critique.degraded",
  "critique.interrupted",
  "critique.failed",
  "critique.parser_warning"
];
function panelEventToSse(e) {
  const { type, ...payload } = e;
  return { event: `critique.${type}`, data: payload };
}
export {
  CRITIQUE_PROTOCOL_VERSION,
  CRITIQUE_SSE_EVENT_NAMES,
  CritiqueConfigSchema,
  FALLBACK_POLICIES,
  PANELIST_ROLES,
  RoleWeights,
  defaultCritiqueConfig,
  isPanelEvent,
  panelEventToSse
};
