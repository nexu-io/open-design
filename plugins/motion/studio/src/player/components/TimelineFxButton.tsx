import { useI18n } from "../../i18n/I18n";
/**
 * The FX entry point from the timeline (C1) — a track or group header button
 * that opens the same preset shelf the property panel's rack uses, without
 * requiring a trip through the panel first.
 *
 * Rendered on group rows and on track rows holding exactly one audio clip
 * (see `plans/audio-mixer-groups.md` §1.6 and the execution runbook's C1 step
 * — a track with several ungrouped clips has no single chain to point at, so
 * it gets the grouping pointer instead of the popover).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTimelineReadOnlyPress } from "./timelineReadOnly";
import {
  enabledAudioFxNodes,
  parseAudioFxChain,
  type HfAudioFxChain,
} from "@hyperframes/core/audio-fx";
import type { HfAudioNameKind } from "@hyperframes/core/audio-carve";
import { TimelineFxPopover } from "../../components/editor/TimelineFxPopover.js";
import { resolveFloatingPanelPosition } from "../../components/editor/floatingPanel.js";
import {
  useAuditionTransport,
  type AuditionSpan,
} from "../../components/editor/useAuditionTransport.js";

/**
 * Naming a group is the moment the whole feature is explained.
 *
 * The design doc calls the sentence below "the highest-leverage copy in this
 * plan and it should be written before the routing is" — it is the concept of a
 * submix bus delivered without the word, to an author who has never met one.
 * The old pointer skipped both the name and the sentence: it made an
 * auto-named group on one click and said only "Group these clips to add effects
 * to all of them", which leaves out the shared volume entirely.
 */
// Estimated, like FORMAT_PANEL_SIZE in RenderQueue: `w-64` is exact, and only
// the flip decision uses the height — the clamp keeps the dialog on screen
// either way.
const GROUP_DIALOG_SIZE = { width: 256, height: 160 };

/** Where the grouping dialog goes: flipped above the anchor when there is no
 *  room below, and clamped so neither edge leaves the viewport. This button
 *  lives in a track header at the BOTTOM of the studio window, so an unclamped
 *  `anchorRect.bottom + 4` opened it past the viewport edge and read as "the
 *  grouping button did nothing". */
function groupDialogPosition(anchorRect: DOMRect): { left: number; top: number } {
  const { left, top } = resolveFloatingPanelPosition(
    anchorRect,
    { width: window.innerWidth, height: window.innerHeight },
    GROUP_DIALOG_SIZE,
    { offset: 4 },
  );
  return { left, top };
}

function GroupNameDialog({
  anchorRect,
  clipCount,
  defaultLabel,
  refusal,
  onCancel,
  onConfirm,
}: {
  anchorRect: DOMRect;
  clipCount: number;
  defaultLabel?: string;
  refusal?: string;
  onCancel: () => void;
  onConfirm: (label: string) => void;
}) {
  const { t } = useI18n();
  const [label, setLabel] = useState(defaultLabel ?? "Voiceover");
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Focused on open so the name can be typed over without a second click —
  // the field is the only thing here that wants input.
  useEffect(() => inputRef.current?.select(), []);
  if (refusal) {
    return (
      <div
        role="dialog"
        aria-label={t("This track cannot be grouped")}
        className="z-200 w-64 rounded-md border border-[var(--timeline-tick-major)] bg-[var(--timeline-dialog-bg)] p-3 text-[11px] leading-snug text-[var(--timeline-text-soft)] shadow-xl"
        style={{ position: "fixed", ...groupDialogPosition(anchorRect) }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onCancel();
        }}
      >
        <p>{refusal}</p>
      </div>
    );
  }
  const confirm = () => onConfirm(label.trim() || defaultLabel || "Voiceover");
  return (
    <div
      role="dialog"
      aria-label={t("Name this group")}
      className="z-200 w-64 rounded-md border border-[var(--timeline-tick-major)] bg-[var(--timeline-dialog-bg)] p-3 text-[11px] text-[var(--timeline-text-soft)] shadow-xl"
      style={{ position: "fixed", ...groupDialogPosition(anchorRect) }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
        if (event.key === "Enter") confirm();
      }}
    >
      <p className="mb-1.5 font-medium text-[var(--timeline-text-solid)]">{t("Name this group")}</p>
      <input
        ref={inputRef}
        type="text"
        aria-label={t("Group name")}
        value={label}
        onChange={(event) => setLabel(event.currentTarget.value)}
        className="w-full rounded-sm border border-[var(--timeline-border-strong)] bg-[var(--timeline-input-bg)] px-1.5 py-1 text-[11px] text-[var(--timeline-text-solid)] outline-hidden focus:border-[var(--timeline-accent)]"
      />
      {/* The sentence. No jargon, and it names both things a bus does. */}
      <p className="mt-2 leading-snug">
        {t("Effects you add to the group apply to")}{" "}{clipCount === 2 ? t("both") : t("all {clipCount}", { clipCount: clipCount })} {t("clips at once, and they share one volume.")}</p>
      <div className="mt-2.5 flex justify-end gap-1.5">
        <button
          type="button"
          className="rounded-sm border border-[var(--timeline-border-strong)] px-2 py-1 text-[10px] text-[var(--timeline-text-soft)] hover:bg-[var(--timeline-tick-major)]"
          onClick={onCancel}
        >
          {t("Cancel")}</button>
        <button
          type="button"
          className="rounded-sm border border-[var(--timeline-accent)] bg-[var(--timeline-accent-button-bg)] px-2 py-1 text-[10px] font-semibold text-[var(--timeline-accent)] hover:bg-[var(--timeline-accent-hover)]"
          onClick={confirm}
        >
          {t("Group")}</button>
      </div>
    </div>
  );
}

