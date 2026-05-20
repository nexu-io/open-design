import { describe, expect, it } from 'vitest';
import { adaptClaudePlugin } from '../src/adapters/claude-plugin';

describe('adaptClaudePlugin', () => {
  it('synthesizes a fallback manifest when the json is unparseable', () => {
    const result = adaptClaudePlugin('not json', { folderId: 'broken-plugin' });
    expect(result.manifest.name).toBe('broken-plugin');
    expect(result.manifest.version).toBe('0.0.0');
    expect(result.manifest.compat?.claudePlugins?.[0]?.path).toBe('./.claude-plugin/plugin.json');
    expect(result.warnings.some((w) => w.includes('Failed to parse'))).toBe(true);
  });

  it('synthesizes a fallback when the JSON is not a plain object', () => {
    const result = adaptClaudePlugin('[1,2,3]', { folderId: 'array-plugin' });
    expect(result.manifest.name).toBe('array-plugin');
    expect(result.warnings).toContain('.claude-plugin/plugin.json must be a JSON object');
  });

  it('passes through a valid minimal plugin.json', () => {
    const result = adaptClaudePlugin(
      JSON.stringify({ name: 'okay', version: '2.3.4', description: 'hi' }),
      { folderId: 'irrelevant' },
    );
    expect(result.manifest.name).toBe('okay');
    expect(result.manifest.version).toBe('2.3.4');
    expect(result.manifest.description).toBe('hi');
    expect(result.warnings).toEqual([]);
  });

  it("defaults version to '0.0.0' when the source omits it", () => {
    const result = adaptClaudePlugin(JSON.stringify({ name: 'no-version' }), {
      folderId: 'no-version',
    });
    expect(result.manifest.version).toBe('0.0.0');
  });

  it('sanitizes names with characters outside the OD plugin id pattern', () => {
    const result = adaptClaudePlugin(
      JSON.stringify({ name: 'My Plugin!', version: '1.0.0' }),
      { folderId: 'fallback' },
    );
    expect(result.manifest.name).toBe('my-plugin-');
    expect(
      result.warnings.some((w) => w.includes("sanitized to 'my-plugin-'")),
    ).toBe(true);
  });

  it('falls back to folderId when the sanitized name is empty', () => {
    const result = adaptClaudePlugin(
      JSON.stringify({ name: '...', version: '1.0.0' }),
      { folderId: 'used-as-fallback' },
    );
    expect(result.manifest.name).toBe('used-as-fallback');
  });

  it('warns when the plugin declares commands that v1 apply ignores', () => {
    const result = adaptClaudePlugin(
      JSON.stringify({ name: 'with-cmds', version: '1.0.0', commands: [{}, {}, {}] }),
      { folderId: 'with-cmds' },
    );
    expect(result.warnings.some((w) => w.includes('declares 3 command(s)'))).toBe(true);
  });

  it('honors a custom compatPath when supplied', () => {
    const result = adaptClaudePlugin(
      JSON.stringify({ name: 'p', version: '1.0.0' }),
      { folderId: 'p', compatPath: './nested/.claude-plugin/plugin.json' },
    );
    expect(result.manifest.compat?.claudePlugins?.[0]?.path).toBe(
      './nested/.claude-plugin/plugin.json',
    );
  });
});
