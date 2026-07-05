/** @module langfuse-trace/payload/cost
 * Cost breakdown, token-usage summaries, and proportional prompt-stack token attribution ("blame").
 * Imports from `core/` only; sibling `timing.ts` calls `buildCostBreakdown` and `tokenUsageSummary`,
 * and `trace-payload.ts` calls those plus `buildPromptStackBlameMetadata`.
 */
import type {
  PromptStackTelemetry,
  PromptTelemetrySection,
} from '../../prompt-telemetry.js';
import type { RunTimingAnalytics } from '../../run-analytics-observability.js';
import {
  PROMPT_STACK_BLAME_MAX_SECTIONS,
  cleanNumber,
} from '../core/index.js';
import type { MessageSummary, ReportContext } from '../core/index.js';

/**
 * Normalises a {@link MessageSummary} usage record into a flat Langfuse-friendly map of
 * token counts, cache stats, and provider-reported vs effective input counts.
 * Returns `undefined` when no usage data is available so callers can omit the field cleanly.
 *
 * @param usage - Raw usage object from the final assistant message.
 * @returns A flat record suitable for Langfuse metadata, or `undefined`.
 */
export function tokenUsageSummary(
  usage: MessageSummary['usage'],
): Record<string, unknown> | undefined {
  if (!usage) return undefined;
  return {
    input: usage.inputTokens,
    input_provider: usage.inputTokensProvider,
    input_effective: usage.inputTokensEffective,
    output: usage.outputTokens,
    total: usage.totalTokens,
    cache_read_input: usage.cacheReadInputTokens,
    cache_creation_input: usage.cacheCreationInputTokens,
    uncached_input: usage.uncachedInputTokens,
    cache_hit_ratio: usage.cacheHitRatio,
    cache_token_source: usage.cacheTokenSource,
  };
}

/**
 * Scans the run's agent-event list from newest to oldest to find the last event that
 * reported a finite, non-negative `cost_usd` value.
 * Returns `undefined` when the agent runtime did not report any cost, so the
 * cost breakdown can mark itself as unavailable rather than reporting zero.
 *
 * @param ctx - The run's {@link ReportContext}.
 * @returns The most-recently reported cost in USD, or `undefined`.
 */
export function latestAgentCostUsd(ctx: ReportContext): number | undefined {
  if (!ctx.agentEvents?.length) return undefined;
  for (let i = ctx.agentEvents.length - 1; i >= 0; i -= 1) {
    const event = ctx.agentEvents[i]!;
    const cost = event.output?.cost_usd;
    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
      return cost;
    }
  }
  return undefined;
}

/**
 * Builds a single entry in the `phase_costs` map: phase name, cost in USD
 * (`null` when the phase is not metered by the provider), the metering status,
 * the attribution source, and an optional explanatory note.
 * Used exclusively by {@link buildCostBreakdown}.
 *
 * @param phase  - Phase identifier string (e.g. `"prompt-build"`, `"agent-call"`).
 * @param costUsd - Provider-reported cost in USD, or `null` when not applicable.
 * @param status  - Metering status string (e.g. `"available"`, `"not_metered"`).
 * @param source  - Attribution source (e.g. `"agent_usage_event"`, `"not_applicable"`).
 * @param note    - Optional human-readable explanation of the status.
 * @returns A plain record ready for inclusion in the `phase_costs` metadata object.
 */
export function phaseCost(
  phase: string,
  costUsd: number | null,
  status: string,
  source: string,
  note?: string,
): Record<string, unknown> {
  return {
    phase,
    cost_usd: costUsd,
    cost_status: status,
    cost_source: source,
    ...(note ? { note } : {}),
  };
}

/**
 * Assembles the full cost object for a completed run: top-level `cost_usd` sourced
 * from the latest agent event via {@link latestAgentCostUsd}, currency and pricing-version
 * metadata, a token-usage summary from {@link tokenUsageSummary}, and a `phase_costs`
 * breakdown covering every instrumented pipeline phase.
 * Consumed by both `timing.ts` (to annotate the agent-call span) and
 * `trace-payload.ts` (for the trace and generation metadata).
 *
 * @param ctx - The run's {@link ReportContext}.
 * @returns A cost metadata record including per-phase cost entries.
 */
