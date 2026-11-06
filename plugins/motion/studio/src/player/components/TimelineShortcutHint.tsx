import { useI18n } from "../../i18n/I18n";
import type { TimelineTheme } from "./timelineTheme";

interface TimelineShortcutHintProps {
  theme: TimelineTheme;
}

export function TimelineShortcutHint({ theme }: TimelineShortcutHintProps) {
  const { t } = useI18n();
  return (
    <div className="absolute bottom-2 right-3 pointer-events-none z-20">
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border"
        style={{ background: "var(--timeline-shortcut-bg)", borderColor: theme.gutterBorder }}
      >
        <kbd
          className="text-[9px] font-mono px-1 py-0.5 rounded-sm"
          style={{ color: theme.textSecondary, background: "var(--timeline-tick-minor)" }}
        >
          Shift
        </kbd>
        <span className="text-[9px]" style={{ color: theme.textSecondary }}>
          {t("+ drag/click to edit range")}</span>
      </div>
    </div>
  );
}
