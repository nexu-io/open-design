/**
 * Clamp a meta / OpenGraph / Twitter description to a search-friendly length.
 *
 * Google truncates snippets around 155–160 chars and social cards around 200;
 * shipping a 250–270 char description just gets cut mid-sentence in the SERP
 * and trips "description too long" audits. We trim at a word boundary (when one
 * exists — CJK has none, so it hard-cuts) and append an ellipsis so the tag
 * stays a clean phrase.
 *
 * Source strings are never mutated: callers pass their full description and
 * render the returned value only into <meta> tags, so this clamps every page
 * and locale from the handful of head-rendering layouts that import it.
 */
export const META_DESCRIPTION_MAX = 160;

export function clampDescription(text: string, max = META_DESCRIPTION_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const base = (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).replace(
    /[\s,.;:—–-]+$/u,
    '',
  );
  return `${base}…`;
}
