import { useI18n } from "../../i18n/I18n";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { HF_AUDIO_FX_ATTR } from "@hyperframes/core/audio-fx";
import { HF_COLOR_GRADING_ATTR } from "@hyperframes/core/color-grading";
import type { TimelineElement } from "../store/playerStore";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import { useCropPresetBarStore } from "../../components/editor/cropPresetStore";
import {
  CHARACTER_CHOICES,
  LOOK_CHOICES,
  VOICE_CHOICES,
  activeLook,
  activeVoicePreset,
  chainWithVoicePreset,
  lookAttrValue,
  type ClipToolChoice,
} from "./clipToolAttrs";
import { useClipToolState } from "./useClipToolState";
import { menuClasses } from "../../components/ui/menuStyle";

export type ClipMenuToolGroup = "time" | "sound" | "picture";

interface ClipMenuToolItemsProps {
  group: ClipMenuToolGroup;
  element: TimelineElement;
  currentTime: number;
  onClose: () => void;
}

const ROW_CLASS = `${menuClasses.row} flex items-center justify-between ${menuClasses.rowEnabled}`;
const DISABLED_ROW_CLASS = `${menuClasses.row} flex items-center justify-between ${menuClasses.rowDisabled}`;
const SUBMENU_WIDTH = 170;
const HOVER_PREVIEW_DELAY_MS = 80;

interface HoverPreview {
  apply: (id: string | null) => void;
  clear: () => void;
}

function useHoverPreview(preview: HoverPreview | undefined) {
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const cancelTimer = () => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const end = () => {
    cancelTimer();
    if (!activeRef.current) return;
    activeRef.current = false;
    previewRef.current?.clear();
  };
  const settle = () => {
    cancelTimer();
    activeRef.current = false;
  };
  const start = (id: string | null) => {
    if (!previewRef.current) return;
    cancelTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      activeRef.current = true;
      previewRef.current?.apply(id);
    }, HOVER_PREVIEW_DELAY_MS);
  };

  useEffect(() => end, []);
  return { start, end, settle };
}

interface ChoiceSection {
  heading?: string;
  choices: readonly ClipToolChoice[];
}

function focusSibling(menu: HTMLElement | null, step: number): void {
  if (!menu) return;
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
  const index = items.findIndex((item) => item === document.activeElement);
  items[(index + step + items.length) % items.length]?.focus();
}

