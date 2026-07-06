/** @module agent-protocol/pi-rpc/models
 * Parses `pi --list-models` tabular stdout into the daemon's model-picker format.
 * No network I/O — accepts the raw stdout string and returns a typed array or null.
 */

/** A single model entry for the daemon's model-picker: an opaque id and a display label. */
export type PiModelOption = { id: string; label: string };
/**
 * Parses the tabular stdout of `pi --list-models` into an array of model options.
 * The first entry is always the `default` sentinel (\"Default (CLI config)\").
 * Provider/model pairs are de-duplicated; the header line is skipped.
 * Returns `null` when the output is empty or contains no parseable rows beyond
 * the header.
 *
 * @param stdout - Raw stdout captured from `pi --list-models`, as a string or Buffer.
 * @returns Parsed model array (at least 2 entries), or `null` when nothing is found.
 */
export function parsePiModels(stdout: unknown): PiModelOption[] | null {
  const lines = String(stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length === 0) return null;

  const DEFAULT_MODEL_OPTION = { id: 'default', label: 'Default (CLI config)' };

  // First line is the header; skip it.
  const entries = [DEFAULT_MODEL_OPTION];
  const seen = new Set(['default']);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const provider = parts[0];
    const modelId = parts[1];
    if (provider === undefined || modelId === undefined) continue;
    // Skip duplicates (some providers list the same model under multiple names).
    const fullId = `${provider}/${modelId}`;
    if (seen.has(fullId)) continue;
    seen.add(fullId);
    entries.push({ id: fullId, label: fullId });
  }

  return entries.length > 1 ? entries : null;
}
