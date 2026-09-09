import { transform } from 'sucrase';

interface ReactComponentSrcdocOptions {
  title: string;
}

// Served from this application, not a CDN. The preview document is a separate
// browsing context with no allow-same-origin, so it cannot borrow the host's
// React and has to load its own copy — and loading it over the public internet
// is what made this surface fail in the packaged client offline and behind
// firewalls. `apps/web/scripts/copy-react-runtime.ts` stages these from the
// installed react packages at install, dev and build time; they are generated,
// not committed. Relative to the embedding document, so a preview served from
// any origin resolves them against that origin.
const REACT_URL = '/vendor/react-runtime/react.production.min.js';
const REACT_DOM_URL = '/vendor/react-runtime/react-dom.production.min.js';

export function buildReactComponentSrcdoc(
  source: string,
  { title }: ReactComponentSrcdocOptions,
): string {
  const safeTitle = escapeHtml(title || 'React component');
  // Compilation moved into the host, and with it the place a syntax error
  // lands. The in-page compiler used to catch it and paint the error panel; if
  // it escaped from here it would throw inside the viewer's render path and
  // take the whole file viewer down over a typo. Turn it back into the same
  // thing the user saw before: the message, on the page, pointing at the line.
  let compiled: string;
  try {
    compiled = prepareReactComponentSource(source);
  } catch (error) {
    const message = error instanceof Error ? (error.stack || error.message) : String(error);
    compiled = `throw new Error(${JSON.stringify(message)});`;
  }
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      html, body, #root { min-height: 100%; margin: 0; }
      body {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #fff;
        color: #111827;
      }
      #root { min-height: 100vh; }
      .od-react-error {
        margin: 16px;
        padding: 14px 16px;
        border: 1px solid #fecaca;
        border-radius: 8px;
        background: #fff1f2;
        color: #991b1b;
        font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="${REACT_URL}"></script>
    <script src="${REACT_DOM_URL}"></script>
    <script>
      (function(){
        var root = document.getElementById('root');
        function showError(err) {
          root.innerHTML = '';
          var el = document.createElement('pre');
          el.className = 'od-react-error';
          el.textContent = err && (err.stack || err.message) ? (err.stack || err.message) : String(err);
          root.appendChild(el);
        }
        if (!window.React || !window.ReactDOM) {
          showError(new Error('React preview runtime failed to load.'));
          return;
        }
        // Sucrase compiled this to CommonJS in the host, so the sandbox only has
        // to resolve the module names. An unknown module used to be deleted in
        // silence, which surfaced as "X is not defined" pointing at nothing;
        // naming it is the whole difference between a fixable message and a
        // mystery.
        var module = { exports: {} };
        var exports = module.exports;
        function require(name) {
          if (name === 'react') return window.React;
          if (name === 'react-dom' || name === 'react-dom/client') return window.ReactDOM;
          throw new Error(
            'This preview cannot resolve "' + name + '". Only react and react-dom are '
            + 'available here; a component that imports other files needs those files too.',
          );
        }
        try {
          // User-authored code runs only inside this sandboxed iframe. The parent
          // omits allow-same-origin, so its effects stay confined to the preview
          // document and cannot reach the host.
${compiled}
          var exported = module.exports || {};
          var Component = exported.default || exported.App || exported.Component
            || exported.Preview || null;
          if (!Component) {
            throw new Error('No React component export found. Export a default component or define App, Component, or Preview.');
          }
          window.ReactDOM.createRoot(root).render(window.React.createElement(Component));
        } catch (err) {
          showError(err);
        }
      })();
    </script>
  </body>
</html>`;
}

/**
 * Compile an authored `.tsx`/`.jsx` component to plain JavaScript, in the host.
 *
 * This used to rewrite `import`/`export` with four regular expressions and then
 * download `@babel/standalone` to finish the job inside the sandbox. Regexes do
 * not understand JavaScript, and the failures were not subtle: a string literal
 * containing the words `export default function` had its contents edited and
 * produced `typeof function` — a syntax error that killed the whole preview —
 * while `export * from './x'` survived verbatim into a classic script, which is
 * also a syntax error.
 *
 * Sucrase parses instead (its parser is a fork of Babel's), and it runs here
 * rather than in the sandbox, so the preview no longer downloads a compiler.
 * Output is CommonJS; the harness supplies `require` and reads
 * `module.exports`.
 */
export function prepareReactComponentSource(source: string): string {
  return transform(source, {
    transforms: ['typescript', 'jsx', 'imports'],
    jsxRuntime: 'classic',
    filePath: 'artifact.tsx',
  }).code;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
