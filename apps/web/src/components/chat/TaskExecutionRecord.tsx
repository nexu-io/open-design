import { useMemo } from 'react';
import { taskDisplayElapsed, taskRecordParts, type TaskPresentation, type TaskRecordContext } from '../../runtime/chat/task-presentation';
import type { ExecutionShell as ShellData } from '../../runtime/chat/contract';
import { ExecutionShell, type ExecutionShellProps } from './ExecutionShell';
import { SayBlock } from './SayBlock';

type Props = Omit<ExecutionShellProps, 'shell' | 'bodyOnly' | 'children'> & {
  task: TaskPresentation; nowMs?: number; recordContext?: TaskRecordContext;
};

/** Merge automatic Runs inside the existing status/folding UI. */
export function TaskExecutionRecord({ task, nowMs, recordContext, foldPreference, ...props }: Props) {
  const parts = useMemo(() => taskRecordParts(task.messages, nowMs, recordContext), [task.messages, nowMs, recordContext]);
  const shells = parts.flatMap(part => 'shell' in part ? [part.shell] : []);
  if (!parts.length) return null;
  const shell: ShellData = {
    kind: 'shell', id: task.display.id,
    status: task.display.state === 'running' || task.display.state === 'preparing' ? 'running'
      : task.display.state === 'failed' ? 'failed' : 'done',
    stopped: task.display.state === 'canceled',
    elapsedMs: taskDisplayElapsed(task.display, nowMs),
    thinking: false, quietMs: null,
    items: shells.flatMap(part => part.items),
    segments: shells.flatMap(part => part.segments),
  };
  return <ExecutionShell {...props} shell={shell} foldPreference={foldPreference}>
    {parts.map(part => 'shell' in part
      ? <ExecutionShell {...props} key={part.key} shell={part.shell} bodyOnly
          odCardScope={`${props.odCardScope ?? task.display.id}:${part.key}`} />
      : <SayBlock key={part.key} text={part.text} onBrandBrowserAssistConfirm={props.onBrandBrowserAssistConfirm} />)}
  </ExecutionShell>;
}
