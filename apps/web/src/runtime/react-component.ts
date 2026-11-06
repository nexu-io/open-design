interface ReactComponentSrcdocOptions {
  title: string;
}

const REACT_DEV_URL = 'https://unpkg.com/react@18/umd/react.development.js';
const REACT_DOM_DEV_URL = 'https://unpkg.com/react-dom@18/umd/react-dom.development.js';
const BABEL_STANDALONE_URL = 'https://unpkg.com/@babel/standalone/babel.min.js';

export function buildReactComponentSrcdoc(
  source: string,
  { title }: ReactComponentSrcdocOptions,
): string {
  const prepared = prepareReactComponentSource(source);
  const safeTitle = escapeHtml(title || 'React component');
  const sourceJson = JSON.stringify(prepared);
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
    <script src="${REACT_DEV_URL}"></script>
    <script src="${REACT_DOM_DEV_URL}"></script>
    <script src="${BABEL_STANDALONE_URL}"></script>
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
        if (!window.React || !window.ReactDOM || !window.Babel) {
          showError(new Error('React preview runtime failed to load.'));
          return;
        }
        var compiled;
        try {
          compiled = window.Babel.transform(${sourceJson}, {
            filename: 'artifact.tsx',
            presets: ['typescript', 'react'],
          }).code;
        } catch (err) {
          showError(err);
          return;
        }
        try {
          // User-authored JSX runs only inside this sandboxed iframe. The parent omits
          // allow-same-origin, so runtime effects are confined to the preview document.
          (0, eval)(compiled);
          var Component = window.__OpenDesignComponent ||
            (typeof App !== 'undefined' ? App : null) ||
            (typeof Component !== 'undefined' ? Component : null) ||
            (typeof Preview !== 'undefined' ? Preview : null);
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

export function prepareReactComponentSource(source: string): string {
  const withoutImports = transformImportDeclarations(source);
  const transformed = transformExports(withoutImports);
  return `${transformed.code}
window.__OpenDesignComponent = window.__OpenDesignComponent || (${componentFallbackExpression(transformed.defaultName)});`;
}

function transformImportDeclarations(source: string): string {
  return source
    .replace(/^\s*import\s+type\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(
      /^\s*import\s+([\s\S]*?)\s+from\s+['"]react['"];?\s*$/gm,
      (_match, specifier: string) => reactImportReplacement(specifier),
    )
    .replace(/^\s*import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
}

function reactImportReplacement(specifier: string): string {
  const bindings: string[] = [];
  const trimmed = specifier.trim();
  const namespaceMatch = trimmed.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
  const namespaceName = namespaceMatch?.[1];
  if (namespaceName) {
    bindings.push(`const ${namespaceName} = window.React;`);
    return bindings.join('\n');
  }

  const namedMatch = trimmed.match(/\{([\s\S]*)\}/);
  const namedPart = namedMatch?.[1]?.trim() ?? '';
  const defaultPart = trimmed
    .replace(/\{[\s\S]*\}/, '')
    .replace(/,\s*$/, '')
    .trim();

  if (defaultPart) bindings.push(`const ${defaultPart} = window.React;`);
  if (namedPart) {
    const namedBindings = namedPart
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !part.startsWith('type '))
      .map((part) => part.replace(/\s+as\s+/g, ': '))
      .join(', ');
    if (namedBindings) bindings.push(`const { ${namedBindings} } = window.React;`);
  }

  return bindings.join('\n');
}

function transformExports(source: string): { code: string; defaultName: string | null } {
  let defaultName: string | null = null;
  let firstNamedExport: string | null = null;
  let code = source;

  code = code.replace(
    /export\s+default\s+function\s+([A-Za-z_$][\w$]*)?\s*\(/g,
    (_match, name: string | undefined) => {
      defaultName = name || 'OpenDesignComponent';
      return `function ${defaultName}(`;
    },
  );
  code = code.replace(
    /export\s+default\s+class\s+([A-Za-z_$][\w$]*)?\s*/g,
    (_match, name: string | undefined) => {
      defaultName = name || 'OpenDesignComponent';
      return `class ${defaultName} `;
    },
  );
  code = code.replace(
    /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/g,
    (_match, name: string) => {
      defaultName = name;
      return '';
    },
  );
  code = code.replace(/export\s+default\s+/g, () => {
    defaultName = 'OpenDesignComponent';
    return 'const OpenDesignComponent = ';
  });
  code = code.replace(
    /export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    (_match, kind: string, name: string) => {
      firstNamedExport ||= name;
      return `${kind} ${name}`;
    },
  );
  code = code.replace(
    /export\s+function\s+([A-Za-z_$][\w$]*)/g,
    (_match, name: string) => {
      firstNamedExport ||= name;
      return `function ${name}`;
    },
  );
  code = code.replace(
    /export\s+class\s+([A-Za-z_$][\w$]*)/g,
    (_match, name: string) => {
      firstNamedExport ||= name;
      return `class ${name}`;
    },
  );
  code = code.replace(/export\s*\{([^}]*)\};?/g, (_match, specifiers: string) => {
    for (const rawSpecifier of specifiers.split(',')) {
      const specifier = rawSpecifier.trim();
      const defaultMatch = specifier.match(/^([A-Za-z_$][\w$]*)\s+as\s+default$/);
      const reexportedDefaultName = defaultMatch?.[1];
      if (reexportedDefaultName) {
        defaultName = reexportedDefaultName;
        continue;
      }
      const namedMatch = specifier.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+[A-Za-z_$][\w$]*)?$/);
      const exportedName = namedMatch?.[1];
      if (exportedName) firstNamedExport ||= exportedName;
    }
    return '';
  });
  code = code.replace(/export\s*\{[^}]*\};?/g, '');

  return { code, defaultName: defaultName || firstNamedExport };
}

function componentFallbackExpression(defaultName: string | null): string {
  const names = [defaultName, 'App', 'Component', 'Preview'].filter(
    (value, index, list): value is string => Boolean(value) && list.indexOf(value) === index,
  );
  return names
    .map((name) => `(typeof ${name} !== 'undefined' ? ${name} : null)`)
    .concat('null')
    .join(' || ');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
