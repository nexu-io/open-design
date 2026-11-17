import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SHARE_TOKENS = join(__dirname, '../../src/styles/share-tokens.css');
const TOKEN_DECL = /(--share-[a-z0-9-]+)\s*:\s*([^;]+);/g;
const TOKEN_REF = /var\((--share-[a-z0-9-]+)\)/g;

function shareTokens(): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of readFileSync(SHARE_TOKENS, 'utf8').matchAll(TOKEN_DECL)) {
    const [, name, value] = match;
    if (name && value) tokens.set(name, value.trim());
  }
  return tokens;
}

/**
 * Read a share stylesheet with every `var(--share-*)` replaced by its value
 * from `styles/share-tokens.css` (tokens may reference other tokens).
 *
 * Static CSS-contract tests assert the rendered design values (#29292B, 32px,
 * …). Share styles now reference those values through tokens, so the
 * contract is checked against the resolved value rather than the token name;
 * an unknown token throws instead of silently passing.
 */
export function readShareCss(filePath: string): string {
  const tokens = shareTokens();
  const resolveValue = (text: string, depth = 0): string => text.replace(TOKEN_REF, (_, name: string) => {
    const value = tokens.get(name);
    if (value === undefined) throw new Error(`Unknown share token ${name} in ${filePath}`);
    if (depth > 8) throw new Error(`Share token cycle at ${name}`);
    return resolveValue(value, depth + 1);
  });
  return resolveValue(readFileSync(filePath, 'utf8'));
}
