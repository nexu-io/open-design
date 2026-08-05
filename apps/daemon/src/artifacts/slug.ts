/** Create the filesystem-safe artifact directory suffix used by the save route. */
export function sanitizeArtifactSlug(value: unknown): string {
  return String(value)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
