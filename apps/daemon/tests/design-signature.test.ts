import { describe, expect, it } from 'vitest';

import {
  computeDesignSignature,
  computeDesignSignatureFromText,
  diffDesignSignatures,
  normalizeColor,
  parseSignatureArgs,
  renderDiffForTerminal,
  renderSignatureForTerminal,
  type DesignSignature,
} from '../src/design-signature.js';
import {
  createDesignTokenEvidenceCollector,
  type DesignExtractReport,
} from '../src/design-systems/token-evidence.js';

function reportFrom(text: string): DesignExtractReport {
  const c = createDesignTokenEvidenceCollector();
  c.scanText({ text, file: 'artifact' });
  return c.toReport({ warnings: [], endedAt: '' });
}

function strand(sig: DesignSignature, key: string) {
  const s = sig.strands.find((x) => x.key === key);
  if (!s) throw new Error(`missing strand ${key}`);
  return s;
}

describe('normalizeColor', () => {
  it('expands shorthand hex and lowercases', () => {
    expect(normalizeColor('#FFF')).toBe('#ffffff');
    expect(normalizeColor('#3B82F6')).toBe('#3b82f6');
  });

  it('dedupes #FFF and #ffffff to the same value', () => {
    expect(normalizeColor('#FFF')).toBe(normalizeColor('#ffffff'));
  });

  it('collapses whitespace in rgb()/hsl()', () => {
    expect(normalizeColor('rgb( 0 , 0 , 0 )')).toBe('rgb(0,0,0)');
    expect(normalizeColor('hsl( 210 , 50% , 50% )')).toBe('hsl(210,50%,50%)');
  });

  it('returns null for non-color values', () => {
    expect(normalizeColor('16px')).toBe(null);
    expect(normalizeColor('')).toBe(null);
  });
});

describe('computeDesignSignature — shape and ordering', () => {
  it('always returns the four strands in canonical order', () => {
    const sig = computeDesignSignatureFromText('<div></div>');
    expect(sig.strands.map((s) => s.key)).toEqual(['palette', 'rhythm', 'cadence', 'density']);
  });

  it('vitality is the mean of strand scores, 0..100', () => {
    const sig = computeDesignSignatureFromText('<div></div>');
    const mean =
      sig.strands.reduce((sum, s) => sum + s.score, 0) / sig.strands.length;
    expect(sig.vitality).toBe(Math.round(mean));
    expect(sig.vitality).toBeGreaterThanOrEqual(0);
    expect(sig.vitality).toBeLessThanOrEqual(100);
  });

  it('scores an empty artifact at zero vitality', () => {
    const sig = computeDesignSignatureFromText('');
    expect(sig.vitality).toBe(0);
    for (const s of sig.strands) expect(s.score).toBe(0);
  });
});

describe('palette strand', () => {
  it('rewards a focused palette (<=6 colors)', () => {
    const css = `<style>a{color:#111}b{color:#222}c{color:#333}</style>`;
    const sig = computeDesignSignatureFromText(css);
    expect(strand(sig, 'palette').score).toBe(100);
    expect(sig.counts.colors).toBe(3);
  });

  it('penalizes a sprawling palette', () => {
    const colors = ['#111', '#222', '#333', '#444', '#555', '#666', '#777', '#888', '#999', '#aaa'];
    const css = `<style>${colors.map((c, i) => `.x${i}{color:${c}}`).join('')}</style>`;
    const sig = computeDesignSignatureFromText(css);
    expect(sig.counts.colors).toBe(10);
    expect(strand(sig, 'palette').score).toBeLessThan(100);
  });

  it('dedupes equivalent color spellings', () => {
    const css = `<style>a{color:#FFF}b{color:#ffffff}c{color:#FFFFFF}</style>`;
    const sig = computeDesignSignatureFromText(css);
    expect(sig.counts.colors).toBe(1);
  });
});

