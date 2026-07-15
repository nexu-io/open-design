import { describe, expect, it } from 'vitest';

import {
  hasTweaksTemplate,
  hasUrlModeBridge,
  htmlNeedsFocusGuard,
  htmlNeedsPoweredPreview,
  htmlNeedsSandboxShim,
  parseForceInline,
  shouldUrlLoadHtmlPreview,
} from '../../src/components/file-viewer-render-mode';

describe('shouldUrlLoadHtmlPreview', () => {
  const base = { mode: 'preview' as const, isDeck: false, commentMode: false, forceInline: false };

  it('URL-loads a plain HTML preview by default', () => {
    expect(shouldUrlLoadHtmlPreview(base)).toBe(true);
  });

  it('falls back to srcDoc when the file is a deck (deck bridge required)', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, isDeck: true })).toBe(false);
  });

  it('falls back to srcDoc when comment mode is active without a URL bridge', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, commentMode: true })).toBe(false);
  });

  it('keeps URL-load when comment mode is active and the artifact owns the bridge', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, commentMode: true, urlModeBridge: true })).toBe(true);
  });

  it('keeps URL-load when comment mode is active and the raw route injects the comment bridge', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, commentMode: true, urlCommentBridge: true })).toBe(true);
  });

  it('falls back to srcDoc when direct edit mode is active without an artifact-owned bridge', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, editMode: true })).toBe(false);
  });

  it('falls back to srcDoc when direct edit mode is active even if the artifact owns a URL bridge', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, editMode: true, urlModeBridge: true })).toBe(false);
  });

  it('falls back to srcDoc when inspect mode is active (selection bridge required)', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, inspectMode: true })).toBe(false);
  });

  it('falls back to srcDoc when draw mode is active without a URL snapshot bridge', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, drawMode: true })).toBe(false);
  });

  it('keeps URL-load when draw mode is active and the raw route injected the snapshot bridge', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, drawMode: true, urlSnapshotBridge: true })).toBe(true);
  });

  it('falls back to srcDoc when the artifact ships the class based tweaks template', () => {
    // Without this, a plain `.tw-panel` artifact would URL load on first
    // open, skip the tweaks bridge entirely, and leave the toolbar toggle
    // disabled (no `od:tweaks-available` ever fires).
    expect(shouldUrlLoadHtmlPreview({ ...base, tweaksBridge: true })).toBe(false);
  });

  it('falls back to srcDoc when the user opts in via forceInline', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, forceInline: true })).toBe(false);
  });

  it('falls back to srcDoc when the HTML source needs a focus guard', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, needsFocusGuard: true })).toBe(false);
  });

  it('falls back to srcDoc when the source references project files by site-root path', () => {
    // URL-load serves the document untouched, so `/reference-assets/main.css`
    // resolves against the app origin root and 404s; only the srcDoc pipeline
    // rewrites confirmed root-relative refs into resolvable URLs.
    expect(shouldUrlLoadHtmlPreview({ ...base, projectRootAssetRefs: true })).toBe(false);
  });

  it('does not URL-load while the source-code tab is active', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, mode: 'source' })).toBe(false);
  });

  it('treats any disqualifying flag as sufficient on its own', () => {
    expect(shouldUrlLoadHtmlPreview({ ...base, isDeck: true, commentMode: true })).toBe(false);
    expect(shouldUrlLoadHtmlPreview({ ...base, isDeck: true, forceInline: true })).toBe(false);
    expect(shouldUrlLoadHtmlPreview({ ...base, commentMode: true, forceInline: true })).toBe(false);
    expect(shouldUrlLoadHtmlPreview({ ...base, tweaksBridge: true, forceInline: true })).toBe(false);
    expect(shouldUrlLoadHtmlPreview({ ...base, commentMode: true, urlModeBridge: true, inspectMode: true })).toBe(false);
    expect(shouldUrlLoadHtmlPreview({ ...base, drawMode: true, urlSnapshotBridge: true, inspectMode: true })).toBe(false);
  });
});

describe('hasTweaksTemplate', () => {
  it('matches a plain `.tw-panel` artifact', () => {
    const source = '<!doctype html><html><body><aside class="tw-panel"></aside></body></html>';
    expect(hasTweaksTemplate(source)).toBe(true);
  });

  it('matches the `.tw-hidden` toggle class even without an explicit `.tw-panel`', () => {
    // Defensive: the template ships both selectors and either one signals a
    // tweaks-template artifact that needs the bridge.
    const source = '<style>.tw-hidden { display: none; }</style>';
    expect(hasTweaksTemplate(source)).toBe(true);
  });

  it('does not match unrelated identifiers that merely contain `tw`', () => {
    expect(hasTweaksTemplate('<div class="container">tweet</div>')).toBe(false);
    expect(hasTweaksTemplate('twk-panel, btw-panel, mtw-hidden')).toBe(false);
  });

  it('returns false for empty / null / undefined input', () => {
    expect(hasTweaksTemplate('')).toBe(false);
    expect(hasTweaksTemplate(null)).toBe(false);
    expect(hasTweaksTemplate(undefined)).toBe(false);
  });
});

