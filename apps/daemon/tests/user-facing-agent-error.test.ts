import { describe, expect, it } from 'vitest';

import { sanitizeAgentErrorDetail } from '../src/user-facing-agent-error.js';

describe('sanitizeAgentErrorDetail', () => {
  it('strips spawnargs arrays with local executable paths (#2161)', () => {
    const raw =
      "spawn /Users/me/Library/Application Support/Open Design/node_modules/@openai/codex/vendor/aarch64-apple-darwin/codex/codex ENOENT, spawnargs: [ 'exec', '--json', '--skip-git-repo-check' ]";

    expect(sanitizeAgentErrorDetail(raw)).toBe(
      'spawn [path] ENOENT',
    );
  });

  it('redacts Windows Program Files paths', () => {
    const raw =
      "spawn C:\\Program Files\\Open Design\\bin\\codex.exe failed, spawnargs: [ 'exec' ]";

    expect(sanitizeAgentErrorDetail(raw)).toContain('[path]');
    expect(sanitizeAgentErrorDetail(raw)).not.toContain('Program Files');
    expect(sanitizeAgentErrorDetail(raw)).not.toContain('spawnargs');
  });

  it('still redacts secrets via redactSecrets', () => {
    const raw = 'auth failed sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890';

    expect(sanitizeAgentErrorDetail(raw)).toContain('[REDACTED:sk_key]');
    expect(sanitizeAgentErrorDetail(raw)).not.toContain('sk-ant-api03');
  });
});
