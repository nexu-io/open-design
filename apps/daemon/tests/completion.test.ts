import { describe, expect, it } from 'vitest';
import {
  COMMAND_SPEC,
  GLOBAL_FLAGS,
  SUPPORTED_SHELLS,
  computeCompletions,
  generateCompletionScript,
  isSupportedShell,
  topLevelCommands,
} from '../src/completion.js';

describe('isSupportedShell', () => {
  it('accepts the three supported shells', () => {
    expect(isSupportedShell('bash')).toBe(true);
    expect(isSupportedShell('zsh')).toBe(true);
    expect(isSupportedShell('fish')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSupportedShell('powershell')).toBe(false);
    expect(isSupportedShell('')).toBe(false);
    expect(isSupportedShell('BASH')).toBe(false);
  });
});

describe('topLevelCommands', () => {
  it('returns a sorted list of every command in the spec', () => {
    const cmds = topLevelCommands();
    expect(cmds).toEqual([...cmds].sort());
    expect(new Set(cmds)).toEqual(new Set(Object.keys(COMMAND_SPEC)));
  });

  it('includes the core commands a user expects', () => {
    const cmds = topLevelCommands();
    for (const expected of ['config', 'plugin', 'run', 'doctor', 'completion', 'skills']) {
      expect(cmds).toContain(expected);
    }
  });
});

describe('computeCompletions — top level', () => {
  it('offers all commands when nothing is typed yet', () => {
    expect(computeCompletions({ words: [], current: '' })).toEqual(topLevelCommands());
  });

  it('prefix-filters top-level commands', () => {
    const out = computeCompletions({ words: [], current: 'co' });
    expect(out).toContain('config');
    expect(out).toContain('completion');
    expect(out).toContain('conversation');
    expect(out).not.toContain('plugin');
    // every result actually starts with the prefix
    expect(out.every((c) => c.startsWith('co'))).toBe(true);
  });

  it('returns an empty list when nothing matches the prefix', () => {
    expect(computeCompletions({ words: [], current: 'zzzzz' })).toEqual([]);
  });
});

describe('computeCompletions — subcommands', () => {
  it('offers a command\'s subcommands plus global flags', () => {
    const out = computeCompletions({ words: ['config'], current: '' });
    for (const sub of ['get', 'set', 'list', 'unset']) {
      expect(out).toContain(sub);
    }
    for (const flag of GLOBAL_FLAGS) {
      expect(out).toContain(flag);
    }
  });

  it('prefix-filters subcommands', () => {
    const out = computeCompletions({ words: ['config'], current: 'g' });
    expect(out).toEqual(['get']);
  });

  it('offers only global flags for a command with no subcommands', () => {
    const out = computeCompletions({ words: ['doctor'], current: '' });
    expect(out).toEqual([...GLOBAL_FLAGS].sort());
  });

  it('offers global flags for an unknown command', () => {
    const out = computeCompletions({ words: ['definitely-not-a-command'], current: '' });
    expect(out).toEqual([...GLOBAL_FLAGS].sort());
  });

  it('offers global flags only beyond the second level', () => {
    const out = computeCompletions({ words: ['config', 'get'], current: '' });
    expect(out).toEqual([...GLOBAL_FLAGS].sort());
  });
});

describe('computeCompletions — flags', () => {
  it('offers global flags when the current token starts with a dash', () => {
    const out = computeCompletions({ words: ['config'], current: '-' });
    expect(out).toEqual([...GLOBAL_FLAGS].sort());
  });

  it('prefix-filters flags', () => {
    const out = computeCompletions({ words: [], current: '--j' });
    expect(out).toEqual(['--json']);
  });

  it('ignores already-typed flags when completing the command path', () => {
    // `od --json <TAB>` should still complete top-level commands.
    const out = computeCompletions({ words: ['--json'], current: '' });
    expect(out).toEqual(topLevelCommands());
  });

  it('does not treat a value-flag value as a command', () => {
    // `od --daemon-url http://localhost:7456 <TAB>` -> the URL is the flag's
    // value, not a command, so top-level commands should still be offered.
    const out = computeCompletions({
      words: ['--daemon-url', 'http://localhost:7456'],
      current: '',
    });
    expect(out).toEqual(topLevelCommands());
  });

  it('does not treat a value-flag value as a subcommand', () => {
    // `od config --daemon-url http://localhost:7456 <TAB>` should still offer
    // config's subcommands, not collapse to global flags.
    const out = computeCompletions({
      words: ['config', '--daemon-url', 'http://localhost:7456'],
      current: '',
    });
    expect(out).toContain('get');
    expect(out).toContain('set');
  });

  it('handles the --daemon-url=<url> inline form', () => {
    const out = computeCompletions({
      words: ['--daemon-url=http://localhost:7456'],
      current: '',
    });
    expect(out).toEqual(topLevelCommands());
  });

  it('still completes a subcommand prefix after a value flag', () => {
    const out = computeCompletions({
      words: ['config', '--daemon-url', 'http://localhost:7456'],
      current: 'g',
    });
    expect(out).toEqual(['get']);
  });
});