describe('hasUrlModeBridge', () => {
  it('detects an artifact-owned direct-edit bridge script', () => {
    expect(hasUrlModeBridge('<script src="od-direct-edit.js"></script>')).toBe(true);
    expect(hasUrlModeBridge('<script defer src="./assets/od-direct-edit.js?v=1"></script>')).toBe(true);
  });

  it('ignores comments, text nodes, and inline script bodies that only mention the bridge name', () => {
    expect(hasUrlModeBridge('<!-- TODO: ship od-direct-edit.js -->')).toBe(false);
    expect(hasUrlModeBridge('<p>Use od-direct-edit.js for editing</p>')).toBe(false);
    expect(hasUrlModeBridge('<script>console.log("od-direct-edit.js")</script>')).toBe(false);
  });

  it('ignores unrelated script URLs', () => {
    expect(hasUrlModeBridge('<script src="direct-edit.js"></script>')).toBe(false);
    expect(hasUrlModeBridge(null)).toBe(false);
  });
});

describe('parseForceInline', () => {
  it('returns false when the parameter is absent', () => {
    expect(parseForceInline('')).toBe(false);
    expect(parseForceInline('?other=1')).toBe(false);
    expect(parseForceInline(null)).toBe(false);
    expect(parseForceInline(undefined)).toBe(false);
  });

  it('returns true for the documented opt-in values', () => {
    expect(parseForceInline('?forceInline=1')).toBe(true);
    expect(parseForceInline('?forceInline=true')).toBe(true);
    expect(parseForceInline('?forceInline=TRUE')).toBe(true);
    expect(parseForceInline('?forceInline=yes')).toBe(true);
    expect(parseForceInline('?forceInline=on')).toBe(true);
  });

  it('returns false for explicit opt-out values and unrelated strings', () => {
    expect(parseForceInline('?forceInline=0')).toBe(false);
    expect(parseForceInline('?forceInline=false')).toBe(false);
    expect(parseForceInline('?forceInline=no')).toBe(false);
    expect(parseForceInline('?forceInline=off')).toBe(false);
    expect(parseForceInline('?forceInline=banana')).toBe(false);
  });

  it('treats an empty value as absent (defensive: ?forceInline= shows up as "")', () => {
    expect(parseForceInline('?forceInline=')).toBe(false);
  });

  it('accepts a pre-built URLSearchParams', () => {
    const params = new URLSearchParams('forceInline=1&other=foo');
    expect(parseForceInline(params)).toBe(true);
  });

  it('survives surrounding whitespace in the value', () => {
    const params = new URLSearchParams();
    params.set('forceInline', '  1  ');
    expect(parseForceInline(params)).toBe(true);
  });
});

