import { describe, expect, it } from 'vitest';
import { createAgentStderrVisibilityFilter } from '../src/amr-stderr-filter.js';

describe('AMR stderr visibility filter', () => {
  it('treats OpenCode bootstrap stderr as lifecycle noise while preserving real AMR diagnostics', () => {
    const filter = createAgentStderrVisibilityFilter('amr');

    const visible = [
      filter.write('Performing one time database migration, may take a few minutes...\n'),
      filter.write('sqlite-migration:42%\r'),
      filter.write('sqlite-migration:done\n'),
      filter.write('Database migration complete.\n'),
      filter.write('Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.\n'),
      filter.write('opencode server listening on http://127.0.0.1:54321\n'),
      filter.write('real AMR diagnostic before ACP\n'),
      filter.write('real AMR diagnostic without newline'),
      filter.flush(),
    ].join('');

    expect(visible).toBe(
      'real AMR diagnostic before ACP\nreal AMR diagnostic without newline',
    );
  });

  it('filters bootstrap lines split across chunks', () => {
    const filter = createAgentStderrVisibilityFilter('amr');

    const visible = [
      filter.write('opencode server listening on http://127.'),
      filter.write('0.0.1:54321\nreal diagnostic\n'),
      filter.flush(),
    ].join('');

    expect(visible).toBe('real diagnostic\n');
  });

  it('preserves sqlite migration diagnostics that are not known progress lines', () => {
    const filter = createAgentStderrVisibilityFilter('amr');

    const visible = [
      filter.write('sqlite-migration:42\n'),
      filter.write('sqlite-migration:42.5%\n'),
      filter.write('sqlite-migration: failed to open migration file\n'),
      filter.write('sqlite-migration:error: locked database\n'),
      filter.flush(),
    ].join('');

    expect(visible).toBe(
      'sqlite-migration: failed to open migration file\n' +
        'sqlite-migration:error: locked database\n',
    );
  });

  it('handles empty, nullish, and control-character chunks without fabricating stderr', () => {
    const filter = createAgentStderrVisibilityFilter('amr');

    const visible = [
      filter.write(''),
      filter.write(null),
      filter.write(undefined),
      filter.write('\0'),
      filter.write('\n'),
      filter.write('diagnostic with nul \0 byte'),
      filter.flush(),
    ].join('');

    expect(visible).toBe('\0\ndiagnostic with nul \0 byte');
  });

  it('does not hide non-AMR stderr', () => {
    const filter = createAgentStderrVisibilityFilter('opencode');

    const visible = filter.write(
      [
        'Performing one time database migration, may take a few minutes...',
        'sqlite-migration:done',
        'opencode server listening on http://127.0.0.1:54321',
        'real diagnostic',
      ].join('\n'),
    );

    expect(visible).toContain('Performing one time database migration');
    expect(visible).toContain('sqlite-migration:done');
    expect(visible).toContain('opencode server listening');
    expect(visible).toContain('real diagnostic');
    expect(filter.flush()).toBe('');
  });

  it('does not stringify nullish chunks for non-AMR stderr', () => {
    const filter = createAgentStderrVisibilityFilter('opencode');

    expect(filter.write(null)).toBe('');
    expect(filter.write(undefined)).toBe('');
  });
});
