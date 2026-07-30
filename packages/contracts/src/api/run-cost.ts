/**
 * Run cost decomposition — the arithmetic behind `GET /api/runs/:id/cost`,
 * `od run cost`, and the web cost panel.
 *
 * WHY THIS EXISTS. A run's price is not "the model is expensive"; it is a
 * handful of separable terms, and which one dominates decides whether a given
 * optimisation can possibly pay. Five plausible savings ideas (trimming the
 * preamble, isolating context across sub-agents, chasing cache churn, cutting
 * output verbosity, deduplicating intake) were each measured against real runs
 * and each turned out to be worth between nothing and ~4%. That result is only
 * reachable with a decomposition, so the decomposition is the tool.
 *
 * THE ONE NON-OBVIOUS INPUT. `usage.cached_read_tokens` on step *i* IS the size
 * of the model's context at step *i*. A persisted `events.jsonl` therefore
 * already contains the run's full context-growth curve — no instrumentation, no
 * re-running, no spend. Everything here is derived from that curve plus the
 * tool traffic around it.
 *
 * WHAT THIS CANNOT MEASURE. The curve only exists if the log carries one usage
 * frame PER MODEL CALL. Only the `json-event-stream` family (OpenCode) does:
 * `claude-stream`, `copilot-stream`, `qoder-stream`, the ACP session, and the
 * pi RPC bridge all emit usage once, from the terminal `result` frame, as a
 * whole-run aggregate. Feeding an aggregate through the per-call arithmetic does
 * not degrade gracefully — it silently reports a one-point curve, which pins
 * 100% of the read cost on the preamble term and zeroes the transcript term.
 * `usageScope` therefore reports what the log can support and callers gate on
 * it; see `detectUsageScope`.
 *
 * PURITY. This module is pure TypeScript by contract: no Node APIs, no
 * filesystem, no `Buffer`. Byte counts go through `TextEncoder` so the same
 * arithmetic runs in the daemon and in the browser and cannot drift between
 * them. Callers supply already-parsed JSONL lines.
 */
import {
  extractUsageCacheFields,
  resolveEffectiveInputTokens,
} from './usage-accounting.js';

/** Per-million-token prices used to turn token counts into dollars. */
export interface RunCostRates {
  /** Uncached input tokens. */
  inputPerMTok: number;
  /** Cache reads — the cheap re-read of an established prefix. */
  cachedReadPerMTok: number;
  /** Cache writes — placing new content into the cache, billed above input. */
  cacheWritePerMTok: number;
  /** Generated tokens. The most expensive per unit, by a wide margin. */
  outputPerMTok: number;
}

/**
 * Anthropic's published multipliers relative to a $3.00/1M input model, which
 * is the shape two independent least-squares fits against real Open Design runs
 * agreed on.
 *
 * These are an ESTIMATE keyed to one rate card. Any figure this module reports
 * in dollars is "what this run would cost at these rates", not a billing fact —
 * a run on a different model or provider needs its own rates passed in.
 */
export const DEFAULT_RUN_COST_RATES: RunCostRates = {
  inputPerMTok: 3.0,
  cachedReadPerMTok: 0.3,
  cacheWritePerMTok: 3.75,
  outputPerMTok: 15.0,
};

/** One model call, as reported by a `usage` frame. */
export interface RunCostStep {
  /** Zero-based position in the run's usage sequence. */
  index: number;
  /**
   * The context the model re-read on this call, read through the shared
   * provider alias matrix (`extractUsageCacheFields`) rather than off one
   * literal field name. Anthropic reports this as `cache_read_input_tokens`
   * and OpenAI-style runtimes as `cached_input_tokens`; a raw
   * `cached_read_tokens` lookup silently reports ZERO for both.
   */
  contextTokens: number;
  cacheWriteTokens: number;
  /**
   * Input tokens that were NOT served from cache, normalized across the two
   * incompatible accounting conventions: additive (Anthropic — `input_tokens`
   * is already the uncached remainder) and inclusive (OpenAI — `input_tokens`
   * contains the cache-read subset and must have it subtracted). Pricing the
   * raw field bills an inclusive payload's cached tokens twice, once at the
   * uncached rate.
   */
  inputTokens: number;
  outputTokens: number;
  /** Wall-clock milliseconds since the previous step; `null` on the first. */
  gapMs: number | null;
  /** True when this step's write matched the next step's context growth. */
  incremental: boolean;
}

