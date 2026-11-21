import { describe, expect, it } from 'vitest';
import { extractKnownProjectFileRefs } from '../../src/components/AssistantMessage';

describe('extractKnownProjectFileRefs', () => {
  it('stays fast on long messages in projects with hundreds of files', () => {
    const names = new Set<string>();
    for (let i = 0; i < 500; i += 1) names.add(`generated-asset-${i}.png`);
    const content = Array.from(
      { length: 3000 },
      (_, i) => `Line ${i}: the layout now uses a wider grid and softer shadows.`,
    ).join('\n');

    const started = performance.now();
    const refs = extractKnownProjectFileRefs(content, names);
    const elapsedMs = performance.now() - started;

    expect(refs).toEqual([]);
    // 1.5M line x file pairs; the per-pair boundary regex took ~800ms here,
    // the substring pre-check takes ~17ms. Bound leaves headroom for slow CI.
    expect(elapsedMs).toBeLessThan(250);
  });

  it('still finds exact-boundary references', () => {
    const names = new Set(['index.html', 'a.css']);
    const refs = extractKnownProjectFileRefs('Edited `index.html` and a.css today.\nnotindex.htmlx', names);
    expect(refs.sort()).toEqual(['a.css', 'index.html']);
  });
});
