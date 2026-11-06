import { useI18n } from "../../i18n/I18n";
import { HiddenToggleIcon, hiddenToggleVerb } from "../../player/components/hiddenToggle";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { ClipboardList, Film, Square, Type, X } from "../../icons/SystemIcons";

const ICON_BY_KIND = { text: Type, media: Film, other: Square } as const;
const ICON_COLOR_BY_KIND = {
  text: "text-accent-ink",
  media: "text-panel-media",
  other: "text-panel-container",
} as const;

import { keyHint, useStudioKeys } from "../../player/components/studioShortcuts";

export function PropertyPanelFlatHeader({
  name,
  meta,
  elementKind,
  hidden,
  asMute = false,
  onToggleHidden,
  copied,
  onCopy,
  onClear,
  onUngroup,
  showUngroup,
}: {
  name: string;
  meta: string;
  elementKind: "text" | "media" | "other";
  hidden: boolean;
  asMute?: boolean;
  onToggleHidden?: () => void;
  copied: boolean;
  onCopy: () => void;
  onClear: () => void;
  onUngroup?: () => void;
  showUngroup: boolean;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const Icon = ICON_BY_KIND[elementKind];
  const visibilityLabel = t("{value0} element", { value0: hiddenToggleVerb(asMute, hidden) });

  return (
    <div className="flex items-center gap-2.5 border-b border-panel-hairline px-4 py-3">
      <Icon
        size={15}
        data-flat-header-icon="true"
        className={`shrink-0 ${ICON_COLOR_BY_KIND[elementKind]}`}
      />
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate text-[13px] font-semibold text-panel-text-0">{name}</span>
        <span className="truncate font-mono text-[10px] text-panel-text-4">{meta}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5 text-panel-text-3">
        {showUngroup && (
          <button
            type="button"
            aria-label={t("Ungroup")}
            title={t("Ungroup ({value0})", { value0: keyHint("ungroup", useStudioKeys()) })}
            onClick={() => {
              track("button", "Ungroup");
              onUngroup?.();
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="1.5" y="1.5" width="7" height="7" rx="1" />
              <rect x="7.5" y="7.5" width="7" height="7" rx="1" />
            </svg>
          </button>
        )}
        {onToggleHidden && (
          <button
            type="button"
            aria-label={visibilityLabel}
            title={visibilityLabel}
            onClick={() => {
              track("toggle", "Element visibility");
              onToggleHidden();
            }}
          >
            <HiddenToggleIcon asMute={asMute} hidden={hidden} size={13} />
          </button>
        )}
        <button
          type="button"
          aria-label={t("Copy element info to clipboard")}
          title={copied ? t("Copied!") : t("Copy element info for any AI agent")}
          onClick={() => {
            track("button", "Copy element info");
            onCopy();
          }}
          className={copied ? "text-accent-ink" : undefined}
        >
          <ClipboardList size={13} />
        </button>
        <button
          type="button"
          aria-label={t("Clear selection")}
          onClick={() => {
            track("button", "Clear selection");
            onClear();
          }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
