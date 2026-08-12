import { describe, expect, it } from 'vitest';

import { renderSiteOutputModePrompt } from '../src/site-output/mode.js';

describe('site output mode prompt', () => {
  it('requires a hash-routed SPA when single-html users request multiple logical pages', () => {
    expect(renderSiteOutputModePrompt('single-html')).toBe([
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
    ].join('\n'));
  });

  it('does not apply the hash-SPA-only rules to multi-file mode', () => {
    const prompt = renderSiteOutputModePrompt('multi-file');

    expect(prompt).toContain('Website output policy (mandatory for this service): multi-file.');
    expect(prompt).not.toContain('client-side SPA');
    expect(prompt).not.toContain('history.pushState');
    expect(prompt).not.toContain('#/work/:id');
  });
});
