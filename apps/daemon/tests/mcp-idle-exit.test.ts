import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { createMcpIdleExitController, runMcpStdio } from '../src/mcp.js';

describe('MCP stdio idle exit controller', () => {
  it('resolves after the idle timeout when no MCP activity arrives', async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const controller = createMcpIdleExitController({
        idleTimeoutMs: 30_000,
        pollIntervalMs: 1_000,
        now: () => now,
      });

      let resolved = false;
      void controller.waitForIdleExit().then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(29_000);
      expect(resolved).toBe(false);

      now = 30_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets the idle clock when MCP activity arrives', async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const controller = createMcpIdleExitController({
        idleTimeoutMs: 30_000,
        pollIntervalMs: 1_000,
        now: () => now,
      });

      let resolved = false;
      void controller.waitForIdleExit().then(() => {
        resolved = true;
      });

      now = 29_000;
      await vi.advanceTimersByTimeAsync(29_000);
      expect(resolved).toBe(false);

      controller.markActivity();

      now = 58_000;
      await vi.advanceTimersByTimeAsync(29_000);
      expect(resolved).toBe(false);

      now = 59_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not resolve while an MCP request is in flight', async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const controller = createMcpIdleExitController({
        idleTimeoutMs: 30_000,
        pollIntervalMs: 1_000,
        now: () => now,
      });
      const endActivity = controller.beginActivity();

      let resolved = false;
      void controller.waitForIdleExit().then(() => {
        resolved = true;
      });

      now = 60_000;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(resolved).toBe(false);

      endActivity();

      now = 89_000;
      await vi.advanceTimersByTimeAsync(29_000);
      expect(resolved).toBe(false);

      now = 90_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the stdio server alive when the client sends protocol pings', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(0));
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      let exited = false;
      const run = runMcpStdio({
        daemonUrl: 'http://127.0.0.1:1',
        stdin,
        stdout,
        idleExit: {
          idleTimeoutMs: 30_000,
          pollIntervalMs: 1_000,
        },
      }).then(() => {
        exited = true;
      });

      await Promise.resolve();
      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })}\n`);

      await vi.advanceTimersByTimeAsync(29_000);
      expect(exited).toBe(false);

      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' })}\n`);
      await vi.advanceTimersByTimeAsync(29_000);
      expect(exited).toBe(false);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(exited).toBe(true);
      stdin.destroy();
      stdout.destroy();
      await run;
    } finally {
      vi.useRealTimers();
    }
  });
});
