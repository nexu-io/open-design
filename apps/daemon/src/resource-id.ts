export function isSafeResourceId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > 128) return false;
  if (/^\.+$/.test(id)) return false;
  return /^[A-Za-z0-9._-]+$/.test(id);
}
