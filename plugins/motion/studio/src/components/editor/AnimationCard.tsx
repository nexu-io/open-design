import { useI18n } from "../../i18n/I18n";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { SUPPORTED_EASES, SUPPORTED_PROPS } from "@hyperframes/core/gsap-constants";
import { trackStudioSegmentEaseEdit } from "../../telemetry/events";
import { RESPONSIVE_GRID } from "./propertyPanelHelpers";
import { MetricField, SelectField } from "./propertyPanelPrimitives";
import { controlPointsForGsapEase } from "./studioMotion";
import { EASE_LABELS, METHOD_LABELS, METHOD_TOOLTIPS, PROP_LABELS } from "./gsapAnimationConstants";
import { buildTweenSummary, uniformSegmentEase } from "./gsapAnimationHelpers";
import { keyframedTweenEases } from "../../utils/gsapKeyframeEases";
import { EaseCurveSection } from "./EaseCurveSection";
import { ArcPathControls } from "./ArcPathControls";
import type { GsapAnimationEditCallbacks } from "./gsapAnimationCallbacks";
import { ComputedTweenNotice } from "./ComputedTweenNotice";
import { KeyframeEaseList } from "./KeyframeEaseList";
import {
  PropertyRow,
  AddPropertyTrigger,
  parseNumericOrString,
  BOOLEAN_PROPS,
} from "./AnimationCardParts";
import type { AnimationKeyframeTarget } from "../../hooks/gsapTweenSynth";

interface AnimationCardProps extends GsapAnimationEditCallbacks {
  animation: GsapAnimation;
  defaultExpanded: boolean;
  flat?: boolean;
  focusedSegment?: {
    tweenPercentage: number;
    collidingAnimationTargets?: AnimationKeyframeTarget[];
  } | null;
  onFocusSegmentConsumed?: () => void;
}

const easeDisplayName = (ease: string) =>
  ease.startsWith("custom(") ? "Custom curve" : (EASE_LABELS[ease] ?? ease);

