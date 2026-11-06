/** Link-group label colours; teal, violet, white and red belong to clips, selection and the sync badge. */
export const LINK_LABEL_COLORS = [
  "var(--color-amber-500)",
  "var(--color-sky-400)",
  "var(--color-green-400)",
  "var(--color-pink-400)",
  "var(--color-orange-400)",
  "var(--color-amber-300)",
] as const;

function stableIndex(link: string): number {
  const numbered = /^lk-(\d+)$/.exec(link);
  if (numbered) return Number(numbered[1]) - 1;
  let hash = 0;
  for (const char of link) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

/** The same colour for every member of a link group, from its id alone. */
export function linkLabelColor(link: string | undefined): string | null {
  if (!link) return null;
  const count = LINK_LABEL_COLORS.length;
  return LINK_LABEL_COLORS[((stableIndex(link) % count) + count) % count] ?? null;
}
