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
    expect(new Set(COMMAND_SPEC.completion.subcommands)).toEqual(new Set(SUPPORTED_SHELLS));
  });
});
