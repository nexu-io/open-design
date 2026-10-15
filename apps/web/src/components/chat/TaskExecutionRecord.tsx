import { useMemo, useRef, useState } from 'react';
import type { TaskDisplayProjection } from '@open-design/contracts';
import { useT } from '../../i18n';
import { taskDisplayElapsed, taskRecordParts, type TaskPresentation, type TaskRecordContext } from '../../runtime/chat/task-presentation';
import { formatShellElapsed } from '../../runtime/chat/format';
import { ExecutionShell, type ExecutionShellProps } from './ExecutionShell';
import { Foldable } from './primitives/Foldable';
import { Orb } from './primitives/Orb';
import { SayBlock } from './SayBlock';
import styles from './TaskExecutionRecord.module.css';
import recordStyles from './primitives/record.module.css';

export function TaskStatus({ display, nowMs }: { display: TaskDisplayProjection; nowMs?: number }) {
  const t = useT();
  const labels = { preparing: 'assistant.statusPreparing', running: 'chat.record.running', waiting: 'chat.task.waiting',
    incomplete: 'assistant.unfinishedLabel', completed: 'chat.record.done', failed: 'chat.record.failedTurn', canceled: 'chat.record.canceled' } as const;
  const elapsed = formatShellElapsed(taskDisplayElapsed(display, nowMs));
  return <div className={styles.status} data-testid="task-display-status" data-state={display.state}>
    {display.state === 'running' ? <Orb state="connecting" box={24} className={recordStyles.orb} /> : null}
    <span className={display.state === 'running' ? `${recordStyles.shimmer} ${recordStyles.head}` : undefined}
      role="status" aria-live="polite">{t(labels[display.state])}</span>
    {elapsed != null ? <span className={styles.time}>{elapsed}</span> : null}
  </div>;
}

type Props = Omit<ExecutionShellProps, 'shell' | 'concluded' | 'bodyOnly'> & {
  task: TaskPresentation; storageKey: string; nowMs?: number; recordContext?: TaskRecordContext;
};
export function TaskExecutionRecord({ task, storageKey, nowMs, recordContext, ...props }: Props) {
  const t = useT();
  const parts = useMemo(() => taskRecordParts(task.messages, nowMs, recordContext), [task.messages, nowMs, recordContext]);
  const [preference, setPreference] = useState<boolean | undefined>(() => {
    try { const value = localStorage.getItem(storageKey); return value === 'true' ? true : value === 'false' ? false : undefined; } catch { return undefined; }
  });
  const open = preference ?? task.display.state === 'running';
  const openRef = useRef(open); openRef.current = open;
  const hasTodo = parts.some(part => 'shell' in part && part.shell.items.some(item => item.kind === 'todo' || item.kind === 'plan'));
  if (!parts.length) return null;
  return <Foldable summary={<span>{t('chat.task.record')}</span>} variant="flat" open={open}
    onToggle={next => { if (next === openRef.current) return; setPreference(next); try { localStorage.setItem(storageKey, String(next)); } catch { /* private storage */ } }}
    className={hasTodo ? recordStyles.hasTodo : undefined} deferBody>
    {parts.map(part => 'shell' in part
      ? <ExecutionShell {...props} key={part.key} shell={part.shell} bodyOnly odCardScope={`${props.odCardScope ?? storageKey}:${part.key}`} />
      : <SayBlock key={part.key} text={'text' in part ? part.text : t(part.marker === 'waiting' ? 'chat.task.waiting' : 'chat.task.continuation')}
          onBrandBrowserAssistConfirm={props.onBrandBrowserAssistConfirm} />)}
  </Foldable>;
}
