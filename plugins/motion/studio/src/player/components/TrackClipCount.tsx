import { useI18n } from "../../i18n/I18n";
/**
 * How many clips the track holds, shown next to the track's identity so a
 * multi-clip track reads as one at a glance. A single-clip track shows nothing:
 * the clip bar already says "one", and the header stays low-density.
 */
export function TrackClipCount({ clipCount }: { clipCount: number }) {
  const { t } = useI18n();
  if (clipCount < 2) return null;
  return (
    <span
      aria-label={t("{clipCount} clips", { clipCount: clipCount })}
      title={t("{clipCount} clips", { clipCount: clipCount })}
      className="shrink-0 rounded-full bg-hover px-1 text-[9px] leading-[14px] tabular-nums text-text-muted"
    >
      {clipCount}
    </span>
  );
}
