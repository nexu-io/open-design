// Pure-rule characterization for the hand-off slice. No doubles: every
// function here takes plain data and returns plain data. Pins CLI-target
// merge + sort order, the shell-quote escape, the framework label switches,
// the clipboard prompt template, and the platform -> fallback-editor mapping.
import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '@open-design/contracts';
import {
  buildCliHandoffPrompt,
  cliDisplayName,
  fallbackEditorFor,
  frameworkLabel,
  frameworkPromptLabel,
  mergeCliTargets,
  shellQuote,
} from '../../../src/features/handoff/rules';
import type { CliTarget, FrameworkId } from '../../../src/features/handoff/types';

function agent(over: Partial<AgentInfo> = {}): AgentInfo {
  return { id: 'claude', name: 'Claude Code', bin: 'claude', available: true, ...over };
}

// A translator stub matching `ReturnType<typeof useT>`'s shape closely enough
// for these pure functions: echoes the key (with interpolated vars appended)
// so assertions can pin exactly which key + vars a rule requested.
function stubT(key: string, vars?: Record<string, string | number>): string {
  return vars ? `${key}:${JSON.stringify(vars)}` : key;
}

describe('cliDisplayName', () => {
  it('renders the amr id under the product name', () => {
    expect(cliDisplayName({ id: 'amr', name: 'Vela' })).toBe('Open Design');
  });
  it('passes through any other id unchanged', () => {
    expect(cliDisplayName({ id: 'claude', name: 'Claude Code' })).toBe('Claude Code');
  });
});

describe('mergeCliTargets', () => {
  it('seeds the fallback catalogue when no agents are reported', () => {
    const targets = mergeCliTargets(undefined);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => t.available === false)).toBe(true);
  });

  it('overlays a reported agent onto its fallback entry by id', () => {
    const targets = mergeCliTargets([agent({ id: 'claude', available: true, version: '1.2.3' })]);
    const claude = targets.find((t) => t.id === 'claude');
    expect(claude).toMatchObject({ id: 'claude', available: true, version: '1.2.3' });
  });

  it('adds an agent id absent from the fallback catalogue', () => {
    const targets = mergeCliTargets([agent({ id: 'brand-new-cli', name: 'Brand New' })]);
    expect(targets.some((t) => t.id === 'brand-new-cli')).toBe(true);
  });

  it('sorts by the curated CLI_ORDER, unknown ids last and alphabetical', () => {
    const targets = mergeCliTargets([
      agent({ id: 'zzz-unlisted', name: 'Zzz' }),
      agent({ id: 'aaa-unlisted', name: 'Aaa' }),
    ]);
    const ids = targets.map((t) => t.id);
    // amr leads CLI_ORDER.
    expect(ids[0]).toBe('amr');
    // Unlisted ids sort after every ordered id, alphabetically among themselves.
    const aaaIdx = ids.indexOf('aaa-unlisted');
    const zzzIdx = ids.indexOf('zzz-unlisted');
    const claudeIdx = ids.indexOf('claude');
    expect(aaaIdx).toBeGreaterThan(claudeIdx);
    expect(aaaIdx).toBeLessThan(zzzIdx);
  });
});

describe('shellQuote', () => {
  it('wraps a plain path in single quotes', () => {
    expect(shellQuote('/tmp/open-design/Landing')).toBe("'/tmp/open-design/Landing'");
  });
  it('escapes an embedded single quote', () => {
    expect(shellQuote("/tmp/o'design")).toBe("'/tmp/o'\\''design'");
  });
});

describe('frameworkLabel / frameworkPromptLabel', () => {
  const ids: FrameworkId[] = ['react', 'vue', 'svelte', 'solid', 'next', 'vanilla'];

  it.each(ids)('resolves the %s label key', (id) => {
    expect(frameworkLabel(id, stubT)).toBe(`handoff.framework.${id}`);
  });

  it.each(ids)('resolves the %s prompt-label key', (id) => {
    expect(frameworkPromptLabel(id, stubT)).toBe(`handoff.frameworkPrompt.${id}`);
  });

  it('falls back to react for an unrecognized id', () => {
    expect(frameworkLabel('bogus' as FrameworkId, stubT)).toBe('handoff.framework.react');
    expect(frameworkPromptLabel('bogus' as FrameworkId, stubT)).toBe('handoff.frameworkPrompt.react');
  });
});

describe('buildCliHandoffPrompt', () => {
  const cli: CliTarget = { id: 'claude', name: 'Claude Code', bin: 'claude', available: true };
  const labels = {
    promptIntro: 'intro',
    target: 'target',
    cli: 'cli',
    stepsLead: 'steps',
    readFiles: 'read',
    keepDesign: 'keep',
    produceCode: 'produce',
    verify: 'verify',
    commandHint: 'hint',
    project: 'project',
    projectId: 'projectId',
  };

  it('includes the project dir, cd command, framework and cli name', () => {
    const prompt = buildCliHandoffPrompt({
      cli,
      frameworkPrompt: 'Vue.js',
      labels,
      projectDir: '/tmp/open-design/Landing',
      projectId: 'p1',
      projectName: 'Landing',
    });
    expect(prompt).toContain('/tmp/open-design/Landing');
    expect(prompt).toContain("cd '/tmp/open-design/Landing'");
    expect(prompt).toContain('Vue.js');
    expect(prompt).toContain('Claude Code');
    expect(prompt).toContain('(claude)');
    expect(prompt).toContain('project: Landing');
  });

  it('falls back to the project id when no name is given', () => {
    const prompt = buildCliHandoffPrompt({
      cli,
      frameworkPrompt: 'React',
      labels,
      projectDir: '/tmp/x',
      projectId: 'p1',
    });
    expect(prompt).toContain('project: p1');
  });

  it('omits the parenthesized bin when the cli has none', () => {
    const prompt = buildCliHandoffPrompt({
      cli: { ...cli, bin: '' },
      frameworkPrompt: 'React',
      labels,
      projectDir: '/tmp/x',
      projectId: 'p1',
    });
    expect(prompt).not.toContain('(claude)');
  });
});

describe('fallbackEditorFor', () => {
  it('maps win32 to Explorer', () => {
    expect(fallbackEditorFor('win32')).toEqual({ id: 'explorer', label: 'Explorer' });
  });
  it('maps linux to File Manager', () => {
    expect(fallbackEditorFor('linux')).toEqual({ id: 'file-manager', label: 'File Manager' });
  });
  it('maps darwin (and anything else) to Finder', () => {
    expect(fallbackEditorFor('darwin')).toEqual({ id: 'finder', label: 'Finder' });
    expect(fallbackEditorFor('unknown')).toEqual({ id: 'finder', label: 'Finder' });
  });
});
