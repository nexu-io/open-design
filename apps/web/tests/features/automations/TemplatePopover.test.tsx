// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../../src/i18n';
import { TemplatePopover } from '../../../src/features/automations/components/TemplatePopover';
import type { AutomationTemplate } from '../../../src/features/automations/types';

afterEach(() => cleanup());

const templates: AutomationTemplate[] = [
  { id: 't1', category: 'memory', kind: 'routine', icon: 'history', title: 'Template One', description: '', prompt: '' },
  { id: 't2', category: 'orbit', kind: 'orbit', icon: 'orbit', title: 'Template Two', description: '', prompt: '', defaultName: 'Fallback name' },
];

function renderPopover(selectedId: string | null, onSelect = vi.fn()) {
  render(
    <I18nProvider initial="en">
      <TemplatePopover templates={templates} selectedId={selectedId} onSelect={onSelect} />
    </I18nProvider>,
  );
  return { onSelect };
}

describe('TemplatePopover', () => {
  it('renders every template with no selection marker when nothing is selected', () => {
    renderPopover(null);
    const option = screen.getByRole('button', { name: /Template One/ });
    expect(option.className).not.toContain('is-selected');
  });

  it('marks the selected template with the active class and a checkmark', () => {
    renderPopover('t1');
    const option = screen.getByRole('button', { name: /Template One/ });
    expect(option.className).toContain('is-selected');
  });

  it('falls back to defaultName when title is not set on a template', () => {
    const noTitle = [{ ...templates[1]!, title: undefined as unknown as string }];
    render(
      <I18nProvider initial="en">
        <TemplatePopover templates={noTitle} selectedId={null} onSelect={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByText('Fallback name')).toBeTruthy();
  });

  it('calls onSelect with the clicked template', () => {
    const { onSelect } = renderPopover(null);
    fireEvent.click(screen.getByRole('button', { name: /Template Two/ }));
    expect(onSelect).toHaveBeenCalledWith(templates[1]);
  });
});
