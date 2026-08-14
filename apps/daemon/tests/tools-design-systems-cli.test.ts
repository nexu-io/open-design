import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runDesignSystemsToolCli } from '../src/tools-design-systems-cli.js';

const ORIGINAL_ENV = { ...process.env };

describe('design-system tool CLI', () => {
  let stdoutWrite: { mockRestore: () => void };
  let stderrWrite: { mockRestore: () => void };
  let stdoutOutput: string[];
  let stderrOutput: string[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      OD_DAEMON_URL: 'http://127.0.0.1:7456/base/',
      OD_TOOL_TOKEN: 'agent-run-token',
    };
    stdoutOutput = [];
    stderrOutput = [];
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutOutput.push(String(chunk));
      return true;
    });
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrOutput.push(String(chunk));
      return true;
    });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({
      designSystemId: 'runtime-v3',
      runtime: 'structured',
      resolution: {
        intent: 'account.settings.save',
        status: 'matched',
        action: 'reuse-components',
        matches: [{ component: { id: 'Button' } }],
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
    process.env = ORIGINAL_ENV;
  });

  it('documents validate artifacts as project-relative files', async () => {
    const result = await runDesignSystemsToolCli(['--help']);

    expect(result.exitCode).toBe(1);
    expect(stdoutOutput.join('')).toContain('--artifact <project-relative-file>');
    expect(stdoutOutput.join('')).not.toContain('file-or-directory');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves a canonical intent through the active project design system', async () => {
    const result = await runDesignSystemsToolCli([
      'resolve',
      '--intent',
      'account.settings.save',
    ]);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/base/api/tools/design-systems/resolve-intent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer agent-run-token',
        }),
        body: JSON.stringify({ intent: 'account.settings.save' }),
      }),
    );
    expect(JSON.parse(stdoutOutput.join(''))).toMatchObject({
      ok: true,
      resolution: { status: 'matched', action: 'reuse-components' },
    });
    expect(stderrOutput.join('')).toBe('');
  });

  it('accepts the standard --json flag for intent resolution', async () => {
    const result = await runDesignSystemsToolCli([
      'resolve',
      '--intent',
      'account.settings.save',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(stdoutOutput.join(''))).toMatchObject({
      ok: true,
      designSystemId: 'runtime-v3',
      resolution: { status: 'matched' },
    });
  });

  it('rejects a missing intent before sending a request', async () => {
    const result = await runDesignSystemsToolCli(['resolve']);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(stderrOutput.join(''))).toEqual({
      ok: false,
      error: { message: 'resolve requires --intent <canonical-intent>' },
    });
  });

  it('validates all related artifacts and exits successfully only on a passing report', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      designSystemId: 'runtime-v3',
      runtime: 'structured',
      report: {
        schemaVersion: 'od-design-system-adherence/v1',
        status: 'passed',
        nextAction: 'complete',
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    const result = await runDesignSystemsToolCli([
      'validate',
      '--intent',
      'account.settings.save',
      '--artifact',
      'account-settings.html',
      '--artifact',
      'styles.css',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/base/api/tools/design-systems/validate-adherence',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          intent: 'account.settings.save',
          artifacts: ['account-settings.html', 'styles.css'],
        }),
      }),
    );
    expect(JSON.parse(stdoutOutput.join(''))).toMatchObject({
      ok: true,
      report: { status: 'passed', nextAction: 'complete' },
    });
  });

  it('returns exit code 2 for findings so the agent must fix or confirm them', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      report: {
        schemaVersion: 'od-design-system-adherence/v1',
        status: 'failed',
        nextAction: 'fix-and-rerun',
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    const result = await runDesignSystemsToolCli([
      'validate',
      '--intent',
      'account.settings.save',
      '--artifact',
      'account-settings.html',
    ]);

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(stdoutOutput.join(''))).toMatchObject({
      ok: false,
      report: { status: 'failed', nextAction: 'fix-and-rerun' },
    });
  });
});
