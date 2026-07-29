import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
import type { PetConfig } from '../../types';
import {
  pickAmbientRow,
  preferredRowId,
  resolveActivePet,
  type PetInteraction,
} from './pets';
import { PetSpriteFace } from './PetSpriteFace';

interface Props {
  pet: PetConfig | undefined;
  taskCenter?: PetTaskCenter;
  onOpenProject?: (projectId: string) => void;
  persistentBubble?: boolean;
}

const STORAGE_KEY = 'open-design:pet-position';

export interface PetTaskSummary {
  projectId: string;
  projectName: string;
  status: 'queued' | 'running';
  count: number;
}

export interface PetRecentTaskSummary {
  projectId: string;
  projectName: string;
  status: 'succeeded' | 'failed' | 'canceled';
  updatedAt: number;
}

export interface PetTaskCenter {
  running: PetTaskSummary[];
  queued: PetTaskSummary[];
  recent: PetRecentTaskSummary[];
}

const EMPTY_TASK_CENTER: PetTaskCenter = {
  running: [],
  queued: [],
  recent: [],
};

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

const IDLE_QUOTE_COUNT = 6;

function recentTaskKey(task: PetRecentTaskSummary): string {
  return `${task.projectId}:${task.updatedAt}`;
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
export function PetOverlay({
  pet,
  taskCenter = EMPTY_TASK_CENTER,
  onOpenProject,
  persistentBubble = false,
}: Props) {
  const t = useT();
  const active = useMemo(() => resolveActivePet(pet), [pet]);
  const [bubbleOpen, setBubbleOpen] = useState(persistentBubble);
  const [acknowledgedRecentKeys, setAcknowledgedRecentKeys] = useState<Set<string>>(() => new Set());
  const [viewingRecentKeys, setViewingRecentKeys] = useState<Set<string>>(() => new Set());
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
    if (persistentBubble) return;
    const id = window.setTimeout(() => setBubbleOpen(false), 4000);
    return () => window.clearTimeout(id);
  }, [active?.id, persistentBubble]);

  useEffect(() => {
    savePosition(position);
  }, [position]);

  const idleQuotes = useMemo(
    () => [
      {
        text: t('pet.idleQuote.leonardo.text'),
        author: t('pet.idleQuote.leonardo.author'),
      },
      {
        text: t('pet.idleQuote.michelangelo.text'),
        author: t('pet.idleQuote.michelangelo.author'),
      },
      {
        text: t('pet.idleQuote.bernini.text'),
        author: t('pet.idleQuote.bernini.author'),
      },
      {
        text: t('pet.idleQuote.raphael.text'),
        author: t('pet.idleQuote.raphael.author'),
      },
      {
        text: t('pet.idleQuote.caravaggio.text'),
        author: t('pet.idleQuote.caravaggio.author'),
      },
      {
        text: t('pet.idleQuote.rodin.text'),
        author: t('pet.idleQuote.rodin.author'),
      },
    ],
    [t],
  );
  const visibleQuote = idleQuotes[ambientIdx % IDLE_QUOTE_COUNT] ?? idleQuotes[0];
  const activeTasks = [...taskCenter.running, ...taskCenter.queued];
  const unacknowledgedRecentTasks = taskCenter.recent.filter(
    (task) => !acknowledgedRecentKeys.has(recentTaskKey(task)),
  );
  const visibleRecentTasks = bubbleOpen
    ? persistentBubble && viewingRecentKeys.size === 0
      ? unacknowledgedRecentTasks
      : taskCenter.recent.filter((task) => viewingRecentKeys.has(recentTaskKey(task)))
    : unacknowledgedRecentTasks;
  const activeTaskCount = activeTasks.reduce((sum, task) => sum + task.count, 0);
  const recentTaskCount = visibleRecentTasks.length;
  const taskTotal = activeTaskCount + recentTaskCount;
  const badgeTotal = activeTaskCount + unacknowledgedRecentTasks.length;
  const taskSummaryLine =
    activeTaskCount > 0
      ? t(
          activeTaskCount === 1
            ? 'pet.taskSummarySingle'
            : 'pet.taskSummaryMultiple',
          {
            count: activeTaskCount,
            projects: new Set(activeTasks.map((task) => task.projectId)).size,
          },
        )
      : recentTaskCount > 0
        ? t(
            recentTaskCount === 1
              ? 'pet.taskSummaryRecentSingle'
              : 'pet.taskSummaryRecentMultiple',
            { count: recentTaskCount },
          )
      : '';
  const visibleLine = taskSummaryLine || visibleQuote?.text || active?.greeting || '';
  const taskRowId =
    taskTotal > 0 && interaction === 'idle' ? 'waiting' : undefined;

  const acknowledgeRecentTasks = useCallback((tasks: PetRecentTaskSummary[]) => {
    if (tasks.length === 0) {
      setViewingRecentKeys(new Set());
      return;
    }
    const keys = tasks.map(recentTaskKey);
    setViewingRecentKeys(new Set(keys));
    setAcknowledgedRecentKeys((prev) => {
      const next = new Set(prev);
      for (const key of keys) next.add(key);
      return next;
    });
  }, []);

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

  if (!active) return null;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
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

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
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
    const nextRight = Math.max(8, Math.min(window.innerWidth - 120, drag.startRight - dx));
    const nextBottom = Math.max(8, Math.min(window.innerHeight - 120, drag.startBottom - dy));
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

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    // A tap (no drag) toggles the speech bubble and rotates the line.
    if (drag && !drag.moved) {
      if (unacknowledgedRecentTasks.length > 0) {
        setBubbleOpen(true);
        setAmbientIdx((i) => i + 1);
        acknowledgeRecentTasks(unacknowledgedRecentTasks);
      } else {
        setBubbleOpen((open) => {
          const next = !open;
          if (next) {
            setAmbientIdx((i) => i + 1);
          } else {
            setViewingRecentKeys(new Set());
          }
          return next;
        });
      }
    }
    // After the drag ends, fall back to the resting animation so the
    // pet stops "running" the moment the user lets go. Hovered state
    // wins so a release-into-hover keeps the wave going.
    setInteraction(hovered ? 'hover' : 'idle');
    armWaitingTimer();
  };

  const onPointerEnter = () => {
    setHovered(true);
    // Don't override an active drag direction with the hover wave —
    // the user is mid-gesture and they expect the running cycle to
    // keep playing until they let go.
    if (!dragRef.current) setInteraction('hover');
    armWaitingTimer();
  };

  const onPointerLeave = () => {
    setHovered(false);
    if (!dragRef.current) setInteraction('idle');
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
          {taskTotal > 0 ? (
            <div className="pet-bubble-line">{visibleLine}</div>
          ) : (
            <figure className="pet-idle-quote">
              <blockquote>{visibleLine}</blockquote>
              {visibleQuote?.author ? <figcaption>{visibleQuote.author}</figcaption> : null}
            </figure>
          )}
          {taskTotal > 0 ? (
            <div className="pet-task-list" aria-label={t('pet.taskListAria')}>
              <TaskGroup
                title={t('pet.taskGroup.running')}
                tasks={taskCenter.running}
                onOpenProject={onOpenProject}
                openTitle={(project) => t('pet.taskOpenProject', { project })}
              />
              <TaskGroup
                title={t('pet.taskGroup.queued')}
                tasks={taskCenter.queued}
                onOpenProject={onOpenProject}
                openTitle={(project) => t('pet.taskOpenProject', { project })}
              />
              <RecentTaskGroup
                title={t('pet.taskGroup.recent')}
                tasks={visibleRecentTasks}
                onOpenProject={onOpenProject}
                openTitle={(project) => t('pet.taskOpenProject', { project })}
              />
            </div>
          ) : null}
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
          rowId={ambientRowId ?? taskRowId ?? preferredRowId(interaction)}
        />
        {badgeTotal > 0 ? (
          <span className="pet-sprite-status" aria-label={visibleLine}>
            {badgeTotal}
          </span>
        ) : null}
        <span className="pet-sprite-shadow" aria-hidden />
      </div>
    </div>
  );
}

