export function sanitizeArchiveFilename(raw: unknown): string {
  const cleaned = String(raw ?? '')
    // In Unicode mode this range matches lone surrogates, not valid pairs.
    .replace(/[\uD800-\uDFFF]/gu, '\uFFFD')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  // Keep the existing length bound without passing half a character to
  // encodeURIComponent when export routes build their filename* header.
  return cleaned.replace(/[\uD800-\uDBFF]$/u, '');
}
