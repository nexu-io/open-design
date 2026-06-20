// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../src/i18n';
import { DesignSignatureStrip } from '../../src/components/Signature';
import { setDesignSignatureStripEnabled } from '../../src/components/Signature/hooks/useDesignSignatureStripEnabled';

beforeEach(() => window.localStorage.clear());

function renderStrip(props: { artifactHtml: string | null; artifactId: string }) {
  return render(
    <I18nProvider initial="en">
      <DesignSignatureStrip {...props} />
    </I18nProvider>,
  );
}

describe('DesignSignatureStrip', () => {
  it('renders nothing when the toggle is off', () => {
    const { container } = renderStrip({ artifactHtml: 'a{color:#3b82f6}', artifactId: 'a1' });
    expect(container.firstChild).toBeNull();
  });

  it('renders a collapsed line when enabled', () => {
    setDesignSignatureStripEnabled(true);
    renderStrip({ artifactHtml: 'a{color:#3b82f6}', artifactId: 'a1' });
    expect(screen.getByText(/Signature/)).toBeTruthy();
  });
});
