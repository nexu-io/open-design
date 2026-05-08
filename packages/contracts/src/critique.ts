import { z } from 'zod';

/**
 * Local mirror of SseTransportEvent from './sse/common'. Re-defining the
 * three-field interface avoids a cross-file relative import inside this leaf
 * module: the daemon walks this file via the './critique' subpath export
 * under NodeNext (which requires explicit '.js' extensions), while the web
 * Turbopack build refuses to rewrite '.js' to '.ts' on the same source.
 * Keeping the type local makes the file self-contained for both consumers.
 */
interface SseTransportEvent<Name extends string, Payload> {
  id?: string;
  event: Name;
  data: Payload;
}

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

// ---------------------------------------------------------------------------
// SSE wire mapping. Inlined here so the contracts package has zero relative
// imports inside the leaf module the daemon walks via the './critique'
// subpath export. The daemon's NodeNext resolution requires explicit .js
// extensions on relative imports while the web Turbopack build refuses to
// rewrite .js -> .ts on the same source, so a re-export across files is
// the worst of both worlds. Keeping the definitions self-contained here
// avoids the conflict entirely.
// ---------------------------------------------------------------------------

type PayloadOf<T extends PanelEvent['type']> = Omit<Extract<PanelEvent, { type: T }>, 'type'>;

export type CritiqueSseEvent =
  | SseTransportEvent<'critique.run_started',       PayloadOf<'run_started'>>
  | SseTransportEvent<'critique.panelist_open',     PayloadOf<'panelist_open'>>
  | SseTransportEvent<'critique.panelist_dim',      PayloadOf<'panelist_dim'>>
  | SseTransportEvent<'critique.panelist_must_fix', PayloadOf<'panelist_must_fix'>>
  | SseTransportEvent<'critique.panelist_close',    PayloadOf<'panelist_close'>>
  | SseTransportEvent<'critique.round_end',         PayloadOf<'round_end'>>
  | SseTransportEvent<'critique.ship',              PayloadOf<'ship'>>
  | SseTransportEvent<'critique.degraded',          PayloadOf<'degraded'>>
  | SseTransportEvent<'critique.interrupted',       PayloadOf<'interrupted'>>
  | SseTransportEvent<'critique.failed',            PayloadOf<'failed'>>
  | SseTransportEvent<'critique.parser_warning',    PayloadOf<'parser_warning'>>;

export const CRITIQUE_SSE_EVENT_NAMES = [
  'critique.run_started',
  'critique.panelist_open',
  'critique.panelist_dim',
  'critique.panelist_must_fix',
  'critique.panelist_close',
  'critique.round_end',
  'critique.ship',
  'critique.degraded',
  'critique.interrupted',
  'critique.failed',
  'critique.parser_warning',
] as const satisfies readonly CritiqueSseEvent['event'][];

export type CritiqueSseEventName = typeof CRITIQUE_SSE_EVENT_NAMES[number];

export function panelEventToSse(e: PanelEvent): CritiqueSseEvent {
  const { type, ...payload } = e;
  // Each PanelEvent variant maps 1:1 to a CritiqueSseEvent variant by
  // prefixing the type with 'critique.' and moving every other field into
  // data. The cast is safe by construction.
  return { event: `critique.${type}`, data: payload } as CritiqueSseEvent;
}
