import type { ChatMessage, TaskDisplayProjection, ProjectMediaTask } from '@open-design/contracts';
import { dedupeToolUsesById, dropSupersededInFlightToolUses } from '../tool-events';
import { buildTurnBlocks } from './build-turn-blocks';
import { effectiveTurnRunStatus } from './turn-status';
import type { BuildTurnInput, ExecutionShell, TurnBlock } from './contract';

export type TaskPresentation = { owner: boolean; display: TaskDisplayProjection; messages: ChatMessage[] };
export type PresentedChatMessage = ChatMessage & { taskPresentation?: TaskPresentation };
export type TaskRecordPart = { key: string; shell: ExecutionShell } | { key: string; text: string };
export type TaskRecordContext = {
  mediaTasksByRunId?: ReadonlyMap<string, ProjectMediaTask[]>;
  previousTodosByMessageId?: ReadonlyMap<string, BuildTurnInput['previousTodos']>;
};

export function newerTaskDisplay(a?: TaskDisplayProjection, b?: TaskDisplayProjection): TaskDisplayProjection | undefined {
  if (!a || (b && a.id !== b.id)) return b;
  if (!b) return a;
  return b.revision > a.revision || (b.revision === a.revision && b.observedAt >= a.observedAt) ? b : a;
}

export function taskDisplayWithDeliveryState(display: TaskDisplayProjection, messages: readonly ChatMessage[]): TaskDisplayProjection {
  const current = messages.filter(message => message.runId === display.currentRunId).at(-1);
  // Local stop/error finalization can precede (or abort) the terminal SSE.
  // Freeze the presentation at that Run's end without inventing a server
  // revision, so a later authoritative timing snapshot can still replace it.
  if (current && (display.state === 'running' || display.state === 'preparing')
    && (current.runStatus === 'canceled' || current.runStatus === 'failed')) {
    const endedAt = current.endedAt ?? display.observedAt;
    // A running snapshot may arrive after Stop; rewind it to the same
    // terminal instant instead of retaining time accrued after that instant.
    const elapsedMs = display.elapsedMs == null ? null : Math.max(0, display.elapsedMs
      + (display.ticking ? endedAt - display.observedAt : 0));
    return { ...display, state: current.runStatus, ticking: false, elapsedMs, observedAt: endedAt };
  }
  return display.state === 'completed' && current && effectiveTurnRunStatus(current) === 'failed'
    ? { ...display, state: 'failed' } : display;
}

/** Presentation groups do not move formal replies across visible user messages. */
export function withTaskPresentation(messages: ChatMessage[], previous: PresentedChatMessage[] = []): PresentedChatMessage[] {
  const previousRows = new Map(previous.map(m => [m.id, m]));
  const groups = new Map<string, ChatMessage[]>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.taskDisplay || !message.runId
      || !message.taskDisplay.runIds.includes(message.runId)) continue;
    const group = groups.get(message.taskDisplay.id) ?? [];
    group.push(message); groups.set(message.taskDisplay.id, group);
  }
  const presentations = new Map<string, TaskPresentation>();
  for (const group of groups.values()) {
    const previousDisplay = previousRows.get(group[0]!.id)?.taskPresentation?.display;
    const display = taskDisplayWithDeliveryState(group.reduce<TaskDisplayProjection | undefined>((value, m) => newerTaskDisplay(value, m.taskDisplay),
      previousDisplay?.id === group[0]!.taskDisplay!.id ? previousDisplay : undefined)!, group);
    group.forEach((message, index) => presentations.set(message.id, { owner: index === 0, display, messages: group }));
  }
  return messages.map(message => {
    const taskPresentation = presentations.get(message.id);
    const old = previousRows.get(message.id);
    const reusePresentation = taskPresentation && old?.taskPresentation
      && old.taskPresentation.owner === taskPresentation.owner
      && old.taskPresentation.display.revision === taskPresentation.display.revision
      && old.taskPresentation.display.elapsedMs === taskPresentation.display.elapsedMs
      && old.taskPresentation.display.state === taskPresentation.display.state
      && old.taskPresentation.display.ticking === taskPresentation.display.ticking
      && (!taskPresentation.display.ticking || old.taskPresentation.display.observedAt === taskPresentation.display.observedAt)
      && sameRecordMessages(old.taskPresentation.messages, taskPresentation.messages);
    if (!taskPresentation) return message;
    const presentation = reusePresentation ? old!.taskPresentation! : taskPresentation;
    // Process caching must never suppress an unrelated delivery/recovery update.
    if (reusePresentation && Object.keys({...old,...message}).every(key =>
      ['taskDisplay','taskPresentation','events'].includes(key)
        || old![key as keyof ChatMessage] === message[key as keyof ChatMessage])) return old!;
    return { ...message, taskDisplay: taskPresentation.display, taskPresentation: presentation };
  });
}