export function buildCostBreakdown(ctx: ReportContext): Record<string, unknown> {
  const costUsd = latestAgentCostUsd(ctx);
  const hasCost = costUsd !== undefined;
  return {
    cost_usd: costUsd ?? null,
    currency: 'USD',
    pricing_version: hasCost ? 'provider_reported' : 'unavailable',
    cost_source: hasCost ? 'agent_usage_event' : 'unavailable',
    cost_status: hasCost ? 'available' : 'unavailable',
    unavailable_reason: hasCost
      ? undefined
      : 'agent runtime did not report total_cost_usd',
    token_usage: tokenUsageSummary(ctx.message.usage),
    phase_costs: {
      prompt_build: phaseCost(
        'prompt-build',
        null,
        'not_metered',
        'not_applicable',
        'local prompt assembly; no provider call in this phase',
      ),
      agent_call: phaseCost(
        'agent-call',
        costUsd ?? null,
        hasCost ? 'available' : 'unavailable',
        hasCost ? 'agent_usage_event' : 'unavailable',
        hasCost
          ? 'provider-reported total for the agent call; not split across stream/tools/artifact internally'
          : 'runtime did not report total_cost_usd',
      ),
      tool_execution: phaseCost(
        'tool-execution',
        null,
        'included_in_agent_call_or_not_metered',
        'not_split',
        'tool spans are local process/tool time; provider token cost is only available at agent-call granularity',
      ),
      artifact_generation: phaseCost(
        'artifact-generation',
        null,
        'included_in_agent_call',
        'not_split',
        'artifact output is generated inside the agent call and is not separately priced',
      ),
      verification: phaseCost(
        'verification',
        null,
        'not_instrumented',
        'unavailable',
        'preview/screenshot/responsive verification is not yet emitted as a structured measured phase',
      ),
    },
  };
}

/**
 * Returns the byte count used to weight a prompt-stack section during proportional
 * token attribution. Prefers `redactedBytes` over `rawBytes` to avoid inflating
 * estimates with content the model never actually saw.
 *
 * @param section - A single prompt-stack telemetry section.
 * @returns The attribution byte count (0 when both fields are absent).
 */
export function sectionAttributionBytes(section: PromptTelemetrySection): number {
  return cleanNumber(section.redactedBytes) ?? cleanNumber(section.rawBytes) ?? 0;
}

/**
 * Counts the UTF-8 byte length of a section's redacted content string.
 * Used as an independent sanity check against the section's declared byte counts
 * when building the blame metadata.
 *
 * @param section - A single prompt-stack telemetry section.
 * @returns UTF-8 byte length of `section.redactedContent`, or 0 if absent.
 */
export function redactedContentBytes(section: PromptTelemetrySection): number {
  return Buffer.byteLength(section.redactedContent ?? '', 'utf8');
}

/**
 * Distributes a total token count across prompt sections by their relative byte weights,
 * using floor allocation with the remainder assigned to the largest-by-weight section.
 * This ensures the distributed sum equals `Math.round(total)` exactly.
 * Returns an empty map when `total` is absent/zero or when all section weights are zero.
 *
 * @param total    - The aggregate token count to distribute (e.g. `cacheCreationInputTokens`).
 * @param sections - Weighted section entries produced from the prompt-stack sections list.
 * @returns A map from each section to its estimated token allocation.
 */
export function allocateProportionalTokens(
  total: number | undefined,
  sections: Array<{ section: PromptTelemetrySection; weightBytes: number }>,
): Map<PromptTelemetrySection, number> {
  const out = new Map<PromptTelemetrySection, number>();
  const cleanTotal = cleanNumber(total);
  if (cleanTotal === undefined || cleanTotal <= 0) return out;
  const totalWeight = sections.reduce((sum, item) => sum + item.weightBytes, 0);
  if (totalWeight <= 0) return out;

  let assigned = 0;
  let largest: { section: PromptTelemetrySection; tokens: number } | null = null;
  for (const item of sections) {
    const exact = (cleanTotal * item.weightBytes) / totalWeight;
    const rounded = Math.floor(exact);
    out.set(item.section, rounded);
    assigned += rounded;
    if (!largest || item.weightBytes > sectionAttributionBytes(largest.section)) {
      largest = { section: item.section, tokens: rounded };
    }
  }
  const remainder = Math.round(cleanTotal) - assigned;
  if (largest && remainder > 0) {
    out.set(largest.section, (out.get(largest.section) ?? 0) + remainder);
  }
  return out;
}

/**
 * Produces the full "blame" picture of which prompt-stack sections consumed which share of
 * input tokens and contributed to time-to-first-token.
 * Emits `promptStack_topSectionsByBytes` (top sections with per-section token estimates),
 * `cacheCreationTokensBySection` (sections that consumed cache-creation budget), and
 * `promptStack_ttftAttribution` (TTFT timing annotated with the primary section's share).
 * Returns an empty object when no prompt-stack telemetry is available or when
 * all sections have zero attribution bytes.
 *
 * @param promptStack - The assembled prompt-stack telemetry, or `undefined`.
 * @param usage       - Token-usage data from the final message, or `undefined`.
 * @param timings     - Run timing analytics for TTFT annotation, or `undefined`.
 * @returns A flat record of blame metadata fields ready for spread into trace/generation metadata.
 */
