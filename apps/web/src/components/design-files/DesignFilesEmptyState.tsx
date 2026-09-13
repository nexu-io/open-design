import { useRef } from 'react';

import { useT } from '../../i18n';
import type { RunFailure, RunPhase, RunProgressStep } from '../../runtime/run-progress';
import { SpaceBackground } from '../workspace/SpaceBackground';
import { failureLabel } from './run-step-label';
import { RunStepFeed } from './RunStepFeed';
import { useTextHoleRects } from './useTextHoleRects';
import styles from './DesignFilesEmptyState.module.css';

interface Props {
  /** True while the chat agent is generating. */
  running?: boolean;
  /** The running turn's tool calls, newest first (see `runtime/run-progress`). */
  steps?: RunProgressStep[];
  /** What the turn is doing before it has called anything. */
  phase?: RunPhase;
  /** Title of the question the finished turn is waiting on, if it asked one. */
  question?: string | null;
  /** How the finished turn died, if it did (see `runFailureState`). */
  failure?: RunFailure | null;
}

/**
 * Design Files with nothing in it yet. Instead of a card of creation CTAs
 * (those all live in the tab strip's "+" launcher), the pane shows the
 * orbiting particle field with the AGENT's state at its center: whether it is
 * thinking, and which tool call it is on.
 *
 * Only the agent's own lines go inside the ring, and only while there is
 * something to report: the steps while it works, and — when a turn stops
 * rather than finishes — the reason it stopped. That is the title of the
 * question it is waiting on, or the heading the chat's task card puts on a run
 * that failed or was canceled. Idle with nothing pending, the ring is just the
 * field turning.
 *
 * A dead run in particular has to reach this side. It used to not: the chat
 * column carried "Run failed" while the pane beside it went blank, which reads
 * as "nothing happened" rather than "it broke".
 *
 * Two things used to sit in there that were not the work: the user's latest
 * prompt (a sentence they had just typed and can still read in the chat
 * column, which also pushed the state line down a row) and, at rest, the copy
 * "designs will appear here". Neither is the agent doing something.
 *
 * The field paints AROUND the words. Every particle collapses onto one 105px
 * ring centered in the pane — exactly where this text sits — so the orbit used
 * to run straight through the sentences. The text's own line boxes are measured
 * and handed to `SpaceBackground` as holes, which fades the dots out as they
 * approach instead of clipping them. The block that holds them is sized to the
 * box inscribed in that ring (see the module CSS), so no line can cross it.
 *
 * The steps read as a log (see `RunStepFeed`): oldest at the top, the current
 * step on the bottom line, the feed following the tail.
 */
export function DesignFilesEmptyState({
  running = false,
  steps = [],
  phase = 'preparing',
  question = null,
  failure = null,
}: Props) {
  const t = useT();
  const centerRef = useRef<HTMLDivElement | null>(null);
  // Re-measured whenever the text can have moved: a new step, the run ending,
  // or the feed scrolling its own content down by one line.
  const holes = useTextHoleRects(
    centerRef,
    `${running}|${steps.length}|${question ?? ''}|${failure ?? ''}`,
  );

  return (
    <>
      {/* A smaller field than the component's default (per product): the ring
          and the spread around it are both driven by `ringRadius`, and the
          count follows its area so the field keeps its density instead of
          reading as the same orbit with holes in it. */}
      <SpaceBackground
        className={styles.field}
        ringRadius={105}
        particleCount={210}
        holes={holes}
      />
      <div className={styles.center} data-testid="design-files-empty-chat" ref={centerRef}>
        {running ? (
          <RunStepFeed
            running={running}
            steps={steps}
            phase={phase}
            className={styles.centerFeed}
          />
        ) : failure ? (
          // Ahead of the question: a turn that broke mid-ask stopped for the
          // failure, not for the answer.
          <p
            className={styles.failure}
            data-testid="design-files-empty-failure"
            data-failure={failure}
          >
            {failureLabel(failure, t)}
          </p>
        ) : question ? (
          <p className={styles.question} data-testid="design-files-empty-question">
            {question}
          </p>
        ) : null}
      </div>
    </>
  );
}