export interface RunCostTerms {
  /**
   * The context floor, re-read once per step. Splitting a run across isolated
   * sub-agents does NOT reduce this term — every step still re-reads its own
   * preamble — which is why context isolation cannot pay off when it dominates.
   */
  preambleTokens: number;
  /** Everything read above the floor: genuine conversation accumulation. */
  transcriptTokens: number;
  cacheWriteTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
}

export interface RunCostUsd {
  preamble: number;
  transcript: number;
  cachedRead: number;
  cacheWrite: number;
  uncachedInput: number;
  output: number;
  total: number;
}

export type RunCostAnomalyKind =
  /** Cached prefix shrank while the content stayed — it must be re-written. */
  | 'cache-invalidation'
  /** The history itself was summarised away. Cheap, and not a defect. */
  | 'compaction'
  /** A step wrote materially more than the next step read as new context. */
  | 'cache-rewrite';

export interface RunCostAnomaly {
  kind: RunCostAnomalyKind;
  /** Step the anomaly is attributed to. */
  stepIndex: number;
  /** Tokens the anomaly cost beyond the optimal path. */
  tokens: number;
  /** Human-readable one-liner for CLI/UI surfacing. */
  detail: string;
}

export interface RunCostToolBytes {
  tool: string;
  bytes: number;
  /** Fraction of the category total, 0..1. */
  share: number;
}

export interface RunCostOutput {
  /** Bytes the model emitted as tool_use inputs, grouped by tool. */
  byTool: RunCostToolBytes[];
  /** Bytes of prose addressed to the user. */
  proseBytes: number;
  /** Bytes of exposed reasoning. */
  thinkingBytes: number;
  totalBytes: number;
}

export interface RunCostIntakeItem {
  tool: string;
  /** File path for reads, command for shells, else the serialized input. */
  label: string;
  bytes: number;
  /** Index of the model call that PRODUCED the result. */
  stepIndex: number;
  /**
   * `bytes x calls that re-read it` — excluding the call that produced it, and
   * zero for a result with no later call. The ordering lever: content pulled in
   * early is dragged through every later call, so a large late read can cost
   * less than a small early one.
   */
  dragBytes: number;
}

export interface RunCostIntake {
  byTool: RunCostToolBytes[];
  items: RunCostIntakeItem[];
  totalBytes: number;
  /** Total `bytes x remaining steps` across every result. */
  totalDragBytes: number;
  /**
   * Calls whose ENTIRE input repeated a previous one. Deduping on file path
   * alone reports paginated reads (same path, different offset/limit) as
   * redundant, which is a false positive.
   */
  duplicateCalls: number;
  duplicateBytes: number;
}

export interface RunCostCacheHealth {
  /** Steps whose write matched the next step's context growth exactly. */
  incrementalSteps: number;
  /** Steps eligible for the comparison (i.e. having a successor). */
  comparableSteps: number;
  /** Tokens written beyond what the next step actually read as new. */
  rewrittenTokens: number;
}

/**
 * Whether the log's `usage` frames are one-per-model-call (the curve exists) or
 * one whole-run aggregate (it does not).
 */
export type RunCostUsageScope = 'per-call' | 'aggregate';

