import { describe, it, expect } from 'vitest';
import {
  MAX_ARTIFACT_FOCUS_SHOW,
  foldArtifactFocusSelections,
  declaredArtifactCards,
  narrowProducedFilesToFocus,
  normalizeArtifactFocusPath,
  parseArtifactFocusMarker,
  parseArtifactFocusPathList,
  renderArtifactFocusInstruction,
  renderArtifactFocusMarkerExample,
  stripArtifactFocusMarkers,
} from '../src/api/artifact-focus-marker';

/**
 * Fixtures follow the shapes in real recordings under `.od/runs/*'/events.jsonl`:
 * `producedFiles` entries are `ProjectFile` objects (name/path/size/mtime/kind/mime),
 * never bare strings, and the turn key is the 16-hex nonce the daemon mints
 * (`{"type":"done_key","key":"c07a83a9bc73cbd6"}`).
 */
const KEY = 'c07a83a9bc73cbd6';

function file(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    path: name,
    size: 2048,
    mtime: 1787787535451,
    kind: name.endsWith('.html') ? 'html' : 'text',
    mime: name.endsWith('.html') ? 'text/html' : 'text/plain',
    ...extra,
  };
}

describe('normalizeArtifactFocusPath — the untrusted-path boundary', () => {
  it('keeps an ordinary project-relative path', () => {
    expect(normalizeArtifactFocusPath('index.html')).toBe('index.html');
    expect(normalizeArtifactFocusPath('site/zh/index.html')).toBe('site/zh/index.html');
  });

  it('normalizes the shapes models actually write', () => {
    expect(normalizeArtifactFocusPath('./index.html')).toBe('index.html');
    expect(normalizeArtifactFocusPath('  index.html  ')).toBe('index.html');
    expect(normalizeArtifactFocusPath('`index.html`')).toBe('index.html');
    expect(normalizeArtifactFocusPath('"report.md"')).toBe('report.md');
    expect(normalizeArtifactFocusPath('site\\zh\\index.html')).toBe('site/zh/index.html');
    expect(normalizeArtifactFocusPath('site//zh///index.html')).toBe('site/zh/index.html');
  });

  /*
   * The security half. Each of these is a path the host would otherwise READ
   * and render, so every one must come back null — not "sanitized".
   */
  it('refuses anything that escapes the project root', () => {
    for (const hostile of [
      '../../../etc/passwd',
      '..',
      '../secrets.env',
      'a/../../b',
      'site/../../etc/hosts',
      '/etc/passwd',
      '/Users/elian/.ssh/id_rsa',
      'C:/Windows/System32/config/SAM',
      'C:\\Windows\\System32\\config\\SAM',
      '//evil-host/share/x',
      'file:///etc/passwd',
      'data:text/html,<script>x</script>',
      'https://example.com/x.html',
      'index.html\u0000.png',
      '',
      '   ',
    ]) {
      expect(normalizeArtifactFocusPath(hostile), `${JSON.stringify(hostile)} must be refused`).toBeNull();
    }
  });

  it('refuses a path past the length and depth ceilings', () => {
    expect(normalizeArtifactFocusPath('a/'.repeat(40) + 'x.html')).toBeNull();
    expect(normalizeArtifactFocusPath('x'.repeat(2000) + '.html')).toBeNull();
  });

  it('refuses non-strings rather than coercing them', () => {
    expect(normalizeArtifactFocusPath(null)).toBeNull();
    expect(normalizeArtifactFocusPath(undefined)).toBeNull();
    expect(normalizeArtifactFocusPath(42)).toBeNull();
    expect(normalizeArtifactFocusPath({ toString: () => 'index.html' })).toBeNull();
  });
});

