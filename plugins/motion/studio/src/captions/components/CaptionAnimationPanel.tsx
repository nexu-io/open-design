import { useI18n } from "../../i18n/I18n";
import { memo, useCallback } from "react";
import { useCaptionStore } from "../store";
import type { CaptionAnimation } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTRANCE_PRESETS = [
  "none",
  "fade",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "pop",
  "slam",
  "bounce",
  "typewriter",
  "blur-in",
  "flip",
  "drop",
];

const HIGHLIGHT_PRESETS = [
  "none",
  "color-change",
  "scale-pop",
  "glow-pulse",
  "underline-sweep",
  "background-fill",
  "bounce",
];

const EXIT_PRESETS = [
  "none",
  "fade",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "scatter",
  "drop",
  "collapse",
  "blur-out",
  "shrink",
];

const EASE_PRESETS = [
  "power1.out",
  "power2.out",
  "power3.out",
  "power4.out",
  "power1.in",
  "power2.in",
  "power3.in",
  "power1.inOut",
  "power2.inOut",
  "back.out(1.7)",
  "elastic.out(1,0.3)",
  "bounce.out",
];

import { Section, Row, inputCls, NumberField } from "./shared";

// Animation edits currently mutate only the in-memory model: they are not
// applied to the preview and not serialized by buildOverrides, so tuning them
// would be editing blind. Controls stay visible (so the capability is
// discoverable) but disabled until the apply/persist pipeline exists.
const ANIMATION_PIPELINE_WIRED = false;

// ---------------------------------------------------------------------------
// Animation phase controls
// ---------------------------------------------------------------------------

interface AnimationPhaseProps {
  label: string;
  presets: string[];
  animation: CaptionAnimation | null;
  showIntensity?: boolean;
  disabled?: boolean;
  onChange: (update: Partial<CaptionAnimation>) => void;
}