function ChoiceSubmenu({
  label,
  sections,
  activeId,
  onPick,
  preview,
}: {
  label: string;
  sections: readonly ChoiceSection[];
  activeId: string | null;
  onPick: (id: string | null) => void;
  preview?: HoverPreview;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const hover = useHoverPreview(preview);
  const openingFocusRef = useRef(false);

  const hideSubmenu = () => {
    hover.end();
    setOpen(false);
  };

  const show = (focusFirst: boolean) => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (rect)
      setAnchor(
        rect.right + SUBMENU_WIDTH > window.innerWidth
          ? { top: rect.top, right: window.innerWidth - rect.left }
          : { top: rect.top, left: rect.right },
      );
    setOpen(true);
    if (!focusFirst) return;
    openingFocusRef.current = true;
    requestAnimationFrame(() => {
      focusSibling(submenuRef.current, 1);
      openingFocusRef.current = false;
    });
  };

  const onSubmenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      focusSibling(submenuRef.current, event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      hideSubmenu();
      rowRef.current?.focus();
    }
  };

  const choiceRow = (id: string | null, text: string) => (
    <button
      key={id ?? "none"}
      type="button"
      role="menuitemradio"
      aria-checked={activeId === id}
      className={ROW_CLASS}
      onClick={() => {
        hover.settle();
        onPick(id);
      }}
      onMouseEnter={() => hover.start(id)}
      onFocus={() => {
        if (openingFocusRef.current) openingFocusRef.current = false;
        else hover.start(id);
      }}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="w-3 text-center">
          {activeId === id ? "✓" : ""}
        </span>
        {text}
      </span>
    </button>
  );

  return (
    <div className="relative" onMouseEnter={() => show(false)} onMouseLeave={hideSubmenu}>
      <button
        ref={rowRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        className={ROW_CLASS}
        onClick={() => show(true)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight") return;
          event.preventDefault();
          show(true);
        }}
      >
        <span>{label}</span>
        <span className="text-neutral-500 text-[10px] ml-3">▸</span>
      </button>
      {open && (
        <div
          ref={submenuRef}
          role="menu"
          aria-label={label}
          className={`${menuClasses.panel} fixed z-10`}
          style={{ width: SUBMENU_WIDTH, ...anchor }}
          onKeyDown={onSubmenuKeyDown}
        >
          {choiceRow(null, "None")}
          {sections.map((section, index) => (
            <div key={section.heading ?? index}>
              {section.heading && (
                <>
                  <div className={menuClasses.divider} />
                  <div className="px-3 py-1 text-[9px] uppercase tracking-wide text-neutral-500">
                    {section.heading}
                  </div>
                </>
              )}
              {section.choices.map((choice) => choiceRow(choice.id, choice.label))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const VOICE_SECTIONS: readonly ChoiceSection[] = [
  { choices: VOICE_CHOICES },
  { heading: "Character", choices: CHARACTER_CHOICES },
];
const LOOK_SECTIONS: readonly ChoiceSection[] = [{ choices: LOOK_CHOICES }];

function isPictureClip(tag: string): boolean {
  return tag === "video" || tag === "img";
}

function FreezeFrameItem({ element, currentTime, onClose }: Omit<ClipMenuToolItemsProps, "group">) {
  const { t } = useI18n();
  const { onFreezeFrame } = useTimelineEditContextOptional();
  if (!onFreezeFrame || element.tag.trim().toLowerCase() !== "video") return null;
  const inside = currentTime > element.start && currentTime < element.start + element.duration;
  return (
    <button
      type="button"
      role="menuitem"
      className={inside ? ROW_CLASS : DISABLED_ROW_CLASS}
      disabled={!inside}
      onClick={() => {
        void onFreezeFrame(element, currentTime);
        onClose();
      }}
    >
      <span>{inside ? t("Freeze frame") : t("Freeze frame (move playhead inside clip)")}</span>
    </button>
  );
}

/** Freeze (time), Voice (sound), Look and Crop (picture). */
export function ClipMenuToolItems(props: ClipMenuToolItemsProps) {
  if (props.group === "time") return <FreezeFrameItem {...props} />;
  return <ClipMenuAttributeItems {...props} />;
}

function ClipMenuAttributeItems({ group, element, onClose }: ClipMenuToolItemsProps) {
  const { t } = useI18n();
  const { onSetElementAttributeQuiet, onSetElementAttributeLive, onRevertElementAttributeLive } =
    useTimelineEditContextOptional();
  const state = useClipToolState(element);
  const openCropBar = useCropPresetBarStore((s) => s.open);
  if (!onSetElementAttributeQuiet) return null;

  const write = (attr: string, value: string | null, label: string) => {
    void onSetElementAttributeQuiet(element, attr, value, label);
    onClose();
  };

  if (group === "sound") {
    if (!state.hasSound) return null;
    return (
      <>
        <ChoiceSubmenu
          label={t("Voice")}
          sections={VOICE_SECTIONS}
          activeId={activeVoicePreset(state.fxChain)}
          onPick={(id) =>
            write(HF_AUDIO_FX_ATTR, chainWithVoicePreset(state.fxChain, id), "Voice preset")
          }
        />
      </>
    );
  }

  if (!isPictureClip(state.tag)) return null;
  const lookPreview =
    onSetElementAttributeLive && onRevertElementAttributeLive
      ? {
          apply: (id: string | null) =>
            onSetElementAttributeLive(element, HF_COLOR_GRADING_ATTR, lookAttrValue(id)),
          clear: () => onRevertElementAttributeLive(element, HF_COLOR_GRADING_ATTR),
        }
      : undefined;
  return (
    <>
      <ChoiceSubmenu
        label={t("Look")}
        sections={LOOK_SECTIONS}
        activeId={activeLook(state.colorGrading)}
        onPick={(id) => write(HF_COLOR_GRADING_ATTR, lookAttrValue(id), "Look")}
        preview={lookPreview}
      />
      <button
        type="button"
        role="menuitem"
        className={ROW_CLASS}
        onClick={() => {
          openCropBar({ hfId: element.hfId, id: element.domId ?? element.id });
          onClose();
        }}
      >
        <span>{t("Crop")}</span>
      </button>
    </>
  );
}
