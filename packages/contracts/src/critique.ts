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

export const DEGRADED_REASONS = [
  'malformed_block',
  'oversize_block',
  'adapter_unsupported',
  'protocol_version_mismatch',
  'missing_artifact',
] as const;
export type DegradedReason = typeof DEGRADED_REASONS[number];

export const FAILED_CAUSES = [
  'cli_exit_nonzero',
  'per_round_timeout',
  'total_timeout',
  'orchestrator_internal',
] as const;
export type FailedCause = typeof FAILED_CAUSES[number];

export const PARSER_WARNING_KINDS = [
  'weak_debate',
  'unknown_role',
  'score_clamped',
  'composite_mismatch',
  'duplicate_ship',
] as const;
export type ParserWarningKind = typeof PARSER_WARNING_KINDS[number];

export const ROUND_DECISIONS = ['continue', 'ship'] as const;
export type RoundDecision = typeof ROUND_DECISIONS[number];

export const SHIP_STATUSES = [
  'shipped',
  'below_threshold',
  'timed_out',
  'interrupted',
] as const;
export type ShipStatus = typeof SHIP_STATUSES[number];

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

const PANELIST_ROLE_SET = new Set<string>(PANELIST_ROLES);
const SHIP_STATUS_SET = new Set<string>(SHIP_STATUSES);
const DEGRADED_REASON_SET = new Set<string>(DEGRADED_REASONS);
const FAILED_CAUSE_SET = new Set<string>(FAILED_CAUSES);
const PARSER_WARNING_KIND_SET = new Set<string>(PARSER_WARNING_KINDS);
const ROUND_DECISION_SET = new Set<string>(ROUND_DECISIONS);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
/** Non-negative finite (>= 0). Used for composite / score / dimScore. */
const isNonNegativeFinite = (v: unknown): v is number =>
  isFiniteNumber(v) && v >= 0;
/** Non-negative integer (0, 1, 2, ...). Used for mustFix, position, bestRound. */
const isNonNegativeInt = (v: unknown): v is number =>
  isFiniteNumber(v) && Number.isInteger(v) && v >= 0;
/** Positive integer (1, 2, ...). Used for round, maxRounds, protocolVersion, scale. */
const isPositiveInt = (v: unknown): v is number =>
  isFiniteNumber(v) && Number.isInteger(v) && v > 0;
const isString = (v: unknown): v is string => typeof v === 'string';
const isPanelistRole = (v: unknown): v is PanelistRole =>
  isString(v) && PANELIST_ROLE_SET.has(v);

/**
 * Strict runtime guard for the `PanelEvent` union. Validates the union tag
 * (`type`), the non-empty `runId` header, every variant-specific required
 * field, the membership of closed-enum fields (`role`, `status`, `reason`,
 * `cause`, `kind`, `decision`), and the numeric domain of every numeric
 * field (integer / positive / non-negative / range), not just finiteness.
 *
 * This is the single source of truth for wire-side validation. Both the web
 * SSE path (`sseToPanelEvent`) and the transcript replay parser go through
 * here, so a malformed frame (missing field, unknown enum value, NaN /
 * Infinity score, `scale: 0` causing downstream divide-by-zero, threshold
 * outside `[0, scale]`, fractional or negative round numbers) is rejected
 * before any reducer or component touches it.
 *
 * Numeric domains enforced (lefarcen P2 on PR #1314 round 4):
 *
 *   - `protocolVersion`, `maxRounds`, `scale`, `round`: positive integers.
 *     ScoreTicker divides by `scale` for inline CSS, so a `scale: 0` would
 *     produce Infinity and ship as broken style; rounds are 1-indexed.
 *   - `bestRound`, `mustFix`, `position`: non-negative integers. `bestRound:
 *     0` is the valid "interrupt before any round closed" sentinel.
 *   - `threshold`: non-negative finite; cross-checked `threshold <= scale`
 *     inside `run_started`. Threshold is allowed to be fractional (e.g.
 *     8.5 on a scale of 10).
 *   - `composite`, `score`, `dimScore`: non-negative finite. The
 *     `<= scale` bound is per-run state the guard does not see; downstream
 *     code clamps to scale on render, but a negative score is never valid.
 *
 * Earlier review history:
 *
 *   - Siri-Ray round-3 P1: the original guard checked `typeof === 'string'`
 *     for enum fields and accepted unknown values; now validated against
 *     the closed-set arrays.
 */