describe('parseArtifactFocusPathList', () => {
  it('splits on commas and trims', () => {
    expect(parseArtifactFocusPathList('index.html, report.md')).toEqual(['index.html', 'report.md']);
  });

  it('drops one bad entry without discarding its neighbours', () => {
    expect(parseArtifactFocusPathList('index.html, ../../etc/passwd, report.md')).toEqual([
      'index.html',
      'report.md',
    ]);
  });

  it('dedupes and caps', () => {
    expect(parseArtifactFocusPathList('a.html, ./a.html, a.html')).toEqual(['a.html']);
    const many = Array.from({ length: 20 }, (_, i) => `f${i}.html`).join(', ');
    expect(parseArtifactFocusPathList(many)).toHaveLength(MAX_ARTIFACT_FOCUS_SHOW);
  });

  it('returns [] for nothing usable', () => {
    expect(parseArtifactFocusPathList('')).toEqual([]);
    expect(parseArtifactFocusPathList('  ,  , ')).toEqual([]);
    expect(parseArtifactFocusPathList(null)).toEqual([]);
  });
});

describe('parseArtifactFocusMarker', () => {
  it('reads key, open, and show off one self-closing tag', () => {
    const parsed = parseArtifactFocusMarker(
      `<od-focus key="${KEY}" open="index.html" show="index.html, report.md"/>`,
    );
    expect(parsed.key).toBe(KEY);
    expect(parsed.open).toBe('index.html');
    expect(parsed.show).toEqual(['index.html', 'report.md']);
  });

  it('tolerates single quotes and unquoted values — model formatting drifts', () => {
    const parsed = parseArtifactFocusMarker(`<od-focus key='${KEY}' open=index.html>`);
    expect(parsed.key).toBe(KEY);
    expect(parsed.open).toBe('index.html');
  });

  it('surfaces an absolute open as rawOpen so the daemon can rebase it', () => {
    const parsed = parseArtifactFocusMarker(
      `<od-focus key="${KEY}" open="/Users/elian/proj/index.html"/>`,
    );
    // Absolute is refused by the pure normalizer — only the daemon knows the root.
    expect(parsed.open).toBeNull();
    expect(parsed.rawOpen).toBe('/Users/elian/proj/index.html');
  });

  it('an attribute-less marker parses to an empty selection, not a throw', () => {
    const parsed = parseArtifactFocusMarker('<od-focus/>');
    expect(parsed.key).toBe('');
    expect(parsed.open).toBeNull();
    expect(parsed.show).toEqual([]);
  });
});

describe('stripArtifactFocusMarkers — the marker never reaches the reader', () => {
  it('removes the tag and every attribute fragment with it', () => {
    const out = stripArtifactFocusMarkers(
      `已完成。<od-focus key="${KEY}" open="index.html" show="index.html"/>\n文件已保存。`,
    );
    expect(out).not.toContain('<od-focus');
    expect(out).not.toContain('od-focus');
    expect(out).not.toContain('key=');
    expect(out).not.toContain('open=');
    expect(out).not.toContain(KEY);
    expect(out).toContain('已完成。');
    expect(out).toContain('文件已保存。');
  });

  it('removes a wrongly-keyed, unkeyed, or unclosed marker just the same', () => {
    for (const marker of [
      '<od-focus key="not-this-turns-key" open="index.html"/>',
      '<od-focus open="index.html"/>',
      '<od-focus>',
      '</od-focus>',
      '<od-focus key="' + KEY + '">',
    ]) {
      const out = stripArtifactFocusMarkers(`前。${marker}后。`);
      expect(out, `${marker} leaked`).not.toContain('od-focus');
      expect(out).toBe('前。后。');
    }
  });

  /*
   * Positive control. Without this, replacing the pattern with `/<[^>]*>/g`
   * would turn every assertion above green while destroying real prose — the
   * exact fake fix the `<MUST_FIX>` leak taught us to test against.
   */
  it('leaves everything that merely looks like the marker alone', () => {
    const innocent = [
      '普通 HTML:<div class="x">hi</div> 和 <span>y</span>。',
      '复数或多一截的拼法 <od-focuses> / <od-focused> 不是这个标记。',
      '别的协议标记 <od-done key="x"/> 不归这里管。',
      '正文里裸写 od-focus 这个词(没有尖括号)要留着。',
      '数学写法 a<b 和 5 < 7 也要留着。',
    ].join('\n');
    expect(stripArtifactFocusMarkers(innocent)).toBe(innocent);
  });

  it('is a no-op on text with no angle bracket at all', () => {
    expect(stripArtifactFocusMarkers('就是一句普通的话。')).toBe('就是一句普通的话。');
  });
});

