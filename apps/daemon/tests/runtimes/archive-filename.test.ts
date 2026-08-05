import { describe, expect, it } from 'vitest';
import { sanitizeArchiveFilename } from '../../src/runtimes/archive-filename.js';

describe('archive filename boundary', () => {
  it('keeps readable Unicode names while neutralizing path and header syntax', () => {
    expect(sanitizeArchiveFilename(' café/design:final? ')).toBe('café_design_final_');
    expect(sanitizeArchiveFilename('a"b<c>|d*e')).toBe('a_b_c__d_e');
  });

  it('removes control bytes, trims separator dashes, and caps length', () => {
    expect(sanitizeArchiveFilename('\u0000--- Project ---\u007f')).toBe('Project');
    expect(sanitizeArchiveFilename('x'.repeat(100))).toHaveLength(80);
  });

  it('handles nullish and non-string input deterministically', () => {
    expect(sanitizeArchiveFilename(null)).toBe('');
    expect(sanitizeArchiveFilename(42)).toBe('42');
  });
});
