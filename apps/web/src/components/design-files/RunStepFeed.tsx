import { useT } from '../../i18n';
import type { RunPhase, RunProgressStep } from '../../runtime/run-progress';
import { phaseLabel, stepLabel } from './run-step-label';
import styles from './RunStepFeed.module.css';

interface Props {
  /** True while the chat agent is generating. */
  running: boolean;
  /** The running turn's tool calls, NEWEST FIRST (see `runtime/run-progress`). */
  steps: readonly RunProgressStep[];
  /** What the turn is doing before it has called anything. */
  phase: RunPhase;
  className?: string;
}

/** One current activity title, matching the plan step shown in Chat. */
export function RunStepFeed({ running, steps, phase, className }: Props) {
  const t = useT();
  if (!running) return null;
  const current = steps[0];
  return (
    <ul className={`${styles.feed} ${className ?? ''}`} data-testid="run-step-feed">
      <li className={styles.item} data-current="true">
        {current ? stepLabel(current, t) : phaseLabel(phase, t)}
      </li>
    </ul>
  );
}