describe('renderArtifactFocusMarkerExample — prompt and parser cannot drift', () => {
  it('round-trips through the parser', () => {
    const rendered = renderArtifactFocusMarkerExample(KEY, {
      open: 'index.html',
      show: ['index.html', 'report.md'],
    });
    const parsed = parseArtifactFocusMarker(rendered);
    expect(parsed.key).toBe(KEY);
    expect(parsed.open).toBe('index.html');
    expect(parsed.show).toEqual(['index.html', 'report.md']);
  });

  it('omits an attribute it was not given', () => {
    expect(renderArtifactFocusMarkerExample(KEY, { open: 'index.html' })).toBe(
      `<od-focus key="${KEY}" open="index.html"/>`,
    );
  });
});

describe('foldArtifactFocusSelections — last wins, per field', () => {
  it('keeps an early open when a late marker only declares show', () => {
    expect(
      foldArtifactFocusSelections([{ open: 'index.html' }, { show: ['index.html', 'report.md'] }]),
    ).toEqual({ open: 'index.html', show: ['index.html', 'report.md'] });
  });

  it('the later value of the same field wins', () => {
    expect(foldArtifactFocusSelections([{ open: 'a.html' }, { open: 'b.html' }])).toEqual({
      open: 'b.html',
    });
    expect(
      foldArtifactFocusSelections([{ show: ['a.html'] }, { show: ['b.html', 'c.md'] }]),
    ).toEqual({ show: ['b.html', 'c.md'] });
  });

  it('no events folds to an empty selection', () => {
    expect(foldArtifactFocusSelections([])).toEqual({});
  });
});

describe('narrowProducedFilesToFocus — narrow only, never widen, never empty', () => {
  const produced = [
    file('index.html'),
    file('styles.css'),
    file('app.js'),
    file('hero.png', { kind: 'image', mime: 'image/png' }),
    file('logo.svg', { kind: 'image', mime: 'image/svg+xml' }),
    file('report.md'),
  ];

  /*
   * The product ruling, verbatim: 一个 html 可能会有 js 或 css 文件或者一堆图片
   * 文件,但最终主要的是这个 html。
   */
  it('a marker naming one html yields exactly that card', () => {
    expect(narrowProducedFilesToFocus(produced, ['index.html']).map((f) => f.name)).toEqual([
      'index.html',
    ]);
  });

  it('a marker naming two deliverables yields exactly those two, in list order', () => {
    expect(
      narrowProducedFilesToFocus(produced, ['report.md', 'index.html']).map((f) => f.name),
    ).toEqual(['index.html', 'report.md']);
  });

  /*
   * The fallback ruling, verbatim: 不发标记要么按现在规则展示。
   * Paired with the positive above so neither assertion can pass vacuously.
   */
  it('no marker leaves the inferred list byte-identical', () => {
    expect(narrowProducedFilesToFocus(produced, undefined)).toBe(produced);
    expect(narrowProducedFilesToFocus(produced, null)).toBe(produced);
    expect(narrowProducedFilesToFocus(produced, [])).toBe(produced);
  });

  it('never widens: a declared file the turn did not produce adds no card', () => {
    expect(
      narrowProducedFilesToFocus(produced, ['index.html', 'never-produced.html']).map((f) => f.name),
    ).toEqual(['index.html']);
  });

  it('an entirely unmatched declaration keeps the inferred list rather than emptying the panel', () => {
    expect(narrowProducedFilesToFocus(produced, ['nothing-here.html'])).toBe(produced);
    expect(narrowProducedFilesToFocus(produced, ['../../etc/passwd'])).toBe(produced);
  });

  it('matches a nested file by full path or by basename', () => {
    const nested = [file('site/index.html', { name: 'site/index.html', path: 'site/index.html' }), file('site/app.js')];
    expect(narrowProducedFilesToFocus(nested, ['site/index.html']).map((f) => f.name)).toEqual([
      'site/index.html',
    ]);
    expect(narrowProducedFilesToFocus(nested, ['index.html']).map((f) => f.name)).toEqual([
      'site/index.html',
    ]);
  });

  it('an empty produced list stays empty — narrowing cannot invent a turn', () => {
    expect(narrowProducedFilesToFocus([], ['index.html'])).toEqual([]);
  });
});