function sameRecordMessages(a: ChatMessage[], b: ChatMessage[]): boolean {
  return a.length === b.length && a.every((m,i) => {
    const next = b[i]!;
    return m.id === next.id && m.runId === next.runId && m.runStatus === next.runStatus
      && m.resultDeliveryState === next.resultDeliveryState
      && m.content === next.content && m.startedAt === next.startedAt && m.endedAt === next.endedAt
      && m.createdAt === next.createdAt && m.producedFiles === next.producedFiles
      && (m.events?.length ?? 0) === (next.events?.length ?? 0)
      && (m.events ?? []).every((event,index) => event === next.events?.[index]
        || (event.kind === 'done_key' && next.events?.[index]?.kind === 'done_key'
          && JSON.stringify(event) === JSON.stringify(next.events[index])));
  });
}

export function automaticTaskProse(blocks: readonly TurnBlock[], index: number, message: ChatMessage,
  messages: readonly ChatMessage[]): boolean {
  const block = blocks[index];
  if (block?.kind !== 'prose' || /<(?:question-form|artifact|od-card)\b/i.test(block.text)) return false;
  // Only a daemon-associated automatic successor makes an earlier Run's prose
  // process narration. A new shell inside the same Run does not change a formal reply.
  if (!['failed', 'canceled'].includes(message.runStatus ?? '')
    && messages.slice(messages.findIndex(m => m.id === message.id) + 1).some(m =>
    m.runId !== message.runId && m.strategyTaskExecutionId
      && m.strategyTaskExecutionId === message.strategyTaskExecutionId
      && (m.strategyTaskRunIndex ?? 0) > (message.strategyTaskRunIndex ?? 0))) return true;
  const prefixCount = message.strategyTaskPrefixEventCount ?? 0;
  if (!prefixCount || !message.events?.slice(prefixCount).some(event => event.kind === 'done_key')) return false;
  const prefix = buildTurnBlocks({
    events: dedupeToolUsesById(dropSupersededInFlightToolUses(message.events.slice(0, prefixCount))), runStatus: 'succeeded',
  });
  // Empty shells disappear when a Run finishes; compare prose positions so
  // that dropping an empty shell cannot shift a production conclusion into the prefix.
  const proseIndex = blocks.slice(0, index).filter(part => part.kind === 'prose').length;
  const priorProse = prefix.filter(part => part.kind === 'prose');
  return priorProse[proseIndex]?.text === block.text;
}

export function taskRecordParts(messages: ChatMessage[], nowMs?: number, context?: TaskRecordContext): TaskRecordPart[] {
  const parts: TaskRecordPart[] = [];
  for (const message of messages) {
    const events = message.events?.length ? message.events : message.content.trim() ? [{ kind: 'text' as const, text: message.content }] : [];
    const blocks = buildTurnBlocks({ events: dedupeToolUsesById(dropSupersededInFlightToolUses(events)),
      mediaTasks: message.runId ? context?.mediaTasksByRunId?.get(message.runId) : undefined,
      previousTodos: context?.previousTodosByMessageId?.get(message.id),
      runStatus: effectiveTurnRunStatus(message,
        message.taskDisplay?.state === 'running' && message.taskDisplay.currentRunId === message.runId
          && !['succeeded', 'failed', 'canceled'].includes(message.runStatus ?? '')),
      ...(message.startedAt != null || message.createdAt != null ? { startedAtMs: message.startedAt ?? message.createdAt } : {}),
      ...(message.endedAt != null ? { endedAtMs: message.endedAt } : {}), ...(nowMs != null ? { nowMs } : {}) });
    blocks.forEach((block, index) => {
      const key = `${message.id}:${index}`;
      if (block.kind === 'shell' && (block.items.length || block.segments.length
        || (block.status === 'running' && !block.stopped))) parts.push({ key, shell: block });
      else if (block.kind === 'prose' && automaticTaskProse(blocks, index, message, messages)) parts.push({ key, text: block.text });
    });
  }
  // Preserve live thinking/first-output rows inside an existing process,
  // while still omitting a task record with no process content at all.
  return parts.some(part => 'text' in part || part.shell.items.length || part.shell.segments.length) ? parts : [];
}

export function taskDisplayElapsed(display: TaskDisplayProjection, nowMs?: number): number | null {
  return display.elapsedMs == null ? null : display.elapsedMs
    + (display.ticking ? Math.max(0, (nowMs ?? display.observedAt) - display.observedAt) : 0);
}
