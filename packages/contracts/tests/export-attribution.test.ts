import { describe, expect, it } from 'vitest';

import {
  injectOpenDesignAttribution,
  openDesignAttributionPlainText,
} from '../src/api/export-attribution';

describe('export attribution', () => {
  it('injects the Made with Open Design footer before body end', () => {
    const html = injectOpenDesignAttribution('<!doctype html><body><main>Demo</main></body>');

    expect(html).toContain('data-open-design-attribution="true"');
    expect(html).toContain('Made with Open Design');
    expect(html).toContain('open-design.ai');
    expect(html).toContain('Remix');
    expect(html).toMatch(/Remix<\/a><\/div><\/body>$/);
  });

  it('is idempotent and can handle html fragments', () => {
    const once = injectOpenDesignAttribution('<main>Demo</main>');
    const twice = injectOpenDesignAttribution(once);

    expect(once).toContain('<main>Demo</main>');
    expect(twice.match(/data-open-design-attribution/g)).toHaveLength(1);
  });

  it('exposes the plain-text social attribution', () => {
    expect(openDesignAttributionPlainText()).toBe('Made with Open Design · open-design.ai · Remix');
  });
});
