import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

// Regression guard for `od mcp`: the stdio MCP server implementation (`runMcpStdio`)
// lives in `src/mcp.ts` and is loaded by `src/cli/mcp/mcp.ts` through a *dynamic*
// import so `od` invocations that never start the server don't pay its startup cost.
//
// When the CLI god-file was split into `cli/`, that dynamic specifier was left as the
// (now self-referential) `'./mcp.js'`, which resolves to the cli module itself — a file
// that does not export `runMcpStdio`. Result: `od mcp` crashed at runtime with
// "runMcpStdio is not a function". Because the module is @ts-nocheck and the import is
// dynamic, neither typecheck nor build caught it.
//
// This test reads the real specifier out of the source and resolves it exactly the way
// Node will at runtime — relative to `cli/mcp/mcp.ts` — then asserts the target actually
// exports `runMcpStdio`. A revert to `'./mcp.js'` (or any path that misses the impl) goes
// red here.
it('od mcp resolves runMcpStdio from its dynamic import specifier', async () => {
  const cliMcpUrl = new URL('../src/cli/mcp/mcp.ts', import.meta.url);
  const source = await readFile(cliMcpUrl, 'utf8');

  const match = source.match(/const \{ runMcpStdio \} = await import\(['"]([^'"]+)['"]\)/);
  const specifier = match?.[1];
  expect(specifier, 'expected a dynamic `import(...)` for runMcpStdio in cli/mcp/mcp.ts').toBeTruthy();
  if (!specifier) return;
  // Resolve relative to the cli/mcp module, mapping the emitted `.js` back to the `.ts`
  // source vitest actually loads.
  const resolved = new URL(specifier.replace(/\.js$/, '.ts'), cliMcpUrl);
  const mod = await import(resolved.href);

  expect(typeof mod.runMcpStdio).toBe('function');
});
