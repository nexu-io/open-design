// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../src/i18n';
import { DesignSignatureStrip } from '../../src/components/Signature';
import { StripExpanded } from '../../src/components/Signature/StripExpanded';
import { setDesignSignatureStripEnabled } from '../../src/components/Signature/hooks/useDesignSignatureStripEnabled';
import { computeDesignSignatureFromText, diffDesignSignatures } from '@open-design/contracts/design-signature';

beforeEach(() => {
  window.localStorage.clear();
  cleanup();
});

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

  it('shows noPrevious message on first version (diff null)', () => {
    setDesignSignatureStripEnabled(true);
    renderStrip({ artifactHtml: 'a{color:#3b82f6}', artifactId: 'first-version' });
    // Click to expand
    const collapseBtn = screen.getByRole('button', { name: /Signature/ });
    act(() => { fireEvent.click(collapseBtn); });
    expect(screen.getByText(/First version/)).toBeTruthy();
  });

  it('shows noChanges message when diff.unchanged is true (StripExpanded unit)', () => {
    // Test StripExpanded directly to cover the unchanged branch without hook memo constraints
    const sig = computeDesignSignatureFromText('a{color:#3b82f6;padding:8px}');
    const diff = diffDesignSignatures(sig, computeDesignSignatureFromText('a{color:#3b82f6;padding:8px}'));
    expect(diff.unchanged).toBe(true);
    render(
      <I18nProvider initial="en">
        <StripExpanded signature={sig} diff={diff} />
      </I18nProvider>,
    );
    expect(screen.getByText(/No changes since last version/)).toBeTruthy();
  });

  it('shows change list when a previous version had different design tokens', async () => {
    setDesignSignatureStripEnabled(true);
    const { rerender } = renderStrip({ artifactHtml: 'a{color:#3b82f6}', artifactId: 'changed-id' });
    // Rerender with different color to produce a diff with changes
    await act(async () => {
      rerender(
        <I18nProvider initial="en">
          <DesignSignatureStrip artifactHtml="a{color:#8b5cf6}" artifactId="changed-id" />
        </I18nProvider>,
      );
    });
    // Expand the strip
    const collapseBtn = screen.getByRole('button', { name: /Signature/ });
    act(() => { fireEvent.click(collapseBtn); });
    expect(screen.getByText(/Changes since last version/)).toBeTruthy();
  });
});
