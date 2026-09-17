import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

it.each([
  { mounted: true, failed: false, expected: 1 },
  { mounted: false, failed: false, expected: 0 },
  { mounted: true, failed: true, expected: 0 },
])('reports desktop readiness only for a mounted healthy revealed app: %j', async ({ mounted, failed, expected }) => {
  const source = readFileSync(new URL('../../src/main/runtime.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  const revealWhenReady = async');
  const end = source.indexOf('\n  const schedule =', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  let now = 0;
  const report = vi.fn();
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = runInNewContext(`let revealed=false;let revealing=false;const revealMainWindow=()=>{revealed=true;};${code}\nrevealWhenReady`, {
    stopped: false, rendererFailed: failed, window: { isDestroyed: () => false, webContents: { executeJavaScript: async () => mounted } },
    Date: { now: () => now }, delay: async (ms: number) => { now += ms; }, setSplashStage() {}, splash: null,
    WEB_MOUNT_REVEAL_TIMEOUT_MS: 100, WEB_MOUNT_POLL_MS: 10, MIN_SPLASH_MS: 0, splashStartedAt: 0,
    options: { onMainWindowReady: report },
  }) as () => Promise<void>;
  await run();
  await run();
  expect(report).toHaveBeenCalledTimes(expected);
});
