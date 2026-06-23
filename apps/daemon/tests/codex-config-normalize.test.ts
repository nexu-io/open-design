// Regression tests for codex-config-normalize.ts — originally #4276, extended
// for the wildcard-removal fix (#3408 Slice 1 / fix_config).
//
// Codex CLI rejects any service_tier value outside {fast, flex} with:
//
//   Error loading config.toml: unknown variant '<value>', expected 'fast'
//   or 'flex' in `service_tier`
//
// The original normalizer mapped a HARDCODED stale set ({priority, default})
// to "fast" and left every other invalid value untouched — so each new stale
// value the Codex app writes (measured in production after `default` was
// already patched) keeps crashing the CLI until someone adds it to the map.
// This is whack-a-mole.
//
// The fix replaces the stale-map strategy with a wildcard: ANY service_tier
// value not in {fast, flex} has its line REMOVED, so the Codex CLI falls back
// to its built-in default instead of crashing. These tests assert that:
//
//   1. normalizeCodexConfigContent REMOVES the service_tier line for any
//      invalid value (priority, default, and previously-unhandled values such
//      as "turbo"/"ultra"), in-memory.
//   2. Valid values ("fast", "flex") are left verbatim (returns null).
//   3. normalizeCodexConfigFile writes back a patched config.toml only when
//      needed and leaves the rest of the file intact.
//   4. BLOCKER 1 (regression): an invalid value inside an unrelated string
//      value or a comment is NOT touched; only a standalone key line is.
//   5. BLOCKER 2 (regression): the write is atomic (temp-file + rename), so
//      no temp-file litter is left behind; write failures are logged and do
//      not throw.
//   6. CRLF line endings around a removed line are preserved.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, normalize } from 'node:path';
import {
  normalizeCodexConfigContent,
  normalizeCodexConfigFile,
  resolveCodexConfigPath,
  type CodexConfigIO,
} from '../src/codex-config-normalize.js';

// ---------------------------------------------------------------------------
// normalizeCodexConfigContent — pure string-level normalization (remove-only)
// ---------------------------------------------------------------------------