describe('declaredArtifactCards — the conversation lists what the turn declared', () => {
  const produced = [
    file('index.html'),
    file('styles.css'),
    file('app.js'),
    file('hero.png', { kind: 'image', mime: 'image/png' }),
    file('logo.svg', { kind: 'image', mime: 'image/svg+xml' }),
    file('report.md'),
  ];

  /*
   * This function is the NARROWING half and nothing else: a pure filter that
   * can only ever shrink the list it was handed. "No usable declaration" is
   * therefore `[]` here — but `[]` is not what the user sees on an undeclared
   * turn. The caller falls back to `pickPrimaryArtifacts` over the files the
   * turn wrote (see artifact-focus-primary.test.ts), because the original
   * ruling 「一张都不显示那就不显示呗」measured out at a 22% declaration rate on
   * edit-only turns, i.e. mostly empty panels (OPEND-2550).
   *
   * It still REVERSES `narrowProducedFilesToFocus`, which is why the two live
   * side by side rather than one calling the other: that one answers "what did
   * this turn deliver" for the Share / Download / next-step anchor, where an
   * undeclared turn must keep its inferred list.
   */
  it('no declaration lists nothing', () => {
    expect(declaredArtifactCards(produced, undefined)).toEqual([]);
    expect(declaredArtifactCards(produced, null)).toEqual([]);
    expect(declaredArtifactCards(produced, [])).toEqual([]);
  });

  /*
   * Paired with the negative above on purpose. On its own, "no declaration
   * lists nothing" is satisfied by a function that always returns `[]`.
   */
  it('a declaration naming one html lists exactly that card', () => {
    expect(declaredArtifactCards(produced, ['index.html']).map((f) => f.name)).toEqual([
      'index.html',
    ]);
  });

  it('a declaration naming two deliverables lists exactly those two, in list order', () => {
    expect(
      declaredArtifactCards(produced, ['report.md', 'index.html']).map((f) => f.name),
    ).toEqual(['index.html', 'report.md']);
  });

  it('never widens: a declared file the turn did not produce adds no card', () => {
    expect(
      declaredArtifactCards(produced, ['index.html', 'never-produced.html']).map((f) => f.name),
    ).toEqual(['index.html']);
  });

  /*
   * The cliff this closes: under a "fall back to the full list" rule, a typo
   * would show SIX cards where declaring nothing shows none.
   */
  it('an entirely unmatched declaration lists nothing, not the full list', () => {
    expect(declaredArtifactCards(produced, ['nothing-here.html'])).toEqual([]);
  });

  it('a declaration of only unusable paths counts as no declaration', () => {
    expect(declaredArtifactCards(produced, ['../../etc/passwd'])).toEqual([]);
    expect(declaredArtifactCards(produced, ['', '   '])).toEqual([]);
  });

  it('matches a nested file by full path or by basename', () => {
    const nested = [
      file('site/index.html', { name: 'site/index.html', path: 'site/index.html' }),
      file('site/app.js'),
    ];
    expect(declaredArtifactCards(nested, ['site/index.html']).map((f) => f.name)).toEqual([
      'site/index.html',
    ]);
    expect(declaredArtifactCards(nested, ['index.html']).map((f) => f.name)).toEqual([
      'site/index.html',
    ]);
  });

  it('an empty produced list stays empty — a declaration cannot invent a card', () => {
    expect(declaredArtifactCards([], ['index.html'])).toEqual([]);
  });
});

