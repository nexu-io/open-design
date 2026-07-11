// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostEditor } from '@open-design/contracts';
import { HandoffTrigger } from '../../../src/features/handoff/components/HandoffTrigger';
import { I18nProvider } from '../../../src/i18n';

afterEach(cleanup);

function renderTrigger(props: Partial<Parameters<typeof HandoffTrigger>[0]> = {}) {
  const onTriggerClick = vi.fn();
  const onCaretClick = vi.fn();
  render(
    <I18nProvider initial="en">
      <HandoffTrigger
        primary={null}
        primaryTitle="Open in Finder"
        busy={null}
        onTriggerClick={onTriggerClick}
        onCaretClick={onCaretClick}
        {...props}
      />
    </I18nProvider>,
  );
  return { onTriggerClick, onCaretClick };
}

describe('HandoffTrigger', () => {
  it('renders the finder icon and title when there is no primary editor', () => {
    renderTrigger();
    const trigger = screen.getByTestId('handoff-trigger');
    expect(trigger.getAttribute('title')).toBe('Open in Finder');
  });

  it("renders the primary editor's icon and title", () => {
    const primary: HostEditor = { id: 'cursor', label: 'Cursor', available: true };
    renderTrigger({ primary, primaryTitle: 'Open in Cursor' });
    const trigger = screen.getByTestId('handoff-trigger');
    expect(trigger.getAttribute('title')).toBe('Open in Cursor');
  });

  it('calls onTriggerClick / onCaretClick on click', () => {
    const { onTriggerClick, onCaretClick } = renderTrigger();
    fireEvent.click(screen.getByTestId('handoff-trigger'));
    fireEvent.click(screen.getByTestId('handoff-caret'));
    expect(onTriggerClick).toHaveBeenCalledTimes(1);
    expect(onCaretClick).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while any launch is busy', () => {
    renderTrigger({ busy: 'cursor' });
    expect((screen.getByTestId('handoff-trigger') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('handoff-caret') as HTMLButtonElement).disabled).toBe(true);
  });
});