describe('normalizeCodexConfigContent', () => {
  it('removes the service_tier line when the value is "priority" (double quotes)', () => {
    const input = `[model]\nservice_tier = "priority"\nmodel = "gpt-5.5"\n`;
    const result = normalizeCodexConfigContent(input);
    // The whole stale line is dropped (Codex uses its built-in default tier).
    expect(result).toBe(`[model]\nmodel = "gpt-5.5"\n`);
  });

  it('removes the service_tier line when the value is "default"', () => {
    const input = `[model]\nservice_tier = "default"\nmodel = "gpt-5.5"\n`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe(`[model]\nmodel = "gpt-5.5"\n`);
  });

  it('RED SPEC (#3408 fix_config): removes a previously-unhandled invalid value ("turbo")', () => {
    // Before the wildcard fix the stale map only knew {priority, default}, so
    // "turbo" slipped through, returned null (no change), and the Codex CLI
    // crashed with `unknown variant 'turbo'`. The wildcard fix removes it.
    const input = `service_tier = "turbo"\n`;
    expect(normalizeCodexConfigContent(input)).toBe('');
  });

  it('removes the service_tier line for any other arbitrary invalid value ("ultra")', () => {
    const input = `service_tier = "ultra"\n`;
    expect(normalizeCodexConfigContent(input)).toBe('');
  });

  it("removes the service_tier line for an invalid single-quoted value ('priority')", () => {
    const input = `service_tier = 'priority'`;
    expect(normalizeCodexConfigContent(input)).toBe('');
  });

  it('removes the service_tier line together with its trailing inline comment', () => {
    const input = `service_tier = "priority" # set by fast-mode toggle\nmodel = "gpt-5.5"\n`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe(`model = "gpt-5.5"\n`);
  });

  it('preserves indentation context when removing an indented invalid line', () => {
    const input = `[model]\n  service_tier = "priority"\n  model = "gpt-5.5"\n`;
    const result = normalizeCodexConfigContent(input);
    // The indented stale line is removed; the rest keeps its indentation.
    expect(result).toBe(`[model]\n  model = "gpt-5.5"\n`);
  });

  it('returns null (no change) when service_tier is already "fast"', () => {
    const input = `service_tier = "fast"\n`;
    expect(normalizeCodexConfigContent(input)).toBeNull();
  });

  it('returns null (no change) when service_tier is "flex"', () => {
    const input = `service_tier = "flex"\n`;
    expect(normalizeCodexConfigContent(input)).toBeNull();
  });

  it('returns null (no change) when service_tier is absent', () => {
    const input = `[model]\nmax_tokens = 4096\n`;
    expect(normalizeCodexConfigContent(input)).toBeNull();
  });

  it('keeps a valid value but removes a second invalid occurrence', () => {
    // Mixed config: the valid line survives verbatim, the invalid one is dropped.
    const input = `service_tier = "fast"\nservice_tier = "priority"\n`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe(`service_tier = "fast"\n`);
  });

  it('preserves all other config content when removing the stale line', () => {
    const input = [
      '[model]',
      'model = "gpt-5.5"',
      'service_tier = "priority"',
      'max_tokens = 8192',
      '',
      '[history]',
      'limit = 100',
    ].join('\n');

    const result = normalizeCodexConfigContent(input);
    expect(result).not.toBeNull();
    // The stale line is gone entirely (no rewrite to "fast").
    expect(result).not.toContain('service_tier');
    expect(result).not.toContain('"priority"');
    expect(result).not.toContain('"fast"');
    // Everything else is preserved verbatim.
    expect(result).toContain('model = "gpt-5.5"');
    expect(result).toContain('max_tokens = 8192');
    expect(result).toContain('[history]');
    expect(result).toContain('limit = 100');
  });

  it('removes every occurrence when multiple invalid service_tier lines exist', () => {
    const input = `service_tier = "priority"\nservice_tier = "default"\n`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe('');
  });

  // -------------------------------------------------------------------------
  // BLOCKER 1 regression cases — line-anchored pattern must not corrupt data
  // -------------------------------------------------------------------------

  it('BLOCKER 1: does NOT touch "priority" appearing inside an unrelated string value', () => {
    const input = [
      'description = "use priority service_tier for high-load jobs"',
      'notes = "priority access required"',
      'service_tier = "fast"',
    ].join('\n');
    // No invalid standalone service_tier key — should be a no-op.
    expect(normalizeCodexConfigContent(input)).toBeNull();
  });

  it('BLOCKER 1: does NOT touch "default" appearing inside an unrelated string value', () => {
    const input = [
      'description = "use default service_tier in old configs"',
      'service_tier = "fast"',
    ].join('\n');
    expect(normalizeCodexConfigContent(input)).toBeNull();
  });

  it('BLOCKER 1: does NOT touch a fully commented-out service_tier line', () => {
    const input = [
      '# service_tier = "priority"',
      'service_tier = "fast"',
    ].join('\n');
    expect(normalizeCodexConfigContent(input)).toBeNull();
  });

  it('BLOCKER 1: removes the real invalid key line but preserves unrelated occurrences', () => {
    const input = [
      'notes = "priority tier deprecated"',
      'service_tier = "priority"',
      '# service_tier = "priority"  (old value)',
    ].join('\n');
    const result = normalizeCodexConfigContent(input);
    expect(result).not.toBeNull();
    // The real key line is gone.
    expect(result).not.toMatch(/^service_tier/m);
    // The unrelated value and comment are unchanged.
    expect(result).toContain('notes = "priority tier deprecated"');
    expect(result).toContain('# service_tier = "priority"  (old value)');
  });

  it('BLOCKER 1: does not touch service_tier="flex" even when "priority" appears elsewhere', () => {
    const input = [
      'notes = "previously used priority"',
      'service_tier = "flex"',
    ].join('\n');
    expect(normalizeCodexConfigContent(input)).toBeNull();
  });

  it('removes nested features tables that make Codex parse features as maps (#4648)', () => {
    const input = [
      '[features]',
      'hide_spawn_agent_metadata = false',
      '[features.multi_agent_v2]',
      'hide_spawn_agent_metadata = false',
      'max_concurrent_threads_per_session = 10000',
      'enabled = false',
      '',
      '[model]',
      'model = "gpt-5.5"',
    ].join('\n');

    const result = normalizeCodexConfigContent(input);

    expect(result).toBe([
      '[features]',
      'hide_spawn_agent_metadata = false',
      '[model]',
      'model = "gpt-5.5"',
    ].join('\n'));
  });

  it('preserves unrelated dotted tables while removing nested features tables', () => {
    const input = [
      '[profiles.default]',
      'model = "gpt-5.5"',
      '[features.multi_agent_v2]',
      'enabled = false',
      '[projects."/tmp/open-design"]',
      'trust_level = "trusted"',
    ].join('\n');

    const result = normalizeCodexConfigContent(input);

    expect(result).toBe([
      '[profiles.default]',
      'model = "gpt-5.5"',
      '[projects."/tmp/open-design"]',
      'trust_level = "trusted"',
    ].join('\n'));
  });

  // -------------------------------------------------------------------------
  // CRLF regression: config.toml files written by the Codex app on Windows use
  // CRLF endings. Removing the stale line must preserve ALL surrounding \r\n
  // sequences — no conversion to LF, no stray \r left behind.
  // -------------------------------------------------------------------------

  it('CRLF regression: removes the invalid line while preserving surrounding \\r\\n endings', () => {
    const crlfContent = '[model]\r\nservice_tier = "priority"\r\nmodel = "gpt-5.5"\r\n';
    const result = normalizeCodexConfigContent(crlfContent);

    expect(result).not.toBeNull();
    // The stale line is removed.
    expect(result).not.toContain('service_tier');
    expect(result).not.toContain('"priority"');
    // The exact surrounding CRLF structure is preserved.
    expect(result).toBe('[model]\r\nmodel = "gpt-5.5"\r\n');
    // No stray bare \r without \n.
    expect(result).not.toMatch(/\r(?!\n)/);
    // No naked LF introduced.
    expect(result).not.toMatch(/(?<!\r)\n/);
  });

  it('CRLF regression: removes nested features tables while preserving surrounding \\r\\n endings', () => {
    const crlfContent = '[features]\r\nhide_spawn_agent_metadata = false\r\n[features.multi_agent_v2]\r\nenabled = false\r\n[model]\r\nmodel = "gpt-5.5"\r\n';
    const result = normalizeCodexConfigContent(crlfContent);

    expect(result).not.toBeNull();
    expect(result).not.toContain('[features.multi_agent_v2]');
    expect(result).toBe('[features]\r\nhide_spawn_agent_metadata = false\r\n[model]\r\nmodel = "gpt-5.5"\r\n');
    expect(result).not.toMatch(/\r(?!\n)/);
    expect(result).not.toMatch(/(?<!\r)\n/);
  });
});

