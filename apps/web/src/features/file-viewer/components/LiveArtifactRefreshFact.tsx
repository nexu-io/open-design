// Dumb single stat row (label + relative/absolute value) for the live-artifact
// refresh history panel's "created" / "last updated" facts.
import { formatAbsoluteDateTime, formatRelativeTime } from '../formatters';
import type { Locale } from '../../../i18n/types';
import type { TranslateFn } from '../types';

export function LiveArtifactRefreshFact({
  label,
  iso,
  value,
  helper,
  emptyLabel,
  now,
  locale,
  t,
}: {
  label: string;
  iso?: string;
  value?: string;
  helper?: string;
  emptyLabel?: string;
  now?: number;
  locale?: Locale;
  t?: TranslateFn;
}) {
  const relative = iso !== undefined ? formatRelativeTime(iso, now, locale, t) : null;
  const absolute = iso !== undefined ? formatAbsoluteDateTime(iso) : null;
  const resolved = value ?? relative ?? emptyLabel ?? '—';
  const sub = helper ?? (iso !== undefined ? absolute ?? '' : '');
  return (
    <div className="live-artifact-refresh-fact">
      <span className="live-artifact-refresh-label">{label}</span>
      <span className="live-artifact-refresh-value" title={absolute ?? undefined}>
        {resolved}
      </span>
      {sub ? <span className="live-artifact-refresh-sub">{sub}</span> : null}
    </div>
  );
}