// fallow-ignore-next-line complexity
export const AnimationCard = memo(function AnimationCard({
  animation,
  defaultExpanded,
  flat,
  focusedSegment,
  onFocusSegmentConsumed,
  onUpdateProperty,
  onUpdateMeta,
  onDeleteAnimation,
  onAddProperty,
  onRemoveProperty,
  onUpdateFromProperty,
  onAddFromProperty,
  onRemoveFromProperty,
  onLivePreview,
  onLivePreviewEnd,
  onSetArcPath,
  onUpdateArcSegment,
  onUpdateKeyframeEase,
  onUpdateSegmentEase,
  onSetAllKeyframeEases,
  onUnroll,
}: AnimationCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [addingProp, setAddingProp] = useState(false);
  const [addingFromProp, setAddingFromProp] = useState(false);
  const [expandedKfPct, setExpandedKfPct] = useState<number | null>(null);
  const [focusedCollidingAnimationTargets, setFocusedCollidingAnimationTargets] = useState<
    AnimationKeyframeTarget[] | undefined
  >();
  const cardRef = useRef<HTMLDivElement>(null);
  const pendingAutoScrollRef = useRef(false);

  useEffect(() => {
    if (!focusedSegment) return;
    setExpanded(true);
    pendingAutoScrollRef.current = true;
    setExpandedKfPct(focusedSegment.tweenPercentage);
    setFocusedCollidingAnimationTargets(focusedSegment.collidingAnimationTargets);
    onFocusSegmentConsumed?.();
  }, [focusedSegment, onFocusSegmentConsumed]);

  useEffect(() => {
    if (!pendingAutoScrollRef.current || expandedKfPct === null) return;
    const segment = cardRef.current?.querySelector<HTMLElement>(
      `[data-ease-segment-pct="${expandedKfPct}"]`,
    );
    segment?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    pendingAutoScrollRef.current = false;
  }, [expandedKfPct]);

  const usedProps = useMemo(
    () => new Set(Object.keys(animation.properties)),
    [animation.properties],
  );
  const availableProps = useMemo(
    () =>
      SUPPORTED_PROPS.filter(
        (p) => !usedProps.has(p) && (animation.method === "set" || !BOOLEAN_PROPS.has(p)),
      ),
    [usedProps, animation.method],
  );

  const usedFromProps = useMemo(
    () => new Set(Object.keys(animation.fromProperties ?? {})),
    [animation.fromProperties],
  );
  const availableFromProps = useMemo(
    () => SUPPORTED_PROPS.filter((p) => !usedFromProps.has(p) && !BOOLEAN_PROPS.has(p)),
    [usedFromProps],
  );

  const commitProperty = useCallback(
    (prop: string, raw: string) => {
      const value = parseNumericOrString(raw);
      onUpdateProperty(animation.id, prop, value);
      onLivePreviewEnd?.();
    },
    [animation.id, onUpdateProperty, onLivePreviewEnd],
  );

  const scrubProperty = useCallback(
    (prop: string, raw: string) => {
      onLivePreview?.(prop, parseNumericOrString(raw));
    },
    [onLivePreview],
  );

  const commitFromProperty = useCallback(
    (prop: string, raw: string) => {
      const value = parseNumericOrString(raw);
      onUpdateFromProperty?.(animation.id, prop, value);
      onLivePreviewEnd?.();
    },
    [animation.id, onUpdateFromProperty, onLivePreviewEnd],
  );

  const commitDuration = useCallback(
    (raw: string) => {
      const num = Number(raw);
      if (Number.isFinite(num) && num >= 0)
        onUpdateMeta(animation.id, { duration: Math.max(0, num) });
    },
    [animation.id, onUpdateMeta],
  );

  const commitPosition = useCallback(
    (raw: string) => {
      const num = Number(raw);
      if (Number.isFinite(num) && num >= 0)
        onUpdateMeta(animation.id, { position: Math.max(0, num) });
    },
    [animation.id, onUpdateMeta],
  );

  const [copied, setCopied] = useState(false);

  const methodLabel = METHOD_LABELS[animation.method] ?? animation.method;
  const easeName =
    (animation.keyframes ? animation.keyframes.easeEach : undefined) ?? animation.ease ?? "none";
  const headerEase = animation.keyframes ? uniformSegmentEase(animation) : easeName;
  const easeLabel = headerEase === null ? "Mixed" : easeDisplayName(headerEase);
  const runEase = animation.keyframes ? keyframedTweenEases(animation).run : undefined;
  const endTime =
    typeof animation.position === "number"
      ? animation.position + (animation.duration ?? 0)
      : animation.position;

  const summary = useMemo(() => buildTweenSummary(animation), [animation]);
  const setKeys = Object.keys(animation.properties);
  if (
    animation.method === "set" &&
    // `every` is vacuously true on an empty bag — require at least one key so a
    // property-less set doesn't masquerade as a position row.
    (setKeys.includes("x") || setKeys.includes("y")) &&
    setKeys.every((k) => k === "x" || k === "y" || k === "immediateRender")
  )
    return (
      <div className="border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-2 py-1.5">
          <span className="rounded-sm bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
            {t("Position")}</span>
          <span className="text-[11px] text-neutral-500">
            x: {Math.round(Number(animation.properties.x ?? 0))}, y:{" "}
            {Math.round(Number(animation.properties.y ?? 0))}
          </span>
          <span className="ml-auto text-[9px] text-neutral-600">{t("drag to move")}</span>
        </div>
      </div>
    );

  return (
    <div
      ref={cardRef}
      data-flat-effect-card={flat ? "true" : undefined}
      className={
        flat
          ? "border-b border-l-2 border-panel-accent/40 border-b-panel-hairline pb-3 pl-2"
          : "border-b border-neutral-800 pb-3"
      }
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 py-1.5 active:scale-[0.99]"
      >
        <span
          className="rounded-sm bg-panel-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink"
          title={METHOD_TOOLTIPS[animation.method]}
        >
          {methodLabel}
        </span>
        <span
          className={`text-[11px] font-medium ${flat ? "text-panel-text-3" : "text-neutral-400"}`}
          title={t("When this effect plays")}
        >
          {typeof animation.position === "number"
            ? `${parseFloat(animation.position.toFixed(3))}s`
            : animation.position}{" "}
          {t("to")}{" "}{typeof endTime === "number" ? `${parseFloat(endTime.toFixed(3))}s` : endTime}
        </span>
        <span
          className={`ml-auto text-[10px] ${flat ? "text-panel-text-3" : "text-neutral-500"}`}
          title={headerEase ?? "Mixed"}
          data-card-ease
        >
          {easeLabel}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          className={`shrink-0 transition-transform ${flat ? "text-panel-text-5" : "text-neutral-500"} ${expanded ? "" : "-rotate-90"}`}
        >
          <path d="M2 3l3 4 3-4z" />
        </svg>
      </button>

      {expanded && (
        <div className="pt-2">
          <div className="space-y-3">
            <ComputedTweenNotice
              provenance={animation.provenance}
              onUnroll={onUnroll ? () => onUnroll(animation.id) : undefined}
            />
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-[10px] leading-relaxed text-neutral-400 italic">{summary}</p>
                {animation.keyframes && (
                  <p className="mt-1 text-[9px] text-neutral-500">
                    <span
                      className="inline-block w-2 h-2 mr-1 align-middle"
                      style={{
                        background: "currentColor",
                        clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
                      }}
                    />
                    {t("Keyframed: click a segment below to edit its curve")}</p>
                )}
                {runEase && runEase !== "none" && (
                  <p className="mt-1 text-[9px] text-neutral-500" data-card-run-ease>
                    {t("Run ease:")}{" "}{easeDisplayName(runEase)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(summary);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-medium text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
                title={t("Copy description for agent prompts")}
              >
                {copied ? t("Copied") : t("Copy")}
              </button>
            </div>
            <div className={RESPONSIVE_GRID}>
              {animation.method !== "set" && (
                <MetricField
                  label={t("Length")}
                  value={String(Math.max(0, animation.duration ?? 0))}
                  suffix="s"
                  tooltip={t("How long this effect lasts")}
                  onCommit={commitDuration}
                />
              )}
              <MetricField
                label={t("Starts at")}
                value={
                  typeof animation.position === "string"
                    ? animation.position
                    : String(parseFloat(Math.max(0, animation.position).toFixed(3)))
                }
                suffix={typeof animation.position === "number" ? "s" : undefined}
                tooltip={t("When this effect begins on the timeline")}
                onCommit={commitPosition}
              />
            </div>

            {animation.method !== "set" && (
              <>
                {animation.keyframes && onUpdateKeyframeEase ? (
                  <KeyframeEaseList
                    keyframes={animation.keyframes.keyframes}
                    globalEase={keyframedTweenEases(animation).segment({})}
                    expandedPct={expandedKfPct}
                    collidingAnimationTargets={focusedCollidingAnimationTargets}
                    onToggle={(pct) => {
                      setExpandedKfPct(pct);
                      setFocusedCollidingAnimationTargets(undefined);
                    }}
                    onEaseCommit={(pct, ease) => {
                      if (
                        focusedCollidingAnimationTargets &&
                        focusedCollidingAnimationTargets.length > 1 &&
                        onUpdateSegmentEase
                      ) {
                        onUpdateSegmentEase(focusedCollidingAnimationTargets, ease);
                      } else {
                        onUpdateKeyframeEase(animation.id, pct, ease);
                      }
                      trackStudioSegmentEaseEdit({ action: "commit", ease });
                    }}
                    onApplyAll={
                      onSetAllKeyframeEases
                        ? (ease) => onSetAllKeyframeEases(animation.id, ease)
                        : undefined
                    }
                  />
                ) : (
                  <>
                    <SelectField
                      label={t("Speed")}
                      value={easeName.startsWith("custom(") ? "custom" : easeName}
                      options={[...SUPPORTED_EASES, "custom"]}
                      onChange={(next) => {
                        const easeKey = animation.keyframes ? "easeEach" : "ease";
                        if (next === "custom") {
                          const points = controlPointsForGsapEase(
                            easeName !== "none" ? easeName : "power2.out",
                          );
                          const path = `M0,0 C${points.x1},${points.y1} ${points.x2},${points.y2} 1,1`;
                          onUpdateMeta(animation.id, { [easeKey]: `custom(${path})` });
                        } else {
                          onUpdateMeta(animation.id, { [easeKey]: next });
                        }
                      }}
                    />
                    <EaseCurveSection
                      ease={easeName}
                      onCustomEaseCommit={(customEase) => {
                        const easeKey = animation.keyframes ? "easeEach" : "ease";
                        onUpdateMeta(animation.id, { [easeKey]: customEase });
                      }}
                    />
                  </>
                )}
              </>
            )}

            {animation.method === "fromTo" && (
              <div className="space-y-1">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-warning-ink">
                  {t("From")}</p>
                <div className="space-y-1.5">
                  {Object.entries(animation.fromProperties ?? {}).map(([prop, val]) => (
                    <PropertyRow
                      key={prop}
                      prop={prop}
                      val={val}
                      onCommit={(adjusted) => commitFromProperty(prop, adjusted)}
                      onRemove={() => onRemoveFromProperty?.(animation.id, prop)}
                      removeTitle={`Remove from-${PROP_LABELS[prop] ?? prop}`}
                    />
                  ))}
                </div>
                <div className="pt-0.5">
                  <AddPropertyTrigger
                    adding={addingFromProp}
                    available={availableFromProps}
                    addLabel="+ From property"
                    addTitle="Add a from-state property"
                    onAdd={(prop) => onAddFromProperty?.(animation.id, prop)}
                    onOpen={() => setAddingFromProp(true)}
                    onClose={() => setAddingFromProp(false)}
                    buttonClassName="text-[11px] font-medium text-warning-ink transition-colors hover:text-text-0"
                  />
                </div>
              </div>
            )}

            {animation.method === "fromTo" && Object.keys(animation.properties).length > 0 && (
              <p className="text-[9px] font-semibold uppercase tracking-wider text-accent-ink">
                {t("To")}</p>
            )}

            {Object.keys(animation.properties).length > 0 && (
              <div className="space-y-1.5">
                {Object.entries(animation.properties).map(([prop, val]) => (
                  <PropertyRow
                    key={prop}
                    prop={prop}
                    val={val}
                    onCommit={(adjusted) => {
                      scrubProperty(prop, adjusted);
                      commitProperty(prop, adjusted);
                    }}
                    onRemove={() => onRemoveProperty(animation.id, prop)}
                    removeTitle={`Remove ${PROP_LABELS[prop] ?? prop}`}
                  />
                ))}
              </div>
            )}

            {onSetArcPath &&
              (animation.properties.x != null ||
                animation.properties.y != null ||
                animation.keyframes) && (
                <div className="border-t border-neutral-800 pt-3">
                  <ArcPathControls
                    arcPath={
                      animation.arcPath ?? { enabled: false, autoRotate: false, segments: [] }
                    }
                    segmentCount={Math.max(
                      animation.properties.x != null || animation.properties.y != null ? 1 : 0,
                      (animation.keyframes?.keyframes?.length ?? 0) - 1,
                    )}
                    onToggle={(enabled) =>
                      onSetArcPath(animation.id, {
                        enabled,
                        segments: animation.arcPath?.segments,
                      })
                    }
                    onUpdateSegment={(index, update) =>
                      onUpdateArcSegment?.(animation.id, index, update)
                    }
                    onToggleAutoRotate={(autoRotate) =>
                      onSetArcPath(animation.id, {
                        enabled: true,
                        autoRotate,
                        segments: animation.arcPath?.segments,
                      })
                    }
                  />
                </div>
              )}

            <div className="flex items-center gap-2 pt-1">
              <AddPropertyTrigger
                adding={addingProp}
                available={availableProps}
                addLabel="+ Effect"
                addTitle="Add another animated property to this effect"
                onAdd={(prop) => onAddProperty(animation.id, prop)}
                onOpen={() => setAddingProp(true)}
                onClose={() => setAddingProp(false)}
                buttonClassName="text-[11px] font-medium text-neutral-400 transition-colors hover:text-neutral-200"
              />
              <button
                type="button"
                onClick={() => onDeleteAnimation(animation.id)}
                className="ml-auto text-[11px] font-medium rounded-sm text-danger-ink transition-colors hover:bg-danger/15"
                title={t("Remove this animation")}
              >
                {t("Remove")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
