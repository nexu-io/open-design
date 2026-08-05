/**
 * Normalize legacy tool input before it is written to the persisted event
 * stream. Providers may still emit camelCase `filePath`, while replay and
 * artifact extraction consume the canonical snake_case key.
 */
export function normalizePersistedToolInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;

  const record = input as Record<string, unknown>;
  if (typeof record.filePath === 'string') {
    return { ...record, file_path: record.filePath };
  }
  return input;
}
