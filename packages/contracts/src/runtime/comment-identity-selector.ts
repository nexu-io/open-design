/** Recognize attribute NAME tokens, never label/id text inside quoted values.
 * This pure, closure-free function is also serialized into iframe bridges.
 */
export function commentSelectorClaimsIdentity(selector: unknown): boolean {
  if (typeof selector !== 'string') return false;
  let quote = '';
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (char === '\\') { i++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char !== '[') continue;
    let cursor = i + 1;
    while (/\s/.test(selector[cursor] ?? '') && cursor < selector.length) cursor++;
    let name = '';
    while (cursor < selector.length) {
      const next = selector[cursor]!;
      if (next === '\\' && cursor + 1 < selector.length) { name += selector[cursor + 1]; cursor += 2; continue; }
      if (!/[a-zA-Z0-9_-]/.test(next)) break;
      name += next;
      cursor++;
    }
    if (name.toLowerCase() === 'data-od-comment-id') return true;
  }
  return false;
}