function AnimationPhase({
  label,
  presets,
  animation,
  showIntensity,
  disabled,
  onChange,
}: AnimationPhaseProps) {
  const { t } = useI18n();
  const preset = animation?.preset ?? "none";
  const duration = animation?.duration ?? 0.2;
  const ease = animation?.ease ?? "power2.out";
  const stagger = animation?.stagger ?? 0;
  const intensity = animation?.intensity ?? 1;

  return (
    <Section label={label}>
      <Row label={t("Preset")}>
        <select
          value={preset}
          disabled={disabled}
          aria-label={t("{label} preset", { label: label })}
          onChange={(e) => onChange({ preset: e.target.value })}
          className={inputCls}
        >
          {presets.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Row>

      <Row label={t("Duration")}>
        <NumberField
          value={duration}
          step={0.05}
          min={0}
          max={2}
          disabled={disabled}
          ariaLabel={`${label} duration`}
          onCommit={(v) => onChange({ duration: v })}
        />
      </Row>

      <Row label={t("Ease")}>
        <select
          value={ease}
          disabled={disabled}
          aria-label={t("{label} ease", { label: label })}
          onChange={(e) => onChange({ ease: e.target.value })}
          className={inputCls}
        >
          {EASE_PRESETS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </Row>

      <Row label={t("Stagger")}>
        <NumberField
          value={stagger}
          step={0.02}
          min={0}
          max={0.5}
          disabled={disabled}
          ariaLabel={`${label} stagger`}
          onCommit={(v) => onChange({ stagger: v })}
        />
      </Row>

      {showIntensity && (
        <Row label={t("Intensity")}>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={intensity}
              disabled={disabled}
              aria-label={t("{label} intensity", { label: label })}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onChange({ intensity: v });
              }}
              className="flex-1 accent-studio-accent disabled:opacity-40"
            />
            <span className="text-2xs text-neutral-400 font-mono w-8 text-right shrink-0">
              {intensity.toFixed(2)}
            </span>
          </div>
        </Row>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const CaptionAnimationPanel = memo(function CaptionAnimationPanel() {
  const { t } = useI18n();
  const model = useCaptionStore((s) => s.model);
  const selectedGroupId = useCaptionStore((s) => s.selectedGroupId);
  const selectedSegmentIds = useCaptionStore((s) => s.selectedSegmentIds);
  const updateGroupAnimation = useCaptionStore((s) => s.updateGroupAnimation);
  const applyAnimationToAll = useCaptionStore((s) => s.applyAnimationToAll);

  // Resolve which group to edit
  let resolvedGroupId: string | null = selectedGroupId;
  if (!resolvedGroupId && model && selectedSegmentIds.size > 0) {
    const firstSegmentId = [...selectedSegmentIds][0];
    if (firstSegmentId) {
      for (const [gid, group] of model.groups) {
        if (group.segmentIds.includes(firstSegmentId)) {
          resolvedGroupId = gid;
          break;
        }
      }
    }
  }

  const group = resolvedGroupId ? model?.groups.get(resolvedGroupId) : undefined;
  const animation = group?.animation;

  // All hooks must be called before any early return
  const handleEntranceChange = useCallback(
    (update: Partial<CaptionAnimation>) => {
      if (resolvedGroupId) updateGroupAnimation(resolvedGroupId, "entrance", update);
    },
    [resolvedGroupId, updateGroupAnimation],
  );

  const handleHighlightChange = useCallback(
    (update: Partial<CaptionAnimation>) => {
      if (resolvedGroupId) updateGroupAnimation(resolvedGroupId, "highlight", update);
    },
    [resolvedGroupId, updateGroupAnimation],
  );

  const handleExitChange = useCallback(
    (update: Partial<CaptionAnimation>) => {
      if (resolvedGroupId) updateGroupAnimation(resolvedGroupId, "exit", update);
    },
    [resolvedGroupId, updateGroupAnimation],
  );

  const handleApplyToAll = useCallback(() => {
    if (animation) applyAnimationToAll(animation);
  }, [animation, applyAnimationToAll]);

  // Empty state — after all hooks
  if (!group || !resolvedGroupId || !animation) {
    return (
      <div className="flex items-center justify-center h-full px-4 text-center">
        <p className="text-xs text-neutral-500">{t("Select a caption word to edit animations")}</p>
      </div>
    );
  }

  const gated = !ANIMATION_PIPELINE_WIRED;

  return (
    <div className="flex flex-col h-full min-h-0">
      {gated && (
        <div className="shrink-0 mx-3 mt-2 px-2 py-1.5 rounded-sm border border-amber-500/30 bg-amber-500/10">
          <p className="text-2xs text-warning-ink leading-snug">
            {t("Animation editing isn't applied to playback or saved yet, so these controls are disabled.")}</p>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <AnimationPhase
          label={t("Entrance")}
          presets={ENTRANCE_PRESETS}
          animation={animation.entrance}
          disabled={gated}
          onChange={handleEntranceChange}
        />

        <AnimationPhase
          label={t("Highlight")}
          presets={HIGHLIGHT_PRESETS}
          animation={animation.highlight}
          showIntensity
          disabled={gated}
          onChange={handleHighlightChange}
        />

        <AnimationPhase
          label={t("Exit")}
          presets={EXIT_PRESETS}
          animation={animation.exit}
          disabled={gated}
          onChange={handleExitChange}
        />
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 py-2 border-t border-neutral-800">
        <button
          type="button"
          onClick={handleApplyToAll}
          disabled={gated}
          title={gated ? t("Disabled until animation editing is applied to playback") : undefined}
          className="w-full py-1.5 rounded-sm border border-neutral-700 text-2xs text-neutral-300 hover:border-studio-accent/50 hover:text-accent-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-neutral-700 disabled:hover:text-neutral-300"
        >
          {t("Apply to all groups")}</button>
      </div>
    </div>
  );
});
