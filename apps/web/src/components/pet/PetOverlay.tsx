import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import type { PetConfig } from '../../types';
import {
  ambientLines,
  pickAmbientRow,
  preferredRowId,
  resolveActivePet,
  type PetInteraction,
} from './pets';
import { PetSpriteFace } from './PetSpriteFace';

export type AgentSessionState = 'idle' | 'thinking' | 'done' | 'error';

interface Props {
  pet: PetConfig | undefined;
  onTuck: () => void;
  onOpenSettings: () => void;
  /** Current AI agent session state. Drives pet animation when no user gesture is active. */
  agentSessionState?: AgentSessionState;
}

const STORAGE_KEY = 'open-design:pet-position';

interface Position {
  // Distances from the right/bottom of the viewport so the overlay
  // sticks to the corner across resizes. Saved in localStorage.
  right: number;
  bottom: number;
}

const DEFAULT_POSITION: Position = { right: 24, bottom: 24 };

// How long the pet has to sit untouched before the overlay flips to
// the "waiting" animation row. Sized to sit comfortably past a few
// ambient beats so the pet clearly feels alive before falling through
// to the more static "bored" cue.
const WAITING_AFTER_MS = 45000;

// Ambient idle choreography — while nobody is hovering / dragging, the
// overlay occasionally swaps the `idle` row for a random non-idle row
// from the atlas (wave, hop, look around) so the pet visibly has a
// life of its own instead of breathing in place forever. Each ambient
// "beat" plays for a chunk of time, then the pet returns to idle for
// a longer rest window before the next beat. Randomising both windows
// prevents the rhythm from feeling mechanical, and the rest window is
// intentionally generous so the pet reads as calm rather than fidgety.
const AMBIENT_PLAY_MIN_MS = 1400;
const AMBIENT_PLAY_VARIANCE_MS = 900;
const AMBIENT_REST_MIN_MS = 9000;
const AMBIENT_REST_VARIANCE_MS = 9000;
const AMBIENT_INITIAL_DELAY_MIN_MS = 4000;
const AMBIENT_INITIAL_DELAY_VARIANCE_MS = 3000;

// Filters pointer jitter and accidental nudges before the overlay
// commits to a directional running animation. Picked to feel
// responsive without flickering on small mouse wiggles.
const DRAG_GESTURE_MIN_PX = 14;
// Require one axis to clearly dominate before swapping running-* for
// jumping/waving so diagonal drags don't strobe between rows.
const DRAG_AXIS_BIAS = 1.18;

// Autonomous horizontal pacing. This is the concrete "movement mode"
// for the personalized pet MVP: when the user is not hovering,
// dragging, or reading the bubble, the companion walks left ↔ right
// inside the viewport bounds instead of staying parked in one corner.
const AUTO_WALK_EDGE_PADDING_PX = 8;
const AUTO_WALK_SPRITE_BOX_PX = 96;
const AUTO_WALK_SPEED_PX_PER_SEC = 40;
const AUTO_WALK_TURN_PAUSE_MS = 820;
const AUTO_WALK_RESUME_PAUSE_MS = 560;

type BubbleStatusTone = 'ready' | 'active' | 'paused';

interface BubbleStatusItem {
  label: string;
  value: string;
  tone: BubbleStatusTone;
}

function atlasRowLabel(
  t: ReturnType<typeof useT>,
  rowId: string,
): string {
  switch (rowId) {
    case 'running-left':
      return t('pet.atlasRow.running-left');
    case 'running-right':
      return t('pet.atlasRow.running-right');
    case 'waving':
      return t('pet.atlasRow.waving');
    case 'jumping':
      return t('pet.atlasRow.jumping');
    case 'waiting':
      return t('pet.atlasRow.waiting');
    case 'running':
      return t('pet.atlasRow.running');
    case 'review':
      return t('pet.atlasRow.review');
    case 'failed':
      return t('pet.atlasRow.failed');
    case 'idle':
    default:
      return t('pet.atlasRow.idle');
  }
}

function loadPosition(): Position {
  if (typeof window === 'undefined') return DEFAULT_POSITION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_POSITION;
    const parsed = JSON.parse(raw) as Partial<Position>;
    return {
      right: typeof parsed.right === 'number' ? parsed.right : DEFAULT_POSITION.right,
      bottom: typeof parsed.bottom === 'number' ? parsed.bottom : DEFAULT_POSITION.bottom,
    };
  } catch {
    return DEFAULT_POSITION;
  }
}

function savePosition(p: Position) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