export interface RunCostReport {
  /**
   * What the underlying log can support. `aggregate` means every per-call term
   * below is meaningless and the report must not be shown; callers gate on this
   * rather than second-guessing the numbers.
   */
  usageScope: RunCostUsageScope;
  steps: RunCostStep[];
  terms: RunCostTerms;
  usd: RunCostUsd;
  cacheHealth: RunCostCacheHealth;
  anomalies: RunCostAnomaly[];
  output: RunCostOutput;
  intake: RunCostIntake;
  rates: RunCostRates;
}

export interface AnalyzeRunCostOptions {
  rates?: RunCostRates;
}

/** Body of `GET /api/runs/:id/cost`. */
export interface RunCostResponse {
  runId: string;
  /**
   * Absent when the run predates event-log persistence or its log was pruned —
   * a run with no recoverable events is reported, not treated as missing.
   */
  report: RunCostReport | null;
  /**
   * Why `report` is null, for a surface to explain rather than show nothing.
   *
   * `no-usage-frames` means the log carried no usage at all — NOT that the run
   * made no model call. A run that never reached the model and a stream family
   * that reports nothing land here identically, and the two are
   * indistinguishable from the log alone. Surfaces must name both causes.
   *
   * `aggregate-usage-only` means usage WAS reported, but once for the whole run
   * instead of once per model call, so there is no context curve to decompose.
   * This is a property of the agent's stream family, not of the run: every
   * runtime except the `json-event-stream` family (OpenCode) reports this way
   * today. Reporting it as unavailable is deliberate — the per-call arithmetic
   * applied to an aggregate produces confident, wrong numbers.
   */
  unavailableReason?: 'no-event-log' | 'no-usage-frames' | 'aggregate-usage-only';
}

const encoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function byteLength(value: string): number {
  return encoder.encode(value).length;
}

/** Key-sorted JSON so two structurally equal inputs hash the same. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function serializedBytes(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value === 'string') return byteLength(value);
  return byteLength(stableStringify(value));
}

/** The `data` payload of one persisted event line, whatever wrapper it came in. */
function eventPayload(line: unknown): Record<string, unknown> | null {
  if (!isRecord(line)) return null;
  const data = line.data;
  return isRecord(data) ? data : null;
}

function intakeLabel(tool: string, input: unknown): string {
  if (!isRecord(input)) return tool;
  const path = input.filePath ?? input.file_path ?? input.path;
  if (typeof path === 'string' && path.length > 0) return path;
  const command = input.command;
  if (typeof command === 'string' && command.length > 0) {
    return command.replace(/\s+/g, ' ').trim();
  }
  return stableStringify(input);
}

function toShares(totals: Map<string, number>): RunCostToolBytes[] {
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([tool, bytes]) => ({ tool, bytes, share: total > 0 ? bytes / total : 0 }))
    .sort((a, b) => b.bytes - a.bytes);
}

/**
 * A write is "incremental" when it matches what the next step reads as new
 * context: written once, then re-read cheaply forever. The tolerance absorbs
 * tokenizer rounding on small deltas without letting a real rewrite through.
 */
function writeMatchesDelta(write: number, delta: number): boolean {
  return Math.abs(write - delta) <= Math.max(64, write * 0.02);
}

/**
 * How many model calls re-read a tool result produced by call `producingStep`.
 *
 * A result cannot be re-read by the call that PRODUCED it. In the persisted
 * order the result is written before that call's usage frame — OpenCode's
 * `tool_use` part emits the result as soon as its state reaches `completed`,
 * and the `step_finish` carrying the call's tokens arrives after it — so
 * `producingStep` indexes the producing call itself, and only the calls after
 * it drag the bytes forward.
 *
 * The consequence at the boundaries is what makes this worth naming: a result
 * from the FIRST call is dragged through `n - 1` calls, not `n`, and a result
 * with no later call at all is dragged nowhere, so its drag is zero rather than
 * one. Both ends matter because this number ranks which intake to attack first.
 */
