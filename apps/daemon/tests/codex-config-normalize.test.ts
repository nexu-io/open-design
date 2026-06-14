// Regression tests for codex-config-normalize.ts — fixes #4276.
//
// Codex CLI rejects `service_tier = "priority"` (renamed to "fast" in a
// recent release). The Codex app's fast-mode toggle still writes the old
// value on some installations. These tests assert that:
//
//   1. normalizeCodexConfigContent coerces "priority" → "fast" in-memory.
//   2. normalizeCodexConfigFile writes back a patched config.toml only when
//      needed and leaves the rest of the file intact.
//   3. Valid values ("fast", "flex") and unknown values are preserved as-is.
//   4. BLOCKER 1 (regression): "priority" in unrelated string values or
//      comments is NOT rewritten; only a standalone key line is touched.
//   5. BLOCKER 2 (regression): the write is atomic (temp-file + rename), so
//      no temp-file litter is left behind; write failures are logged and do
//      not throw.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import {
  normalizeCodexConfigContent,
  normalizeCodexConfigFile,
  resolveCodexConfigPath,
  type CodexConfigIO,
} from '../src/codex-config-normalize.js';

// ---------------------------------------------------------------------------
// normalizeCodexConfigContent — pure string-level normalization
// ---------------------------------------------------------------------------