// Compact floating sprite + speech bubble. Rendered at the document
// root via App.tsx so it stays put when the user navigates between
// the entry and project views.
export function PetOverlay({ pet, onTuck, onOpenSettings, agentSessionState }: Props) {
  const t = useT();
  const active = useMemo(() => resolveActivePet(pet), [pet]);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [ambientIdx, setAmbientIdx] = useState(0);
  const [position, setPosition] = useState<Position>(() => loadPosition());
  // Interaction state drives which atlas row plays. Only meaningful
  // for atlas-backed custom pets — the renderer ignores it for emoji
  // / single-strip pets.
  const [interaction, setInteraction] = useState<PetInteraction>('idle');
  // Ambient row id that temporarily overrides the `idle` row. Null
  // whenever the pet is resting on its baseline row so the user-facing
  // interaction state wins as soon as a gesture fires.
  const [ambientRowId, setAmbientRowId] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [movementMode, setMovementMode] = useState<'walk-left' | 'walk-right' | null>('walk-left');
  const movementModeRef = useRef<'walk-left' | 'walk-right' | null>('walk-left');
  const walkDirectionRef = useRef<'left' | 'right'>('left');
  const walkPauseUntilRef = useRef<number>(0);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    moved: boolean;
    // Last classified gesture direction. Kept on the ref so we don't
    // trigger a state update + render on every pointermove tick.
    direction: 'right' | 'left' | 'up' | 'down' | null;
  } | null>(null);
  // Idle timer that flips the pet to the `waiting` row after a few
  // seconds without hover or drag. Reset by every interaction.
  const waitingTimerRef = useRef<number | null>(null);

  // Show the greeting briefly the first time the overlay mounts after a
  // wake. Auto-tuck the bubble after 4s so it does not linger forever.
  useEffect(() => {
    if (!active) return;
    setBubbleOpen(true);
    const id = window.setTimeout(() => setBubbleOpen(false), 4000);
    return () => window.clearTimeout(id);
  }, [active?.id]);

  useEffect(() => {
    savePosition(position);
  }, [position]);

  const agentPoseActive =
    !dragging &&
    !hovered &&
    !bubbleOpen &&
    agentSessionState != null &&
    agentSessionState !== 'idle';

  // Agent session state drives pet interaction when no user gesture is active.
  // User drag/hover/bubble takes priority — agent state only applies while calm.
  useEffect(() => {
    if (dragging || hovered || bubbleOpen) return;
    if (!agentSessionState || agentSessionState === 'idle') {
      setInteraction((prev) => (
        prev === 'agent-thinking' || prev === 'agent-done' || prev === 'agent-error'
          ? 'idle'
          : prev
      ));
      return;
    }
    const map: Record<Exclude<AgentSessionState, 'idle'>, PetInteraction> = {
      thinking: 'agent-thinking',
      done: 'agent-done',
      error: 'agent-error',
    };
    setInteraction(map[agentSessionState]);
    // For 'done'/'error' flash back to idle after 2s so the pet doesn't
    // stay frozen in the completed-hop or failed pose indefinitely.
    if (agentSessionState === 'done' || agentSessionState === 'error') {
      const id = window.setTimeout(() => {
        setInteraction((prev) => (prev === map[agentSessionState] ? 'idle' : prev));
      }, 2000);
      return () => window.clearTimeout(id);
    }
  }, [agentSessionState, bubbleOpen, dragging, hovered]);

  const lines = useMemo(
    () => (active ? [active.greeting, ...ambientLines(active.name)] : []),
    [active],
  );
  const visibleLine = lines.length > 0 ? lines[ambientIdx % lines.length] : '';

  const applyMovementMode = useCallback((next: 'walk-left' | 'walk-right' | null) => {
    if (movementModeRef.current === next) return;
    movementModeRef.current = next;
    setMovementMode(next);
  }, []);

  const resumeAutoWalk = useCallback((pauseMs = AUTO_WALK_RESUME_PAUSE_MS) => {
    walkPauseUntilRef.current = performance.now() + pauseMs;
    applyMovementMode(walkDirectionRef.current === 'left' ? 'walk-left' : 'walk-right');
  }, [applyMovementMode]);

  if (!active) return null;

  const currentRowId = agentPoseActive
    ? preferredRowId(interaction)
    : movementMode === 'walk-left'
      ? 'running-left'
      : movementMode === 'walk-right'
        ? 'running-right'
        : ambientRowId ?? preferredRowId(interaction);
  const currentRowLabel = active.atlas
    ? atlasRowLabel(t, currentRowId)
    : agentPoseActive
      ? interaction === 'agent-thinking'
        ? 'Thinking'
        : interaction === 'agent-done'
          ? 'Done'
          : 'Error'
      : movementMode
        ? 'Walking'
        : interaction === 'waiting'
          ? 'Waiting'
          : hovered
            ? 'Watching'
            : 'Floating';
  const statusHeadline = dragging
    ? 'Drag mode'
    : bubbleOpen
      ? 'Status open'
      : hovered
        ? 'Focused'
        : agentPoseActive
          ? interaction === 'agent-thinking'
            ? 'Agent thinking'
            : interaction === 'agent-done'
              ? 'Agent done'
              : 'Agent error'
          : movementMode
            ? 'Patrolling'
            : interaction === 'waiting'
              ? 'Waiting'
              : 'Idle';
  const statusSummary = dragging
    ? 'Following your pointer inside the workspace.'
    : bubbleOpen
      ? 'Sharing the current state before the next move.'
      : hovered
        ? 'Paused here and reacting to your attention.'
        : agentPoseActive
          ? interaction === 'agent-thinking'
            ? 'Watching the current AI run while it works.'
            : interaction === 'agent-done'
              ? 'Reacting to a completed AI run before settling down.'
              : 'Flagging that the latest AI run needs attention.'
          : movementMode
            ? 'Walking edge to edge so the companion feels alive.'
            : interaction === 'waiting'
              ? 'Holding position until the next nudge.'
              : 'Resting quietly between ambient beats.';
  const bubbleStatusItems: BubbleStatusItem[] = [
    {
      label: 'Mode',
      value: statusHeadline,
      tone: dragging || movementMode || agentPoseActive ? 'active' : bubbleOpen ? 'ready' : 'paused',
    },
    {
      label: 'Motion',
      value: currentRowLabel,
      tone: movementMode || hovered || dragging || agentPoseActive ? 'active' : 'ready',
    },
    {
      label: 'Bubble',
      value: bubbleOpen ? 'Open' : 'Closed',
      tone: bubbleOpen ? 'ready' : 'paused',
    },
  ];
  const motionState = dragging
    ? 'dragging'
    : movementMode
      ? 'walking'
      : bubbleOpen
        ? 'paused'
        : hovered
          ? 'focused'
          : 'idle';

  // (Re)arms the long-idle waiting timer. Called every time the user
  // interacts so an active session never falls into "waiting" mid-drag.
  const armWaitingTimer = useCallback(() => {
    if (waitingTimerRef.current != null) {
      window.clearTimeout(waitingTimerRef.current);
    }
    waitingTimerRef.current = window.setTimeout(() => {
      // Only escalate to `waiting` from a calm `idle` baseline; an
      // active hover / drag should keep their own animation.
      setInteraction((prev) => (prev === 'idle' ? 'waiting' : prev));
      waitingTimerRef.current = null;
    }, WAITING_AFTER_MS);
  }, []);

  // Start the idle clock when the pet becomes visible / changes.
  useEffect(() => {
    if (!active) return;
    armWaitingTimer();
    return () => {
      if (waitingTimerRef.current != null) {
        window.clearTimeout(waitingTimerRef.current);
        waitingTimerRef.current = null;
      }
    };
  }, [active?.id, armWaitingTimer]);

  // Ambient idle choreography scheduler. Only runs while the pet is in
  // `idle` and has an atlas with ambient-eligible rows; otherwise we
  // bail out and leave the base row alone. The effect is deliberately
  // scoped to `interaction === 'idle'` so any user gesture
  // (hover / drag / pointerdown) cancels the currently playing beat via
  // cleanup and the user-facing state takes over instantly.
  useEffect(() => {
    if (interaction !== 'idle') {
      setAmbientRowId(null);
      return;
    }
    const atlas = active?.atlas;
    if (!atlas || atlas.rowsDef.length === 0) return;

    let playTimer: number | undefined;
    let restTimer: number | undefined;
    let lastPlayedId: string | undefined;

    const playBeat = () => {
      const def = pickAmbientRow(atlas, lastPlayedId);
      if (!def) return;
      lastPlayedId = def.id;
      setAmbientRowId(def.id);
      const playMs =
        AMBIENT_PLAY_MIN_MS + Math.floor(Math.random() * AMBIENT_PLAY_VARIANCE_MS);
      playTimer = window.setTimeout(() => {
        setAmbientRowId(null);
        const restMs =
          AMBIENT_REST_MIN_MS + Math.floor(Math.random() * AMBIENT_REST_VARIANCE_MS);
        restTimer = window.setTimeout(playBeat, restMs);
      }, playMs);
    };

    // Let the pet breathe for a moment before the first beat so a
    // freshly-woken overlay doesn't snap straight into a flourish.
    const initialDelay =
      AMBIENT_INITIAL_DELAY_MIN_MS +
      Math.floor(Math.random() * AMBIENT_INITIAL_DELAY_VARIANCE_MS);
    restTimer = window.setTimeout(playBeat, initialDelay);

    return () => {
      if (playTimer != null) window.clearTimeout(playTimer);
      if (restTimer != null) window.clearTimeout(restTimer);
      setAmbientRowId(null);
    };
  }, [interaction, active?.id, active?.atlas]);

  useEffect(() => {
    if (!active) return;
    walkDirectionRef.current = 'left';
    walkPauseUntilRef.current = performance.now() + AUTO_WALK_TURN_PAUSE_MS;
    setDragging(false);
    applyMovementMode('walk-left');
  }, [active?.id, applyMovementMode]);

  useEffect(() => {
    if (!active) return;
    if (bubbleOpen || agentPoseActive) {
      applyMovementMode(null);
      return;
    }
    if (hovered || dragging) return;
    resumeAutoWalk();
  }, [active?.id, bubbleOpen, agentPoseActive, hovered, dragging, applyMovementMode, resumeAutoWalk]);

  // Horizontal autonomous walk. This is the first real movement-mode
  // pass for the pet: when it is not being interacted with, it paces
  // inside the viewport and flips direction at the edges.
  useEffect(() => {
    if (!active || hovered || dragging || bubbleOpen || agentPoseActive) {
      applyMovementMode(null);
      return;
    }

    let frameId = 0;
    let previousTs: number | null = null;

    const tick = (ts: number) => {
      if (previousTs == null) {
        previousTs = ts;
        frameId = window.requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(48, ts - previousTs);
      previousTs = ts;

      if (ts >= walkPauseUntilRef.current) {
        const direction = walkDirectionRef.current;
        const delta = (AUTO_WALK_SPEED_PX_PER_SEC * dt) / 1000;
        setPosition((curr) => {
          const minRight = AUTO_WALK_EDGE_PADDING_PX;
          const maxRight = Math.max(
            AUTO_WALK_EDGE_PADDING_PX,
            window.innerWidth - AUTO_WALK_SPRITE_BOX_PX - AUTO_WALK_EDGE_PADDING_PX,
          );
          let nextRight = curr.right + (direction === 'left' ? delta : -delta);

          if (nextRight >= maxRight) {
            nextRight = maxRight;
            walkDirectionRef.current = 'right';
            walkPauseUntilRef.current = ts + AUTO_WALK_TURN_PAUSE_MS;
            applyMovementMode('walk-right');
          } else if (nextRight <= minRight) {
            nextRight = minRight;
            walkDirectionRef.current = 'left';
            walkPauseUntilRef.current = ts + AUTO_WALK_TURN_PAUSE_MS;
            applyMovementMode('walk-left');
          } else {
            applyMovementMode(direction === 'left' ? 'walk-left' : 'walk-right');
          }

          nextRight = Math.round(nextRight);
          if (nextRight === curr.right) return curr;
          return { ...curr, right: nextRight };
        });
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [active?.id, active, hovered, dragging, bubbleOpen, agentPoseActive, applyMovementMode]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    setDragging(true);
    applyMovementMode(null);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startRight: position.right,
      startBottom: position.bottom,
      moved: false,
      direction: null,
    };
    armWaitingTimer();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    drag.moved = true;
    // Convert pointer movement into right/bottom offsets so the sprite
    // tracks the cursor while staying anchored to the corner system.
    // The clamp budget (~120px) keeps the 96px sprite plus its drop
    // shadow on-screen even when dragged toward the opposite edge.
    const nextRight = Math.round(
      Math.max(8, Math.min(window.innerWidth - 120, drag.startRight - dx)),
    );
    const nextBottom = Math.round(
      Math.max(8, Math.min(window.innerHeight - 120, drag.startBottom - dy)),
    );
    setPosition({ right: nextRight, bottom: nextBottom });

    // Classify the gesture direction once it clears the jitter floor
    // and one axis clearly dominates the other. The animation then
    // sticks until the user reverses past the threshold again.
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < DRAG_GESTURE_MIN_PX && absY < DRAG_GESTURE_MIN_PX) return;
    let dir: 'right' | 'left' | 'up' | 'down' | null = null;
    if (absX >= absY * DRAG_AXIS_BIAS) {
      dir = dx > 0 ? 'right' : 'left';
    } else if (absY >= absX * DRAG_AXIS_BIAS) {
      dir = dy < 0 ? 'up' : 'down';
    }
    if (dir && dir !== drag.direction) {
      drag.direction = dir;
      setInteraction(
        dir === 'right'
          ? 'drag-right'
          : dir === 'left'
            ? 'drag-left'
            : dir === 'up'
              ? 'drag-up'
              : 'drag-down',
      );
    }
    armWaitingTimer();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    // A tap (no drag) toggles the speech bubble and rotates the line.
    if (drag && !drag.moved) {
      setBubbleOpen((open) => {
        const next = !open;
        if (next) setAmbientIdx((i) => (i + 1) % Math.max(1, lines.length));
        return next;
      });
    }
    // After the drag ends, fall back to the resting animation so the
    // pet stops "running" the moment the user lets go. Hovered state
    // wins so a release-into-hover keeps the wave going.
    setInteraction(hovered ? 'hover' : 'idle');
    if (!hovered && !bubbleOpen && !(drag && !drag.moved)) {
      resumeAutoWalk();
    }
    armWaitingTimer();
  };

  const onPointerEnter = () => {
    setHovered(true);
    applyMovementMode(null);
    // Don't override an active drag direction with the hover wave —
    // the user is mid-gesture and they expect the running cycle to
    // keep playing until they let go.
    if (!dragRef.current) setInteraction('hover');
    armWaitingTimer();
  };

  const onPointerLeave = () => {
    setHovered(false);
    if (!dragRef.current) {
      setInteraction('idle');
      if (!bubbleOpen) {
        resumeAutoWalk();
      }
    }
    armWaitingTimer();
  };

  return (
    <div
      className="pet-overlay"
      role="complementary"
      aria-label={t('pet.overlayAria')}
      style={{
        right: position.right,
        bottom: position.bottom,
        // The accent drives the halo, the bubble border, and the focus
        // ring on the action buttons via CSS custom property cascade.
        ['--pet-accent' as string]: active.accent,
      }}
    >
      {bubbleOpen ? (
        <div className="pet-bubble" role="status">
          <div className="pet-bubble-name">{active.name}</div>
          <div className="pet-bubble-line">{visibleLine}</div>
          <div className="pet-bubble-summary">
            <div className="pet-bubble-summary-title">{statusHeadline}</div>
            <div className="pet-bubble-summary-copy">{statusSummary}</div>
          </div>
          <div className="pet-bubble-status-list" aria-label={`${active.name} status summary`}>
            {bubbleStatusItems.map((item) => (
              <div key={item.label} className={`pet-bubble-status tone-${item.tone}`}>
                <span className="pet-bubble-status-label">{item.label}</span>
                <span className="pet-bubble-status-value">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="pet-bubble-actions">
            <button
              type="button"
              className="pet-bubble-btn"
              onClick={onOpenSettings}
              title={t('pet.settingsTitle')}
            >
              <Icon name="settings" size={12} />
              <span>{t('pet.changePet')}</span>
            </button>
            <button
              type="button"
              className="pet-bubble-btn"
              onClick={onTuck}
              title={t('pet.tuckTitle')}
            >
              <Icon name="close" size={12} />
              <span>{t('pet.tuck')}</span>
            </button>
          </div>
        </div>
      ) : null}
      <div
        className="pet-sprite"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        title={t('pet.spriteTitle', { name: active.name })}
        aria-label={t('pet.spriteAria', { name: active.name })}
        data-pet-state={interaction}
        data-pet-ambient={ambientRowId ?? undefined}
        data-pet-motion={motionState}
        style={{
          // For atlas-backed pets the row swap *is* the animation, so
          // we let the sprite element sit still and animate frames
          // inside it. Built-ins / single-strip uploads keep their
          // gentle CSS-named bob via --pet-anim.
          ['--pet-anim' as string]: active.atlas
            ? 'none'
            : `pet-${active.animation}`,
        }}
      >
        <PetSpriteFace
          active={active}
          className="pet-sprite-glyph"
          size={AUTO_WALK_SPRITE_BOX_PX}
          rowId={currentRowId}
        />
        <span className="pet-sprite-shadow" aria-hidden />
      </div>
    </div>
  );
}
