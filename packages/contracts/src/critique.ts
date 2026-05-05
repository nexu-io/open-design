import { z } from 'zod';

export const PANELIST_ROLES = ['designer', 'critic', 'brand', 'a11y', 'copy'] as const;
export type PanelistRole = typeof PANELIST_ROLES[number];

export const FALLBACK_POLICIES = ['ship_best', 'ship_last', 'fail'] as const;
export type FallbackPolicy = typeof FALLBACK_POLICIES[number];

export const CRITIQUE_PROTOCOL_VERSION = 1;

export const RoleWeights = z.object({
  designer: z.number().min(0).max(1),
  critic: z.number().min(0).max(1),
  brand: z.number().min(0).max(1),
  a11y: z.number().min(0).max(1),
  copy: z.number().min(0).max(1),
});
export type RoleWeights = z.infer<typeof RoleWeights>;

export const CritiqueConfigSchema = z.object({
  enabled: z.boolean(),
  cast: z.array(z.enum(PANELIST_ROLES)).min(1),
  maxRounds: z.number().int().min(1).max(10),
  scoreScale: z.number().int().min(1).max(100),
  scoreThreshold: z.number().min(0).max(100)
    .describe('Must be <= scoreScale; enforced by cross-field refine'),
  weights: RoleWeights,
  perRoundTimeoutMs: z.number().int().min(1000),
  totalTimeoutMs: z.number().int().min(1000),
  parserMaxBlockBytes: z.number().int().min(1024),
  fallbackPolicy: z.enum(FALLBACK_POLICIES),
  protocolVersion: z.number().int().min(1),
  maxConcurrentRuns: z.number().int().min(1),
}).refine(
  // Small epsilon tolerance so a fractional threshold that rounds up against an
  // integer scale (e.g. 8.0 with floating-point slack) still validates. The
  // semantic check is "threshold cannot meaningfully exceed scale".
  (cfg) => cfg.scoreThreshold <= cfg.scoreScale + 1e-9,
  { message: 'scoreThreshold must be <= scoreScale' },
);

export type CritiqueConfig = z.infer<typeof CritiqueConfigSchema>;

export function defaultCritiqueConfig(): CritiqueConfig {
  return {
    enabled: false,
    cast: [...PANELIST_ROLES],
    maxRounds: 3,
    scoreScale: 10,
    scoreThreshold: 8.0,
    weights: { designer: 0, critic: 0.4, brand: 0.2, a11y: 0.2, copy: 0.2 },
    perRoundTimeoutMs: 90_000,
    totalTimeoutMs: 240_000,
    parserMaxBlockBytes: 262_144,
    fallbackPolicy: 'ship_best',
    protocolVersion: CRITIQUE_PROTOCOL_VERSION,
    // Contracts layer cannot call os.cpus(); daemon env layer overrides via OD_CRITIQUE_MAX_CONCURRENT_RUNS.
    maxConcurrentRuns: 4,
  };
}

export type DegradedReason =
  | 'malformed_block'
  | 'oversize_block'
  | 'adapter_unsupported'
  | 'protocol_version_mismatch'
  | 'missing_artifact';

export type FailedCause =
  | 'cli_exit_nonzero'
  | 'per_round_timeout'
  | 'total_timeout'
  | 'orchestrator_internal';

export type ParserWarningKind =
  | 'weak_debate'
  | 'unknown_role'
  | 'score_clamped'
  | 'composite_mismatch'
  | 'duplicate_ship';

export type RoundDecision = 'continue' | 'ship';
export type ShipStatus = 'shipped' | 'below_threshold' | 'timed_out' | 'interrupted';

export type PanelEvent =
  | { type: 'run_started'; runId: string; protocolVersion: number; cast: PanelistRole[]; maxRounds: number; threshold: number; scale: number }
  | { type: 'panelist_open';     runId: string; round: number; role: PanelistRole }
  | { type: 'panelist_dim';      runId: string; round: number; role: PanelistRole; dimName: string; dimScore: number; dimNote: string }
  | { type: 'panelist_must_fix'; runId: string; round: number; role: PanelistRole; text: string }
  | { type: 'panelist_close';    runId: string; round: number; role: PanelistRole; score: number }
  | { type: 'round_end';         runId: string; round: number; composite: number; mustFix: number; decision: RoundDecision; reason: string }
  | { type: 'ship';              runId: string; round: number; composite: number; status: ShipStatus; artifactRef: { projectId: string; artifactId: string }; summary: string }
  | { type: 'degraded';          runId: string; reason: DegradedReason; adapter: string }
  | { type: 'interrupted';       runId: string; bestRound: number; composite: number }
  | { type: 'failed';            runId: string; cause: FailedCause }
  | { type: 'parser_warning';    runId: string; kind: ParserWarningKind; position: number };

const PANEL_EVENT_TYPE_LIST = [
  'run_started', 'panelist_open', 'panelist_dim', 'panelist_must_fix',
  'panelist_close', 'round_end', 'ship', 'degraded', 'interrupted',
  'failed', 'parser_warning',
] as const satisfies readonly PanelEvent['type'][];

const PANEL_EVENT_TYPES = new Set<PanelEvent['type']>(PANEL_EVENT_TYPE_LIST);

export function isPanelEvent(value: unknown): value is PanelEvent {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  const t = obj['type'];
  if (typeof t !== 'string' || !PANEL_EVENT_TYPES.has(t as PanelEvent['type'])) return false;
  return typeof obj['runId'] === 'string' && (obj['runId'] as string).length > 0;
}