export function buildPromptStackBlameMetadata(
  promptStack: PromptStackTelemetry | undefined,
  usage: MessageSummary['usage'] | undefined,
  timings: RunTimingAnalytics | undefined,
): Record<string, unknown> {
  if (!promptStack || promptStack.sections.length === 0) return {};
  const weightedSections = promptStack.sections
    .map((section) => ({
      section,
      weightBytes: sectionAttributionBytes(section),
    }))
    .filter((item) => item.weightBytes > 0);
  if (weightedSections.length === 0) return {};

  const totalBytes = weightedSections.reduce((sum, item) => sum + item.weightBytes, 0);
  const sorted = [...weightedSections].sort(
    (a, b) => b.weightBytes - a.weightBytes || a.section.ordinal - b.section.ordinal,
  );
  const cacheCreationBySection = allocateProportionalTokens(
    usage?.cacheCreationInputTokens,
    weightedSections,
  );
  const cacheReadBySection = allocateProportionalTokens(
    usage?.cacheReadInputTokens,
    weightedSections,
  );
  const inputEffectiveBySection = allocateProportionalTokens(
    usage?.inputTokensEffective ?? usage?.inputTokens,
    weightedSections,
  );
  const uncachedBySection = allocateProportionalTokens(
    usage?.uncachedInputTokens,
    weightedSections,
  );

  const sectionRow = ({ section, weightBytes }: { section: PromptTelemetrySection; weightBytes: number }) => {
    const share = totalBytes > 0 ? weightBytes / totalBytes : 0;
    return {
      kind: section.kind,
      ordinal: section.ordinal,
      contentMode: section.contentMode,
      rawBytes: section.rawBytes,
      redactedBytes: section.redactedBytes,
      redactedContentBytes: redactedContentBytes(section),
      attributionBytes: weightBytes,
      attributionShare: Number(share.toFixed(6)),
      truncated: section.truncated,
      ...(section.truncationReason ? { truncationReason: section.truncationReason } : {}),
      estimatedInputEffectiveTokens: inputEffectiveBySection.get(section) ?? undefined,
      estimatedCacheCreationInputTokens: cacheCreationBySection.get(section) ?? undefined,
      estimatedCacheReadInputTokens: cacheReadBySection.get(section) ?? undefined,
      estimatedUncachedInputTokens: uncachedBySection.get(section) ?? undefined,
    };
  };

  const primary = sorted[0]!;
  const primaryShare = totalBytes > 0 ? primary.weightBytes / totalBytes : 0;
  return {
    promptStack_topSectionsByBytes: sorted
      .slice(0, PROMPT_STACK_BLAME_MAX_SECTIONS)
      .map(sectionRow),
    cacheCreationTokensBySection: sorted
      .filter(({ section }) => (cacheCreationBySection.get(section) ?? 0) > 0)
      .map(({ section, weightBytes }) => ({
        kind: section.kind,
        ordinal: section.ordinal,
        attributionBytes: weightBytes,
        estimatedCacheCreationInputTokens: cacheCreationBySection.get(section) ?? 0,
      })),
    promptStack_ttftAttribution: {
      method: 'proportional_by_prompt_section_redacted_bytes',
      estimation_warning:
        'Provider reports aggregate prompt/cache tokens only; section token values are estimates for diagnosis, not billing truth.',
      time_to_first_token_ms: timings?.time_to_first_token_ms,
      spawn_to_first_token_ms: timings?.spawn_to_first_token_ms,
      totalAttributionBytes: totalBytes,
      sectionCount: weightedSections.length,
      primarySectionKind: primary.section.kind,
      primarySectionOrdinal: primary.section.ordinal,
      primarySectionAttributionBytes: primary.weightBytes,
      primarySectionAttributionShare: Number(primaryShare.toFixed(6)),
      primarySectionEstimatedInputEffectiveTokens:
        inputEffectiveBySection.get(primary.section) ?? undefined,
      primarySectionEstimatedCacheCreationInputTokens:
        cacheCreationBySection.get(primary.section) ?? undefined,
      primarySectionEstimatedCacheReadInputTokens:
        cacheReadBySection.get(primary.section) ?? undefined,
      cacheTokenSource: usage?.cacheTokenSource,
    },
  };
}