describe('htmlNeedsSandboxShim', () => {
  it('returns false for plain static HTML', () => {
    expect(htmlNeedsSandboxShim('<!doctype html><h1>hello</h1>')).toBe(false);
  });

  it('detects <script type="text/babel"> (Babel-standalone React prototypes)', () => {
    // Real agent-emitted shape with src= and double-quoted attributes.
    expect(
      htmlNeedsSandboxShim(
        '<script type="text/babel" src="components/Icon.jsx"></script>',
      ),
    ).toBe(true);
    // Single quotes.
    expect(htmlNeedsSandboxShim("<script type='text/babel'>const a = 1;</script>")).toBe(true);
    // Extra attributes before type=.
    expect(
      htmlNeedsSandboxShim('<script defer type="text/babel" src="app.jsx"></script>'),
    ).toBe(true);
    // Whitespace around the equals sign.
    expect(htmlNeedsSandboxShim('<script type = "text/babel"></script>')).toBe(true);
    // Case-insensitive type value.
    expect(htmlNeedsSandboxShim('<script type="TEXT/BABEL"></script>')).toBe(true);
  });

  it('detects unquoted <script type=text/babel> (HTML5 permits unquoted attrs)', () => {
    // Bare unquoted type value, no other attributes.
    expect(htmlNeedsSandboxShim('<script type=text/babel></script>')).toBe(true);
    // Unquoted with an unquoted src= following — terminates on whitespace.
    expect(
      htmlNeedsSandboxShim('<script type=text/babel src=app.jsx></script>'),
    ).toBe(true);
    // Mixed: unquoted type=, then a quoted src=.
    expect(
      htmlNeedsSandboxShim('<script type=text/babel src="components/Icon.jsx"></script>'),
    ).toBe(true);
    // Trailing `\b` rejects word continuations: `type=text/babelish` does
    // not match because `l`→`i` is a word-internal transition. Hyphenated
    // variants like `type=text/babel-other` still match per the helper
    // docstring (`l`→`-` is a word boundary) — that's the documented safe
    // false-positive direction, so it is intentionally not asserted here.
    expect(htmlNeedsSandboxShim('<script type=text/babelish></script>')).toBe(false);
  });

  it('does not match unrelated MIME types or inline-only <script> tags', () => {
    // Inline JSON data island — no executable code, no Web Storage access.
    expect(htmlNeedsSandboxShim('<script type="application/json">{}</script>')).toBe(false);
    // Substring-only matches must not trigger (e.g. text/babel-like custom type).
    expect(htmlNeedsSandboxShim('<script type="text/babelish"></script>')).toBe(false);
    // A bare inline <script> without src= and without a Web Storage mention
    // is left alone (URL-load can render it fine without the shim).
    expect(htmlNeedsSandboxShim('<script>console.log("hi")</script>')).toBe(false);
  });

  it('detects direct localStorage / sessionStorage references in the source', () => {
    expect(htmlNeedsSandboxShim('<script>localStorage.getItem("k")</script>')).toBe(true);
    expect(htmlNeedsSandboxShim('<script>sessionStorage.setItem("k","v")</script>')).toBe(true);
    // Inside an external script tag's surrounding markup still trips the
    // scan when the literal name appears in the document the iframe loads.
    expect(htmlNeedsSandboxShim('// uses localStorage to persist theme')).toBe(true);
  });

  it('does not match incidental substrings that are not the storage globals', () => {
    expect(htmlNeedsSandboxShim('Storage')).toBe(false);
    expect(htmlNeedsSandboxShim('mylocalStorageWrapper')).toBe(false);
    expect(htmlNeedsSandboxShim('SuperLocalStorage')).toBe(false);
  });

  // Issue #2361 — Tweaks and animations problems
  // Agent-emitted artifacts commonly read `localStorage` from an *external*
  // script (e.g. `<script src="boot.js">` that initializes theme/language).
  // The parent string scan can't see the script body, so prior to #2361 the
  // helper returned false, the preview took the URL-load path, and the
  // sandboxed iframe threw `SecurityError` on first read — leaving the
  // artifact blank until the user toggled Tweaks (which forces srcDoc and
  // pulls in `injectSandboxShim`). Conservatively route any external script
  // through srcDoc so the shim is available from the start.
  it('flags any external <script src=> as needing the shim (issue #2361)', () => {
    // Plain external script — the original reporter's repro shape.
    expect(htmlNeedsSandboxShim('<script src="boot.js"></script>')).toBe(true);
    // ES module import.
    expect(htmlNeedsSandboxShim('<script type="module" src="main.js"></script>')).toBe(true);
    // Attributes between <script and src= (defer / async / nonce / crossorigin).
    expect(htmlNeedsSandboxShim('<script defer src="./app.js"></script>')).toBe(true);
    expect(htmlNeedsSandboxShim('<script async src="https://cdn.example.com/lib.js"></script>')).toBe(true);
    // Single-quoted src.
    expect(htmlNeedsSandboxShim("<script src='./bundle.js'></script>")).toBe(true);
    // Whitespace around the equals sign.
    expect(htmlNeedsSandboxShim('<script src = "./bundle.js"></script>')).toBe(true);
    // Unquoted src value (HTML5 permits unquoted attrs).
    expect(htmlNeedsSandboxShim('<script src=boot.js></script>')).toBe(true);
    // Case-insensitive tag name.
    expect(htmlNeedsSandboxShim('<SCRIPT SRC="boot.js"></SCRIPT>')).toBe(true);
  });

  it('does not match incidental "src=" in non-script contexts (issue #2361 regression)', () => {
    // `<img src=>` is not an executable subresource for our purposes.
    expect(htmlNeedsSandboxShim('<img src="logo.png">')).toBe(false);
    // `<link rel="stylesheet" href=>` similarly does not run JavaScript.
    expect(htmlNeedsSandboxShim('<link rel="stylesheet" href="styles.css">')).toBe(false);
    // Text content mentioning `script src=` (e.g. a docs page) must not trigger.
    expect(htmlNeedsSandboxShim('<p>Use <code>&lt;script src=&quot;app.js&quot;&gt;</code></p>')).toBe(false);
  });
});

