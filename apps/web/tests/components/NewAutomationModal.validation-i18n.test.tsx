// @vitest-environment jsdom
//
// Regression for #2917: with the UI in Chinese, submitting the New automation
// modal without a title or prompt showed hardcoded English validation errors
// while the rest of the modal was localized.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewAutomationModal } from '../../src/components/NewAutomationModal';
import { I18nProvider } from '../../src/i18n';
import { zhCN } from '../../src/i18n/locales/zh-CN';

vi.mock('../../src/state/projects', () => ({
  listPlugins: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/state/mcp', () => ({
  fetchMcpServers: vi.fn().mockResolvedValue({ servers: [], templates: [] }),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderModal() {
  return render(
    <I18nProvider initial="zh-CN">
      <NewAutomationModal
        open
        templates={[]}
        projects={[]}
        skills={[]}
        connectors={[]}
        onClose={() => undefined}
        onSaved={() => undefined}
      />
    </I18nProvider>,
  );
}

describe('NewAutomationModal validation copy (#2917)', () => {
  it('shows the missing-title error in the active locale', () => {
    const { container } = renderModal();
    fireEvent.submit(container.querySelector('form.automation-modal')!);

    expect(screen.getByRole('alert').textContent).toBe(zhCN['automations.errorTitleRequired']);
    expect(screen.getByRole('alert').textContent).not.toMatch(/Add a title/);
  });

  it('shows the missing-prompt error in the active locale', () => {
    const { container } = renderModal();
    fireEvent.change(screen.getByTestId('automation-modal-title'), {
      target: { value: 'Daily summary' },
    });
    fireEvent.submit(container.querySelector('form.automation-modal')!);

    expect(screen.getByRole('alert').textContent).toBe(zhCN['automations.errorPromptRequired']);
    expect(screen.getByRole('alert').textContent).not.toMatch(/Add a prompt/);
  });
});
