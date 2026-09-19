// @vitest-environment jsdom

import type { ComponentProps, CSSProperties } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DesignSystemFoundations } from '../../src/components/DesignSystemFoundations';
import { I18nProvider } from '../../src/i18n';

type Tokens = ComponentProps<typeof DesignSystemFoundations>['tokens'];

function foundations(tokens: Tokens = []) {
  return render(<I18nProvider initial="en"><DesignSystemFoundations tokens={tokens} /></I18nProvider>);
}

afterEach(cleanup);

describe('DesignSystemFoundations', () => {
  it('hides missing and blank data without filling the three font slots', () => {
    const view = foundations([
      { name: '--font-body', type: 'fontFamily', value: ' ' },
      { name: '--shadow-card', type: 'shadow', value: '' },
      { name: '--radius-card', type: 'dimension', value: ' ' },
      { name: '--space-1', type: 'dimension', value: '' },
    ]);
    expect(screen.queryByTestId('design-system-foundations')).not.toBeInTheDocument();
    view.rerender(<I18nProvider initial="en"><DesignSystemFoundations
      tokens={[{ name: '--font-body', type: 'fontFamily', value: 'Original Font', sourceBacked: true }]} /></I18nProvider>);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Original Font')).toBeInTheDocument();
    for (const name of ['Shadow', 'Radius', 'Spacing']) {
      expect(screen.queryByRole('region', { name })).not.toBeInTheDocument();
    }
  });

  it('does not use curated or unverified data to fill missing font roles or groups', () => {
    foundations([
      { name: '--font-display', type: 'fontFamily', value: 'Original Font', sourceBacked: true },
      { name: '--font-body', type: 'fontFamily', value: 'Fallback Font', sourceBacked: false },
      { name: '--font-mono', type: 'fontFamily', value: 'Unknown Font' },
      { name: '--radius-md', type: 'dimension', value: '8px', sourceBacked: false },
      { name: '--shadow-default', type: 'shadow', value: '0 1px 4px black' },
    ]);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Original Font')).toBeInTheDocument();
    expect(screen.queryByText('Fallback Font')).not.toBeInTheDocument();
    expect(screen.queryByText('Unknown Font')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Radius' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Shadow' })).not.toBeInTheDocument();
  });

  it('hides samples whose aliases depend on missing or fallback data', () => {
    foundations([
      { name: '--shadow-real', type: 'shadow', value: '0 1px 2px var(--shadow-color)', sourceBacked: true },
      { name: '--shadow-color', type: 'color', value: '#000000', sourceBacked: false },
      { name: '--radius-card', type: 'dimension', value: 'var(--missing)', sourceBacked: true },
    ]);
    expect(screen.queryByTestId('design-system-foundations')).not.toBeInTheDocument();
  });

  it('shows real shadow, radius and spacing names and values in their respective groups', () => {
    foundations([
      { name: '--shadow-floating', sourceBacked: true, type: 'shadow', value: '0 8px 24px rgba(0, 0, 0, 0.12)' },
      { name: '--radius-card', sourceBacked: true, type: 'dimension', value: '18px' },
      { name: '--space-2', sourceBacked: true, type: 'dimension', value: '8px' },
      { name: '--spacing-dialog', sourceBacked: true, type: 'dimension', value: '1.5rem' },
      { name: '--space-zero', sourceBacked: true, type: 'number', value: '0' },
      { name: '--unrelated-width', sourceBacked: true, type: 'dimension', value: '100px' },
    ]);

    const shadow = screen.getByRole('region', { name: 'Shadow' });
    expect(within(shadow).getByText('shadow-floating')).toBeInTheDocument();
    expect(within(shadow).getByTitle('--shadow-floating: 0 8px 24px rgba(0, 0, 0, 0.12)')).toBeInTheDocument();
    const radius = screen.getByRole('region', { name: 'Radius' });
    expect(within(radius).getByText('radius-card')).toBeInTheDocument();
    expect(within(radius).getByText('18px')).toBeInTheDocument();
    const spacing = screen.getByRole('region', { name: 'Spacing' });
    for (const text of ['space-2', '8px', 'spacing-dialog', '1.5rem', 'space-zero', '0']) {
      expect(within(spacing).getByText(text)).toBeInTheDocument();
    }
    expect(screen.queryByText('unrelated-width')).not.toBeInTheDocument();
  });

  it('scopes CSS aliases inside the preview while keeping source names and values readable', () => {
    const tokens: Tokens = [
      { name: '--radius-base', sourceBacked: true, type: 'dimension', value: '6px' },
      { name: '--radius-panel', sourceBacked: true, type: 'dimension', value: 'var(--radius-base)' },
      { name: '--space-2', sourceBacked: true, type: 'dimension', value: '8px' },
      { name: '--spacing-panel', sourceBacked: true, type: 'dimension', value: 'calc(var(--space-2) * 2)' },
      { name: '--shadow-color', sourceBacked: true, type: 'color', value: '#123456' },
      { name: '--shadow-card', sourceBacked: true, type: 'shadow', value: '0 2px 8px var(--shadow-color)' },
    ];
    const { container } = render(<I18nProvider initial="en">
      <div style={{ '--radius-base': '999px', '--space-2': '777px' } as CSSProperties}>
        <DesignSystemFoundations tokens={tokens} />
      </div>
    </I18nProvider>);
    const root = screen.getByTestId('design-system-foundations');
    expect(root.style.getPropertyValue('--ds-foundation-radius-base')).toBe('6px');
    expect(root.style.getPropertyValue('--ds-foundation-radius-panel')).toBe('var(--ds-foundation-radius-base)');
    expect(root.style.getPropertyValue('--ds-foundation-spacing-panel')).toBe('calc(var(--ds-foundation-space-2) * 2)');
    expect(root.style.getPropertyValue('--ds-foundation-shadow-card')).toBe('0 2px 8px var(--ds-foundation-shadow-color)');
    expect(root.style.getPropertyValue('--radius-base')).toBe('');
    expect(root.parentElement!.style.getPropertyValue('--radius-base')).toBe('999px');
    expect(root.parentElement!.style.getPropertyValue('--space-2')).toBe('777px');

    const previews = Array.from(container.querySelectorAll<HTMLElement>('[style]'));
    expect(previews.some((node) => node.style.borderRadius === 'var(--ds-foundation-radius-base)')).toBe(true);
    expect(previews.some((node) => node.style.boxShadow === '0 2px 8px var(--ds-foundation-shadow-color)')).toBe(true);
    expect(screen.getByText('var(--radius-base)')).toBeInTheDocument();
    expect(screen.getByText('calc(var(--space-2) * 2)')).toBeInTheDocument();
  });
});
