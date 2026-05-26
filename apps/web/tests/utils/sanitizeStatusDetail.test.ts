/* eslint-disable @typescript-eslint/no-undef */
import { sanitizeStatusDetail } from '../../src/utils/sanitizeStatusDetail';

describe('sanitizeStatusDetail', () => {
  describe('macOS app bundle paths', () => {
    it('replaces a vela executable path with "Live Artifact"', () => {
      const raw =
        '/Applications/Open Design Beta.app/Contents/Resources/open-design/bin/vela';

      expect(sanitizeStatusDetail(raw)).toBe('Live Artifact');
    });

    it('handles uppercase variations', () => {
      const raw =
        '/Applications/Open Design.app/Contents/Resources/open-design/bin/VELA';

      expect(sanitizeStatusDetail(raw)).toBe('Live Artifact');
    });
  });

  describe('Unix absolute paths', () => {
    it('replaces a /usr/local/bin/vela path', () => {
      const raw = '/usr/local/bin/vela';

      expect(sanitizeStatusDetail(raw)).toBe('Live Artifact');
    });

    it('replaces a /opt/bin/claude-code path', () => {
      const raw = '/opt/bin/claude-code';

      expect(sanitizeStatusDetail(raw)).toBe('Claude Code');
    });

    it('suppresses an unrecognized /usr/local/bin/unknown-agent path', () => {
      expect(sanitizeStatusDetail('/usr/local/bin/unknown-agent')).toBeUndefined();
    });
  });

  describe('Windows paths', () => {
    it('replaces a C:\\Program Files\\vela.exe path', () => {
      const raw = 'C:\\Program Files\\vela.exe';

      expect(sanitizeStatusDetail(raw)).toBe('Live Artifact');
    });

    it('suppresses an unknown C:\\Program Files\\unknown.exe path', () => {
      expect(sanitizeStatusDetail('C:\\Program Files\\unknown.exe')).toBeUndefined();
    });
  });

  describe('known agent labels', () => {
    it('recognizes claude-code', () => {
      expect(sanitizeStatusDetail('/bin/claude-code')).toBe('Claude Code');
    });

    it('recognizes codex', () => {
      expect(sanitizeStatusDetail('/bin/codex')).toBe('Codex');
    });

    it('recognizes devin', () => {
      expect(sanitizeStatusDetail('/bin/devin')).toBe('Devin');
    });

    it('recognizes deepseek', () => {
      expect(sanitizeStatusDetail('/bin/deepseek')).toBe('DeepSeek');
    });
  });

  describe('normal status text (unchanged)', () => {
    it('passes through normal status text untouched', () => {
      expect(
        sanitizeStatusDetail('Starting Live Artifact...')
      ).toBe('Starting Live Artifact...');
    });

    it('passes through multi-word status messages', () => {
      const text = 'Watching project files and preparing the review draft.';
      expect(sanitizeStatusDetail(text)).toBe(text);
    });

    it('passes through colon-separated labels and values', () => {
      const text = 'label: value';
      expect(sanitizeStatusDetail(text)).toBe(text);
    });

    it('preserves custom messages', () => {
      const text = 'Generating dashboard component...';
      expect(sanitizeStatusDetail(text)).toBe(text);
    });
  });

  describe('edge cases', () => {
    it('handles undefined gracefully', () => {
      expect(sanitizeStatusDetail(undefined)).toBeUndefined();
    });

    it('handles empty string gracefully', () => {
      expect(sanitizeStatusDetail('')).toBe('');
    });

    it('handles null-like strings', () => {
      expect(sanitizeStatusDetail('null')).toBe('null');
    });

    it('suppresses .asar (Electron app archive) paths', () => {
      expect(
        sanitizeStatusDetail('/opt/app/app.asar/bin/agent')
      ).toBeUndefined();
    });
  });
});
