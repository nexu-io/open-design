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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import {
  normalizeCodexConfigContent,
  normalizeCodexConfigFile,
  resolveCodexConfigPath,
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

  it('replaces service_tier=\'priority\' with service_tier="fast" (single quotes)', () => {
    const input = `service_tier = 'priority'`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe(`service_tier = "fast"`);
  });

  it('handles surrounding whitespace around the = sign', () => {
    const input = `service_tier="priority"`;
    const result = normalizeCodexConfigContent(input);
    expect(result).toBe(`service_tier = "fast"`);
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
});