/**
 * The instruction body itself.
 *
 * `grep -c od-focus` across the recorded runs is 0: everything downstream of
 * this marker was built and tested before anything ever told a model to write
 * one. This suite pins the four things the instruction has to say, so a later
 * trim cannot quietly drop one and leave the protocol unreachable again.
 */
describe('renderArtifactFocusInstruction — what the model is actually told', () => {
  const body = renderArtifactFocusInstruction(KEY);

  it('shows the exact wire format the parser accepts, with this turn\'s key', () => {
    expect(body).toContain(renderArtifactFocusMarkerExample(KEY, { open: 'index.html' }));
    expect(body).toContain(
      renderArtifactFocusMarkerExample(KEY, { show: ['index.html', 'report.md'] }),
    );
    // Round-trips through the parser: the example is not merely key-shaped.
    const parsed = parseArtifactFocusMarker(
      renderArtifactFocusMarkerExample(KEY, { open: 'index.html', show: ['index.html'] }),
    );
    expect(parsed.key).toBe(KEY);
    expect(parsed.open).toBe('index.html');
    expect(parsed.show).toEqual(['index.html']);
  });

  /* 「不要在空的时候打开…能看到产物有内容了再打开?但也不要等完全写完再打开」 */
  it('times `open` at "has real content", between "created" and "turn over"', () => {
    expect(body).toMatch(/real content/i);
    expect(body).toMatch(/still empty/i);
    expect(body).toMatch(/end of the turn|turn ends|until the turn/i);
  });

  /* 「最终主要的是这个 html,而不是其他杂七杂八的东西」 */
  it('says `show` names the deliverable, not its sidecars', () => {
    expect(body).toMatch(/stylesheet/i);
    expect(body).toMatch(/ONE deliverable/);
  });

  /*
   * The root cause of the 22% declaration rate on edit-only turns, fixed in the
   * text itself.
   *
   * The instruction used to speak only of "a file you created this turn" and
   * "this turn's deliverables". A model that read that literally and decided a
   * small edit was not a delivery was reading it CORRECTLY — the measured rate
   * was 100% on turns that created a file and 22–25% on turns that only edited
   * one. Nothing downstream can recover a declaration the instruction talked
   * the model out of making, so this is pinned here.
   */
  it('says an edit is a delivery, not only a creation', () => {
    expect(body).toMatch(/created OR changed/);
    expect(body).toMatch(/Changing an existing file is delivering it/i);
    expect(body).toMatch(/only edited `index\.html`/);
  });

  /*
   * What silence actually does, stated truthfully.
   *
   * This used to assert `/no cards/i`, matching the original opt-in ruling. The
   * host now falls back to the main artifacts among the files the turn wrote,
   * so telling the model "declare nothing and you get no cards" is a lie —
   * and a lie the model has no way to detect. What it must be told instead is
   * that its declaration BEATS the fallback, which is what earns compliance
   * without misdescribing the panel.
   */
  it('states that `show` narrows, and that silence hands the pick to the host', () => {
    expect(body).toMatch(/`show` NARROWS/);
    expect(body).toMatch(/the host answers for you/i);
    expect(body).not.toMatch(/no cards at all/i);
  });

  it('says paths are project-relative', () => {
    expect(body).toMatch(/relative to the project root/i);
  });

  it('carries the turn key verbatim and forbids inventing one', () => {
    expect(body).toContain(KEY);
    expect(body).toMatch(/never invent one/i);
  });

  it('is empty without a key — an unkeyed marker is never accepted, so never taught', () => {
    expect(renderArtifactFocusInstruction('')).toBe('');
  });
});
