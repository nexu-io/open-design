// Regression coverage for #4456: local CLI auth probes can misclassify valid
// API-key and profile-based auth.
//
//   Case 1 — Codex custom-provider env_key: a working custom provider (e.g.
//     Azure via AZURE_OPENAI_API_KEY in ~/.codex/config.toml) must not be
//     reported as missing auth just because `codex login status` exits
//     non-zero. The probe should short-circuit to `ok` when the selected
//     provider's env_key is present, without running the probe at all.
//
//   Case 2 — inherited Claude profile classifier: a local profile that
//     inherits Claude's authProbe runs under the profile id. With the base
//     classifier identity carried on the probe, healthy Claude output
//     (`{"authenticated": true}`) is parsed by Claude's JSON-aware classifier
//     (→ ok). WITHOUT it the generic classifier matches the word
//     "authenticated" and misreports `missing` — the bug this fixes.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execAgentFileMock = vi.fn();

vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: (...args: unknown[]) =>
    (execAgentFileMock as unknown as (...args: unknown[]) => unknown)(...args),
}));

const { probeAgentAuthStatus } = await import('../../src/runtimes/auth.js');

const HEALTHY_CLAUDE = '{"authenticated": true, "source": "claude.ai"}';

describe('probeAgentAuthStatus (#4456)', () => {
  beforeEach(() => {
    execAgentFileMock.mockReset();
  });

  describe('Case 2 — inherited Claude profile classifier', () => {
    it('uses the base Claude classifier when classifierAgentId is carried', async () => {
      execAgentFileMock.mockResolvedValue({ stdout: HEALTHY_CLAUDE, stderr: '' });
      const result = await probeAgentAuthStatus(
        {
          id: 'my-claude-profile',
          name: 'Claude (profile)',
          authProbe: { args: ['auth', 'status'], classifierAgentId: 'claude' },
        },
        '/fake/bin/claude',
        {},
      );
      expect(result).toEqual({ status: 'ok' });
    });

    it('regression: without classifierAgentId the generic classifier misreads healthy output as missing', async () => {
      execAgentFileMock.mockResolvedValue({ stdout: HEALTHY_CLAUDE, stderr: '' });
      const result = await probeAgentAuthStatus(
        {
          id: 'my-claude-profile',
          name: 'Claude (profile)',
          authProbe: { args: ['auth', 'status'] },
        },
        '/fake/bin/claude',
        {},
      );
      expect(result?.status).toBe('missing');
    });

    it('still flags a real Claude auth failure under the inherited classifier', async () => {
      execAgentFileMock.mockResolvedValue({
        stdout: '{"authenticated": false}',
        stderr: '',
      });
      const result = await probeAgentAuthStatus(
        {
          id: 'my-claude-profile',
          name: 'Claude (profile)',
          authProbe: { args: ['auth', 'status'], classifierAgentId: 'claude' },
        },
        '/fake/bin/claude',
        {},
      );
      expect(result?.status).toBe('missing');
    });
  });

  describe('Case 1 — Codex custom-provider env_key', () => {
    let codexHome: string;

    beforeEach(async () => {
      codexHome = await mkdtemp(path.join(os.tmpdir(), 'od-codex-4456-'));
      await writeFile(
        path.join(codexHome, 'config.toml'),
        [
          'model_provider = "azure"',
          '[model_providers.azure]',
          'base_url = "https://example.openai.azure.com/openai/v1"',
          'env_key = "AZURE_OPENAI_API_KEY"',
        ].join('\n'),
        'utf8',
      );
    });

    afterEach(async () => {
      await rm(codexHome, { recursive: true, force: true });
    });

    it('short-circuits to ok when the selected provider env_key is set (no probe run)', async () => {
      const result = await probeAgentAuthStatus(
        { id: 'codex', name: 'Codex CLI', authProbe: { args: ['login', 'status'] } },
        '/fake/bin/codex',
        { CODEX_HOME: codexHome, AZURE_OPENAI_API_KEY: 'secret-value' },
      );
      expect(result).toEqual({ status: 'ok' });
      expect(execAgentFileMock).not.toHaveBeenCalled();
    });

    it('falls through to the probe when the provider env_key is absent', async () => {
      const loginFailure = Object.assign(new Error('Not logged in. Run `codex login`.'), {
        stdout: '',
        stderr: 'Not logged in',
        code: 1,
      });
      execAgentFileMock.mockRejectedValue(loginFailure);
      const result = await probeAgentAuthStatus(
        { id: 'codex', name: 'Codex CLI', authProbe: { args: ['login', 'status'] } },
        '/fake/bin/codex',
        { CODEX_HOME: codexHome },
      );
      expect(execAgentFileMock).toHaveBeenCalledTimes(1);
      expect(result?.status).toBe('missing');
    });
  });
});
