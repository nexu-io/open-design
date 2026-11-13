import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { COMMENT_IDENTITY_HELPERS } from '../src/runtime/comment-identity-helpers.js';

const uuid = '12345678-1234-4234-8234-123456789abc';
const helpersEntry = fileURLToPath(new URL('../src/runtime/comment-identity-helpers.ts', import.meta.url));

// The preview bridges paste the helpers into an iframe script and then call
// `commentSelectorClaimsIdentity(...)` by that name, so the serialized source
// must define the name itself whatever the bundler did to the function.
function claimsIdentityInBridge(helpers: string, selector: string): unknown {
  return new Function('selector', `${helpers}\nreturn commentSelectorClaimsIdentity(selector);`)(selector);
}

async function minifiedHelpers(): Promise<string> {
  const result = await build({
    entryPoints: [helpersEntry],
    bundle: true,
    minify: true,
    format: 'cjs',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  });
  const module = { exports: {} as { COMMENT_IDENTITY_HELPERS?: string } };
  new Function('module', 'exports', result.outputFiles[0]!.text)(module, module.exports);
  return module.exports.COMMENT_IDENTITY_HELPERS!;
}

describe('comment identity helpers serialized into preview bridges', () => {
  it('expose commentSelectorClaimsIdentity by its source name', () => {
    expect(claimsIdentityInBridge(COMMENT_IDENTITY_HELPERS, `[data-od-comment-id="${uuid}"]`)).toBe(true);
    expect(claimsIdentityInBridge(COMMENT_IDENTITY_HELPERS, 'main > p:nth-child(2)')).toBe(false);
  });

  it('keep that name after a production minifier renames the function', async () => {
    const helpers = await minifiedHelpers();
    expect(claimsIdentityInBridge(helpers, `[data-od-comment-id="${uuid}"]`)).toBe(true);
    expect(claimsIdentityInBridge(helpers, 'main > p:nth-child(2)')).toBe(false);
  });
});
