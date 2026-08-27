import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { parseByteRange, resolveProjectFilePath } from '../src/projects.js';
import { startServer } from '../src/server.js';
import { load } from 'cheerio';

// ---------------------------------------------------------------------------
// parseByteRange — RFC 7233 unit tests
// ---------------------------------------------------------------------------

describe('parseByteRange', () => {
  it('returns null when header is undefined', () => {
    expect(parseByteRange(undefined, 1000)).toBeNull();
  });

  it('returns null when header is an empty string', () => {
    expect(parseByteRange('', 1000)).toBeNull();
  });

  it('returns null for non-bytes unit', () => {
    expect(parseByteRange('none=0-100', 1000)).toBeNull();
  });

  it('returns null for multi-range (caller falls back to full 200)', () => {
    expect(parseByteRange('bytes=0-100, 200-300', 1000)).toBeNull();
  });

  it('parses a standard start-end range', () => {
    expect(parseByteRange('bytes=0-499', 1000)).toEqual({ start: 0, end: 499 });
  });

  it('clamps an over-long end to fileSize - 1', () => {
    expect(parseByteRange('bytes=0-9999', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('parses an open-ended range (bytes=N-)', () => {
    expect(parseByteRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
  });

  it('parses a suffix range (bytes=-N)', () => {
    expect(parseByteRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 });
  });

  it('clamps suffix larger than fileSize to the whole file', () => {
    expect(parseByteRange('bytes=-9999', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('returns unsatisfiable when start equals fileSize', () => {
    expect(parseByteRange('bytes=1000-1999', 1000)).toBe('unsatisfiable');
  });

  it('returns unsatisfiable when start exceeds fileSize', () => {
    expect(parseByteRange('bytes=5000-5999', 1000)).toBe('unsatisfiable');
  });

  it('returns unsatisfiable for a zero-length suffix range (bytes=-0)', () => {
    expect(parseByteRange('bytes=-0', 1000)).toBe('unsatisfiable');
  });

  it('returns unsatisfiable for a negative suffix', () => {
    expect(parseByteRange('bytes=--1', 1000)).toBe('unsatisfiable');
  });

  it('returns null for non-integer start', () => {
    expect(parseByteRange('bytes=1.5-499', 1000)).toBeNull();
  });

  it('returns null for non-integer end', () => {
    expect(parseByteRange('bytes=0-499.9', 1000)).toBeNull();
  });

  it('returns null when end < start', () => {
    expect(parseByteRange('bytes=500-100', 1000)).toBeNull();
  });

  it('returns null for alphabetic range values', () => {
    expect(parseByteRange('bytes=abc-xyz', 1000)).toBeNull();
  });

  it('handles a single-byte range (bytes=0-0)', () => {
    expect(parseByteRange('bytes=0-0', 1000)).toEqual({ start: 0, end: 0 });
  });

  it('handles a range that exactly covers the last byte', () => {
    expect(parseByteRange('bytes=999-999', 1000)).toEqual({ start: 999, end: 999 });
  });
});

// ---------------------------------------------------------------------------
// resolveProjectFilePath — integration test (real temp files)
// ---------------------------------------------------------------------------

describe('resolveProjectFilePath', () => {
  let projectsRoot = '';
  const projectId = 'proj-range-test';

  beforeEach(async () => {
    projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-range-'));
    const dir = path.join(projectsRoot, projectId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'clip.mp4'), Buffer.alloc(2048));
    await writeFile(path.join(dir, 'index.html'), '<html/>');
  });

  afterEach(() => {
    if (projectsRoot) rmSync(projectsRoot, { recursive: true, force: true });
  });

  it('returns the correct size and mime for a video file', async () => {
    const result = await resolveProjectFilePath(projectsRoot, projectId, 'clip.mp4');
    expect(result.size).toBe(2048);
    expect(result.mime).toBe('video/mp4');
    expect(result.kind).toBe('video');
    expect(path.isAbsolute(result.filePath)).toBe(true);
  });

  it('returns the correct mime for an html file', async () => {
    const result = await resolveProjectFilePath(projectsRoot, projectId, 'index.html');
    expect(result.mime).toBe('text/html; charset=utf-8');
  });

  it('throws ENOENT for a missing file', async () => {
    await expect(
      resolveProjectFilePath(projectsRoot, projectId, 'missing.mp4'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects path traversal attempts', async () => {
    await expect(
      resolveProjectFilePath(projectsRoot, projectId, '../other-project/secret.mp4'),
    ).rejects.toThrow();
  });

  it('rejects symlink escapes inside managed projects', async () => {
    const outsideRoot = mkdtempSync(path.join(tmpdir(), 'od-range-outside-'));
    try {
      await writeFile(path.join(outsideRoot, 'secret.txt'), 'secret');
      await symlink(
        path.join(outsideRoot, 'secret.txt'),
        path.join(projectsRoot, projectId, 'linked-secret.txt'),
      );

      await expect(
        resolveProjectFilePath(projectsRoot, projectId, 'linked-secret.txt'),
      ).rejects.toMatchObject({ code: 'EPATHESCAPE' });
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id/raw/* — HTTP route-level tests
// Exercises the actual endpoint the VideoViewer and AudioViewer components
// call, confirming 206 / Accept-Ranges / Content-Range behaviour end-to-end.
// ---------------------------------------------------------------------------

describe('GET /api/projects/:id/raw/* range request route', () => {
  let server: http.Server;
  let baseUrl: string;
  let projectsRoot: string;
  const projectId = 'proj-raw-range-test';
  const FILE_SIZE = 512;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;

    const createResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Raw range fixture' }),
    });
    expect(createResponse.status).toBe(200);

    // Write a test video file into the daemon's projects root.
    // OD_DATA_DIR is set by tests/setup.ts so we can derive the path.
    projectsRoot = path.join(process.env.OD_DATA_DIR!, 'projects');
    const dir = path.join(projectsRoot, projectId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'clip.mp4'), Buffer.alloc(FILE_SIZE, 0x42));
    await writeFile(path.join(dir, 'audio.mp3'), Buffer.alloc(FILE_SIZE, 0x43));
    await writeFile(path.join(dir, 'page.html'), Buffer.from('<html/>'));
    await writeFile(
      path.join(dir, 'large.html'),
      Buffer.from(`<!doctype html><html><body><main>Large Preview</main>${'x'.repeat((2 * 1024 * 1024) + 256)}</body></html>`),
    );
    await writeFile(
      path.join(dir, 'large-powered.html'),
      Buffer.from(`<!doctype html><html><body>${'x'.repeat((2 * 1024 * 1024) + 256)}<script>new Worker("worker.js")</script></body></html>`),
    );
    await writeFile(path.join(dir, 'body.html'), Buffer.from('<html><body><main>Preview</main></body></html>'));
    // `<head>` is optional markup, so a document can legally have none while a
    // script string contains one — the head-open half of
    // nexu-io/open-design#7410. `<header>` is here because a bare
    // `/<head[^>]*>/` matches it too.
    await writeFile(
      path.join(dir, 'script-literal-head.html'),
      Buffer.from(
        '<!doctype html><html><body><header>Nav</header>'
          + '<script>\n'
          + '  const doc = `<head><title>Slip</title></head>`;\n'
          + "  document.getElementById('slot').textContent = doc.length;\n"
          + '</script>'
          + '<main id="slot"></main></body></html>',
      ),
    );
    // Three more from review: a raw-text *name* under SVG is a foreign
    // element (its CDATA is still a section), `=` may be followed by
    // whitespace before an unquoted value, and CR is a tag-name delimiter.
    await writeFile(
      path.join(dir, 'foreign-and-delimiters.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg><script><![CDATA[x > <\/script></svg><body>slip</body>]]><\/script></svg>'
          + '<svg data= http://x/><![CDATA[x > </svg><body>slip</body>]]></svg>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // CR delimits a tag name at *both* ends: it opens `<script\r>` and it
    // closes `</textarea\r>`. Missing the closing half leaves the scan inside
    // the raw text, where the authored `</body>` reads as a real end tag.
    // Namespace is a stack, not a depth. `<![CDATA[` is character data in
    // foreign content and a bogus comment in HTML, and `<script>` inverts the
    // same way, so both rules have to follow the adjusted current node —
    // including a `<math>` that re-enters MathML beneath an HTML integration
    // point, and `annotation-xml`, which is only an integration point when its
    // `encoding` names an HTML type.
    await writeFile(
      path.join(dir, 'foreign-namespaces.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg><![CDATA[label > <\/body>]]></svg>'
          + '<svg><foreignObject><math><ms><![CDATA[y > <\/body>]]></ms></math></foreignObject></svg>'
          + '<svg><foreignObject><script>var q = "<\/body>";<\/script></foreignObject></svg>'
          + '<math><annotation-xml encoding="text/html"><script>var r = "<\/body>";<\/script></annotation-xml></math>'
          + '<math><annotation-xml><![CDATA[z > <\/body>]]></annotation-xml></math>'
          + '<template><svg><![CDATA[x > </template><body>slip</body>]]></svg></template>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // The foreign-content dispatcher has exceptions that depend on the token
    // as well as the namespace: a breakout tag (`<p>`, `<font color>`, …) pops
    // the foreign element and is reprocessed as HTML, while `<mglyph>` and
    // `<malignmark>` stay in MathML beneath a text integration point. Read by
    // namespace alone, each of these puts the scan back inside author content.
    await writeFile(
      path.join(dir, 'foreign-breakout.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg><p><script>const x = "<\/svg><body>slip</body>";<\/script></p></svg>'
          + '<svg><font color="red"><script>const y = "<\/svg><body>slip</body>";<\/script></font></svg>'
          + '<math><mi><mglyph><![CDATA[x > </math><body>slip</body>]]></mglyph></mi></math>'
          + '<math><mtext><malignmark><![CDATA[q > </math><body>slip</body>]]></malignmark></mtext></math>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // The two attribute-driven rules above (`<font color>` breaking out of
    // foreign content, `annotation-xml encoding` becoming an integration
    // point) must read parsed attributes, not tag text: a value may contain
    // anything, including something spelled like another attribute.
    await writeFile(
      path.join(dir, 'quoted-fake-attrs.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg><font data-note=" color=red"><![CDATA[x > <\/svg><body>slip</body>]]></font></svg>'
          + '<math><annotation-xml data-note=" encoding=text/html">'
          + '<![CDATA[x > <\/math><body>slip</body>]]></annotation-xml></math>'
          // The mirror case: the tokenizer resolves character references in a
          // value, so this one *is* an integration point and its `<script>` is
          // HTML raw text — reading the source spelling keeps it MathML.
          + '<math><annotation-xml encoding="text&#x2f;html">'
          + '<script>const enc = "<\/math><body>slip</body>";<\/script></annotation-xml></math>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    await writeFile(
      path.join(dir, 'encoding-near-misses.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<math><annotation-xml encoding=" text/html ">'
          + '<![CDATA[p > <\/math><body>slip</body>]]></annotation-xml></math>'
          + '<math><annotation-xml encoding="text&solhtml">'
          + '<![CDATA[u > <\/math><body>slip</body>]]></annotation-xml></math>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // `<head data==">` is a complete start tag: the second `=` opens an
    // *unquoted* value and the quote is a character of it, so the tag ends at
    // the very next `>`. Reading that quote as a value delimiter runs the scan
    // on to the next quote in the document and reports a `>` from author text.
    await writeFile(
      path.join(dir, 'unquoted-equals-tag.html'),
      Buffer.from(
        '<!doctype html><html><head data==">'
          + '<script>const marker = "inside>";<\/script></head>'
          + '<body><main id="slot">real</main></body></html>',
      ),
    );
    // Named character references are case-sensitive: `&sol;` is one, `&SOL;`
    // is not, and the parser leaves the latter as literal text — so this
    // `annotation-xml` stays MathML and its CDATA stays character data.
    await writeFile(
      path.join(dir, 'encoding-case.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<math><annotation-xml encoding="text&SOL;html">'
          + '<![CDATA[c > <\/math><body>slip</body>]]></annotation-xml></math>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // Only TAB, LF, FF, CR and SPACE separate tokens. Every other C0 code
    // point is an ordinary character, so `color\0=x` names an attribute the
    // parser writes as `color\uFFFD` — not `color`, and therefore not a
    // `<font>` presentational attribute that breaks out of foreign content.
    await writeFile(
      path.join(dir, 'control-char-attr.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + `<svg><font color\u0000=x>`
          + '<![CDATA[q > <\/svg><body>slip</body>]]></font></svg>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // Leaving script-data-double-escaped through `-->`. In the
    // double-escaped *dash-dash* state a `>` returns the tokenizer to plain
    // script data, so the `</script>` that follows is a real close and what
    // comes after it is markup.
    await writeFile(
      path.join(dir, 'double-escape-exit.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          // The shape from review, which has a second `</script>` to fall back
          // on, so both readings eventually find some boundary.
          + '<script><!--<script>--><\/script><body>slip</body><\/script>'
          // The same state without that fallback. Read as staying
          // double-escaped, this script never closes, swallows `<main>` and
          // the real body close, and the scan has no boundary left at all.
          + '<script><!--<script>--><\/script>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // A solidus only self-closes when `>` comes immediately after it; the
    // self-closing start tag state reconsumes anything else in the
    // before-attribute-name state. So `<svg/ >` is an ordinary open tag, and a
    // scan that treats it as closed reads the element's contents as markup.
    await writeFile(
      path.join(dir, 'solidus-then-space.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg/ ><![CDATA[x > <\/svg><body>slip</body>]]></svg>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // The dispatcher hands `<svg>` beneath a MathML `annotation-xml` to the
    // HTML rules even with no `encoding`, so that `<svg>` lands in SVG rather
    // than inheriting MathML — and the `<foreignObject>` under it is then a
    // real integration point whose `<script>` is HTML raw text again.
    await writeFile(
      path.join(dir, 'annotation-xml-svg.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<math><annotation-xml><svg><foreignObject>'
          + `<script>const x = '<\/math><body>slip</body>';<\/script>`
          + '</foreignObject></svg></annotation-xml></math>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // Every token the tokenizer turns into a comment may precede the doctype
    // without changing the document's mode — an XML prologue and a stray
    // `<!foo>` among them. Putting the payload in front of one puts a character
    // before the doctype, which silently drops the artifact into quirks mode.
    await writeFile(
      path.join(dir, 'bogus-prologue.html'),
      Buffer.from(
        `<?xml version='1.0'?><!bogus><!doctype html>`
          + '<plaintext>tail</body></html>',
      ),
    );
    // The in-select insertion mode ignores an `<svg>` / `<math>` start tag
    // outright, so no foreign element exists and what follows is still
    // ordinary HTML — here a `<script>`, whose string contains both a
    // breakout tag and a `</body>`.
    await writeFile(
      path.join(dir, 'select-foreign-start.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<select><svg></select>'
          + '<script>const x = "<table><\/body>";<\/script>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // A nested `<svg>` beneath `<foreignObject>` shares the root's name but is
    // an ordinary element. Tracking the subtree with a name counter alongside
    // the stack lets the two disagree the moment `</foreignObject>` unwinds
    // past that inner element, and the walk then never ends.
    await writeFile(
      path.join(dir, 'nested-svg-foreignobject.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg><foreignObject><svg></foreignObject></svg>'
          + '<script>const x = "<table><\/body>";<\/script>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // Same shape in MathML.
    await writeFile(
      path.join(dir, 'nested-math-mi.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<math><mi><math></mi></math>'
          + '<script>var y = "<p><\/body>";<\/script>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // A `<select>` start tag while a select is open closes it rather than
    // nesting, so the SVG that follows really is foreign content.
    await writeFile(
      path.join(dir, 'nested-select.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<select><select></select>'
          + '<svg><![CDATA[x > <\/body>]]></svg>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // The in-select mode ends in more ways than `</select>`: `input`, `keygen`
    // and `textarea` close it and are then reprocessed, so the SVG that
    // follows really is foreign content and its CDATA really is character
    // data. `textarea` is also raw text, so the select state has to be updated
    // before that branch consumes the tag.
    for (const [name, closer] of [
      ['select-exit-input.html', '<input>'],
      ['select-exit-keygen.html', '<keygen>'],
      ['select-exit-textarea.html', '<textarea></textarea>'],
    ] as const) {
      await writeFile(
        path.join(dir, name),
        Buffer.from(
          '<!doctype html><html><head></head><body>'
            + `<select>${closer}`
            + '<svg><![CDATA[x > <\/body>]]></svg>'
            + '<main id="slot">real</main></body></html>',
        ),
      );
    }
    // A `<table>` cannot put itself in a table. In select mode with no table
    // already open the token is ignored outright, so it neither ends the mode
    // nor joins the table stack, and the `<svg>` after it is ignored too.
    await writeFile(
      path.join(dir, 'select-table-token.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<select><table><svg>'
          + '<script>const x = "<table><\/body>";<\/script></select>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // A `<base>` under an HTML integration point is an HTML-namespace element
    // and governs the document, even though the structural scan skips the
    // whole foreign subtree. One directly under `<svg>` is an SVG element and
    // inert, and one inside a `<template>` belongs to an inert fragment.
    await writeFile(
      path.join(dir, 'integration-point-base.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg><foreignObject><base href="https://author.example/assets/">'
          + '</foreignObject></svg><main id="slot">real</main></body></html>',
      ),
    );
    await writeFile(
      path.join(dir, 'foreign-namespace-base.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg><base href="https://ignored.example/"></svg>'
          + '<template><base href="https://inert.example/"></template>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // A template's contents are parsed with the same insertion modes as the
    // document, so the in-select mode applies inside one too. Modelling it at
    // the top level and not here made the two walkers disagree on the same
    // bytes.
    await writeFile(
      path.join(dir, 'template-select-foreign.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<template><select><svg></select>'
          + '<script>const x = "<p></template><body>slip</body>";<\/script></template>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // A foreign element may also be called `template`, and it creates no inert
    // fragment — so a `<base>` beneath it is live and must still suppress the
    // generated containment base.
    await writeFile(
      path.join(dir, 'svg-template-base.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg><template><foreignObject>'
          + '<base href="https://author.example/assets/">'
          + '</foreignObject></template></svg>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // A stray end tag inside foreign content is usually ignored, but `</p>`
    // and `</br>` each have an "in body" rule that synthesises the element and
    // closes it, popping the foreign element on the way. The scan does not
    // model that, so it refuses rather than keeping a frame the parser dropped.
    await writeFile(
      path.join(dir, 'foreign-stray-p.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg></p><script>const x = "<body>slip</body>";<\/script>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // Every other stray end tag leaves the foreign element open, so this one
    // still resolves precisely — the refusal above must not widen to it.
    await writeFile(
      path.join(dir, 'foreign-stray-div.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg></div><![CDATA[q > <\/body>]]></svg>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // A nested template's contents get a fresh insertion mode and the outer one
    // is restored at its close, so the inner `<svg>` is real foreign content
    // even though the outer fragment is in select mode.
    await writeFile(
      path.join(dir, 'nested-template-select.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<template><select><template><svg>'
          + '<![CDATA[x > </template></template><body>slip</body>]]>'
          + '</svg></template></select></template>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // A leading BOM is the encoding signature and only counts at byte zero, so
    // the no-boundary fallback has to insert after it rather than in front of
    // it — otherwise the doctype stops applying and the artifact silently
    // renders in quirks mode. `<plaintext>` is what removes the boundary here.
    await writeFile(
      path.join(dir, 'bom-plaintext.html'),
      Buffer.from(
        // No `<head>` and no `<html>`: the head/html anchors must miss so the
        // doctype fallback is the branch under test.
        '\uFEFF<!doctype html><plaintext>tail</body></html>',
      ),
    );
    await writeFile(
      path.join(dir, 'cr-delimiter.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<script\r>const doc = "<body>slip</body>";<\/script>'
          + '<textarea>note </textarea\r>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // Token shapes an audit against parse5 turned up, each of which had the
    // scan resume inside author text: an end-tag-open on a non-letter (bogus
    // comment), the `--!>` and `<!-->` comment ends, a custom element whose
    // name merely starts with a raw-text name, and an unquoted attribute value
    // ending in `/` (not a self-closing solidus).
    await writeFile(
      path.join(dir, 'token-shapes.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '</ note: use </body> carefully>'
          + '<!-- a --!>'
          + '<iframe-x>a</iframe-x>'
          + '<svg data-href=http://x/><text>t</text></svg>'
          + '<script>var s = "</iframe> --> </body>";<\/script>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // `<plaintext>` has no way out of PLAINTEXT state: everything after it is
    // character data, `</plaintext>` included. A scan that honours the close
    // tag resumes in text that the parser never treats as markup.
    await writeFile(
      path.join(dir, 'plaintext-tail.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body><plaintext></body></plaintext>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // Foreign content is the one place `<![CDATA[ … ]]>` is real markup. The
    // `>` inside the section is still text, so a scan that ends declarations at
    // the next `>` resumes inside it and returns the `</body>` it holds. Inside
    // an HTML integration point the parser is back in HTML, where `<![CDATA[`
    // is a bogus comment again.
    await writeFile(
      path.join(dir, 'foreign-content.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<svg><foreignObject><![CDATA[x > </svg><body>slip</body>]]></foreignObject></svg>'
          + '<template><svg><![CDATA[x > </template><body>slip</body>]]></svg></template>'
          + '<math><annotation-xml><![CDATA[x > </math><body>slip</body>]]></annotation-xml></math>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // Tokenizer states the scan has to follow, not just tag text: a
    // `</template>` inside a nested script is content, and after `<!--` a
    // nested `<script` puts script data in double-escaped state, where
    // `</script>` steps back out instead of closing.
    await writeFile(
      path.join(dir, 'tokenizer-states.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<template><script>const a = "</template><body>slip</body>";<\/script></template>'
          + '<script><!--\nconst open = "<script>";\nconst b = "</script><body>slip</body>";\n//--><\/script>'
          + '<main id="slot">real</main></body></html>',
      ),
    );
    // A raw-text element only closes on `</name` followed by whitespace, `/` or
    // `>`. A longer name that merely starts with it stays character data, so a
    // scan that accepts the prefix resumes inside the author's script and hands
    // back a boundary from inside their string.
    await writeFile(
      path.join(dir, 'raw-text-prefix.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<script>const doc = "</script-template><body>slip</body>";<\/script>'
          + '<textarea id="t"></textarea-note></textarea>'
          + '<main id="slot"></main></body></html>',
      ),
    );
    // The other places a `</body>` is character data rather than a boundary:
    // raw-text elements the parser never reads as markup, and `<template>`
    // content, which the tree builder keeps out of the document entirely (an
    // injection placed there would silently never run).
    await writeFile(
      path.join(dir, 'inert-literal-body.html'),
      Buffer.from(
        '<!doctype html><html><head></head><body>'
          + '<template></body></template>'
          + '<noscript></body></noscript>'
          + '<xmp></body></xmp>'
          + '<main id="slot"></main></body></html>',
      ),
    );
    // The same tags are just as ordinary inside an attribute value — storing a
    // template on a `data-` attribute is the other half of the #7410 shape.
    // Browsers accept a literal `<` there, and the injected bridge carries
    // quotes, so splicing into the value would close the attribute early.
    await writeFile(
      path.join(dir, 'attr-literal-body.html'),
      Buffer.from(
        '<!doctype html><html><head><title>Print</title></head><body>'
          + '<div id="tpl" data-tpl="<body>slip</body>"></div>'
          + '<main id="slot"></main></body></html>',
      ),
    );
    // A prototype whose inline script builds an HTML document string — the
    // shape behind nexu-io/open-design#7410. The literal `</body>` inside the
    // template literal precedes the document's real one, so an injector that
    // splices at the FIRST `</body>` lands inside the script and truncates it.
    await writeFile(
      path.join(dir, 'script-literal-body.html'),
      Buffer.from(
        '<!doctype html><html><head><title>Print</title></head><body>'
          + '<script type="text/babel">\n'
          + '  const doc = `<body>slip</body>`;\n'
          + "  document.getElementById('slot').textContent = doc.length;\n"
          + '</script>'
          + '<main id="slot"></main></body></html>',
      ),
    );
    await writeFile(
      path.join(dir, 'guarded.html'),
      Buffer.from('<!doctype html><html><head><script src="./boot.js"></script></head><body><input autofocus></body></html>'),
    );
    const complexPreviewDir = path.join(dir, 'prototypes', 'booking');
    await mkdir(path.join(complexPreviewDir, 'styles'), { recursive: true });
    await mkdir(path.join(complexPreviewDir, 'scripts'), { recursive: true });
    await mkdir(path.join(complexPreviewDir, 'components'), { recursive: true });
    await mkdir(path.join(complexPreviewDir, 'assets'), { recursive: true });
    const babelScripts = Array.from(
      { length: 43 },
      (_, index) => `<script type="text/babel" src="./components/screen-${index + 1}.jsx"></script>`,
    ).join('');
    await writeFile(
      path.join(complexPreviewDir, 'index.html'),
      Buffer.from([
        '<!doctype html><html><head>',
        '<link rel="stylesheet" href="./styles/app.css">',
        '<script src="./scripts/support.js"></script>',
        babelScripts,
        '<script type="module" src="./scripts/module.js"></script>',
        '</head><body>',
        '<img src="./assets/card.svg" srcset="./assets/card.svg 1x, ./assets/card@2x.svg 2x">',
        '<main id="root"></main>',
        '</body></html>',
      ].join('')),
    );
    await writeFile(
      path.join(complexPreviewDir, 'styles', 'app.css'),
      '@import "./theme.css"; .card { background-image: url("../assets/card.svg"); }',
    );
    await writeFile(path.join(complexPreviewDir, 'styles', 'theme.css'), ':root { --accent: #0a7; }');
    await writeFile(
      path.join(complexPreviewDir, 'scripts', 'support.js'),
      'window.__supportLoaded = true; fetch("./data.json").then((response) => response.json());',
    );
    await writeFile(path.join(complexPreviewDir, 'scripts', 'module.js'), 'export const ready = true;');
    for (let index = 1; index <= 43; index += 1) {
      await writeFile(
        path.join(complexPreviewDir, 'components', `screen-${index}.jsx`),
        `window.__screen${index} = () => <section>Screen ${index}</section>;`,
      );
    }
    await writeFile(path.join(complexPreviewDir, 'data.json'), '{"ready":true}');
    await writeFile(path.join(complexPreviewDir, 'assets', 'card.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(path.join(complexPreviewDir, 'assets', 'card@2x.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="2"/>');
    await writeFile(
      path.join(dir, 'bridged.html'),
      Buffer.from('<html><body><script data-od-url-scroll-bridge></script><main>Preview</main></body></html>'),
    );
    await writeFile(
      path.join(dir, 'selection-bridged.html'),
      Buffer.from('<html><body><script data-od-url-selection-bridge></script><main>Preview</main></body></html>'),
    );
    await writeFile(
      path.join(dir, 'snapshot-bridged.html'),
      Buffer.from('<html><body><script data-od-url-snapshot-bridge></script><main>Preview</main></body></html>'),
    );
    await writeFile(
      path.join(dir, 'observability-bridged.html'),
      Buffer.from('<html><head><script data-od-preview-observability></script></head><body><main>Preview</main></body></html>'),
    );
    await mkdir(path.join(dir, 'dist', 'assets'), { recursive: true });
    await writeFile(
      path.join(dir, 'vite-entry.html'),
      Buffer.from('<!doctype html><html><head><script type="module" src="/src/main.tsx"></script></head><body><div id="root"></div></body></html>'),
    );
    await writeFile(
      path.join(dir, 'dist', 'index.html'),
      Buffer.from(
        '<!doctype html><html><head>' +
          '<script type="module" crossorigin src="/assets/app.js"></script>' +
          '<link rel="stylesheet" crossorigin href="/assets/app.css">' +
          '</head><body><div id="root"></div></body></html>',
      ),
    );
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const rawUrl = (name: string) => `${baseUrl}/api/projects/${projectId}/raw/${name}`;
  const poweredUrl = (name: string) => `${baseUrl}/api/projects/${projectId}/powered/${name}`;
  const poweredOrigin = () => {
    const url = new URL(baseUrl);
    url.hostname = url.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
    return url.origin;
  };

  it('advertises Accept-Ranges: bytes for a video file with no Range header', async () => {
    const res = await fetch(rawUrl('clip.mp4'));
    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toContain('video/mp4');
    expect(Number(res.headers.get('content-length'))).toBe(FILE_SIZE);
  });

  it('returns 206 with correct Content-Range for a partial video request', async () => {
    const res = await fetch(rawUrl('clip.mp4'), {
      headers: { Range: 'bytes=0-99' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 0-99/${FILE_SIZE}`);
    expect(res.headers.get('content-length')).toBe('100');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBe(100);
    expect(buf[0]).toBe(0x42);
  });

  it('returns 206 for an open-ended range on an audio file', async () => {
    const res = await fetch(rawUrl('audio.mp3'), {
      headers: { Range: 'bytes=256-' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 256-${FILE_SIZE - 1}/${FILE_SIZE}`);
    expect(res.headers.get('content-length')).toBe(String(FILE_SIZE - 256));
  });

  it('returns 206 for a suffix range', async () => {
    const res = await fetch(rawUrl('clip.mp4'), {
      headers: { Range: 'bytes=-128' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes ${FILE_SIZE - 128}-${FILE_SIZE - 1}/${FILE_SIZE}`);
    expect(res.headers.get('content-length')).toBe('128');
  });

  it('returns 416 for an out-of-bounds range', async () => {
    const res = await fetch(rawUrl('clip.mp4'), {
      headers: { Range: 'bytes=9999-99999' },
    });
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe(`bytes */${FILE_SIZE}`);
  });

  it('does not stream small transformed HTML files (HTML returns full 200 without Accept-Ranges)', async () => {
    const res = await fetch(rawUrl('page.html'));
    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBeNull();
    const text = await res.text();
    expect(text).toBe('<html/>');
  });

  it('returns a truncated text preview for large HTML without reading the full file', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/text-preview/large.html?limit=64`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      text: string;
      truncated: boolean;
      size: number;
      limit: number;
      mime: string;
      poweredPreview: {
        required: boolean;
        scannedBytes: number;
        complete: boolean;
      };
    };
    expect(body.text).toContain('<!doctype html>');
    expect(body.text.length).toBeLessThanOrEqual(1024);
    expect(body.truncated).toBe(true);
    expect(body.size).toBeGreaterThan(2 * 1024 * 1024);
    expect(body.limit).toBe(1024);
    expect(body.mime).toContain('text/html');
    expect(body.poweredPreview.required).toBe(false);
    expect(body.poweredPreview.complete).toBe(true);
  });

  it('returns powered-preview hints even when the Worker/WASM signal is late in a large HTML file', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/text-preview/large-powered.html?limit=64`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      text: string;
      poweredPreview: {
        required: boolean;
        scannedBytes: number;
        complete: boolean;
      };
    };
    expect(body.text.length).toBeLessThanOrEqual(1024);
    expect(body.text).not.toContain('new Worker');
    expect(body.poweredPreview.required).toBe(true);
    expect(body.poweredPreview.scannedBytes).toBeGreaterThan(2 * 1024 * 1024);
  });

  it('skips URL preview bridge injection for large HTML so first paint can stream', async () => {
    const res = await fetch(`${rawUrl('large.html')}?odPreviewBridge=scroll&odPreviewBridge=selection&odPreviewBridge=snapshot&odPreviewBridge=observability`, {
      headers: { Range: 'bytes=0-127' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-range')).toMatch(/^bytes 0-127\//);
    const html = await res.text();
    expect(html).toContain('Large Preview');
    expect(html).not.toContain('data-od-url-scroll-bridge');
    expect(html).not.toContain('data-od-url-selection-bridge');
    expect(html).not.toContain('data-od-url-snapshot-bridge');
    expect(html).not.toContain('data-od-preview-observability');
  });

  it('injects the URL preview scroll bridge only when requested', async () => {
    const plain = await fetch(rawUrl('page.html'));
    expect(await plain.text()).toBe('<html/>');

    const bridged = await fetch(`${rawUrl('page.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html).toContain('data-od-url-scroll-bridge');
    expect(html).toContain("type: 'od:preview-scroll'");
    expect(html).toContain("type: 'od:preview-content-size'");
    expect(html).toContain('od:preview-content-size-request');
    expect(html).toContain('lastContentSizeRequest.measurementId');
    expect(html).toContain('lastContentSizeRequest.generation');
    expect(html).toContain('documentEpoch: contentSizeDocumentEpoch');
    expect(html).toContain("get('odPreviewEpoch')");
    expect(html).toContain('scrollWidth: size && size.scrollWidth');
    expect(html).toContain('clientWidth: size && size.clientWidth');
  });

  it('injects the URL preview scroll bridge before the closing body tag', async () => {
    const bridged = await fetch(`${rawUrl('body.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html.indexOf('data-od-url-scroll-bridge')).toBeGreaterThan(-1);
    expect(html.indexOf('data-od-url-scroll-bridge')).toBeLessThan(html.indexOf('</body>'));
  });

  it('injects the URL preview scroll bridge after a `</body>` written inside a script string', async () => {
    // nexu-io/open-design#7410: splicing at the first raw-text `</body>` puts
    // the bridge's own `</script>` inside the author's script, which ends that
    // script early and dumps the rest of it on the page as text.
    const bridged = await fetch(`${rawUrl('script-literal-body.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(injectedAt).toBeGreaterThan(-1);
    // The author's script must survive intact...
    expect(html).toContain('const doc = `<body>slip</body>`;');
    // ...and the bridge must land after it closes, not inside it.
    expect(injectedAt).toBeGreaterThan(html.indexOf('</script>'));
    expect(injectedAt).toBeLessThan(html.lastIndexOf('</body>'));
  });

  it('injects the containment base after a `<head>` written inside a script string', async () => {
    // The containment `<base>` runs after the bridges on every URL preview, and
    // it used its own first-textual-`<head>` match. Requesting only the scroll
    // bridge keeps any head-open guard from synthesizing a real `<head>` first,
    // so the base injector has to find the boundary on its own.
    const bridged = await fetch(`${rawUrl('script-literal-head.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html).toContain('data-od-project-preview-base');
    expect(html).toContain('const doc = `<head><title>Slip</title></head>`;');
  });

  it('injects the URL preview sandbox shim after a `<head>` written inside a script string', async () => {
    // nexu-io/open-design#7410, head-open half: the document has no real
    // `<head>`, so the first textual match is the one inside the script.
    const bridged = await fetch(`${rawUrl('script-literal-head.html')}?odPreviewBridge=sandbox`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const injectedAt = html.indexOf('data-od-sandbox-shim');
    expect(injectedAt).toBeGreaterThan(-1);
    expect(html).toContain('const doc = `<head><title>Slip</title></head>`;');
    expect(injectedAt).toBeLessThan(html.indexOf('<script>'));
  });

  it('injects the URL preview scroll bridge after a `</body>` written in an attribute value', async () => {
    const bridged = await fetch(`${rawUrl('attr-literal-body.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(injectedAt).toBeGreaterThan(-1);
    expect(html).toContain('data-tpl="<body>slip</body>"');
    expect(injectedAt).toBeGreaterThan(html.indexOf('data-tpl'));
    expect(injectedAt).toBeLessThan(html.lastIndexOf('</body>'));
  });

  it('injects the URL preview scroll bridge after `</body>` in inert and raw-text content', async () => {
    const bridged = await fetch(`${rawUrl('inert-literal-body.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(injectedAt).toBeGreaterThan(-1);
    expect(html).toContain('<template></body></template>');
    expect(html).toContain('<noscript></body></noscript>');
    expect(html).toContain('<xmp></body></xmp>');
    // Injected into the real body, after every inert copy.
    expect(injectedAt).toBeGreaterThan(html.indexOf('<xmp>'));
    expect(injectedAt).toBeLessThan(html.lastIndexOf('</body>'));
  });

  it('injects the URL preview scroll bridge after a raw-text close-tag prefix', async () => {
    const bridged = await fetch(`${rawUrl('raw-text-prefix.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(injectedAt).toBeGreaterThan(-1);
    // `</script-template>` does not close the script, so the `</body>` it
    // contains is still the author's string, not this document's boundary.
    expect(html).toContain('const doc = "</script-template><body>slip</body>";');
    expect(html).toContain('<textarea id="t"></textarea-note></textarea>');
    expect(injectedAt).toBeGreaterThan(html.indexOf('<main id="slot">'));
    expect(injectedAt).toBeLessThan(html.lastIndexOf('</body>'));
  });

  it('injects the URL preview scroll bridge after template and script escape states', async () => {
    const bridged = await fetch(`${rawUrl('tokenizer-states.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(injectedAt).toBeGreaterThan(-1);
    expect(html).toContain('const a = "</template><body>slip</body>";');
    expect(html).toContain('const b = "</script><body>slip</body>";');
    expect(injectedAt).toBeGreaterThan(html.indexOf('<main id="slot">real</main>'));
    expect(injectedAt).toBeLessThan(html.lastIndexOf('</body>'));
  });

  it('injects the URL preview scroll bridge after CDATA in foreign content', async () => {
    const bridged = await fetch(`${rawUrl('foreign-content.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(injectedAt).toBeGreaterThan(-1);
    // Whether these are CDATA sections or bogus comments depends on the
    // adjusted current node's namespace, and the two spellings disagree about
    // where the body ends. Beneath `<template><svg>` and `<math>` the parser is
    // in foreign content, so those sections are character data and the
    // `</body>` inside each is text — both survive byte for byte.
    expect(html).toContain('<![CDATA[x > </template><body>slip</body>]]>');
    expect(html).toContain('<![CDATA[x > </math><body>slip</body>]]>');
    // Beneath `<foreignObject>` the parser is back in HTML, where `<![CDATA[x >`
    // is a bogus comment and the `</body>` after it really does close the body.
    // The scan stops at that first real boundary, which is what the tree builder
    // does, so the bridge lands in body ahead of it.
    const page = load(html);
    expect(page('[data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
  });

  it('appends the URL preview scroll bridge rather than splicing into plaintext', async () => {
    const bridged = await fetch(`${rawUrl('plaintext-tail.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(injectedAt).toBeGreaterThan(-1);
    // Everything after `<plaintext>` is character data — both `</body>` copies
    // included — so there is no boundary to splice at. Appending would not
    // work either: PLAINTEXT never exits, so appended markup is text and the
    // bridge would not exist as an element at all. The fallback therefore goes
    // in at the top of the document, which costs the end-of-body placement but
    // keeps the bridge live. Asserting the parsed result, not just the bytes.
    expect(html).toContain('<plaintext></body></plaintext>');
    expect(injectedAt).toBeLessThan(html.indexOf('<plaintext>'));
    expect(load(html)('[data-od-url-scroll-bridge]').length).toBe(1);
  });

  it('injects the URL preview scroll bridge past bogus comments, custom elements and unquoted slashes', async () => {
    const bridged = await fetch(`${rawUrl('token-shapes.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(injectedAt).toBeGreaterThan(-1);
    expect(html).toContain('</ note: use </body> carefully>');
    expect(html).toContain('<iframe-x>a</iframe-x>');
    expect(html).toContain('var s = "</iframe> --> </body>";');
    expect(injectedAt).toBeGreaterThan(html.indexOf('<main id="slot">real</main>'));
    expect(injectedAt).toBeLessThan(html.lastIndexOf('</body>'));
  });

  it('refuses a boundary through CDATA under a raw-text-named foreign element', async () => {
    const bridged = await fetch(`${rawUrl('foreign-and-delimiters.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(injectedAt).toBeGreaterThan(-1);
    // `<svg><script>` is a foreign element, not HTML raw text, so its CDATA is
    // still a section; and `data= http://x/` is an unquoted value, not a
    // self-closing solidus. Both sections survive byte for byte.
    expect(html).toContain('<![CDATA[x > <\/script></svg><body>slip</body>]]>');
    expect(html).toContain('<![CDATA[x > </svg><body>slip</body>]]>');
    // No boundary is picked here, so the bridge goes in at the top of the
    // document rather than at the end of body — it still exists as an element,
    // which is what actually matters, and every authored section is untouched.
    expect(load(html)('[data-od-url-scroll-bridge]').length).toBe(1);
  });

  it('follows the adjusted current node through foreign content', async () => {
    const bridged = await fetch(`${rawUrl('foreign-namespaces.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    // A live bridge, in body, with every authored section still intact.
    expect(page('[data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    // None of the six `</body>` spellings above may be read as a boundary.
    expect(html.indexOf('data-od-url-scroll-bridge'))
      .toBeGreaterThan(html.indexOf('<main id="slot">real</main>'));
  });

  it('leaves foreign content on a breakout tag and keeps mglyph foreign', async () => {
    const bridged = await fetch(`${rawUrl('foreign-breakout.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    // None of the four authored `</body>` spellings may be read as a boundary.
    expect(html).toContain('const x = "</svg><body>slip</body>";');
    expect(html).toContain('const y = "</svg><body>slip</body>";');
    expect(html).toContain('<![CDATA[x > </math><body>slip</body>]]>');
    expect(html).toContain('<![CDATA[q > </math><body>slip</body>]]>');
  });

  it('does not treat a padded or unterminated encoding as an integration point', async () => {
    // `annotation-xml` is an integration point only on an exact match, so a
    // padded value and an ambiguous ampersand both stay MathML — and their
    // CDATA stays character data.
    const bridged = await fetch(`${rawUrl('encoding-near-misses.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('<![CDATA[p > </math><body>slip</body>]]>');
    expect(html).toContain('<![CDATA[u > </math><body>slip</body>]]>');
  });

  it('reads parsed attributes, not attribute-like text in a quoted value', async () => {
    const bridged = await fetch(`${rawUrl('quoted-fake-attrs.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    // Neither section carries a real `color` or `encoding`, so both stay
    // foreign and the `</body>` inside each is character data.
    expect(html).toContain('<![CDATA[x > </svg><body>slip</body>]]>');
    expect(html).toContain('<![CDATA[x > </math><body>slip</body>]]>');
    expect(html).toContain('const enc = "</math><body>slip</body>";');
  });

  it('ends a tag whose unquoted value contains a quote at the next angle bracket', async () => {
    const bridged = await fetch(`${rawUrl('unquoted-equals-tag.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('[data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    // The authored script survives; nothing was spliced into its string.
    expect(html).toContain('const marker = "inside>";');
  });

  it('treats a named character reference as case-sensitive', async () => {
    const bridged = await fetch(`${rawUrl('encoding-case.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('<![CDATA[c > </math><body>slip</body>]]>');
  });

  it('separates tokens on HTML whitespace only, not the whole C0 range', async () => {
    const bridged = await fetch(`${rawUrl('control-char-attr.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('<![CDATA[q > </svg><body>slip</body>]]>');
  });

  it('leaves script-data-double-escaped through the dash-dash greater-than', async () => {
    const bridged = await fetch(`${rawUrl('double-escape-exit.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    // A live bridge inside `<body>`, and `<main>` still an element rather than
    // script text. Read as staying double-escaped, the second script never
    // closes: `#slot` is swallowed and the bridge falls back into `<head>`, so
    // both assertions below fail. The bridge lands at the first `</body>` — the
    // one the tree builder acts on — which is ahead of `<main>`; that position
    // and the document's last `</body>` leave an identical tree, which is why
    // this asserts live elements and not an offset.
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('<script><!--<script>--></script>');
  });

  it('does not treat a solidus followed by whitespace as self-closing', async () => {
    const bridged = await fetch(`${rawUrl('solidus-then-space.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('<![CDATA[x > </svg><body>slip</body>]]>');
  });

  it('gives an svg beneath annotation-xml the SVG namespace', async () => {
    const bridged = await fetch(`${rawUrl('annotation-xml-svg.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain(`const x = '</math><body>slip</body>';`);
  });

  it('keeps a standards-mode doctype behind a bogus-comment prologue', async () => {
    const bridged = await fetch(`${rawUrl('bogus-prologue.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    // The prologue and the doctype both still precede every injected token, so
    // the served document keeps the mode it had before injection.
    const doctypeAt = html.toLowerCase().indexOf('<!doctype');
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(doctypeAt).toBeGreaterThan(-1);
    expect(injectedAt).toBeGreaterThan(doctypeAt);
    expect(html.indexOf('<?xml')).toBeLessThan(doctypeAt);
    expect(load(html)('[data-od-url-scroll-bridge]').length).toBe(1);
  });

  it('does not enter foreign content for an svg start tag inside select', async () => {
    const bridged = await fetch(`${rawUrl('select-foreign-start.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('const x = "<table></body>";');
  });

  it('ends a foreign subtree by its stack, not by a name counter', async () => {
    for (const [fixture, authored] of [
      ['nested-svg-foreignobject.html', 'const x = "<table></body>";'],
      ['nested-math-mi.html', 'var y = "<p></body>";'],
    ] as const) {
      const bridged = await fetch(`${rawUrl(fixture)}?odPreviewBridge=scroll`);
      expect(bridged.status).toBe(200);
      const html = await bridged.text();
      const page = load(html);
      expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
      expect(page('#slot').text()).toBe('real');
      expect(html).toContain(authored);
    }
  });

  it('treats a second select start tag as closing the first', async () => {
    const bridged = await fetch(`${rawUrl('nested-select.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('<![CDATA[x > </body>]]>');
  });

  it('leaves the in-select mode on input, keygen and textarea', async () => {
    for (const fixture of [
      'select-exit-input.html',
      'select-exit-keygen.html',
      'select-exit-textarea.html',
    ]) {
      const bridged = await fetch(`${rawUrl(fixture)}?odPreviewBridge=scroll`);
      expect(bridged.status).toBe(200);
      const html = await bridged.text();
      const page = load(html);
      expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
      expect(page('#slot').text()).toBe('real');
      expect(html).toContain('<![CDATA[x > </body>]]>');
    }
  });

  it('does not let a table token put itself in a table while in select', async () => {
    const bridged = await fetch(`${rawUrl('select-table-token.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('[data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('const x = "<table></body>";');
  });

  it('respects an authored base inside an HTML integration point', async () => {
    const bridged = await fetch(`${rawUrl('integration-point-base.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    // The generated base would land in `<head>`, ahead of the authored one, and
    // the first base with an href wins — so it must not be generated at all.
    expect(html).not.toContain('data-od-project-preview-base');
    expect(html).toContain('href="https://author.example/assets/"');
    expect(load(html)('[data-od-url-scroll-bridge]').length).toBe(1);
  });

  it('does not treat a foreign-namespace or template base as authored', async () => {
    const bridged = await fetch(`${rawUrl('foreign-namespace-base.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    // Neither of those governs the document, so containment still applies.
    expect(html).toContain('data-od-project-preview-base');
    expect(html).toContain('href="https://ignored.example/"');
    expect(html).toContain('href="https://inert.example/"');
  });

  it('applies the in-select mode inside template contents too', async () => {
    const bridged = await fetch(`${rawUrl('template-select-foreign.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('const x = "<p></template><body>slip</body>";');
  });

  it('treats a foreign element named template as live, not inert', async () => {
    const bridged = await fetch(`${rawUrl('svg-template-base.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html).not.toContain('data-od-project-preview-base');
    expect(html).toContain('href="https://author.example/assets/"');
  });

  it('refuses a boundary past a stray end tag that reprocessing acts on', async () => {
    const bridged = await fetch(`${rawUrl('foreign-stray-p.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('[data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('const x = "<body>slip</body>";');
  });

  it('keeps precise placement past a stray end tag that is ignored', async () => {
    const bridged = await fetch(`${rawUrl('foreign-stray-div.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('<![CDATA[q > </body>]]>');
  });

  it('gives a nested template its own insertion mode', async () => {
    const bridged = await fetch(`${rawUrl('nested-template-select.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
    expect(html).toContain('<![CDATA[x > </template></template><body>slip</body>]]>');
  });

  it('keeps a leading BOM at byte zero when there is no boundary', async () => {
    const bridged = await fetch(`${rawUrl('bom-plaintext.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    // `Response.text()` runs a UTF-8 decode, which *removes* a leading BOM —
    // reading the body that way would assert nothing about the byte this spec
    // exists for. Decode the bytes with the BOM preserved instead.
    const html = new TextDecoder('utf-8', { ignoreBOM: true })
      .decode(await bridged.arrayBuffer());
    // The BOM stays the first code unit, and the doctype still precedes every
    // injected token — the two conditions the browser needs to stay out of
    // quirks mode.
    expect(html.charCodeAt(0)).toBe(0xfeff);
    const doctypeAt = html.toLowerCase().indexOf('<!doctype');
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(doctypeAt).toBe(1);
    expect(injectedAt).toBeGreaterThan(doctypeAt);
    expect(load(html)('[data-od-url-scroll-bridge]').length).toBe(1);
  });

  it('treats a carriage return as a tag-name delimiter', async () => {
    const bridged = await fetch(`${rawUrl('cr-delimiter.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const injectedAt = html.indexOf('data-od-url-scroll-bridge');
    expect(injectedAt).toBeGreaterThan(-1);
    expect(html).toContain('const doc = "<body>slip</body>";');
    expect(injectedAt).toBeGreaterThan(html.indexOf('<main id="slot">real</main>'));
    expect(injectedAt).toBeLessThan(html.lastIndexOf('</body>'));
    // The bridge is a live element in body — not pushed into the head by a
    // raw-text region the scan failed to close.
    const page = load(html);
    expect(page('body > [data-od-url-scroll-bridge]').length).toBe(1);
    expect(page('#slot').text()).toBe('real');
  });

  it('injects the URL preview selection bridge only when requested', async () => {
    const plain = await fetch(rawUrl('page.html'));
    expect(await plain.text()).toBe('<html/>');

    const bridged = await fetch(`${rawUrl('page.html')}?odPreviewBridge=selection`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html).toContain('data-od-url-selection-bridge');
    expect(html).toContain("type: 'od:comment-target'");
    expect(html).toContain("type: 'od:preview-runtime-state-captured'");
    expect(html).toContain('roots: roots');
    expect(html).toContain('function postReady(');
    expect(html).toContain('href: window.location.href');
    expect(html).not.toContain('data-od-url-scroll-bridge');
  });

  it('injects the URL preview snapshot bridge only when requested', async () => {
    const plain = await fetch(rawUrl('page.html'));
    expect(await plain.text()).toBe('<html/>');

    const bridged = await fetch(`${rawUrl('page.html')}?odPreviewBridge=snapshot`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html).toContain('data-od-url-snapshot-bridge');
    expect(html).toContain("type: 'od:snapshot:result'");
    expect(html).not.toContain('data-od-url-scroll-bridge');
    expect(html).not.toContain('data-od-url-selection-bridge');
  });

  it('injects URL preview observability before author scripts when requested', async () => {
    const bridged = await fetch(`${rawUrl('body.html')}?odPreviewBridge=observability`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html).toContain('data-od-preview-observability');
    expect(html).toContain("send('runtime_error'");
    expect(html).toContain("send('white_screen'");
    expect(html.indexOf('data-od-preview-observability')).toBeLessThan(html.indexOf('<body>'));
  });

  it('injects passive URL guards before authored scripts', async () => {
    const bridged = await fetch(
      `${rawUrl('guarded.html')}?odPreviewBridge=sandbox&odPreviewBridge=focus&odPreviewBridge=redirect`,
    );
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    const authorScriptIndex = html.indexOf('<script src="./boot.js">');
    expect(authorScriptIndex).toBeGreaterThan(-1);
    expect(html).toContain('data-od-sandbox-shim');
    expect(html).toContain('data-od-preview-focus-guard');
    expect(html).toContain('data-od-preview-redirect-guard');
    expect(html.indexOf('data-od-sandbox-shim')).toBeLessThan(authorScriptIndex);
    expect(html.indexOf('data-od-preview-focus-guard')).toBeLessThan(authorScriptIndex);
    expect(html.indexOf('data-od-preview-redirect-guard')).toBeLessThan(authorScriptIndex);
  });

  it('preserves and serves complex nested external resources through a guarded URL preview', async () => {
    const response = await fetch(
      `${rawUrl('prototypes/booking/index.html')}?odPreviewBridge=scroll&odPreviewBridge=selection&odPreviewBridge=snapshot&odPreviewBridge=observability&odPreviewBridge=sandbox&odPreviewBridge=focus`,
    );
    expect(response.status).toBe(200);
    const html = await response.text();

    const firstAuthorScript = html.indexOf('<script src="./scripts/support.js">');
    expect(firstAuthorScript).toBeGreaterThan(-1);
    expect(html.indexOf('data-od-sandbox-shim')).toBeLessThan(firstAuthorScript);
    expect(html.indexOf('data-od-preview-focus-guard')).toBeLessThan(firstAuthorScript);
    expect(html.match(/type="text\/babel"/g)).toHaveLength(43);
    expect(html).toContain('<script type="module" src="./scripts/module.js"></script>');
    expect(html).toContain('srcset="./assets/card.svg 1x, ./assets/card@2x.svg 2x"');

    const baseHref = html.match(/<base href="([^"]+)" data-od-project-preview-base>/)?.[1];
    expect(baseHref).toBeTruthy();
    const previewBase = new URL(baseHref!, baseUrl);
    const expectedResources = new Map([
      ['./styles/app.css', '@import "./theme.css"; .card { background-image: url("../assets/card.svg"); }'],
      ['./styles/theme.css', ':root { --accent: #0a7; }'],
      ['./scripts/support.js', 'window.__supportLoaded = true; fetch("./data.json").then((response) => response.json());'],
      ['./scripts/module.js', 'export const ready = true;'],
      ['./components/screen-43.jsx', 'window.__screen43 = () => <section>Screen 43</section>;'],
      ['./data.json', '{"ready":true}'],
      ['./assets/card.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
      ['./assets/card@2x.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2"/>'],
    ]);
    for (const [relativePath, expectedBody] of expectedResources) {
      const assetResponse = await fetch(new URL(relativePath, previewBase));
      expect(assetResponse.status, relativePath).toBe(200);
      expect(await assetResponse.text(), relativePath).toBe(expectedBody);
    }
  });

  it('serves built dist HTML for Vite dev entries so previews do not load /src from daemon root', async () => {
    const res = await fetch(rawUrl('vite-entry.html'));
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).not.toContain('/src/main.tsx');
    expect(html).not.toContain('src="/assets/app.js"');
    expect(html).not.toContain('href="/assets/app.css"');
    expect(html).toContain('src="dist/assets/app.js"');
    expect(html).toContain('href="dist/assets/app.css"');
  });

  it('does not expose powered preview project files to foreign browser origins through CORS', async () => {
    const browserOrigin = new URL(baseUrl);
    browserOrigin.hostname = browserOrigin.hostname === '127.0.0.1'
      ? 'localhost'
      : '127.0.0.1';

    const res = await fetch(poweredUrl('page.html'), {
      headers: { Origin: browserOrigin.origin },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('document-isolation-policy')).toBe('isolate-and-credentialless');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(await res.text()).toBe('<html/>');

    const foreign = await fetch(poweredUrl('page.html'), {
      headers: { Origin: 'https://foreign.example' },
    });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();

    const preflight = await fetch(poweredUrl('page.html'), {
      method: 'OPTIONS',
      headers: {
        Origin: browserOrigin.origin,
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('injects the URL preview scroll bridge for powered previews when requested', async () => {
    const bridged = await fetch(`${poweredUrl('page.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    expect(bridged.headers.get('document-isolation-policy')).toBe('isolate-and-credentialless');
    const html = await bridged.text();
    expect(html).toContain('data-od-url-scroll-bridge');
    expect(html).toContain("type: 'od:preview-content-size'");
    expect(html).toContain('od:preview-content-size-request');
    expect(html).toContain('lastContentSizeRequest.measurementId');
    expect(html).toContain('lastContentSizeRequest.generation');
    expect(html).toContain('documentEpoch: contentSizeDocumentEpoch');
    expect(html).toContain("get('odPreviewEpoch')");
    expect(html).toContain('scrollWidth: size && size.scrollWidth');
    expect(html).toContain('clientWidth: size && size.clientWidth');
  });

  it('injects preview observability for powered previews when requested', async () => {
    const bridged = await fetch(`${poweredUrl('page.html')}?odPreviewBridge=observability`);
    expect(bridged.status).toBe(200);
    expect(bridged.headers.get('document-isolation-policy')).toBe('isolate-and-credentialless');
    const html = await bridged.text();
    expect(html).toContain('data-od-preview-observability');
    expect(html).toContain("send('runtime_error'");
    expect(html).toContain("send('white_screen'");
  });

  it('does not let the powered preview origin call normal daemon APIs', async () => {
    const origin = poweredOrigin();
    const poweredReferer = `${origin}/api/projects/${projectId}/powered/page.html`;

    const poweredFile = await fetch(`${origin}/api/projects/${projectId}/powered/page.html`, {
      headers: {
        Referer: poweredReferer,
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    expect(poweredFile.status).toBe(200);
    expect(await poweredFile.text()).toBe('<html/>');

    const api = await fetch(`${origin}/api/projects`, {
      headers: {
        Referer: poweredReferer,
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    expect(api.status).toBe(403);
    expect(await api.json()).toEqual({
      error: 'Powered preview origin cannot access this API route',
    });
  });

  it('injects all URL preview bridges together', async () => {
    const bridged = await fetch(`${rawUrl('body.html')}?odPreviewBridge=scroll&odPreviewBridge=selection&odPreviewBridge=snapshot&odPreviewBridge=observability`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html).toContain('data-od-url-scroll-bridge');
    expect(html).toContain('data-od-url-selection-bridge');
    expect(html).toContain('data-od-url-snapshot-bridge');
    expect(html).toContain('data-od-preview-observability');
    expect(html.indexOf('data-od-preview-observability')).toBeLessThan(html.indexOf('<body>'));
    expect(html.indexOf('data-od-url-scroll-bridge')).toBeLessThan(html.indexOf('</body>'));
    expect(html.indexOf('data-od-url-selection-bridge')).toBeLessThan(html.indexOf('</body>'));
    expect(html.indexOf('data-od-url-snapshot-bridge')).toBeLessThan(html.indexOf('</body>'));
  });

  it('does not inject the URL preview scroll bridge twice', async () => {
    const bridged = await fetch(`${rawUrl('bridged.html')}?odPreviewBridge=scroll`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html.match(/data-od-url-scroll-bridge/g)?.length).toBe(1);
  });

  it('does not inject the URL preview selection bridge twice', async () => {
    const bridged = await fetch(`${rawUrl('selection-bridged.html')}?odPreviewBridge=selection`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html.match(/data-od-url-selection-bridge/g)?.length).toBe(1);
  });

  it('does not inject the URL preview snapshot bridge twice', async () => {
    const bridged = await fetch(`${rawUrl('snapshot-bridged.html')}?odPreviewBridge=snapshot`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html.match(/data-od-url-snapshot-bridge/g)?.length).toBe(1);
  });

  it('does not inject the URL preview observability bridge twice', async () => {
    const bridged = await fetch(`${rawUrl('observability-bridged.html')}?odPreviewBridge=observability`);
    expect(bridged.status).toBe(200);
    const html = await bridged.text();
    expect(html.match(/data-od-preview-observability/g)?.length).toBe(1);
  });

  it('returns 404 for a missing file', async () => {
    const res = await fetch(rawUrl('missing.mp4'));
    expect(res.status).toBe(404);
  });
});
