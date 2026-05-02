import { describe, expect, it } from 'vitest';
import { listStrippedAgentEnvKeys, sanitizeAgentEnv } from '../src/agent-env.js';

describe('sanitizeAgentEnv', () => {
  it('passes through unrelated shell/system variables unchanged', () => {
    const out = sanitizeAgentEnv({
      PATH: '/usr/bin:/bin',
      HOME: '/Users/joey',
      LANG: 'en_US.UTF-8',
    });
    expect(out).toEqual({
      PATH: '/usr/bin:/bin',
      HOME: '/Users/joey',
      LANG: 'en_US.UTF-8',
    });
  });

  it('strips OPENCODE_* host-agent runtime variables', () => {
    const out = sanitizeAgentEnv({
      PATH: '/usr/bin',
      OPENCODE_CLIENT: 'desktop',
      OPENCODE_SERVER_USERNAME: 'opencode',
      OPENCODE_SERVER_PASSWORD: 'secret',
      OPENCODE_RUN_ID: 'abc-123',
      OPENCODE_PROCESS_ROLE: 'main',
      OPENCODE_PID: '60177',
      OPENCODE_EXPERIMENTAL_FILEWATCHER: 'true',
    });
    expect(out).toEqual({ PATH: '/usr/bin' });
  });

  it('strips the bare OPENCODE flag (set to 1 inside host sessions)', () => {
    const out = sanitizeAgentEnv({
      PATH: '/usr/bin',
      OPENCODE: '1',
    });
    expect(out).toEqual({ PATH: '/usr/bin' });
  });

  it('strips other agent-runtime prefixes (claude code, codex, gemini, cursor)', () => {
    const out = sanitizeAgentEnv({
      PATH: '/usr/bin',
      CLAUDE_CODE_SESSION: 'x',
      CODEX_RUN_ID: 'y',
      GEMINI_CLI_HOME: '/tmp',
      CURSOR_AGENT_PID: '1234',
    });
    expect(out).toEqual({ PATH: '/usr/bin' });
  });

  it('keeps API keys intact — they do not match any deny prefix', () => {
    const out = sanitizeAgentEnv({
      OPENAI_API_KEY: 'sk-abc',
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      GOOGLE_API_KEY: 'goog-yyy',
      OPENROUTER_API_KEY: 'or-zzz',
    });
    expect(out).toEqual({
      OPENAI_API_KEY: 'sk-abc',
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      GOOGLE_API_KEY: 'goog-yyy',
      OPENROUTER_API_KEY: 'or-zzz',
    });
  });

  it('drops undefined values (NodeJS.ProcessEnv holds string | undefined)', () => {
    const out = sanitizeAgentEnv({
      PATH: '/usr/bin',
      MAYBE: undefined,
    });
    expect(out).toEqual({ PATH: '/usr/bin' });
  });

  it('matches prefixes case-insensitively (defensive)', () => {
    const out = sanitizeAgentEnv({
      opencode_client: 'desktop',
      Opencode_Server_Password: 'secret',
      PATH: '/usr/bin',
    });
    expect(out).toEqual({ PATH: '/usr/bin' });
  });

  it('accepts extra deny prefixes / exact names from callers', () => {
    const out = sanitizeAgentEnv(
      { PATH: '/usr/bin', FOO_BAR: 'x', SECRET: 'y' },
      { extraDenyPrefixes: ['FOO_'], extraDenyExact: ['SECRET'] },
    );
    expect(out).toEqual({ PATH: '/usr/bin' });
  });
});

describe('listStrippedAgentEnvKeys', () => {
  it('reports exactly which keys would be stripped, preserving original case', () => {
    const keys = listStrippedAgentEnvKeys({
      PATH: '/usr/bin',
      OPENCODE_CLIENT: 'desktop',
      OPENCODE: '1',
      OPENAI_API_KEY: 'sk-abc',
    });
    expect(keys.sort()).toEqual(['OPENCODE', 'OPENCODE_CLIENT']);
  });
});
