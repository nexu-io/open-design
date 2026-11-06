import { useI18n } from "../../i18n/I18n";
import {
  createContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { matchesKey } from "./studioShortcuts";
import {
  HF_AUDIO_FADE_IN_ATTR,
  HF_AUDIO_FADE_OUT_ATTR,
  clampFadesToDuration,
  formatFadeSeconds,
  type AudioFades,
} from "@hyperframes/core/audio-fade";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { Tooltip } from "../../components/ui";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import { releasedOutsideWindow } from "./timelinePointerRelease";
import {
  FADE_TAB_CENTER_IN_HIT,
  FADE_TAB_WIDTH,
  fadeHandleBoxes,
  type FadeEdge,
  type FadeHandleBox,
  type FadeHandleClipBox,
} from "./timelineClipFadeGeometry";
import {
  collectTimelineSnapTargets,
  snapTimelineTime,
  TIMELINE_SNAP_PX,
  type TimelineSnapTarget,
  type TimelineSnapType,
} from "./timelineSnapping";

type FadeDraft = { edge: FadeEdge; seconds: number } | null;

const TAB_HEIGHT = 15;
const HANDLE_Z_ABOVE_CLIP_CONTENT = 30;
const SUPPRESS_CLIP_NATIVE_TITLE = "";
/** Pixels of pointer travel before a press on the handle counts as a drag. */
const DRAG_THRESHOLD_PX = 2;
const DEFAULT_FADE_SECONDS = 0.5;
const SNAP_LABEL: Record<TimelineSnapType, string> = {
  playhead: "playhead",
  "clip-edge": "clip edge",
  beat: "beat",
  grid: "grid line",
};

export type ClipFadeShape = AudioFades & { duration: number };
export const ClipFadesContext = createContext<ClipFadeShape | null>(null);

// Owned by TimelineClip so the handles and the waveform share the value under the pointer;
// the draft also bridges release until the save lands in the store.
export function useClipFadeDraft(el: TimelineElement) {
  const [draft, setDraft] = useState<FadeDraft>(null);
  const authoredIn = el.fadeIn ?? 0;
  const authoredOut = el.fadeOut ?? 0;
  const { fadeIn, fadeOut } = clampFadesToDuration(
    {
      fadeIn: draft?.edge === "in" ? draft.seconds : authoredIn,
      fadeOut: draft?.edge === "out" ? draft.seconds : authoredOut,
    },
    el.duration,
  );
  const shape = useMemo(
    () => ({ fadeIn, fadeOut, duration: el.duration }),
    [fadeIn, fadeOut, el.duration],
  );
  return { draft, setDraft, shape };
}

interface TimelineClipFadesProps {
  el: TimelineElement;
  pps: number;
  widthPx: number;
  /** Handles show on hover/selection; the ramps show whenever a fade is set. */
  showHandles: boolean;
  focusable?: boolean;
  /** Audio clips draw the fade in their waveform; others get the shaded wedge. */
  hasWaveform?: boolean;
  fade: ReturnType<typeof useClipFadeDraft>;
}

type KeyedFade = (current: number, step: number, limit: number) => number | null;
const grow: KeyedFade = (current, step) => current + step;
const shrink: KeyedFade = (current, step) => current - step;
const clear: KeyedFade = () => 0;
const FADE_KEYS: Record<string, KeyedFade> = {
  ArrowRight: grow,
  ArrowUp: grow,
  ArrowLeft: shrink,
  ArrowDown: shrink,
  Home: clear,
  Delete: clear,
  Backspace: clear,
  End: (_current, _step, limit) => limit,
  Enter: (current) => (current === 0 ? DEFAULT_FADE_SECONDS : null),
};

function keyedFadeSeconds(key: string, shift: boolean, current: number, limit: number) {
  return FADE_KEYS[key]?.(current, shift ? 1 : 0.1, limit) ?? null;
}

/** Slim tabs at each fade's end that drag `data-fade-in` / `data-fade-out`. */
// fallow-ignore-next-line complexity
export function TimelineClipFades({
  el,
  pps,
  widthPx,
  showHandles,
  focusable = false,
  hasWaveform = false,
  fade,
}: TimelineClipFadesProps) {
  const { onSetElementAttributeLive, onSetElementAttributeQuiet, onRevertElementAttributeLive } =
    useTimelineEditContextOptional();
  const canEdit = Boolean(onSetElementAttributeLive && onSetElementAttributeQuiet);
  const { setDraft } = fade;
  const fades = fade.shape;
  const [dragging, setDragging] = useState<FadeEdge | null>(null);
  const [focused, setFocused] = useState<FadeEdge | null>(null);
  const [snapType, setSnapType] = useState<TimelineSnapType | null>(null);
  const authoredIn = el.fadeIn ?? 0;
  const authoredOut = el.fadeOut ?? 0;
  const inPx = Math.min(widthPx, fades.fadeIn * pps);
  const outPx = Math.min(widthPx, fades.fadeOut * pps);

  const visible =
    fades.fadeIn > 0 || fades.fadeOut > 0 || showHandles || dragging !== null || focused !== null;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [clipBox, setClipBox] = useState<FadeHandleClipBox>({
    height: 0,
    width: 0,
    radius: 0,
    toolsLeft: null,
  });
  const handlesVisible = showHandles || dragging !== null || focused !== null;
  // Measured only while the handles show: a zoom step must not force a layout per clip.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const clip = root?.parentElement;
    if (!handlesVisible || !root || !clip) return;
    const radius = parseFloat(getComputedStyle(clip).borderTopLeftRadius) || 0;
    const { clientHeight: height, clientWidth: width } = root;
    const fx = clip.querySelector('[data-badge="fx"]');
    const toolsLeft = fx
      ? fx.getBoundingClientRect().left - root.getBoundingClientRect().left
      : null;
    setClipBox((box) =>
      box.height === height &&
      box.width === width &&
      box.radius === radius &&
      box.toolsLeft === toolsLeft
        ? box
        : { height, width, radius, toolsLeft },
    );
  }, [widthPx, handlesVisible]);

  const gesture = useRef<{
    edge: FadeEdge;
    pointerId: number;
    originClientX: number;
    originSeconds: number;
    otherSeconds: number;
    moved: boolean;
    last: number;
    snapTargets: TimelineSnapTarget[];
  } | null>(null);

  const attrFor = (edge: FadeEdge) =>
    edge === "in" ? HF_AUDIO_FADE_IN_ATTR : HF_AUDIO_FADE_OUT_ATTR;
  const attrText = (seconds: number) => (seconds > 0 ? formatFadeSeconds(seconds) : null);
  const labelFor = (edge: FadeEdge) => (edge === "in" ? "Fade in" : "Fade out");
  const currentSeconds = (edge: FadeEdge) =>
    fade.draft?.edge === edge ? fade.draft.seconds : edge === "in" ? authoredIn : authoredOut;
  const limitFor = (edge: FadeEdge) =>
    Math.max(0, el.duration - currentSeconds(edge === "in" ? "out" : "in"));

  // When the other fade makes the pair overrun the clip, neither a key nor a drag lowers this one.
  const stepLimit = (current: number, other: number) =>
    Math.max(0, el.duration - other, other > 0 ? current : 0);
  const startSeconds = (edge: FadeEdge) => {
    const current = currentSeconds(edge);
    return Math.min(current, stepLimit(current, currentSeconds(edge === "in" ? "out" : "in")));
  };
  const dragLimit = (g: { otherSeconds: number; originSeconds: number }) =>
    stepLimit(g.originSeconds, g.otherSeconds);

  /** Moves the fade's end onto a playhead or clip edge within the timeline's snap radius. */
  const snapSeconds = (g: NonNullable<typeof gesture.current>, seconds: number) => {
    const knee = g.edge === "in" ? el.start + seconds : el.start + el.duration - seconds;
    const snapped = snapTimelineTime(knee, g.snapTargets, TIMELINE_SNAP_PX / Math.max(pps, 1e-6));
    if (!snapped.target) return { seconds, type: null };
    const next = g.edge === "in" ? snapped.time - el.start : el.start + el.duration - snapped.time;
    const limit = dragLimit(g);
    return next >= 0 && next <= limit
      ? { seconds: next, type: snapped.target.type }
      : { seconds, type: null };
  };

  const secondsAt = (clientX: number): number => {
    const g = gesture.current;
    if (!g) return 0;
    const deltaSeconds = (clientX - g.originClientX) / Math.max(pps, 1e-6);
    const raw = g.edge === "in" ? g.originSeconds + deltaSeconds : g.originSeconds - deltaSeconds;
    const limit = dragLimit(g);
    const clamped = Math.min(limit, Math.max(0, raw));
    return Math.round(clamped * 100) / 100;
  };

  const onHandlePointerDown = (edge: FadeEdge) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !canEdit) return;
    // Ours, not the clip's: a press here must not start a move or trim.
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    flushKeys();
    const store = usePlayerStore.getState();
    gesture.current = {
      edge,
      pointerId: e.pointerId,
      originClientX: e.clientX,
      originSeconds: startSeconds(edge),
      otherSeconds: currentSeconds(edge === "in" ? "out" : "in"),
      moved: false,
      last: startSeconds(edge),
      snapTargets: store.timelineSnapEnabled
        ? collectTimelineSnapTargets({
            elements: store.elements,
            playheadTime: store.currentTime,
            beatTimes: [],
            excludeElementKey: el.key ?? el.id,
          }).filter(({ time }) => time > el.start + 1e-3 && time < el.start + el.duration - 1e-3)
        : [],
    };
    setDragging(edge);
  };

  const onHandlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (!g.moved && Math.abs(e.clientX - g.originClientX) < DRAG_THRESHOLD_PX) return;
    g.moved = true;
    const { seconds: raw, type } = snapSeconds(g, secondsAt(e.clientX));
    const seconds = Math.round(raw * 100) / 100;
    setSnapType(type);
    if (seconds === g.last) return;
    g.last = seconds;
    setDraft({ edge: g.edge, seconds });
    onSetElementAttributeLive?.(el, attrFor(g.edge), attrText(seconds));
  };

  type Gesture = NonNullable<typeof gesture.current>;

  /** Ends the pointer gesture and returns it, or null when the event is not ours. */
  const endGesture = (e: PointerEvent<HTMLDivElement>): Gesture | null => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return null;
    gesture.current = null;
    setDragging(null);
    setSnapType(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    return g;
  };

  /** Puts the live document back where the file has it and drops the draft. */
  const revertGesture = (g: Gesture) => {
    if (!g.moved) return;
    onSetElementAttributeLive?.(el, attrFor(g.edge), attrText(g.originSeconds));
    onRevertElementAttributeLive?.(el, attrFor(g.edge));
    setDraft(null);
  };

  // The save syncs the store before it settles, so its own draft can go then; a newer draft stays.
  const commit = (edge: FadeEdge, seconds: number) => {
    const draft = { edge, seconds };
    setDraft(draft);
    const settle = () => setDraft((current) => (current === draft ? null : current));
    void onSetElementAttributeQuiet?.(el, attrFor(edge), attrText(seconds), labelFor(edge)).then(
      settle,
      settle,
    );
  };

  const finish = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = endGesture(e);
    if (!g) return;
    if (cancelled || !g.moved || g.last === g.originSeconds || releasedOutsideWindow(e)) {
      return revertGesture(g);
    }
    commit(g.edge, g.last);
  };

  const onHandleDoubleClick = (edge: FadeEdge) => {
    commit(edge, currentSeconds(edge) > 0 ? 0 : Math.min(DEFAULT_FADE_SECONDS, limitFor(edge)));
  };

  const keyBurst = useRef<{ edge: FadeEdge; seconds: number } | null>(null);
  const flushKeys = () => {
    const burst = keyBurst.current;
    keyBurst.current = null;
    if (burst) commit(burst.edge, burst.seconds);
  };

  // A held key previews live and saves once on release: one undo step per burst.
  const onHandleKeyDown = (edge: FadeEdge) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (gesture.current || !canEdit) return;
    const current = startSeconds(edge);
    const limit = stepLimit(current, currentSeconds(edge === "in" ? "out" : "in"));
    const next = keyedFadeSeconds(e.key, e.shiftKey, current, limit);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    const seconds = Math.round(Math.min(limit, Math.max(0, next)) * 100) / 100;
    if (seconds === current) return;
    keyBurst.current = { edge, seconds };
    setDraft({ edge, seconds });
    onSetElementAttributeLive?.(el, attrFor(edge), attrText(seconds));
  };

  useEffect(() => {
    if (dragging === null) return;
    const cancelOnWindowEscape = (e: globalThis.KeyboardEvent) => {
      const g = gesture.current;
      if (!matchesKey(e, "cancel") || !g) return;
      e.preventDefault();
      e.stopPropagation();
      gesture.current = null;
      setDragging(null);
      setSnapType(null);
      revertGesture(g);
    };
    window.addEventListener("keydown", cancelOnWindowEscape, { capture: true });
    return () => window.removeEventListener("keydown", cancelOnWindowEscape, { capture: true });
  });

  const showIn = fades.fadeIn > 0;
  const showOut = fades.fadeOut > 0;
  if (!visible) return null;

  // A handle with no 0.01 s step to move is not drawn, unless in use: its twin owns the spot.
  const drawn = (edge: FadeEdge) =>
    currentSeconds(edge) > 0 ||
    Math.round(limitFor(edge) * 100) >= 1 ||
    dragging === edge ||
    focused === edge;
  const handleBoxes = fadeHandleBoxes({
    widthPx,
    inPx,
    outPx,
    clipBox,
    drawn: { in: drawn("in"), out: drawn("out") },
  });
  const handleStyle = (geometry: FadeHandleBox): CSSProperties => ({
    position: "absolute",
    top: geometry.top,
    left: geometry.left,
    width: geometry.width,
    height: geometry.height,
    cursor: "ew-resize",
    opacity: handlesVisible ? 1 : 0,
    pointerEvents: handlesVisible && canEdit ? "auto" : "none",
    touchAction: "none",
    outline: "none",
  });

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        pointerEvents: "none",
        zIndex: HANDLE_Z_ABOVE_CLIP_CONTENT,
      }}
    >
      {(showIn || showOut) && (
        <svg
          aria-hidden="true"
          data-testid="clip-fade-ramps"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            overflow: "hidden",
            borderRadius: "inherit",
          }}
          viewBox={`0 0 ${Math.max(widthPx, 1)} 100`}
          preserveAspectRatio="none"
        >
          {showIn && (
            <FadeRamp
              testId="clip-fade-in"
              wedge={hasWaveform ? null : `0,0 ${inPx},0 0,100`}
              line={[0, 100, inPx, 0]}
            />
          )}
          {showOut && (
            <FadeRamp
              testId="clip-fade-out"
              wedge={hasWaveform ? null : `${widthPx - outPx},0 ${widthPx},0 ${widthPx},100`}
              line={[widthPx - outPx, 0, widthPx, 100]}
            />
          )}
        </svg>
      )}
      {canEdit &&
        (["in", "out"] as const).filter(drawn).map((edge) => {
          const geometry = handleBoxes[edge];
          return (
            <FadeHandle
              key={edge}
              direction={edge}
              clipName={el.label || el.id}
              value={edge === "in" ? fades.fadeIn : fades.fadeOut}
              max={Math.max(0, el.duration - (edge === "in" ? fades.fadeOut : fades.fadeIn))}
              snapLabel={dragging === edge && snapType ? SNAP_LABEL[snapType] : null}
              style={handleStyle(geometry)}
              tabLeft={geometry.tabLeft}
              tabTop={FADE_TAB_CENTER_IN_HIT - TAB_HEIGHT / 2}
              focusable={focusable}
              dragging={dragging === edge}
              onPointerDown={onHandlePointerDown(edge)}
              onPointerMove={onHandlePointerMove}
              onPointerUp={(e) => finish(e, false)}
              onPointerCancel={(e) => finish(e, true)}
              onDoubleClick={() => onHandleDoubleClick(edge)}
              onKeyDown={onHandleKeyDown(edge)}
              onKeyUp={flushKeys}
              onFocusChange={(on) => {
                if (!on) flushKeys();
                setFocused(on ? edge : null);
              }}
            />
          );
        })}
    </div>
  );
}

