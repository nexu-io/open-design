import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const runtime = readFileSync(new URL(
  '../../../../plugins/_official/examples/open-design-homepage/assets/_next/static/chunks/turbopack-425288158aa66df2.js',
  import.meta.url,
), 'utf8');

describe('bundled homepage hydration', () => {
  it.each(['relative', 'root-relative', 'absolute', 'workspace-scoped'] as const)(
    'starts the app after its %s script chunks register',
    async (mode) => {
      const baseURI = 'http://localhost:17456/api/plugins/example-open-design-homepage/asset/';
      const suffix = mode === 'workspace-scoped' ? '?workspaceId=workspace&workspaceMemberId=member' : '';
      const script = (file: string) => ({
        getAttribute: () => {
          const relative = `./assets/_next/static/chunks/${file}.js`;
          return (mode === 'relative' ? relative : mode === 'root-relative' ? new URL(relative, baseURI).pathname : new URL(relative, baseURI).href) + suffix;
        },
      });
      let started = false;
      let hydrated = false;
      // Use the shipped loader, registering its real bootstrap dependency IDs.
      // The renderer rewrites script src attributes to scoped absolute URLs;
      // those must resolve the same promises as relative otherChunks entries.
      const context = {
        URL,
        document: {
          baseURI,
          currentScript: script('turbopack-425288158aa66df2'),
          querySelectorAll: () => [{ addEventListener: () => {} }],
        },
        TURBOPACK: [
          [script('56b0d8f9f2c1e441'), 52699, (loader: { L: (url: string) => Promise<void> }) => {
            started = true;
            // Flight refers to unscoped relative URLs even though initial
            // scripts carry workspace query parameters. Both must share a promise.
            loader.L('./assets/_next/static/chunks/1552c7742c37f06d.js').then(() => {
              hydrated = true;
            });
          }],
          [script('7cc1924554447827'), 1, () => {}],
        ],
        remainingChunks: [
          [script('83f95f6c165018c5'), 2, () => {}],
          [script('8c2d1abc8462562b'), 3, () => {}],
          [script('1552c7742c37f06d'), 4, () => {}],
        ],
      };
      // Drain the loader's Promise.all at the VM boundary, without timers.
      runInNewContext(
        `self = globalThis; ${runtime}\nremainingChunks.forEach(chunk => TURBOPACK.push(chunk));`,
        context,
        { microtaskMode: 'afterEvaluate' },
      );
      // Completion callbacks are test-realm functions; drain that queue too.
      await Promise.resolve();
      expect(started).toBe(true);
      expect(hydrated).toBe(true);
    },
  );
});
