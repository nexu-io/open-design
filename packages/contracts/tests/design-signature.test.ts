import { describe, expect, it } from 'vitest';
import {
  computeDesignSignatureFromText,
  diffDesignSignatures,
} from '../src/design-signature';

describe('design-signature engine (contracts)', () => {
  it('produces a stable fingerprint for equivalent color spellings', () => {
    const a = computeDesignSignatureFromText('a{color:#FFF}');
    const b = computeDesignSignatureFromText('a{color:#ffffff}');
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('names a color swap in the diff', () => {
    const prev = computeDesignSignatureFromText('a{color:#3b82f6}');
    const next = computeDesignSignatureFromText('a{color:#8b5cf6}');
    const diff = diffDesignSignatures(prev, next);
    expect(diff.unchanged).toBe(false);
    expect(diff.changes.some((c) => c.area === 'palette')).toBe(true);
  });

  it('reports unchanged for identical artifacts', () => {
    const prev = computeDesignSignatureFromText('a{color:#3b82f6;padding:8px}');
    const next = computeDesignSignatureFromText('a{color:#3b82f6;padding:8px}');
    expect(diffDesignSignatures(prev, next).unchanged).toBe(true);
  });
});