export function isPanelEvent(value: unknown): value is PanelEvent {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  const t = o['type'];
  if (typeof t !== 'string' || !PANEL_EVENT_TYPES.has(t as PanelEvent['type'])) return false;
  const runId = o['runId'];
  if (typeof runId !== 'string' || runId.length === 0) return false;
  switch (t as PanelEvent['type']) {
    case 'run_started': {
      const threshold = o['threshold'];
      const scale = o['scale'];
      return isPositiveInt(o['protocolVersion'])
        && Array.isArray(o['cast']) && o['cast'].length > 0
        && (o['cast'] as unknown[]).every(isPanelistRole)
        && isPositiveInt(o['maxRounds'])
        && isPositiveInt(scale)
        && isNonNegativeFinite(threshold)
        // threshold must fit within the configured scale; downstream
        // panel decisions compare composite against threshold and break
        // silently if threshold > scale.
        && (threshold as number) <= (scale as number);
    }
    case 'panelist_open':
      return isPositiveInt(o['round']) && isPanelistRole(o['role']);
    case 'panelist_dim':
      return isPositiveInt(o['round'])
        && isPanelistRole(o['role'])
        && isString(o['dimName'])
        && isNonNegativeFinite(o['dimScore'])
        && isString(o['dimNote']);
    case 'panelist_must_fix':
      return isPositiveInt(o['round'])
        && isPanelistRole(o['role'])
        && isString(o['text']);
    case 'panelist_close':
      return isPositiveInt(o['round'])
        && isPanelistRole(o['role'])
        && isNonNegativeFinite(o['score']);
    case 'round_end':
      return isPositiveInt(o['round'])
        && isNonNegativeFinite(o['composite'])
        && isNonNegativeInt(o['mustFix'])
        && isString(o['decision']) && ROUND_DECISION_SET.has(o['decision'])
        && isString(o['reason']);
    case 'ship': {
      const ref = o['artifactRef'] as { projectId?: unknown; artifactId?: unknown } | null | undefined;
      return isPositiveInt(o['round'])
        && isNonNegativeFinite(o['composite'])
        && isString(o['status']) && SHIP_STATUS_SET.has(o['status'])
        && ref !== null && typeof ref === 'object'
        && typeof ref.projectId === 'string' && ref.projectId.length > 0
        && typeof ref.artifactId === 'string' && ref.artifactId.length > 0
        && isString(o['summary']);
    }
    case 'degraded':
      return isString(o['reason']) && DEGRADED_REASON_SET.has(o['reason'])
        && isString(o['adapter']);
    case 'interrupted':
      // `bestRound: 0` is the valid sentinel for "interrupted before any
      // round closed"; rounds otherwise start at 1.
      return isNonNegativeInt(o['bestRound']) && isNonNegativeFinite(o['composite']);
    case 'failed':
      return isString(o['cause']) && FAILED_CAUSE_SET.has(o['cause']);
    case 'parser_warning':
      return isString(o['kind']) && PARSER_WARNING_KIND_SET.has(o['kind'])
        && isNonNegativeInt(o['position']);
  }
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

/**
 * Per-round summary persisted with each critique run. Mirrors the shape the
 * orchestrator writes via decideRound; web clients consume it through the
 * rerun and history endpoints, so it lives in the shared contract layer.
 */
export interface CritiqueRoundSummary {
  n: number;
  composite: number;
  mustFix: number;
  decision: RoundDecision;
}

/**
 * Terminal critique status persisted with each run. Superset of ShipStatus
 * that also covers degraded / failed / legacy outcomes. The daemon's CHECK
 * constraint also accepts the in-flight 'running' value, but that is handled
 * inline by daemon-side code; the public contract surface is terminal-only
 * because every consumer of this type works against finished runs.
 */
export type CritiqueRunStatus =
  | ShipStatus
  | 'degraded'
  | 'failed'
  | 'legacy';

/**
 * Enumeration of every terminal CritiqueRunStatus value, in the order the
 * UI / docs / status filters typically display them: SHIP outcomes first
 * (shipped → below_threshold → timed_out → interrupted), then quality /
 * lifecycle exits (degraded → failed), then the historical 'legacy' tag
 * for runs created before the feature shipped. Web consumers (status
 * filters, analytics dashboards) iterate this constant directly so the
 * daemon stays the single source of truth on the order.
 */
export const CRITIQUE_RUN_STATUSES = [
  'shipped',
  'below_threshold',
  'timed_out',
  'interrupted',
  'degraded',
  'failed',
  'legacy',
] as const satisfies readonly CritiqueRunStatus[];

/**
 * Compile-time guarantee that every `CritiqueRunStatus` variant appears in
 * `CRITIQUE_RUN_STATUSES`. `satisfies` only proves each listed value is
 * valid; this assertion proves the list is exhaustive, so adding a new
 * variant to `CritiqueRunStatus` (or `ShipStatus`) without updating the
 * array fails the build with a tuple naming the missing variants. Picked
 * up from lefarcen P3 on PR #1016. The exported helper type is reusable
 * by other shared enums (e.g. `PANELIST_ROLES`) once they need the same
 * guard.
 */
export type AssertExhaustiveValues<T extends string, U extends readonly T[]> =
  Exclude<T, U[number]> extends never
    ? true
    : ['Missing variants in array:', Exclude<T, U[number]>];

const _critiqueRunStatusesExhaustive: AssertExhaustiveValues<
  CritiqueRunStatus,
  typeof CRITIQUE_RUN_STATUSES
> = true;
// Reference the binding so esbuild does not tree-shake it; the assignment
// itself is what enforces the exhaustiveness guarantee at compile time.
void _critiqueRunStatusesExhaustive;

/**
 * Internal-to-the-daemon row status. Adds the in-flight `'running'` value
 * the DB CHECK constraint accepts to the public `CritiqueRunStatus` union
 * so DB-row types can be precisely typed without inline `as X | 'running'`
 * widens at every call site. Every public DTO continues to use the
 * terminal-only `CritiqueRunStatus` so a future endpoint cannot leak a
 * 'running' row through the wire. Picked up from lefarcen P2 on PR #1016.
 */
export type CritiquePersistedStatus = CritiqueRunStatus | 'running';

/**
 * Logical handle the daemon hands to the web layer for a critique run's
 * shipped artifact. Web clients never see daemon filesystem paths; they
 * fetch the artifact bytes via the `url` field, which the daemon serves
 * with the right `Content-Type` header derived from `mime`. Returned by
 * the rerun endpoint and the `GET /api/projects/:projectId/critique/:runId/artifact`
 * route that streams the bytes.
 */
export interface CritiqueArtifactRef {
  /** The owning project; matches the URL segment. */
  projectId: string;
  /** The owning critique run; matches the URL segment. */
  runId: string;
  /** Content-Type announced by the agent in `<ARTIFACT mime="…">`. */
  mime: string;
  /** Size of the artifact body in bytes, as written to disk. */
  sizeBytes: number;
  /** Daemon-relative HTTP path the web layer fetches to stream the bytes. */
  url: string;
}