function callsThatReRead(producingStep: number, totalSteps: number): number {
  return Math.max(0, totalSteps - 1 - producingStep);
}

/**
 * Whether a log's `usage` frames are per-model-call or one whole-run aggregate.
 *
 * An aggregate is emitted from the terminal `result` frame, which happens once,
 * so an aggregate log carries EXACTLY ONE usage frame. Two or more frames means
 * a curve exists, however short.
 *
 * The discriminator for a single frame is arithmetic: a run that emitted a
 * `tool_use` made at least two model calls — one to emit it, one to consume its
 * result — so a single frame cannot be per-call and must be a close-of-run
 * summary. That is the shape of `claude-stream`, `copilot-stream`,
 * `qoder-stream`, the ACP session and the pi bridge. A run with no tool calls is
 * per-call by definition: its one frame IS its one call.
 *
 * WHY NOT A POSITIONAL TEST. This first checked whether any `tool_use` appeared
 * AFTER the first usage frame, reasoning that a per-call log interleaves usage
 * with work. Real persisted runs falsified it: a legitimate two-call OpenCode
 * run whose first call emitted both of its tools has every `tool_use` before the
 * first frame, and was gated away despite carrying a real 1,792 → 28,864 curve.
 * The positional test was guarding a hypothetical (a terminal-frame runtime
 * emitting two frames) at the cost of real runs, and even in that hypothetical
 * the damage is a two-point curve rather than the one-point collapse this gate
 * exists to prevent.
 *
 * The remaining conservative edge is a one-call run that used tools and never
 * consumed the result — a cancellation. It reads as aggregate, which errs
 * toward refusing to report rather than reporting a one-point curve.
 */
export function detectUsageScope(args: {
  usageFrames: number;
  toolUseFrames: number;
}): RunCostUsageScope {
  if (args.usageFrames >= 2) return 'per-call';
  return args.toolUseFrames > 0 ? 'aggregate' : 'per-call';
}

/**
 * Decompose a run's persisted event lines into cost terms, cache health,
 * output composition, and intake drag.
 *
 * `lines` are the parsed entries of `<runsDir>/<runId>/events.jsonl`. Malformed
 * entries are skipped rather than throwing: the file is append-only JSONL
 * written across daemon versions, so a report must degrade rather than fail.
 */