function TaskItem({
  children,
  clickable,
  onClick,
  title,
}: {
  children: ReactNode;
  clickable: boolean;
  onClick?: () => void;
  title: string;
}) {
  if (clickable) {
    return (
      <button
        type="button"
        className="pet-task-item"
        onClick={onClick}
        title={title}
      >
        {children}
      </button>
    );
  }
  return (
    <div className="pet-task-item pet-task-item--static" title={title}>
      {children}
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  onOpenProject,
  openTitle,
}: {
  title: string;
  tasks: PetTaskSummary[];
  onOpenProject?: (projectId: string) => void;
  openTitle: (projectName: string) => string;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="pet-task-group">
      <div className="pet-task-group-title">{title}</div>
      {tasks.slice(0, 3).map((task) => (
        <TaskItem
          key={task.projectId}
          clickable={Boolean(onOpenProject)}
          onClick={onOpenProject ? () => onOpenProject(task.projectId) : undefined}
          title={openTitle(task.projectName)}
        >
          <span
            className="pet-task-dot"
            data-pet-task-status={task.status}
            aria-hidden
          />
          <span className="pet-task-name">{task.projectName}</span>
          {task.count > 1 ? (
            <span className="pet-task-count">{task.count}</span>
          ) : null}
        </TaskItem>
      ))}
    </section>
  );
}

function RecentTaskGroup({
  title,
  tasks,
  onOpenProject,
  openTitle,
}: {
  title: string;
  tasks: PetRecentTaskSummary[];
  onOpenProject?: (projectId: string) => void;
  openTitle: (projectName: string) => string;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="pet-task-group">
      <div className="pet-task-group-title">{title}</div>
      {tasks.slice(0, 3).map((task) => (
        <TaskItem
          key={`${task.projectId}:${task.updatedAt}`}
          clickable={Boolean(onOpenProject)}
          onClick={onOpenProject ? () => onOpenProject(task.projectId) : undefined}
          title={openTitle(task.projectName)}
        >
          <span
            className="pet-task-dot"
            data-pet-task-status={task.status}
            aria-hidden
          />
          <span className="pet-task-name">{task.projectName}</span>
        </TaskItem>
      ))}
    </section>
  );
}
