// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignSystemDetailTabs } from '../../src/components/DesignSystemDetailTabs';
import { I18nProvider } from '../../src/i18n';
import type { DesignKit } from '../../src/runtime/design-kit';
import type { DesignSystemSummary } from '../../src/types';

const system: DesignSystemSummary = {
  id: 'example-kit', title: 'Example', category: 'Custom', summary: 'A complete system.',
};

function fixtureKit(): DesignKit {
  return {
    designSystemId: system.id,
    name: 'Example', description: 'Identity guidance.', editable: false, canUpload: false,
    logoSrc: '/example-logo.svg', logoAlternates: [],
    colors: [{ role: 'primary', name: 'Action blue', hex: '#123456', usage: 'Primary actions' }],
    typography: { body: { family: 'Example Sans', fallbacks: [], weights: [400] } }, fonts: [],
    system: { kitUrl: '/example-components.html' },
    imagery: { style: 'Quiet photography.', subjects: [], treatment: '', avoid: [],
      samples: [{ url: '/example-photo.jpg', caption: 'Example photo' }] },
    assets: [{ kind: 'landing', label: 'Landing page', url: '/example-landing.html' }],
  };
}

function detail(kit: DesignKit | null = fixtureKit(), body?: string) {
  return <I18nProvider initial="en">
    <DesignSystemDetailTabs system={system} kit={kit} body={body} resourceReadIdentity={null}
      backSlot={<button>Back to systems</button>} loadingSlot={<p>Loading kit</p>} />
  </I18nProvider>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('DesignSystemDetailTabs', () => {
  it('shows only the selected module group and mounts component and graphic previews on demand', () => {
    const { container } = render(detail());
    expect(screen.getByRole('tab', { name: 'Theme' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel', { name: 'Theme' })).toContainElement(screen.getByText('Action blue'));
    expect(screen.queryByRole('region', { name: 'Typography' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Logo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Identity guidance.')).not.toBeInTheDocument();
    expect(container.querySelectorAll('iframe')).toHaveLength(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Components' }));
    const components = screen.getByRole('tabpanel', { name: 'Components' });
    expect(within(components).getByTitle('Design system')).toHaveAttribute('src', '/example-components.html');
    expect(within(components).getByRole('region', { name: 'Design system assets' })).toBeInTheDocument();
    expect(within(components).getByTitle('Landing page')).toHaveAttribute('src', '/example-landing.html');
    expect(container.querySelectorAll('iframe')).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Typography' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('design-system-theme')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Graphics' }));
    const graphics = screen.getByRole('tabpanel', { name: 'Graphics' });
    expect(within(graphics).getByRole('region', { name: 'Logo' })).toBeInTheDocument();
    expect(within(graphics).getByRole('img', { name: 'Example photo' })).toBeInTheDocument();
    expect(within(graphics).queryByRole('region', { name: 'Design system assets' })).not.toBeInTheDocument();
    expect(within(graphics).queryByTitle('Landing page')).not.toBeInTheDocument();
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
    expect(screen.queryByTitle('Design system')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Design guidelines' }));
    expect(screen.getByText('Identity guidance.')).toBeInTheDocument();
    expect(screen.getByText('Quiet photography.')).toBeInTheDocument();
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Logo' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('shows design system assets in Components even when no component kit is available', () => {
    const { container } = render(detail({ ...fixtureKit(), system: undefined }));
    fireEvent.click(screen.getByRole('tab', { name: 'Components' }));
    const components = screen.getByRole('tabpanel', { name: 'Components' });
    expect(within(components).getByRole('region', { name: 'Design system assets' })).toBeInTheDocument();
    expect(within(components).getByTitle('Landing page')).toHaveAttribute('src', '/example-landing.html');
    expect(within(components).queryByTitle('Design system')).not.toBeInTheDocument();
    expect(container.querySelectorAll('iframe')).toHaveLength(1);
  });

  it('moves selection and roving keyboard focus with arrow keys, Home and End', () => {
    render(detail());
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1, -1]);
    fireEvent.keyDown(tabs[1]!, { key: 'End' });
    expect(tabs[3]).toHaveFocus();
    fireEvent.keyDown(tabs[3]!, { key: 'ArrowRight' });
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
    expect(tabs[3]).toHaveFocus();
    fireEvent.keyDown(tabs[3]!, { key: 'Home' });
    expect(tabs[0]).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[0]!.id);
    expect(tabs[0]).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id);
  });

  it('shares one token read between the color palette and foundations across tab changes', async () => {
    const fetchTokens = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ tokens: [
      { name: '--accent', type: 'color', value: '#345678' },
      { name: '--font-body', type: 'fontFamily', value: 'Shared Token Sans', confidence: 'high', sources: ['https://example.com/styles.css:10'] },
      { name: '--radius-card', type: 'dimension', value: '14px', confidence: 'high', sources: ['https://example.com/styles.css:11'] },
    ] }));
    render(<I18nProvider initial="en"><DesignSystemDetailTabs
      system={system} kit={fixtureKit()} resourceReadIdentity={null}
      packageInfo={{
        manifest: { schemaVersion: '1', id: system.id, name: system.title, category: 'Custom', files: { designTokens: 'design-tokens.json' } },
        availableFiles: ['design-tokens.json'],
      }} backSlot={<button>Back to systems</button>} />
    </I18nProvider>);

    expect(await screen.findByText('Shared Token Sans')).toBeInTheDocument();
    expect(within(screen.getByTestId('design-system-theme')).getByText('--accent')).toBeInTheDocument();
    const foundations = screen.getByTestId('design-system-foundations');
    expect(within(foundations).getByText('14px')).toBeInTheDocument();
    expect(within(foundations).queryByText('Example Sans')).not.toBeInTheDocument();
    expect(fetchTokens.mock.calls.filter(([url]) => String(url).includes('path=design-tokens.json'))).toHaveLength(1);
    expect(fetchTokens).toHaveBeenCalledWith(
      '/api/design-systems/example-kit/static?path=design-tokens.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Components' }));
    expect(screen.queryByTestId('design-system-foundations')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Graphics' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Theme' }));
    expect(screen.getByText('Shared Token Sans')).toBeInTheDocument();
    expect(screen.getByText('14px')).toBeInTheDocument();
    expect(screen.getByText('--accent')).toBeInTheDocument();
    expect(fetchTokens.mock.calls.filter(([url]) => String(url).includes('path=design-tokens.json'))).toHaveLength(1);
  });

  it('preserves the selected tab while loading and safely renders the full guideline document', () => {
    const { rerender, container } = render(detail(null));
    expect(screen.getByText('Loading kit')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Design guidelines' }));
    rerender(detail(fixtureKit(), '# Complete guidance\n\nKeep deliberate spacing.\n\n<script>alert(1)</script>'));
    expect(screen.getByRole('tab', { name: 'Design guidelines' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Complete guidance' })).toBeInTheDocument();
    expect(screen.getByText('Keep deliberate spacing.')).toBeInTheDocument();
    expect(screen.queryByText('Identity guidance.')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading kit')).not.toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('keeps back and system actions available across module changes', () => {
    const onBack = vi.fn();
    const onEdit = vi.fn();
    render(<I18nProvider initial="en"><DesignSystemDetailTabs
      system={system} kit={fixtureKit()} resourceReadIdentity={null}
      backSlot={<button onClick={onBack}>Back to systems</button>}
      actionsSlot={<button onClick={onEdit}>Edit system</button>}
      noticeSlot={<p>System notice</p>} />
    </I18nProvider>);
    fireEvent.click(screen.getByRole('tab', { name: 'Components' }));
    expect(screen.getByText('System notice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit system' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to systems' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