/** A 1 px dashed gain line; clips without a waveform also shade the gain they lose. */
function FadeRamp({
  testId,
  wedge,
  line,
}: {
  testId: string;
  wedge: string | null;
  line: [number, number, number, number];
}) {
  const [x1, y1, x2, y2] = line;
  return (
    <>
      {wedge && (
        <polygon
          data-testid={testId}
          points={wedge}
          fill="var(--timeline-fade-shade)"
          fillOpacity={0.35}
        />
      )}
      <line
        data-testid={wedge ? undefined : testId}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="var(--clip-handle)"
        strokeOpacity={0.55}
        strokeWidth={1}
        strokeDasharray="2 3"
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

function FadeHandle({
  direction,
  clipName,
  value,
  max,
  snapLabel,
  style,
  tabLeft,
  tabTop,
  focusable,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDoubleClick,
  onKeyDown,
  onKeyUp,
  onFocusChange,
}: {
  direction: "in" | "out";
  clipName: string;
  value: number;
  max: number;
  snapLabel: string | null;
  style: CSSProperties;
  tabLeft: number;
  tabTop: number;
  focusable: boolean;
  dragging: boolean;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onKeyUp: () => void;
  onFocusChange: (focused: boolean) => void;
}) {
  const { t } = useI18n();
  const label = direction === "in" ? "Fade in" : "Fade out";
  const text = `${label} ${formatFadeSeconds(value)} s`;
  return (
    <Tooltip label={snapLabel ? t("{text}, snapped to {snapLabel}", { text: text, snapLabel: snapLabel }) : text}>
      <div
        role="slider"
        tabIndex={focusable ? 0 : -1}
        aria-label={`${label}, ${clipName}`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${formatFadeSeconds(value)}s`}
        data-testid={`clip-fade-handle-${direction}`}
        data-dragging={dragging ? "" : undefined}
        className="timeline-fade-handle"
        title={SUPPRESS_CLIP_NATIVE_TITLE}
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
      >
        <span
          aria-hidden="true"
          className="timeline-fade-tab"
          style={{
            left: tabLeft - FADE_TAB_WIDTH / 2,
            top: tabTop,
            width: FADE_TAB_WIDTH,
            height: TAB_HEIGHT,
            pointerEvents: "none",
          }}
        />
      </div>
    </Tooltip>
  );
}
