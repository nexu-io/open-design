// AGENTS.md -> "Daemon data directory contract" lists this exact pattern as a
// known escape candidate:
//
//   Helper defaults such as `defaultRegistryRoots()` that recompute a data
//   root from `process.env.OD_DATA_DIR` or a cwd fallback instead of receiving
//   `RUNTIME_DATA_DIR`.
//
// `defaultRegistryRoots()` resolved `process.env.OD_DATA_DIR ?? <cwd>/.od` at
// call time and was used as the installer's default root, so any install that
// did not name its root wrote plugin bytes into a directory derived from the
// process environment rather than from the daemon's resolved data root. Plugin
// bytes are executable-adjacent content, so the root must be an explicit
// argument at every call site.

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as registry from '../src/plugins/registry.js';
import { installFromLocalFolder } from '../src/plugins/installer.js';

describe('plugin registry roots contract', () => {
  it('derives the plugin root from an explicit data dir', () => {
    const dataDir = path.join(path.sep, 'srv', 'od-data');
    expect(registry.registryRootsForDataDir(dataDir)).toEqual({
      userPluginsRoot: path.join(dataDir, 'plugins'),
    });
  });

  it('no longer exposes a helper that recomputes the data root from env or cwd', () => {
    expect('defaultRegistryRoots' in registry).toBe(false);
  });

  it('refuses an install that does not name an explicit registry root', async () => {
    // Unchecked caller: no `roots`, which used to fall back to the env/cwd
    // helper. The install must fail loudly before it touches the filesystem.
    const uncheckedInstall = installFromLocalFolder as unknown as (
      db: unknown,
      opts: Record<string, unknown>,
    ) => AsyncGenerator<unknown, void, void>;

    const iterator = uncheckedInstall(null, { source: path.join(path.sep, 'tmp', 'od-nonexistent-plugin') });
    await expect(iterator.next()).rejects.toThrow(/registry root/i);
  });
});