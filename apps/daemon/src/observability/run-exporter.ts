import type { TelemetryPrefs } from '../app-config.js';

// Compatibility facts remain assembled at the daemon boundary today:
// `langfuse-bridge.ts` supplies the host-composed Prompt stack, attachment and
// artifact references, and event-derived usage/timing/tool facts. The legacy
// adapter owns redaction, local-path scrubbing, field truncation, batch size,
// sink selection, and transport retries. Prompt section token attribution is
// diagnostic estimation; provider-reported usage remains the accounting fact.
// Keeping those responsibilities out of this module lets later normalized
// observations replace the facts type without inheriting a provider protocol.

/**
 * Protocol-neutral eligibility state for exporting one completed run.
 *
 * The daemon deliberately keeps this separate from the legacy Langfuse
 * delivery field names. Future normalizers and exporters can depend on this
 * seam without importing a provider wire contract.
 */
export type RunTelemetryExportExpectation =
  | {
      expected: false;
      status: 'not_expected';
      reason:
        | 'metrics_consent_off'
        | 'content_consent_off'
        | 'missing_sink_config';
    }
  | {
      expected: true;
      status: 'queued';
    };

export function deriveRunTelemetryExportExpectation(
  prefs: TelemetryPrefs,
  hasEffectiveSink: boolean,
): RunTelemetryExportExpectation {
  if (prefs.metrics !== true) {
    return {
      expected: false,
      status: 'not_expected',
      reason: 'metrics_consent_off',
    };
  }
  if (prefs.content !== true) {
    return {
      expected: false,
      status: 'not_expected',
      reason: 'content_consent_off',
    };
  }
  if (!hasEffectiveSink) {
    return {
      expected: false,
      status: 'not_expected',
      reason: 'missing_sink_config',
    };
  }
  return { expected: true, status: 'queued' };
}

/**
 * Exporter boundary between daemon-owned observation facts and a concrete
 * provider adapter. Facts, options, and delivery state remain generic so the
 * coordinator and future normalized observation layer never need provider
 * event types.
 */
export interface RunObservationExporter<TFacts, TOptions, TDelivery> {
  readonly id: string;
  exportRun(facts: TFacts, options: TOptions): Promise<TDelivery>;
}

export function exportRunObservation<TFacts, TOptions, TDelivery>(
  exporter: RunObservationExporter<TFacts, TOptions, TDelivery>,
  facts: TFacts,
  options: TOptions,
): Promise<TDelivery> {
  return exporter.exportRun(facts, options);
}