export function analyzeRunCost(
  lines: readonly unknown[],
  options: AnalyzeRunCostOptions = {},
): RunCostReport {
  const rates = options.rates ?? DEFAULT_RUN_COST_RATES;

  const steps: RunCostStep[] = [];
  const outputByTool = new Map<string, number>();
  const intakeByTool = new Map<string, number>();
  const intakeItems: Array<Omit<RunCostIntakeItem, 'dragBytes'>> = [];
  const toolNameById = new Map<string, string>();
  const toolInputById = new Map<string, unknown>();
  const seenInputs = new Set<string>();
  let proseBytes = 0;
  let thinkingBytes = 0;
  let duplicateCalls = 0;
  let duplicateBytes = 0;
  let lastTimestamp: number | null = null;
  // Scope discriminator inputs. See `detectUsageScope`.
  let toolUseFrames = 0;

  for (const line of Array.isArray(lines) ? lines : []) {
    const data = eventPayload(line);
    if (!data) continue;
    const type = data.type;

    if (type === 'usage') {
      const usage = isRecord(data.usage) ? data.usage : null;
      if (!usage) continue;
      const timestamp = isRecord(line) && typeof line.timestamp === 'number' ? line.timestamp : null;
      // Read through the shared provider matrix, never off literal field names:
      // Anthropic ships `cache_read_input_tokens` and additive `input_tokens`,
      // OpenAI-style runtimes ship `cached_input_tokens` and inclusive
      // `input_tokens`. `resolveEffectiveInputTokens` returns `undefined` for
      // uncached input when the provider gave no split to derive it from; the
      // raw input figure is the honest fallback there.
      const fields = extractUsageCacheFields(usage);
      const { uncachedInput } = resolveEffectiveInputTokens(
        fields.inputTokens,
        fields.cacheReadInputTokens,
        fields.cacheCreationInputTokens,
        fields.cacheTokenSource,
      );
      steps.push({
        index: steps.length,
        contextTokens: fields.cacheReadInputTokens ?? 0,
        cacheWriteTokens: fields.cacheCreationInputTokens ?? 0,
        inputTokens: uncachedInput ?? fields.inputTokens ?? 0,
        outputTokens: fields.outputTokens ?? 0,
        gapMs: timestamp !== null && lastTimestamp !== null ? timestamp - lastTimestamp : null,
        incremental: false,
      });
      if (timestamp !== null) lastTimestamp = timestamp;
      continue;
    }

    if (type === 'text_delta' && typeof data.delta === 'string') {
      proseBytes += byteLength(data.delta);
      continue;
    }
    if (type === 'thinking_delta' && typeof data.delta === 'string') {
      thinkingBytes += byteLength(data.delta);
      continue;
    }

    if (type === 'tool_use' && typeof data.name === 'string') {
      const tool = data.name;
      toolUseFrames += 1;
      outputByTool.set(tool, (outputByTool.get(tool) ?? 0) + serializedBytes(data.input));
      if (typeof data.id === 'string') {
        toolNameById.set(data.id, tool);
        toolInputById.set(data.id, data.input);
      }
      continue;
    }

    if (type === 'tool_result' && typeof data.toolUseId === 'string') {
      const tool = toolNameById.get(data.toolUseId) ?? 'unknown';
      const input = toolInputById.get(data.toolUseId);
      const bytes = serializedBytes(data.content);
      intakeByTool.set(tool, (intakeByTool.get(tool) ?? 0) + bytes);
      intakeItems.push({
        tool,
        label: intakeLabel(tool, input),
        bytes,
        stepIndex: steps.length,
      });
      const key = `${tool}::${stableStringify(input ?? null)}`;
      if (seenInputs.has(key)) {
        duplicateCalls += 1;
        duplicateBytes += bytes;
      } else {
        seenInputs.add(key);
      }
    }
  }

  // --- Cache health and anomalies -----------------------------------------
  const anomalies: RunCostAnomaly[] = [];
  let incrementalSteps = 0;
  let comparableSteps = 0;
  let rewrittenTokens = 0;

  for (let i = 0; i < steps.length - 1; i += 1) {
    const step = steps[i];
    const next = steps[i + 1];
    if (!step || !next) continue;
    const delta = next.contextTokens - step.contextTokens;
    // A negative delta is a context DROP, classified below. Scoring it as a
    // rewrite would blame the step before the drop for the drop itself.
    if (delta < 0) continue;
    const write = step.cacheWriteTokens;
    if (write <= 0) continue;
    comparableSteps += 1;
    if (writeMatchesDelta(write, delta)) {
      step.incremental = true;
      incrementalSteps += 1;
    } else if (write > delta) {
      const excess = write - delta;
      rewrittenTokens += excess;
      anomalies.push({
        kind: 'cache-rewrite',
        stepIndex: i,
        tokens: excess,
        detail: `wrote ${write} tokens but the next step only read ${delta} as new context`,
      });
    }
  }

  for (let i = 1; i < steps.length; i += 1) {
    const step = steps[i];
    const before = steps[i - 1];
    if (!step || !before) continue;
    const previous = before.contextTokens;
    const current = step.contextTokens;
    if (current >= previous) continue;
    // A frame reporting no cached read at all did not make a comparable model
    // call — runs close with exactly such a summary frame. Reading its fall to
    // zero as lost history invents an anomaly at the end of every healthy run.
    if (current === 0) continue;
    // Did the CONTENT leave, or only its cached copy? If the step wrote back
    // roughly what vanished, the conversation is intact and we merely paid to
    // re-cache it. If nothing came back, the history was summarised away.
    const held = current + step.cacheWriteTokens;
    if (held >= previous * 0.9) {
      anomalies.push({
        kind: 'cache-invalidation',
        stepIndex: i,
        tokens: previous - current,
        detail: `cached prefix fell ${previous} -> ${current} while the context held at ~${held}; re-cached, not compacted`,
      });
    } else {
      anomalies.push({
        kind: 'compaction',
        stepIndex: i,
        tokens: previous - current,
        detail: `context shrank ${previous} -> ${current} and was not written back; history was summarised`,
      });
    }
  }

  // --- Term decomposition --------------------------------------------------
  // The preamble is the floor of the curve. Zero-context steps (the first call
  // of a run, before anything is cached) are excluded: treating one as the
  // floor zeroes the preamble term and misattributes the whole curve to
  // transcript accumulation.
  const withContext = steps.filter((s) => s.contextTokens > 0);
  const floor = withContext.length > 0
    ? Math.min(...withContext.map((s) => s.contextTokens))
    : 0;
  const readTotal = withContext.reduce((a, s) => a + s.contextTokens, 0);
  const preambleTokens = floor * withContext.length;
  const transcriptTokens = Math.max(0, readTotal - preambleTokens);

  const terms: RunCostTerms = {
    preambleTokens,
    transcriptTokens,
    cacheWriteTokens: steps.reduce((a, s) => a + s.cacheWriteTokens, 0),
    uncachedInputTokens: steps.reduce((a, s) => a + s.inputTokens, 0),
    outputTokens: steps.reduce((a, s) => a + s.outputTokens, 0),
  };

  const perM = (tokens: number, rate: number) => (tokens / 1_000_000) * rate;
  const usd: RunCostUsd = {
    preamble: perM(terms.preambleTokens, rates.cachedReadPerMTok),
    transcript: perM(terms.transcriptTokens, rates.cachedReadPerMTok),
    cachedRead: perM(readTotal, rates.cachedReadPerMTok),
    cacheWrite: perM(terms.cacheWriteTokens, rates.cacheWritePerMTok),
    uncachedInput: perM(terms.uncachedInputTokens, rates.inputPerMTok),
    output: perM(terms.outputTokens, rates.outputPerMTok),
    total: 0,
  };
  usd.total = usd.cachedRead + usd.cacheWrite + usd.uncachedInput + usd.output;

  // --- Intake drag ---------------------------------------------------------
  const totalSteps = steps.length;
  const items: RunCostIntakeItem[] = intakeItems
    .map((item) => ({
      ...item,
      dragBytes: item.bytes * callsThatReRead(item.stepIndex, totalSteps),
    }))
    .sort((a, b) => b.dragBytes - a.dragBytes);

  const outputToolBytes = [...outputByTool.values()].reduce((a, b) => a + b, 0);
  const outputTotalBytes = outputToolBytes + proseBytes + thinkingBytes;
  const outputByToolShared: RunCostToolBytes[] = [...outputByTool.entries()]
    .map(([tool, bytes]) => ({
      tool,
      bytes,
      share: outputTotalBytes > 0 ? bytes / outputTotalBytes : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    usageScope: detectUsageScope({ usageFrames: steps.length, toolUseFrames }),
    steps,
    terms,
    usd,
    cacheHealth: { incrementalSteps, comparableSteps, rewrittenTokens },
    anomalies,
    output: {
      byTool: outputByToolShared,
      proseBytes,
      thinkingBytes,
      totalBytes: outputTotalBytes,
    },
    intake: {
      byTool: toShares(intakeByTool),
      items,
      totalBytes: items.reduce((a, i) => a + i.bytes, 0),
      totalDragBytes: items.reduce((a, i) => a + i.dragBytes, 0),
      duplicateCalls,
      duplicateBytes,
    },
    rates,
  };
}
