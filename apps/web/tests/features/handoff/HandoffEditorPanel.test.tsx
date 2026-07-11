// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostEditor } from '@open-design/contracts';
import { HandoffEditorPanel } from '../../../src/features/handoff/components/HandoffEditorPanel';
import { I18nProvider } from '../../../src/i18n';

afterEach(cleanup);

function editor(over: Partial<HostEditor> = {}): HostEditor {
  return { id: 'cursor', label: 'Cursor', available: true, ...over };
}

function renderPanel(props: Partial<Parameters<typeof HandoffEditorPanel>[0]> = {}) {
  const onLaunch = vi.fn();
  render(
    <I18nProvider initial="en">
      <HandoffEditorPanel available={[editor()]} unavailable={[]} busy={null} onLaunch={onLaunch} {...props} />
    </I18nProvider>,
  );
  return { onLaunch };
}

describe('HandoffEditorPanel', () => {
  it('renders each available editor and calls onLaunch on click', () => {
    const { onLaunch } = renderPanel();
    const row = screen.getByTestId('handoff-menu-item-cursor');
    expect(row.textContent).toContain('Cursor');
    fireEvent.click(row);
    expect(onLaunch).toHaveBeenCalledWith(editor());
  });

  it('omits the unavailable section when there is nothing unavailable', () => {
    renderPanel();
    expect(screen.queryByText('Not installed')).toBeNull();
  });

  it('renders the unavailable section (dimmed) when present', () => {
    renderPanel({ unavailable: [editor({ id: 'vscode', label: 'VS Code', available: false })] });
    const row = screen.getByTestId('handoff-menu-item-vscode');
    expect(row.className).toContain('dim');
    expect(screen.getByText('Not installed')).toBeTruthy();
  });

  it('disables the row matching busy', () => {
    renderPanel({ busy: 'cursor' });
    expect((screen.getByTestId('handoff-menu-item-cursor') as HTMLButtonElement).disabled).toBe(true);
  });
});
