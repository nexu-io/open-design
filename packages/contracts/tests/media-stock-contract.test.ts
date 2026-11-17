import { describe, expect, it } from 'vitest';
import { parseStockSearchRequest } from '../src/api/media-stock.js';

describe('stock search wire request', () => {
  const slots = [{ id: 'hero', query: 'camping', width: 1200, orientation: 'landscape' }];

  it('accepts the shared CLI and project request shape', () => {
    expect(parseStockSearchRequest({ slots, outDir: 'assets/stock', concurrency: 3, budgetMs: 180000 })).toEqual({ slots, outDir: 'assets/stock', concurrency: 3, budgetMs: 180000 });
  });

  it.each([{ env: {} }, { projectId: 'another' }, { cwd: '/outside' }, { runId: 'another' }])('rejects authority or credential overrides %j', (extra) => {
    expect(() => parseStockSearchRequest({ slots, ...extra })).toThrow('unsupported');
  });

  it.each([[], Array.from({ length: 31 }, () => slots[0]), [{ id: '', query: 'camping' }], [{ id: 'hero', query: '', width: 2 }], [{ id: 'hero', query: 'camping', orientation: 'invented' }], [{ id: 'hero', query: 'camping', orientation: ['landscape'] }], [{ id: 'hero', query: 'camping', width: Infinity }]].map((invalid) => ({ slots: invalid })))('rejects invalid slots %j', (invalid) => {
    expect(() => parseStockSearchRequest(invalid)).toThrow();
  });

  it.each([0, -1, 1.5, Infinity, NaN, '3'])('rejects invalid numeric limits %j', (value) => {
    for (const name of ['concurrency', 'budgetMs', 'requestTimeoutMs']) expect(() => parseStockSearchRequest({ slots, [name]: value })).toThrow('positive integer');
  });
});
