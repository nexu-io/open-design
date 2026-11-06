import { useI18n } from "../../i18n/I18n";
import { memo, type MouseEvent } from "react";
import type { TimelineElement } from "../store/playerStore";
import { clipVolumeBadge, readClipEffects } from "./clipToolAttrs";
import { useClipToolState } from "./useClipToolState";

function SpeakerGlyph({ muted }: { muted: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
      {muted ? (
        <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" strokeWidth="1.4" />
      ) : (
        <path
          d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9"
          stroke="currentColor"
          fill="none"
          strokeWidth="1.4"
        />
      )}
    </svg>
  );
}

const BADGE_CLASS =
  "timeline-clip__badge inline-flex items-center gap-0.5 rounded-[3px] border bg-black/55 px-1 text-[9px] leading-[14px] whitespace-nowrap";
const FX_ON = "border-white/40 text-white font-semibold";
const FX_OFF = "border-white/10 text-white/60";

/** Premiere's fx badge — grey with no effects, white with any; hover lists them, click opens the clip menu. */
export const ClipBadges = memo(function ClipBadges({
  el,
  onOpenMenu,
}: {
  el: TimelineElement;
  onOpenMenu?: (event: MouseEvent) => void;
}) {
  const { t } = useI18n();
  const state = useClipToolState(el);
  const effects = readClipEffects(state);
  const volume = clipVolumeBadge(state);
  const hasEffects = effects.length > 0;
  const openMenu = (event: MouseEvent) => {
    event.stopPropagation();
    onOpenMenu?.(event);
  };
  return (
    <span
      className="pointer-events-none absolute right-1.5 top-0.5 z-[31] flex max-w-[calc(100%-12px)] gap-1 overflow-hidden"
      data-testid="clip-badges"
    >
      {volume && (
        <span
          className={`${BADGE_CLASS} min-w-0 overflow-hidden border-white/20 text-white/90`}
          title={volume}
          data-badge="volume"
        >
          <SpeakerGlyph muted={volume === "Muted"} />
          {volume === "Muted" ? null : <span className="truncate">{volume}</span>}
        </span>
      )}
      <span
        className={`${BADGE_CLASS} pointer-events-auto shrink-0 cursor-pointer ${hasEffects ? FX_ON : FX_OFF}`}
        title={hasEffects ? effects.join(" · ") : t("No effects")}
        data-badge="fx"
        data-fx-active={hasEffects ? "true" : "false"}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={openMenu}
        onContextMenu={openMenu}
      >
        fx
      </span>
    </span>
  );
});
