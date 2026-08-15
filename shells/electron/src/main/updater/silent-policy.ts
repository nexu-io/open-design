export async function ensureSilentUpdatePreference<T extends { allowSilentUpdates?: boolean }>(
  read: () => Promise<T>,
  write: (next: T & { allowSilentUpdates: true }) => Promise<T>,
): Promise<boolean> {
  const current = await read();
  if (current.allowSilentUpdates !== undefined) return current.allowSilentUpdates === true;
  const persisted = await write({ ...current, allowSilentUpdates: true });
  return persisted.allowSilentUpdates === true;
}
