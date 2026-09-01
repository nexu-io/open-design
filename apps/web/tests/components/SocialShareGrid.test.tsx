// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildSocialSharePayload } from '@open-design/contracts';

import { SocialShareGrid } from '../../src/components/SocialShareGrid';
import { I18nProvider } from '../../src/i18n';

describe('SocialShareGrid', () => {
  it('renders a visible icon for every supported social platform', () => {
    const share = buildSocialSharePayload({
      kind: 'project-html',
      url: 'https://example.com/shared-project',
    });

    const { container } = render(
      <I18nProvider initial="en">
        <SocialShareGrid share={share} />
      </I18nProvider>,
    );

    const platformButtons = Array.from(
      container.querySelectorAll<HTMLElement>('.social-share-button'),
    );
    expect(platformButtons).toHaveLength(share.platforms.length);

    for (const [index, button] of platformButtons.entries()) {
      const platform = share.platforms[index]?.platform;
      const path = button.querySelector<SVGPathElement>('.social-share-button__icon path');
      expect(path, `${platform} should render a non-empty SVG icon`).not.toBeNull();
      expect(path?.getAttribute('d'), `${platform} should render a non-empty SVG path`).toBeTruthy();
    }
  });
});
