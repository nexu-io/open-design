/**
 * Shared test helper for slicing a CSS source string by selector.
 *
 * The escape order matters. We do regex-special escaping FIRST, then
 * replace real newline characters with the regex-source token `\s+`:
 *
 * 1. Escape first: `selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`
 *    turns `.` into `\.`, `+` into `\+`, etc. The newline character
 *    is NOT in the escape set, so it survives this step unchanged.
 *
 * 2. Replace newlines after: `selector.replace(/\n/g, '\\s+')` swaps
 *    each remaining `\n` (the literal newline) for the three chars
 *    `\s+`. When that string is fed to `new RegExp`, the regex engine
 *    reads `\s+` as a whitespace matcher, which is what we want.
 *
 * If we did it the other way round (newlines → `\s+` first, then
 * escape) the `+` inside the just-inserted `\s+` would itself get
 * escaped to `\+` and the `\s` would be turned into `\\s`, so the
 * resulting regex would look for "literal backslash, then s, then
 * literal +" instead of whitespace.
 *
 * The helper is shared by both `filter-pill.test.ts` and
 * `settings-polish.test.ts`, both of which used to carry local
 * copies of the same buggy function.
 */
export function cssBlock(css: string, selector: string): string {
  const escaped = selector
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\n/g, "\\s+");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? "";
}