describe('computeCompletions — determinism', () => {
  it('returns sorted, de-duplicated results', () => {
    const out = computeCompletions({ words: ['plugin'], current: '' });
    expect(out).toEqual([...out].sort());
    expect(new Set(out).size).toBe(out.length);
  });
});

describe('generateCompletionScript', () => {
  for (const shell of SUPPORTED_SHELLS) {
    it(`produces a non-empty ${shell} script that delegates to __complete`, () => {
      const script = generateCompletionScript(shell);
      expect(script.length).toBeGreaterThan(0);
      // The whole point: the script defers to the live CLI rather than baking
      // in a command list.
      expect(script).toContain('od completion __complete');
    });

    it(`mentions an install hint for ${shell}`, () => {
      expect(generateCompletionScript(shell).toLowerCase()).toContain(shell);
    });
  }

  it('registers a completion function per shell', () => {
    expect(generateCompletionScript('bash')).toContain('complete -F _od_complete od');
    expect(generateCompletionScript('zsh')).toContain('compdef _od od');
    expect(generateCompletionScript('fish')).toContain('complete -c od');
  });
});

describe('COMMAND_SPEC integrity', () => {
  it('has no duplicate subcommands within a command', () => {
    for (const [name, spec] of Object.entries(COMMAND_SPEC)) {
      expect(new Set(spec.subcommands).size, `duplicates in ${name}`).toBe(
        spec.subcommands.length,
      );
    }
  });

  it('uses kebab-case command and subcommand tokens', () => {
    const token = /^[a-z][a-z0-9-]*$/;
    for (const [name, spec] of Object.entries(COMMAND_SPEC)) {
      expect(token.test(name), `bad command name: ${name}`).toBe(true);
      for (const sub of spec.subcommands) {
        expect(token.test(sub), `bad subcommand in ${name}: ${sub}`).toBe(true);
      }
    }
  });

  it('exposes the supported shells as completion subcommands', () => {
    expect(new Set(COMMAND_SPEC.completion?.subcommands ?? [])).toEqual(
      new Set(SUPPORTED_SHELLS),
    );
  });
});

// Fixture pinning the known second-level surface for command families that
// dispatch subcommands in cli.ts. If a handler there gains a subcommand and
// COMMAND_SPEC isn't updated, the relevant case fails — catching silent drift
// between the completion table and the real CLI. Each list is a *subset* the
// spec must contain (so adding a new subcommand to the spec doesn't break the
// test), keyed to the handlers' switch/dispatch in cli.ts.
const KNOWN_SUBCOMMANDS: Record<string, string[]> = {
  config: ['get', 'set', 'list', 'unset'],
  ui: ['list', 'show', 'respond', 'revoke', 'prefill'],
  daemon: ['db', 'start', 'status', 'stop', 'vacuum', 'verify'],
  atoms: ['info', 'list', 'show'],
  chat: ['new'],
  memory: ['tree'],
  run: ['cancel', 'info', 'list', 'redesign', 'start', 'watch'],
  files: ['delete', 'diff', 'list', 'read', 'upload', 'write'],
  templates: ['delete', 'list', 'save'],
  conversation: ['db', 'info', 'list', 'new', 'start', 'status', 'stop'],
  project: ['create', 'delete', 'editors', 'import', 'import-folder', 'info', 'list', 'open-in'],
  'design-systems': [
    'rename', 'import-local', 'import-github', 'import-shadcn', 'rebuild-token-contract',
  ],
};

describe('COMMAND_SPEC covers known cli.ts subcommands', () => {
  for (const [command, expected] of Object.entries(KNOWN_SUBCOMMANDS)) {
    it(`completes the known subcommands of \`od ${command}\``, () => {
      const spec = COMMAND_SPEC[command];
      expect(spec, `${command} missing from COMMAND_SPEC`).toBeDefined();
      const have = new Set(spec?.subcommands ?? []);
      const missing = expected.filter((sub) => !have.has(sub));
      expect(missing, `od ${command} is missing completions for: ${missing.join(', ')}`).toEqual(
        [],
      );
    });

    it(`offers those subcommands through computeCompletions for \`od ${command}\``, () => {
      const out = computeCompletions({ words: [command], current: '' });
      for (const sub of expected) {
        expect(out, `\`od ${command} <TAB>\` should offer ${sub}`).toContain(sub);
      }
    });
  }
});
