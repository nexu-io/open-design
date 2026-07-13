import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TrustBadge } from '../../src/components/TrustBadge';

describe('TrustBadge', () => {
  it('normalizes bundled installed plugins to the user-facing Official tier', () => {
    const html = renderToStaticMarkup(<TrustBadge trust="bundled" />);

    expect(html).toContain('Official');
    expect(html).toContain('plugin-trust-badge--official');
    expect(html).toContain('data-trust-tier="official"');
    expect(html).toContain('Open Design official');
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
    expect(html).toContain('Community trusted');
    expect(html).toContain('Restricted source');
  });

  it('allows contextual text while preserving the trust tier styling', () => {
    const html = renderToStaticMarkup(
      <TrustBadge trust="official" label="Action plugin" />,
    );

    expect(html).toContain('Action plugin');
    expect(html).toContain('plugin-trust-badge--official');
    expect(html).toContain('aria-label="Open Design official: Action plugin"');
  });
});
