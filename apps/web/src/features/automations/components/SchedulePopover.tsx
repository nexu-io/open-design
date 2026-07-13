import { useT } from '../../../i18n';
import { SCHEDULE_KINDS, WEEKDAYS } from '../constants';
import { tzCityLabel, weekdayLongLabel, weekdayShortLabel } from '../formatters';
import { clampMinute } from '../rules';
import type { AutomationFormState } from '../types';

export function SchedulePopover({
  form,
  setForm,
  timezones,
  onDone,
}: {
  form: AutomationFormState;
  setForm: (updater: (current: AutomationFormState) => AutomationFormState) => void;
  timezones: string[];
  onDone: () => void;
}) {
  const t = useT();

  return (
    <div className="automation-popover automation-popover--schedule">
      <div className="automation-popover__kinds" role="tablist">
        {SCHEDULE_KINDS.map((k) => (
          <button
            type="button"
            key={k.kind}
            role="tab"
            aria-selected={form.kind === k.kind}
            className={`automation-popover__kind${form.kind === k.kind ? ' is-active' : ''}`}
            onClick={() => setForm((current) => ({ ...current, kind: k.kind }))}
          >
            {t(k.labelKey)}
          </button>
        ))}
      </div>

      {form.kind === 'hourly' ? (
        <label className="automation-popover__field">
          <span>{t('routines.fieldMinute')}</span>
          <input
            type="number"
            min={0}
            max={59}
            step={1}
            value={form.minute}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                minute: clampMinute(Number(e.target.value)),
              }))
            }
          />
        </label>
      ) : (
        <>
          {form.kind === 'weekly' ? (
            <div className="automation-popover__weekdays" aria-label={t('routines.kind.weekdays')}>
              {WEEKDAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`automation-popover__weekday${form.weekday === d ? ' is-active' : ''}`}
                  onClick={() => setForm((current) => ({ ...current, weekday: d }))}
                  title={weekdayLongLabel(d, t)}
                >
                  {weekdayShortLabel(d, t)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="automation-popover__row">
            <label className="automation-popover__field">
              <span>{t('routines.fieldTime')}</span>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm((current) => ({ ...current, time: e.target.value }))}
              />
            </label>
            <label className="automation-popover__field">
              <span>{t('routines.fieldTimezone')}</span>
              <select
                value={form.timezone}
                onChange={(e) => setForm((current) => ({ ...current, timezone: e.target.value }))}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tzCityLabel(tz)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}

      <div className="automation-popover__done">
        <button type="button" className="automation-popover__done-btn" onClick={onDone}>
          {t('tasks.filter.done')}
        </button>
      </div>
    </div>
  );
}