describe('rhythm strand', () => {
  it('rewards 1-2 font families', () => {
    const css = [
      '<style>',
      'body { font-family: Inter, sans-serif; }',
      'h1 { font-family: Inter, sans-serif; }',
      '</style>',
    ].join('\n');
    const sig = computeDesignSignatureFromText(css);
    expect(sig.counts.fontFamilies).toBe(1);
    expect(strand(sig, 'rhythm').score).toBe(100);
  });

  it('penalizes a fragmented type voice', () => {
    // One declaration per line: the extractor's font-family regex captures to
    // end of line, so realistic CSS (not crammed onto one line) yields the
    // distinct families we intend to measure.
    const css = [
      '<style>',
      '.a { font-family: Inter, sans-serif; }',
      '.b { font-family: Georgia, serif; }',
      '.c { font-family: Courier, monospace; }',
      '.d { font-family: Helvetica, sans-serif; }',
      '.e { font-family: Verdana, sans-serif; }',
      '</style>',
    ].join('\n');
    const sig = computeDesignSignatureFromText(css);
    expect(sig.counts.fontFamilies).toBe(5);
    expect(strand(sig, 'rhythm').score).toBeLessThan(100);
  });
});

describe('cadence strand', () => {
  it('rewards spacing that aligns to a consistent step', () => {
    const css = `<style>a{padding:8px}b{margin:16px}c{gap:24px}d{padding:32px}</style>`;
    const sig = computeDesignSignatureFromText(css);
    expect(strand(sig, 'cadence').score).toBeGreaterThanOrEqual(90);
  });

  it('scores off-grid spacing lower than on-grid', () => {
    const onGrid = computeDesignSignatureFromText(
      `<style>a{padding:8px}b{margin:16px}c{gap:24px}d{padding:32px}</style>`,
    );
    const offGrid = computeDesignSignatureFromText(
      `<style>a{padding:7px}b{margin:13px}c{gap:19px}d{padding:23px}</style>`,
    );
    expect(strand(offGrid, 'cadence').score).toBeLessThan(strand(onGrid, 'cadence').score);
  });
});

