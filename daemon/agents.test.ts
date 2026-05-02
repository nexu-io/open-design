import { describe, expect, it } from 'vitest';

import { AGENT_DEFS } from './agents.js';

describe('AGENT_DEFS', () => {
  it('runs Codex in lean web-agent mode without plugin or analytics sync', () => {
    const codex = AGENT_DEFS.find((agent) => agent.id === 'codex');

    expect(codex).toBeTruthy();
    const args = codex?.buildArgs('', [], [], {}, { cwd: 'C:/repo' }) ?? [];

    expect(args).toEqual(expect.arrayContaining([
      'exec',
      '--json',
      '--disable',
      'plugins',
      'general_analytics',
      '--ephemeral',
      '--skip-git-repo-check',
      '--full-auto',
      '-C',
      'C:/repo',
      '-',
    ]));
    expect(args.join(' ')).not.toContain('ignore-user-config');
  });
});