describe('normalizeCodexConfigContent', () => {
  it('replaces service_tier="priority" with service_tier="fast" (double quotes)', () => {
    const input = `[model]\nservice_tier = "priority"\n`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe(`[model]\nservice_tier = "fast"\n`);
  });

  it("replaces service_tier='priority' with service_tier=\"fast\" (single quotes)", () => {
    const input = `service_tier = 'priority'`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe(`service_tier = "fast"`);
  });

  it('preserves original spacing around the = sign (no normalization of whitespace)', () => {
    // The new line-anchored pattern preserves the original = spacing.
    const input = `service_tier="priority"`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe(`service_tier="fast"`);
  });

  it('preserves indentation when the key is inside a TOML table section', () => {
    // Some TOML writers indent keys inside an inline table block.
    const input = `[model]\n  service_tier = "priority"\n`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe(`[model]\n  service_tier = "fast"\n`);
  });

  it('preserves a trailing inline comment on the service_tier line', () => {
    // BLOCKER 1 regression: inline comment must survive the replacement.
    const input = `service_tier = "priority" # set by fast-mode toggle\n`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe(`service_tier = "fast" # set by fast-mode toggle\n`);
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

  it('returns null (no change) for an unknown service_tier value not in the stale map', () => {
    // Unknown values are left as-is; the CLI will reject them with a clear message.
    const input = `service_tier = "turbo"`;
    expect(normalizeCodexConfigContent(input)).toBeNull();
  });

  it('preserves all other config content when patching', () => {
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
    expect(result).toContain('service_tier = "fast"');
    expect(result).toContain('model = "gpt-5.5"');
    expect(result).toContain('max_tokens = 8192');
    expect(result).toContain('[history]');
    expect(result).toContain('limit = 100');
    expect(result).not.toContain('"priority"');
  });

  it('fixes every occurrence when service_tier appears more than once', () => {
    // Unusual but possible in duplicated config sections.
    const input = `service_tier = "priority"\nservice_tier = "priority"\n`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe(`service_tier = "fast"\nservice_tier = "fast"\n`);
  });

  // -------------------------------------------------------------------------
  // BLOCKER 1 regression cases — line-anchored pattern must not corrupt data
  // -------------------------------------------------------------------------

  it('BLOCKER 1: does NOT rewrite "priority" appearing inside an unrelated string value', () => {
    // The word "priority" is embedded in a different key's value; only
    // a standalone `service_tier = "priority"` line should be touched.
    const input = [
      'description = "use priority service_tier for high-load jobs"',
      'notes = "priority access required"',
      'service_tier = "fast"',
    ].join('\n');
    // No stale service_tier key — should be a no-op.
    expect(normalizeCodexConfigContent(input)).toBeNull();
  });

  it('BLOCKER 1: does NOT rewrite "priority" that appears only in a comment', () => {
    // A fully commented-out key line must not be rewritten.
    const input = [
      '# service_tier = "priority"',
      'service_tier = "fast"',
    ].join('\n');
    expect(normalizeCodexConfigContent(input)).toBeNull();
  });

  it('BLOCKER 1: rewrites a real key line even when "priority" also appears elsewhere', () => {
    // The stale key line must still be caught; the unrelated occurrence is safe.
    const input = [
      'notes = "priority tier deprecated"',
      'service_tier = "priority"',
      '# service_tier = "priority"  (old value)',
    ].join('\n');
    const result = normalizeCodexConfigContent(input);
    expect(result).not.toBeNull();
    // The real key is fixed.
    expect(result).toContain('service_tier = "fast"');
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

  it('BLOCKER 1: does not touch service_tier with an unrecognised value adjacent to "priority" text', () => {
    const input = [
      'tier_label = "priority-ish"',
      'service_tier = "ultra"',
    ].join('\n');
    expect(normalizeCodexConfigContent(input)).toBeNull();
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

  it('patches a config.toml that contains service_tier="priority" (bug #4276 regression)', async () => {
    const configPath = join(tmpDir, 'config.toml');
    writeFileSync(
      configPath,
      `[model]\nservice_tier = "priority"\nmodel = "gpt-5.5"\n`,
      'utf8',
    );

    await normalizeCodexConfigFile({ CODEX_HOME: tmpDir });

    const after = readFileSync(configPath, 'utf8');
    expect(after).toContain('service_tier = "fast"');
    expect(after).not.toContain('"priority"');
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
    // File was not rewritten (mtime unchanged within 1ms tolerance).
    const { mtimeMs: mtimeAfter } = statSync(configPath);
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it('does nothing when config.toml is absent (no throw)', async () => {
    // Directory exists but no config.toml — must not throw.
    await expect(
      normalizeCodexConfigFile({ CODEX_HOME: tmpDir }),
    ).resolves.toBeUndefined();
  });

  it('resolves config path via CODEX_HOME env var', () => {
    const p = resolveCodexConfigPath({ CODEX_HOME: '/custom/codex-home' });
    // normalize() handles cross-platform path separators.
    expect(normalize(p)).toBe(normalize('/custom/codex-home/config.toml'));
  });

  // -------------------------------------------------------------------------
  // BLOCKER 2 regression cases — atomic write and logged errors
  // -------------------------------------------------------------------------

  it('BLOCKER 2: no temp-file litter remains after a successful atomic write', async () => {
    const configPath = join(tmpDir, 'config.toml');
    writeFileSync(configPath, `service_tier = "priority"\n`, 'utf8');

    await normalizeCodexConfigFile({ CODEX_HOME: tmpDir });

    // The directory should contain exactly one file: config.toml.
    const files = readdirSync(tmpDir);
    expect(files).toEqual(['config.toml']);
  });

  it('BLOCKER 2: final config.toml content is correct and complete after atomic write', async () => {
    // Verifies that the rename replaced the full content, not a partial write.
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
    // The patched key is updated.
    expect(after).toContain('service_tier = "fast"');
    // All other content is preserved verbatim.
    expect(after).toContain('model = "gpt-5.5"');
    expect(after).toContain('max_tokens = 8192');
    expect(after).toContain('[history]');
    expect(after).toContain('limit = 100');
    expect(after).not.toContain('"priority"');
  });

  it('BLOCKER 2: write failure is logged with console.warn and does not throw', async () => {
    // Inject a stub IO where rename throws to simulate an atomic-write failure
    // (e.g. cross-device rename, permission error). We verify:
    //   (a) normalizeCodexConfigFile does not throw,
    //   (b) console.warn is called with the expected prefix,
    //   (c) the temp file is cleaned up (unlink is called).
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
    // The temp file cleanup was attempted.
    expect(unlinkCalls).toHaveLength(1);
    expect(unlinkCalls[0]).toMatch(/config\.toml\.[0-9a-f]+\.tmp$/);

    warnSpy.mockRestore();
  });
});