describe('fingerprint', () => {
  it('is an 8-char hex string', () => {
    const sig = computeDesignSignatureFromText('<style>a{color:#111;padding:8px}</style>');
    expect(sig.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is stable for identical token sets', () => {
    const css = '<style>a{color:#3b82f6;padding:16px;border-radius:8px}</style>';
    expect(computeDesignSignatureFromText(css).fingerprint).toBe(
      computeDesignSignatureFromText(css).fingerprint,
    );
  });

  it('changes when a token changes', () => {
    const a = computeDesignSignatureFromText('<style>x{color:#3b82f6;padding:16px}</style>');
    const b = computeDesignSignatureFromText('<style>x{color:#8b5cf6;padding:16px}</style>');
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('is invariant to color spelling that normalizes equal', () => {
    const a = computeDesignSignatureFromText('<style>x{color:#FFF}</style>');
    const b = computeDesignSignatureFromText('<style>x{color:#ffffff}</style>');
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe('computeDesignSignature from a report', () => {
  it('matches the from-text convenience wrapper', () => {
    const css = '<style>a{color:#111;font-family:Inter;padding:8px;border-radius:4px}</style>';
    const viaText = computeDesignSignatureFromText(css);
    const viaReport = computeDesignSignature(reportFrom(css));
    expect(viaReport).toEqual(viaText);
  });
});

describe('renderSignatureForTerminal', () => {
  const sig = computeDesignSignatureFromText(
    '<style>a{color:#111;font-family:Inter;padding:8px;border-radius:4px}</style>',
  );
  const out = renderSignatureForTerminal(sig);

  it('includes the vitality score and fingerprint in the header', () => {
    expect(out).toContain(`vitality ${sig.vitality}/100`);
    expect(out).toContain(sig.fingerprint);
  });

  it('lists every strand label', () => {
    for (const s of sig.strands) expect(out).toContain(s.label);
  });

  it('renders a fixed-width 10-cell meter per strand', () => {
    // Each meter is exactly 10 cells of filled/empty blocks.
    const meters = out.match(/[█░]+/g) ?? [];
    expect(meters.length).toBe(sig.strands.length);
    for (const m of meters) expect(m.length).toBe(10);
  });

  it('emits no ANSI escape sequences (stable for pipes and tests)', () => {
    expect(out.includes(String.fromCharCode(27))).toBe(false);
  });
});

describe('diffDesignSignatures', () => {
  const baseCss = [
    '<style>',
    'body { font-family: Inter, sans-serif; color: #111827; }',
    '.btn { background: #3b82f6; padding: 8px; border-radius: 8px; }',
    '.card { padding: 16px; gap: 24px; }',
    '</style>',
  ].join('\n');

  it('reports no changes for identical designs', () => {
    const a = computeDesignSignatureFromText(baseCss);
    const b = computeDesignSignatureFromText(baseCss);
    const diff = diffDesignSignatures(a, b);
    expect(diff.unchanged).toBe(true);
    expect(diff.changes).toEqual([]);
    expect(diff.vitalityDelta).toBe(0);
  });

  it('detects a single color swap as a palette change', () => {
    const a = computeDesignSignatureFromText(baseCss);
    const b = computeDesignSignatureFromText(baseCss.replace('#3b82f6', '#8b5cf6'));
    const diff = diffDesignSignatures(a, b);
    expect(diff.unchanged).toBe(false);
    const palette = diff.changes.find((c) => c.area === 'palette');
    expect(palette).toBeDefined();
    expect(palette?.summary).toContain('#3b82f6');
    expect(palette?.summary).toContain('#8b5cf6');
  });

  it('detects an increased corner radius', () => {
    const a = computeDesignSignatureFromText(baseCss);
    const b = computeDesignSignatureFromText(baseCss.replace('border-radius: 8px', 'border-radius: 16px'));
    const diff = diffDesignSignatures(a, b);
    const radius = diff.changes.find((c) => c.summary.toLowerCase().includes('radius'));
    expect(radius).toBeDefined();
    expect(radius?.direction).toBe('increased');
  });

  it('detects a decreased corner radius', () => {
    const a = computeDesignSignatureFromText(baseCss);
    const b = computeDesignSignatureFromText(baseCss.replace('border-radius: 8px', 'border-radius: 2px'));
    const radius = diffDesignSignatures(a, b).changes.find((c) =>
      c.summary.toLowerCase().includes('radius'),
    );
    expect(radius?.direction).toBe('decreased');
  });

  it('reports a vitality delta when scores move', () => {
    // Fragment the type voice so rhythm (and vitality) drops.
    const a = computeDesignSignatureFromText(baseCss);
    const worse = baseCss.replace(
      '</style>',
      '.x { font-family: Georgia, serif; }\n.y { font-family: Courier, monospace; }\n.z { font-family: Verdana, sans-serif; }\n</style>',
    );
    const b = computeDesignSignatureFromText(worse);
    const diff = diffDesignSignatures(a, b);
    expect(diff.vitalityDelta).toBeLessThan(0);
  });

  it('treats a shadow-only change as a real change (regression)', () => {
    // Same color, only the box-shadow offsets differ. Shadow tokens must be
    // part of the fingerprint, otherwise the diff short-circuits to unchanged.
    const a = computeDesignSignatureFromText('<style>x{box-shadow:0 1px 2px #000}</style>');
    const b = computeDesignSignatureFromText('<style>x{box-shadow:0 4px 8px #000}</style>');
    expect(a.fingerprint).not.toBe(b.fingerprint);
    const diff = diffDesignSignatures(a, b);
    expect(diff.unchanged).toBe(false);
    const shadow = diff.changes.find((c) => c.area === 'shadow');
    expect(shadow).toBeDefined();
  });

  it('reports added elevation as increased', () => {
    const a = computeDesignSignatureFromText('<style>x{color:#111}</style>');
    const b = computeDesignSignatureFromText('<style>x{color:#111;box-shadow:0 4px 8px #000}</style>');
    const shadow = diffDesignSignatures(a, b).changes.find((c) => c.area === 'shadow');
    expect(shadow?.direction).toBe('increased');
  });

  // Regression: shadows embed a color, so equivalent color spellings inside a
  // shadow must share a fingerprint (same contract as the palette), otherwise
  // #FFF vs #ffffff produces a false-positive diff.
  it('treats equivalent shadow color spellings as the same fingerprint', () => {
    const a = computeDesignSignatureFromText('<style>x{box-shadow:0 1px 2px #FFF}</style>');
    const b = computeDesignSignatureFromText('<style>x{box-shadow:0 1px 2px #ffffff}</style>');
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(diffDesignSignatures(a, b).unchanged).toBe(true);
  });

  it('collapses shadow whitespace so spacing-only spelling differences match', () => {
    const a = computeDesignSignatureFromText('<style>x{box-shadow:0 1px 2px #000}</style>');
    const b = computeDesignSignatureFromText('<style>x{box-shadow:0   1px   2px   #000}</style>');
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  // Regression: rgba()/hsla() spacing is spelling-only. Formatter output
  // `rgba(0, 0, 0, 0.2)` vs minified `rgba(0,0,0,0.2)` must share a fingerprint.
  it('normalizes functional-color (rgba/hsla) spacing in shadows', () => {
    const a = computeDesignSignatureFromText('<style>x{box-shadow:0 1px 2px rgba(0, 0, 0, 0.2)}</style>');
    const b = computeDesignSignatureFromText('<style>x{box-shadow:0 1px 2px rgba(0,0,0,0.2)}</style>');
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(diffDesignSignatures(a, b).unchanged).toBe(true);
  });

  // Regression: multi-shadow list comma spacing is spelling-only.
  it('normalizes shadow-list comma spacing', () => {
    const a = computeDesignSignatureFromText('<style>x{box-shadow:0 1px 2px #000, 0 2px 4px #111}</style>');
    const b = computeDesignSignatureFromText('<style>x{box-shadow:0 1px 2px #000,0 2px 4px #111}</style>');
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(diffDesignSignatures(a, b).unchanged).toBe(true);
  });
});

describe('renderDiffForTerminal', () => {
  const a = computeDesignSignatureFromText('<style>.b{background:#3b82f6;border-radius:8px}</style>');
  const b = computeDesignSignatureFromText('<style>.b{background:#8b5cf6;border-radius:16px}</style>');

  it('matches the requested format: Signature header + changes list', () => {
    const out = renderDiffForTerminal(b, diffDesignSignatures(a, b));
    expect(out).toContain(`Signature: ${b.fingerprint}`);
    expect(out).toContain('Changes since last version:');
  });

  it('reports no changes cleanly for identical designs', () => {
    const out = renderDiffForTerminal(a, diffDesignSignatures(a, a));
    expect(out).toContain('No design changes since the previous version.');
  });

  it('emits no ANSI escape sequences', () => {
    const out = renderDiffForTerminal(b, diffDesignSignatures(a, b));
    expect(out.includes(String.fromCharCode(27))).toBe(false);
  });
});

describe('parseSignatureArgs', () => {
  it('reads a file path target', () => {
    expect(parseSignatureArgs(['design.html'])).toEqual({
      target: 'design.html',
      against: undefined,
      hasAgainst: false,
      json: false,
    });
  });

  // Regression: a bare `-` is the stdin target, not a flag. Previously the
  // positional scan dropped anything starting with `-`, so `od signature -`
  // never set a target and exited with the usage error.
  it('treats a bare - as the stdin target', () => {
    const parsed = parseSignatureArgs(['-']);
    expect(parsed.target).toBe('-');
  });

  it('treats - as the target alongside --against and --json', () => {
    const parsed = parseSignatureArgs(['-', '--against', 'prev.html', '--json']);
    expect(parsed.target).toBe('-');
    expect(parsed.against).toBe('prev.html');
    expect(parsed.hasAgainst).toBe(true);
    expect(parsed.json).toBe(true);
  });

  it('consumes the --against value so it is not read as the target', () => {
    const parsed = parseSignatureArgs(['--against', 'prev.html', 'next.html']);
    expect(parsed.target).toBe('next.html');
    expect(parsed.against).toBe('prev.html');
  });

  it('supports the --against=<file> inline form', () => {
    const parsed = parseSignatureArgs(['next.html', '--against=prev.html']);
    expect(parsed.target).toBe('next.html');
    expect(parsed.against).toBe('prev.html');
  });

  it('flags --against with no value (hasAgainst true, against undefined)', () => {
    const parsed = parseSignatureArgs(['next.html', '--against']);
    expect(parsed.hasAgainst).toBe(true);
    expect(parsed.against).toBeUndefined();
  });

  // Regression: a following flag is not a value. `--against --json` must leave
  // `against` undefined so the caller fails fast, rather than capturing
  // `--json` and trying to open a file named `--json`.
  it('does not capture a following flag as the --against value', () => {
    const parsed = parseSignatureArgs(['next.html', '--against', '--json']);
    expect(parsed.hasAgainst).toBe(true);
    expect(parsed.against).toBeUndefined();
    expect(parsed.json).toBe(true);
    expect(parsed.target).toBe('next.html');
  });

  it('accepts a bare - as the --against value (stdin previous version)', () => {
    const parsed = parseSignatureArgs(['next.html', '--against', '-']);
    expect(parsed.against).toBe('-');
  });

  it('reports no target when only flags are given', () => {
    expect(parseSignatureArgs(['--json']).target).toBeUndefined();
  });
});
