/** @module langfuse-trace/reporting/report
 * Orchestration entrypoints for Langfuse telemetry reporting: applies the consent gate,
 * derives delivery state, builds the trace or feedback payload, enforces the byte-size cap,
 * and dispatches to the relay or direct Langfuse transport.
 * Imports from core/, config/, payload/, and delivery/.
 */
import {
  HARD_BATCH_MAX_BYTES,
} from '../core/index.js';
import type {
  FeedbackReportContext,
  LangfuseDeliveryState,
  ReportContext,
  ReportRunOpts,
} from '../core/index.js';
import {
  deriveLangfuseDeliveryState,
  resolveReportConfig,
} from '../config/index.js';
import { buildFeedbackPayload, buildTracePayload } from '../payload/index.js';
import { postLangfuseBatch, postRelayBatch } from '../delivery/index.js';

/**
 * @internal
 * One-shot process-wide flag set the first time telemetry metrics are enabled but no relay
 * URL or Langfuse credentials are found. Subsequent runs in the same daemon process are
 * silently skipped to avoid per-run warning noise; the warning fires at most once per
 * daemon process lifetime regardless of how many agent runs complete.
 */
let missingTelemetrySinkWarned = false;

/**
 * Reports a completed agent run to Langfuse. Applies the consent gate (metrics + content
 * must both be opted in), resolves the sink config, builds the full trace payload, enforces
 * the UTF-8 byte-size cap, and dispatches to the relay or direct Langfuse transport.
 * Returns the final {@link LangfuseDeliveryState} so the daemon can persist it on the run record.
 * @param ctx - Run context including prefs, run metadata, and telemetry data.
 * @param opts - Optional overrides for sink config and fetch implementation.
 * @returns The delivery state indicating accepted, failed, or not_expected.
 */
export async function reportRunCompleted(
  ctx: ReportContext,
  opts: ReportRunOpts = {},
): Promise<LangfuseDeliveryState> {
  const notExpected = deriveLangfuseDeliveryState(ctx.prefs, null);
  if (ctx.prefs.metrics !== true) return notExpected;
  if (ctx.prefs.content !== true) return notExpected;

  const config = resolveReportConfig(opts);
  const langfuseDelivery = deriveLangfuseDeliveryState(ctx.prefs, config);
  if (!config) {
    if (!missingTelemetrySinkWarned) {
      // Warn once per daemon process; packaged config is loaded at process
      // start, so repeated run-level warnings would only add noise.
      missingTelemetrySinkWarned = true;
      console.warn(
        '[langfuse-trace] Telemetry metrics are enabled but no relay or Langfuse credentials are configured',
      );
    }
    return langfuseDelivery;
  }

  let batch: unknown[];
  try {
    batch = buildTracePayload({ ...ctx, langfuse: langfuseDelivery });
  } catch (error) {
    console.warn(`[langfuse-trace] Payload build error: ${String(error)}`);
    return {
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'payload_too_large',
    };
  }

  const serialized = JSON.stringify({ batch });
  // Compare actual UTF-8 byte length, not String.length (UTF-16 code units),
  // so the cap matches the byte-oriented contract documented in the spec
  // (and the byte-oriented limit Langfuse enforces server-side).
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  if (serializedBytes > HARD_BATCH_MAX_BYTES) {
    console.warn(
      `[langfuse-trace] Batch too large (${serializedBytes}B > ${HARD_BATCH_MAX_BYTES}B), dropping trace ${ctx.run.runId}`,
    );
    return {
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'payload_too_large',
    };
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (config.kind === 'relay') {
    return postRelayBatch(config, serialized, fetchImpl);
  }
  return postLangfuseBatch(config, batch, fetchImpl);
}

/**
 * Reports user score feedback for a completed run to Langfuse. Mirrors the consent gate
 * and size-cap logic of {@link reportRunCompleted} but builds a feedback-only payload and
 * returns void, because feedback delivery is fire-and-forget and callers do not record a
 * feedback delivery state on the run record.
 * @param ctx - Feedback context including prefs, run ID, and score data.
 * @param opts - Optional overrides for sink config and fetch implementation.
 */
export async function reportRunFeedback(
  ctx: FeedbackReportContext,
  opts: ReportRunOpts = {},
): Promise<void> {
  if (ctx.prefs.metrics !== true) return;
  if (ctx.prefs.content !== true) return;

  const config = resolveReportConfig(opts);
  if (!config) return;

  let batch: unknown[];
  try {
    batch = buildFeedbackPayload(ctx);
  } catch (error) {
    console.warn(`[langfuse-trace] Feedback payload build error: ${String(error)}`);
    return;
  }

  const serialized = JSON.stringify({ batch });
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  if (serializedBytes > HARD_BATCH_MAX_BYTES) {
    console.warn(
      `[langfuse-trace] Feedback batch too large (${serializedBytes}B > ${HARD_BATCH_MAX_BYTES}B), dropping feedback for ${ctx.runId}`,
    );
    return;
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (config.kind === 'relay') {
    await postRelayBatch(config, serialized, fetchImpl);
    return;
  }
  await postLangfuseBatch(config, batch, fetchImpl);
}
