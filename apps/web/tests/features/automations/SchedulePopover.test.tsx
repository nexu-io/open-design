// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../../src/i18n';
import { SchedulePopover } from '../../../src/features/automations/components/SchedulePopover';
import { emptyForm } from '../../../src/features/automations/rules';
import type { AutomationFormState } from '../../../src/features/automations/types';

afterEach(() => cleanup());

// `setForm` must apply its updater SYNCHRONOUSLY (like a real `useState`
// setter would, within the same event dispatch) — a controlled input whose
// onChange handler doesn't actually update the bound value gets its DOM
// value snapped back by React's controlled-input restoration once the event
// finishes, so reading `e.target.value` from a *deferred* mock invocation
// would see the already-restored stale value instead of the live one.
function renderPopover(initial: AutomationFormState, onDone = vi.fn()) {
  let latestForm = initial;
  const setForm = vi.fn((updater: (current: AutomationFormState) => AutomationFormState) => {
    latestForm = updater(latestForm);
  });
  const { rerender } = render(
    <I18nProvider initial="en">
      <SchedulePopover form={latestForm} setForm={setForm} timezones={['UTC', 'America/New_York']} onDone={onDone} />
    </I18nProvider>,
  );
  return {
    setForm,
    onDone,
    getForm: () => latestForm,
    // Re-renders with the latest applied form so a test can assert on
    // derived UI (active tab/weekday) after a change.
    sync: () =>
      rerender(
        <I18nProvider initial="en">
          <SchedulePopover form={latestForm} setForm={setForm} timezones={['UTC', 'America/New_York']} onDone={onDone} />
        </I18nProvider>,
      ),
  };
}

describe('SchedulePopover', () => {
  it('changing the minute input clamps and updates the form', () => {
    const form = { ...emptyForm(), kind: 'hourly' as const, minute: 5 };
    const { getForm } = renderPopover(form);

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '75' } });

    expect(getForm().minute).toBe(59);
  });

  it('picking a weekday updates the form and marks it active', () => {
    const form = { ...emptyForm(), kind: 'weekly' as const, weekday: 1 as const };
    const { getForm, sync } = renderPopover(form);

    fireEvent.click(screen.getByTitle('Wednesday'));
    expect(getForm().weekday).toBe(3);

    sync();
    expect(screen.getByTitle('Wednesday').className).toContain('is-active');
    expect(screen.getByTitle('Monday').className).not.toContain('is-active');
  });

  it('changing the time input updates the form', () => {
    const form = { ...emptyForm(), kind: 'daily' as const, time: '09:00' };
    const { getForm } = renderPopover(form);

    fireEvent.change(screen.getByDisplayValue('09:00'), { target: { value: '14:45' } });

    expect(getForm().time).toBe('14:45');
  });

  it('changing the timezone select updates the form', () => {
    const form = { ...emptyForm(), kind: 'daily' as const, timezone: 'UTC' };
    const { getForm } = renderPopover(form);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'America/New_York' } });

    expect(getForm().timezone).toBe('America/New_York');
  });

  it('clicking a schedule-kind tab switches kind', () => {
    const form = { ...emptyForm(), kind: 'daily' as const };
    const { getForm, sync } = renderPopover(form);

    fireEvent.click(screen.getByRole('tab', { name: 'Weekly' }));
    expect(getForm().kind).toBe('weekly');

    sync();
    expect(screen.getByRole('tab', { name: 'Weekly' }).className).toContain('is-active');
  });

  it('clicking Done calls onDone', () => {
    const form = { ...emptyForm(), kind: 'daily' as const };
    const { onDone } = renderPopover(form);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not render the weekday picker for a non-weekly kind', () => {
    renderPopover({ ...emptyForm(), kind: 'weekdays' as const });
    expect(screen.queryByLabelText('Weekdays')).toBeNull();
  });
});
