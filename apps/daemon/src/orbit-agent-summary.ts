const NO_LIVE_ARTIFACT_SUMMARY =
  'Agent succeeded but did not register a live artifact for this Orbit run.';

const MAX_FINAL_EXPLANATION_CHARS = 2_000;

interface RunEventRecord {
  event?: unknown;
  data?: unknown;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function textDeltaFromEvent(record: RunEventRecord): string | null {
  if (record.event !== 'agent') return null;
  const data = asObject(record.data);
  if (!data || data.type !== 'text_delta') return null;
  return typeof data.delta === 'string' ? data.delta : null;
}

export function extractOrbitAgentFinalExplanation(events: readonly RunEventRecord[]): string | null {
  const text = events
    .map(textDeltaFromEvent)
    .filter((delta): delta is string => delta !== null)
    .join('')
    .trim();
  if (!text) return null;
  if (text.length <= MAX_FINAL_EXPLANATION_CHARS) return text;
  return `${text.slice(0, MAX_FINAL_EXPLANATION_CHARS).trimEnd()}...`;
}

export function buildOrbitNoLiveArtifactSummary(events: readonly RunEventRecord[]): string {
  const explanation = extractOrbitAgentFinalExplanation(events);
  return explanation
    ? `${NO_LIVE_ARTIFACT_SUMMARY}\n\n${explanation}`
    : NO_LIVE_ARTIFACT_SUMMARY;
}
