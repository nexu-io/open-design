import type { SiteOutputMode } from '@open-design/contracts';

const SITE_OUTPUT_MODES = ['single-html', 'multi-file'] as const;

export const SITE_OUTPUT_MODE_ENV = 'OD_SITE_OUTPUT_MODE';

export function parseSiteOutputMode(value: unknown, source = 'site output mode'): SiteOutputMode {
  const normalized = String(value ?? '').trim();
  if (SITE_OUTPUT_MODES.includes(normalized as SiteOutputMode)) {
    return normalized as SiteOutputMode;
  }
  throw new Error(`${source} must be one of: ${SITE_OUTPUT_MODES.join(', ')}`);
}

export function resolveSiteOutputMode(options: {
  cliValue?: unknown;
  env?: NodeJS.ProcessEnv;
} = {}): SiteOutputMode | null {
  if (options.cliValue !== undefined) {
    return parseSiteOutputMode(options.cliValue, '--site-output-mode');
  }
  const env = options.env ?? process.env;
  if (Object.prototype.hasOwnProperty.call(env, SITE_OUTPUT_MODE_ENV)) {
    return parseSiteOutputMode(env[SITE_OUTPUT_MODE_ENV], SITE_OUTPUT_MODE_ENV);
  }
  return null;
}

export function renderSiteOutputModePrompt(mode: SiteOutputMode): string {
  if (mode === 'single-html') {
    return [
      'Website output policy (mandatory for this service): single-html.',
      'Produce the deployable website as exactly one visible file named index.html.',
      'Inline all CSS and JavaScript. Embed images, fonts, and other required resources as data URLs.',
      'Do not depend on remote stylesheets, scripts, images, fonts, modules, or other runtime resources.',
      'If the user requests multiple pages, views, or routes:',
      '- Implement them inside the single index.html as a client-side SPA.',
      '- Use hash routes such as #/, #/about, and #/work/:id.',
      '- Do not create separate HTML files for logical pages.',
      '- Do not use history.pushState or server-dependent pathname routing.',
      '- Give every logical page a stable, unique page container.',
      '- Show exactly one logical page for the active route.',
      '- Use hash-compatible navigation links such as href="#/about".',
      '- Handle initial loading, hashchange, browser back/forward, unknown routes, and parameterized routes.',
      '- Keep shared navigation and layout inside the same document.',
      'The service validates and may normalize the result after generation; a non-conforming result fails the run.',
    ].join('\n');
  }
  return [
    'Website output policy (mandatory for this service): multi-file.',
    'Produce index.html, at least one visible .css file, at least one visible .js file, and an assets directory (even when empty).',
    'Additional HTML, CSS, and JavaScript files are allowed. Put binary resources under assets/.',
    'Do not depend on remote stylesheets, scripts, images, fonts, modules, or other runtime resources.',
    'The service validates and may normalize the result after generation; a non-conforming result fails the run.',
  ].join('\n');
}
