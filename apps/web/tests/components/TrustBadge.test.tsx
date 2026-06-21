import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TrustBadge } from '../../src/components/TrustBadge';

describe('TrustBadge', () => {
  it('normalizes bundled installed plugins to the user-facing Official tier', () => {
    const html = renderToStaticMarkup(<TrustBadge trust="bundled" />);

    expect(html).toContain('Official');
    expect(html).toContain('plugin-trust-badge--official');
    expect(html).toContain('data-trust-tier="official"');
    // Tooltip / screen-reader text is the localized tier label, not a
    // hard-coded English description (would leak English on other locales).
    expect(html).toContain('aria-label="Official"');
  });

  it('uses one visual API for marketplace trust tiers', () => {
    const html = renderToStaticMarkup(
      <>
        <TrustBadge trust="official" />
        <TrustBadge trust="trusted" />
        <TrustBadge trust="restricted" />
      </>,
    );

    expect(html).toContain('plugin-trust-badge--official');
    expect(html).toContain('plugin-trust-badge--trusted');
    expect(html).toContain('plugin-trust-badge--restricted');
    expect(html).toContain('Trusted');
    expect(html).toContain('Restricted');
  });

  it('allows contextual text while preserving the trust tier styling', () => {
    const html = renderToStaticMarkup(
      <TrustBadge trust="official" label="Action plugin" />,
    );

    expect(html).toContain('Action plugin');
    expect(html).toContain('plugin-trust-badge--official');
    // Custom label keeps the localized tier prefix for assistive tech.
    expect(html).toContain('aria-label="Official: Action plugin"');
  });
});