// ---------------------------------------------------------------------------
// normalizeCodexConfigFile — disk I/O normalization
// ---------------------------------------------------------------------------

describe('normalizeCodexConfigFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'od-codex-config-normalize-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes service_tier="priority" from config.toml (bug #4276 regression)', async () => {
    const configPath = join(tmpDir, 'config.toml');
    writeFileSync(
      configPath,
      `[model]\nservice_tier = "priority"\nmodel = "gpt-5.5"\n`,
      'utf8',
    );

    await normalizeCodexConfigFile({ CODEX_HOME: tmpDir });

    const after = readFileSync(configPath, 'utf8');
    expect(after).not.toContain('service_tier');
    expect(after).not.toContain('"priority"');
    expect(after).toContain('model = "gpt-5.5"');
  });

  it('removes service_tier="default" from config.toml', async () => {
    const configPath = join(tmpDir, 'config.toml');
    writeFileSync(
      configPath,
      `[model]\nservice_tier = "default"\nmodel = "gpt-5.5"\n`,
      'utf8',
    );

    await normalizeCodexConfigFile({ CODEX_HOME: tmpDir });

    const after = readFileSync(configPath, 'utf8');
    expect(after).not.toContain('service_tier');
    expect(after).not.toContain('"default"');
    expect(after).toContain('model = "gpt-5.5"');
  });

  it('RED SPEC (#3408 fix_config): removes a previously-unhandled value ("turbo") from config.toml', async () => {
    // This is the production failure the wildcard fix targets: after `default`
    // was added to the old stale map, other invalid values (measured ~50/day
    // on 0.11.0) still crashed the CLI. The file-level path must remove them.
    const configPath = join(tmpDir, 'config.toml');
    writeFileSync(
      configPath,
      `[model]\nservice_tier = "turbo"\nmodel = "gpt-5.5"\n`,
      'utf8',
    );

    await normalizeCodexConfigFile({ CODEX_HOME: tmpDir });

    const after = readFileSync(configPath, 'utf8');
    expect(after).not.toContain('service_tier');
    expect(after).not.toContain('"turbo"');
    expect(after).toContain('model = "gpt-5.5"');
  });

  it('removes nested features tables from config.toml (#4648 regression)', async () => {
    const configPath = join(tmpDir, 'config.toml');
    writeFileSync(
      configPath,
      [
        '[features]',
        'hide_spawn_agent_metadata = false',
        '[features.multi_agent_v2]',
        'hide_spawn_agent_metadata = false',
        'max_concurrent_threads_per_session = 10000',
        'enabled = false',
        '[model]',
        'model = "gpt-5.5"',
      ].join('\n'),
      'utf8',
    );

    await normalizeCodexConfigFile({ CODEX_HOME: tmpDir });

    const after = readFileSync(configPath, 'utf8');
    expect(after).toContain('[features]');
    expect(after).toContain('hide_spawn_agent_metadata = false');
    expect(after).not.toContain('[features.multi_agent_v2]');
    expect(after).not.toContain('max_concurrent_threads_per_session');
    expect(after).toContain('[model]');
    expect(after).toContain('model = "gpt-5.5"');
  });

  it('does not modify config.toml when service_tier is already valid', async () => {
    const configPath = join(tmpDir, 'config.toml');
    const original = `service_tier = "fast"\n`;
    writeFileSync(configPath, original, 'utf8');
    const { mtimeMs: mtimeBefore } = statSync(configPath);

    await normalizeCodexConfigFile({ CODEX_HOME: tmpDir });

    const after = readFileSync(configPath, 'utf8');
    expect(after).toBe(original);
    // File was not rewritten (mtime unchanged).
    const { mtimeMs: mtimeAfter } = statSync(configPath);
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it('does nothing when config.toml is absent (no throw)', async () => {
    await expect(
      normalizeCodexConfigFile({ CODEX_HOME: tmpDir }),
    ).resolves.toBeUndefined();
  });

  it('resolves config path via CODEX_HOME env var', () => {
    const p = resolveCodexConfigPath({ CODEX_HOME: '/custom/codex-home' });
    expect(normalize(p)).toBe(normalize('/custom/codex-home/config.toml'));
  });

  // -------------------------------------------------------------------------
  // BLOCKER 2 regression cases — atomic write and logged errors
  // -------------------------------------------------------------------------

  it('BLOCKER 2: no temp-file litter remains after a successful atomic write', async () => {
    const configPath = join(tmpDir, 'config.toml');
    writeFileSync(configPath, `service_tier = "priority"\nmodel = "gpt-5.5"\n`, 'utf8');

    await normalizeCodexConfigFile({ CODEX_HOME: tmpDir });

    const files = readdirSync(tmpDir);
    expect(files).toEqual(['config.toml']);
  });

  it('BLOCKER 2: final config.toml content is correct and complete after atomic write', async () => {
    const original = [
      '[model]',
      'model = "gpt-5.5"',
      'service_tier = "priority"',
      'max_tokens = 8192',
      '',
      '[history]',
      'limit = 100',
    ].join('\n');
    const configPath = join(tmpDir, 'config.toml');
    writeFileSync(configPath, original, 'utf8');

    await normalizeCodexConfigFile({ CODEX_HOME: tmpDir });

    const after = readFileSync(configPath, 'utf8');
    // The stale line is removed (not rewritten to "fast").
    expect(after).not.toContain('service_tier');
    expect(after).not.toContain('"priority"');
    // All other content is preserved verbatim.
    expect(after).toContain('model = "gpt-5.5"');
    expect(after).toContain('max_tokens = 8192');
    expect(after).toContain('[history]');
    expect(after).toContain('limit = 100');
  });

  it('BLOCKER 2: write failure is logged with console.warn and does not throw', async () => {
    const configPath = join(tmpDir, 'config.toml');
    writeFileSync(configPath, `service_tier = "priority"\n`, 'utf8');

    const simulatedError = new Error('EPERM: rename failed (simulated)');
    const unlinkCalls: string[] = [];
    const stubbedIO: CodexConfigIO = {
      readFile,
      writeFile,
      rename: async () => { throw simulatedError; },
      unlink: async (p) => { unlinkCalls.push(p); await unlink(p).catch(() => {}); },
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await normalizeCodexConfigFile({ CODEX_HOME: tmpDir }, stubbedIO);

    expect(warnSpy).toHaveBeenCalledWith(
      '[codex-config-normalize] atomic write failed:',
      simulatedError,
    );
    expect(unlinkCalls).toHaveLength(1);
    expect(unlinkCalls[0]).toMatch(/config\.toml\.[0-9a-f]+\.tmp$/);

    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // FIX 1 regression: env-mismatch — CODEX_HOME from agentCliEnv must be
  // respected (#4276). The normalizer resolves the path from whatever env is
  // passed, including an overridden CODEX_HOME.
  // -------------------------------------------------------------------------

  it('FIX 1 regression: patches config.toml at CODEX_HOME from a merged env, not bare process.env', async () => {
    const altCodexHome = tmpDir;
    const configPath = join(altCodexHome, 'config.toml');
    writeFileSync(
      configPath,
      `[model]\nservice_tier = "priority"\nmodel = "gpt-5.5"\n`,
      'utf8',
    );

    const mergedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      CODEX_HOME: altCodexHome,
    };

    await normalizeCodexConfigFile(mergedEnv);

    const after = readFileSync(configPath, 'utf8');
    expect(after).not.toContain('service_tier');
    expect(after).not.toContain('"priority"');
    expect(after).toContain('model = "gpt-5.5"');
  });

  // -------------------------------------------------------------------------
  // FIX 3 regression: tilde CODEX_HOME mismatch — #4276.
  // -------------------------------------------------------------------------

  it('FIX 3 tilde regression: resolveCodexConfigPath expands ~/... to an absolute path', () => {
    const home = homedir();
    const resolved = resolveCodexConfigPath({ CODEX_HOME: '~/.codex-alt' });
    expect(normalize(resolved)).toBe(
      normalize(join(home, '.codex-alt', 'config.toml')),
    );
  });

  it('FIX 3 tilde regression: patches config.toml at the EXPANDED location when CODEX_HOME contains a tilde prefix', async () => {
    const home = homedir();
    const tildeTmpDir = mkdtempSync(join(home, '.od-codex-config-test-'));
    const configPath = join(tildeTmpDir, 'config.toml');
    try {
      writeFileSync(
        configPath,
        `[model]\nservice_tier = "priority"\nmodel = "gpt-5.5"\n`,
        'utf8',
      );

      const relSuffix = tildeTmpDir.slice(home.length).replace(/\\/g, '/');
      const tildeCodexHome = '~' + relSuffix;

      await normalizeCodexConfigFile({ ...process.env, CODEX_HOME: tildeCodexHome });

      const after = readFileSync(configPath, 'utf8');
      expect(after).not.toContain('service_tier');
      expect(after).not.toContain('"priority"');
      expect(after).toContain('model = "gpt-5.5"');
    } finally {
      rmSync(tildeTmpDir, { recursive: true, force: true });
    }
  });

  it('FIX 1 regression (negative): without CODEX_HOME in env, default path is used (not the alt location)', async () => {
    const altCodexHome = tmpDir;
    const configPath = join(altCodexHome, 'config.toml');
    writeFileSync(
      configPath,
      `[model]\nservice_tier = "priority"\nmodel = "gpt-5.5"\n`,
      'utf8',
    );

    const envWithoutCodexHome: NodeJS.ProcessEnv = { ...process.env };
    delete envWithoutCodexHome.CODEX_HOME;

    await normalizeCodexConfigFile(envWithoutCodexHome);

    // The alt-location config was NOT patched (normalizer looked elsewhere).
    const after = readFileSync(configPath, 'utf8');
    expect(after).toContain('service_tier = "priority"');
  });
});