function parseFxChainOrEmpty(raw: string | undefined): HfAudioFxChain {
  if (!raw) return { version: 1, nodes: [] };
  try {
    return parseAudioFxChain(raw);
  } catch {
    return { version: 1, nodes: [] };
  }
}

interface TimelineFxButtonChainProps {
  variant?: "chain";
  trackKind?: HfAudioNameKind;
  onOpenRack: () => void;
  fxChainRaw: string | undefined;
  onChainChange: (next: HfAudioFxChain) => void;
  onChainPreview?: (next: HfAudioFxChain, ended?: boolean) => void;
  /** The clips this chain is heard through, so an audition starts where they
   *  actually sound rather than from a playhead parked before the first. */
  auditionSpans?: readonly AuditionSpan[];
  /** Whether this target is muted right now. */
  isMuted?: boolean;
  /** Set this target's mute on the running graph WITHOUT touching the document,
   *  so an audition can lift a mute and put it back. Hovering a preset on a
   *  muted bus is a question about the preset, not about the mute. */
  onSetMutedLive?: (muted: boolean) => void;
}

interface TimelineFxButtonGroupPointerProps {
  variant: "group-pointer";
  /** Create the group under this name. */
  onGroupClips: (label: string) => void;
  /** How many clips are about to be grouped, for the copy that explains it. */
  clipCount: number;
  /** Seeded into the name field — "Voiceover" per the design's own mockup. */
  defaultLabel?: string;
  /** Why this track cannot be grouped at all. Present, the dialog states the
   *  limit instead of offering a name field — groups are audio-only in v1
   *  (§1.4), and the doc is explicit that a deliberate limit has to be said:
   *  "silent ones just send authors hunting for something that was never
   *  built." */
  refusal?: string;
}

type TimelineFxButtonProps = TimelineFxButtonChainProps | TimelineFxButtonGroupPointerProps;

export function TimelineFxButton(props: TimelineFxButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  // Owned here rather than threaded from each caller: both timeline call sites
  // want the same thing, and neither passed one, so hovering a preset in this
  // popover was silent unless the transport already happened to be running.
  const transport = useAuditionTransport();
  /** Whether THIS audition lifted a mute, so only it puts one back. */
  const borrowedMute = useRef(false);
  const readOnlyPress = useTimelineReadOnlyPress();

  const openAt = () => {
    if (readOnlyPress) return readOnlyPress();
    setAnchorRect(buttonRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  };

  if (props.variant === "group-pointer") {
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          tabIndex={-1}
          ref={buttonRef}
          aria-label={t("Effects: group these clips first")}
          title={t("Group these clips to add effects to all of them")}
          className="flex h-6 items-center justify-center rounded-sm border-0 bg-transparent px-1 text-[10px] font-semibold text-[var(--timeline-text-faint)] hover:text-[var(--timeline-text-soft)]"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            openAt();
          }}
        >
          FX
        </button>
        {open &&
          anchorRect &&
          createPortal(
            <GroupNameDialog
              refusal={props.refusal}
              anchorRect={anchorRect}
              clipCount={props.clipCount}
              defaultLabel={props.defaultLabel}
              onCancel={() => setOpen(false)}
              onConfirm={(label) => {
                setOpen(false);
                props.onGroupClips(label);
              }}
            />,
            document.body,
          )}
      </div>
    );
  }

  const chain = parseFxChainOrEmpty(props.fxChainRaw);
  const nodeCount = enabledAudioFxNodes(chain).length;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        tabIndex={-1}
        ref={buttonRef}
        aria-label={nodeCount > 0 ? t("Effects: {nodeCount} applied", { nodeCount: nodeCount }) : t("Effects")}
        title={t("Effects")}
        className={`flex h-6 items-center justify-center gap-0.5 rounded border-0 bg-transparent px-1 text-[10px] font-semibold transition-colors ${
          open || nodeCount > 0
            ? "text-[var(--timeline-accent)]"
            : "text-[var(--timeline-text-faint)] hover:text-[var(--timeline-text-soft)]"
        }`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          openAt();
        }}
      >
        FX{nodeCount > 0 ? ` ${nodeCount}` : ""}
      </button>
      {open &&
        anchorRect &&
        createPortal(
          <TimelineFxPopover
            anchorRect={anchorRect}
            chain={chain}
            trackKind={props.trackKind}
            onClose={() => setOpen(false)}
            onChainChange={props.onChainChange}
            onChainPreview={props.onChainPreview}
            onAuditionTransport={(on) => {
              // Read on the way IN and remembered: the live unmute flows back
              // into the row's props, so by the time the audition ends the
              // target no longer looks muted and the mute would never return.
              if (on) borrowedMute.current = props.isMuted === true;
              if (borrowedMute.current) props.onSetMutedLive?.(!on);
              if (!on) borrowedMute.current = false;
              transport(on, props.auditionSpans);
            }}
            onOpenRack={props.onOpenRack}
          />,
          document.body,
        )}
    </div>
  );
}
