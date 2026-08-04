// @vitest-environment node

import { describe, expect, test, vi } from 'vitest';

import {
  initializePlaywrightRunNamespace,
  PLAYWRIGHT_RUN_NAMESPACE_ENV,
  resolvePlaywrightSlotNamespace,
} from '@/playwright/runtime-identity';
import { warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import type { RunToolsDevJsonOptions } from '@/tools-dev/cli';
import { createToolsDevSuite } from '@/tools-dev/runtime';
import type { ToolsDevRuntimeDependencies } from '@/tools-dev/runtime';
import type { ToolsDevSuiteSpec } from '@/tools-dev/types';

describe('Playwright tools-dev runtime lifecycle', () => {
  test('keeps a replacement worker on the same logical parallel slot', () => {
    const env: Record<string, string | undefined> = {};
    expect(initializePlaywrightRunNamespace(env, () => 'run-token')).toBe('playwright-run-token');
    expect(env[PLAYWRIGHT_RUN_NAMESPACE_ENV]).toBe('playwright-run-token');

    expect(resolvePlaywrightSlotNamespace(0, env)).toBe('playwright-run-token-w0');
    expect(resolvePlaywrightSlotNamespace(0, env)).toBe('playwright-run-token-w0');
    expect(resolvePlaywrightSlotNamespace(1, env)).toBe('playwright-run-token-w1');
  });

  test('uses the explicit namespace as a prefix while keeping concurrent runs isolated', () => {
    const env = {
      OD_E2E_NAMESPACE: 'focused route stress',
    };
    expect(initializePlaywrightRunNamespace(env, () => 'run-token')).toBe(
      'focused-route-stress-run-token',
    );
    expect(resolvePlaywrightSlotNamespace(2, env)).toBe('focused-route-stress-run-token-w2');
  });

  test('preserves an inherited exact run namespace across Playwright processes', () => {
    const env = {
      OD_E2E_NAMESPACE: 'ignored-prefix',
      [PLAYWRIGHT_RUN_NAMESPACE_ENV]: 'generated-run',
    };
    expect(initializePlaywrightRunNamespace(env, () => 'unused')).toBe('generated-run');
    expect(resolvePlaywrightSlotNamespace(2, env)).toBe('generated-run-w2');
  });

  test('clears the previous slot incarnation before allocating ports and passes its owner pid', async () => {
    const calls: Array<{ args: string[]; timeoutMs: number | undefined }> = [];
    const order: string[] = [];
    const spec: ToolsDevSuiteSpec = {
      codexHomeDir: '/tmp/codex-home',
      dataDir: '/tmp/data',
      namespace: 'playwright-run-w0',
      ownerPid: 4242,
      root: '/tmp/root',
      toolsDevRoot: '/tmp/tools-dev',
    };
    const runJson: ToolsDevRuntimeDependencies['runJson'] = async <T>(
      _workspaceRoot: string,
      _suite: ToolsDevSuiteSpec,
      args: string[],
      _env: Record<string, string | undefined> = {},
      options?: RunToolsDevJsonOptions,
    ): Promise<T> => {
      calls.push({ args, timeoutMs: options?.timeoutMs });
      order.push(args[0] === 'stop' ? 'stop' : 'start');
      if (args[0] === 'start') {
        return {
          daemon: { status: { url: 'http://127.0.0.1:31001' } },
          web: { status: { url: 'http://127.0.0.1:31002' } },
        } as T;
      }
      return {} as T;
    };
    const suite = createToolsDevSuite(spec, {
      allocatePorts: async () => {
        order.push('allocate');
        return {
          daemonPort: 31001,
          webPort: 31002,
          release: async () => {
            order.push('release');
          },
        };
      },
      runJson,
    });

    await suite.startWeb();

    expect(order).toEqual(['stop', 'allocate', 'release', 'start']);
    expect(calls[0]?.args.slice(0, 2)).toEqual(['stop', 'web']);
    expect(calls[0]?.timeoutMs).toBe(30_000);
    expect(calls[1]?.args).toContain('--parent-pid');
    expect(calls[1]?.args).toContain('4242');
    expect(calls[1]?.timeoutMs).toBe(180_000);
  });

  test('aborts a blocked cold warmup before the fixture teardown budget is consumed', async () => {
    const blockedFetch = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }));

    await expect(
      warmPlaywrightWebRuntime('http://127.0.0.1:31002/', {
        fetch: blockedFetch,
        timeoutMs: 10,
      }),
    ).rejects.toThrow('Playwright web warmup timed out after 10ms');
  });
});