describe('htmlNeedsFocusGuard', () => {
  it('returns false for plain static HTML', () => {
    expect(htmlNeedsFocusGuard('<!doctype html><h1>hello</h1>')).toBe(false);
  });

  it('detects window.focus() calls', () => {
    expect(htmlNeedsFocusGuard('<script>window.focus();</script>')).toBe(true);
    expect(htmlNeedsFocusGuard('<script>window .focus()</script>')).toBe(true);
    expect(htmlNeedsFocusGuard('<script>WINDOW.FOCUS()</script>')).toBe(true);
  });

  it('detects document.body.focus() calls', () => {
    expect(htmlNeedsFocusGuard('<script>document.body.focus();</script>')).toBe(true);
    expect(htmlNeedsFocusGuard('<script>document.body .focus()</script>')).toBe(true);
  });

  it('detects querySelector(...).focus() and chained focus calls', () => {
    expect(htmlNeedsFocusGuard('<script>document.querySelector("input").focus()</script>')).toBe(true);
    expect(htmlNeedsFocusGuard('<script>document.getElementById("x").focus()</script>')).toBe(true);
    expect(htmlNeedsFocusGuard('<script>myInput.focus()</script>')).toBe(true);
  });

  it('detects autofocus attributes', () => {
    expect(htmlNeedsFocusGuard('<input autofocus>')).toBe(true);
    expect(htmlNeedsFocusGuard('<input AUTOFOCUS>')).toBe(true);
    expect(htmlNeedsFocusGuard('<textarea autofocus></textarea>')).toBe(true);
  });

  it('detects external script references that may call focus at load', () => {
    expect(htmlNeedsFocusGuard('<script src="./boot.js"></script>')).toBe(true);
    expect(htmlNeedsFocusGuard('<script src="app.js"></script>')).toBe(true);
    expect(htmlNeedsFocusGuard('<script defer src="./assets/init.js"></script>')).toBe(true);
    expect(htmlNeedsFocusGuard('<SCRIPT SRC="main.js"></SCRIPT>')).toBe(true);
  });

  it('does not match inline scripts without focus calls', () => {
    expect(htmlNeedsFocusGuard('<script>console.log("hello")</script>')).toBe(false);
    expect(htmlNeedsFocusGuard('<script type="application/json">{}</script>')).toBe(false);
  });

  it('does not match unrelated focus mentions', () => {
    expect(htmlNeedsFocusGuard('<div class="focus-ring">')).toBe(false);
    expect(htmlNeedsFocusGuard('// focus the element')).toBe(false);
    expect(htmlNeedsFocusGuard(':focus')).toBe(false);
    expect(htmlNeedsFocusGuard('focus-visible')).toBe(false);
  });
});

describe('htmlNeedsPoweredPreview', () => {
  it('returns false for empty / null input', () => {
    expect(htmlNeedsPoweredPreview('')).toBe(false);
    expect(htmlNeedsPoweredPreview(null)).toBe(false);
    expect(htmlNeedsPoweredPreview(undefined)).toBe(false);
  });

  it('matches SharedArrayBuffer (needs cross-origin isolation)', () => {
    expect(htmlNeedsPoweredPreview('const b = new SharedArrayBuffer(16);')).toBe(true);
  });

  it('matches Web Worker / SharedWorker construction', () => {
    expect(htmlNeedsPoweredPreview("const w = new Worker('sort.js');")).toBe(true);
    expect(htmlNeedsPoweredPreview('new SharedWorker(url)')).toBe(true);
    expect(htmlNeedsPoweredPreview('new  Worker(blobUrl)')).toBe(true);
  });

  it('matches importScripts inside a worker', () => {
    expect(htmlNeedsPoweredPreview("importScripts('lib.js')")).toBe(true);
  });

  it('matches WASM streaming and .wasm references', () => {
    expect(htmlNeedsPoweredPreview('WebAssembly.instantiateStreaming(fetch(u))')).toBe(true);
    expect(htmlNeedsPoweredPreview('WebAssembly.compileStreaming(r)')).toBe(true);
    expect(htmlNeedsPoweredPreview('fetch("engine.wasm")')).toBe(true);
  });

  it('matches WebGL2 / OffscreenCanvas / WebGPU', () => {
    expect(htmlNeedsPoweredPreview('canvas.getContext("webgl2")')).toBe(true);
    expect(htmlNeedsPoweredPreview("el.getContext('webgl2', {})")).toBe(true);
    expect(htmlNeedsPoweredPreview('new OffscreenCanvas(8, 8)')).toBe(true);
    expect(htmlNeedsPoweredPreview('const a = navigator.gpu')).toBe(true);
  });

  it('does NOT match a plain WebGL1 canvas demo (runs fine in the opaque sandbox)', () => {
    expect(htmlNeedsPoweredPreview("canvas.getContext('webgl')")).toBe(false);
    expect(htmlNeedsPoweredPreview("canvas.getContext('2d')")).toBe(false);
  });

  it('does NOT match unrelated prose that mentions the words', () => {
    expect(htmlNeedsPoweredPreview('<p>Our web worker culture is great</p>')).toBe(false);
    expect(htmlNeedsPoweredPreview('<p>A workshop about 3D printing</p>')).toBe(false);
  });
});
