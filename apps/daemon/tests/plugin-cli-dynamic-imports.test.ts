// Regression guard for the CLI capability-barrel split (PR #5127, per
// @mrcfps's review). The plugin subcommand modules under `src/cli/plugin/`
// are `@ts-nocheck` and reach their implementations at `src/plugins/` through
// `await import('../../plugins/<x>.js')`. Because those specifiers are
// dynamic-import STRINGS, `tsc` cannot verify them: a stale path left over
// from the pre-move `cli.ts` location (e.g. `./plugins/<x>.js`) still compiles
// green but throws `ERR_MODULE_NOT_FOUND` at runtime, silently breaking
// `od plugin scaffold` and its siblings.
//
// This test resolves every relative dynamic-import specifier in those files
// and asserts the target module exists — and actually loads the scaffold
// branch — so the broken-path class cannot regress again undetected.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_CLI_DIR = pathResolve(__dirname, '../src/cli/plugin');

/** Extracts relative (`.`-prefixed) dynamic-import specifiers from a source file. */
function relativeDynamicImports(fileAbs: string): string[] {
  const src = readFileSync(fileAbs, 'utf8');
  const specs: string[] = [];
  const re = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    const spec = match[1];
    if (spec) specs.push(spec);
  }
  return specs;
}

/** Resolves an ESM `.js` specifier to its on-disk `.ts` source, relative to the importer. */
function resolveModule(fromFileAbs: string, spec: string): string {
  return pathResolve(dirname(fromFileAbs), spec.replace(/\.js$/, '.ts'));
}

const pluginFiles = readdirSync(PLUGIN_CLI_DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => pathResolve(PLUGIN_CLI_DIR, f));

describe('od plugin CLI dynamic imports', () => {
  it('finds the plugin subcommand files and their relative dynamic imports', () => {
    expect(pluginFiles.length).toBeGreaterThan(0);
    const total = pluginFiles.reduce((n, f) => n + relativeDynamicImports(f).length, 0);
    // Guards against the regex silently matching nothing (vacuous pass).
    expect(total).toBeGreaterThan(0);
  });

  it('resolves every relative dynamic import to an existing implementation module', () => {
    const missing: string[] = [];
    for (const file of pluginFiles) {
      for (const spec of relativeDynamicImports(file)) {
        const target = resolveModule(file, spec);
        if (!existsSync(target)) {
          missing.push(`${file.replace(PLUGIN_CLI_DIR, 'cli/plugin')} -> ${spec}`);
        }
      }
    }
    expect(missing, `unresolved plugin dynamic imports:\n${missing.join('\n')}`).toEqual([]);
  });

  it('loads the scaffold branch import path at runtime (guards ERR_MODULE_NOT_FOUND)', async () => {
    const devFile = pathResolve(PLUGIN_CLI_DIR, 'dev.ts');
    const scaffoldSpec = relativeDynamicImports(devFile).find((s) => s.includes('plugins/scaffold'));
    expect(scaffoldSpec, 'dev.ts should dynamically import plugins/scaffold').toBeTruthy();
    const mod = await import(resolveModule(devFile, scaffoldSpec!));
    expect(typeof mod.scaffoldPlugin).toBe('function');
  });
});
