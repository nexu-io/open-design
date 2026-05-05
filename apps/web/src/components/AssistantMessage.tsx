import { Fragment, useEffect, useMemo, useState } from 'react';
import { ToolCard } from './ToolCard';
import { renderMarkdown } from '../runtime/markdown';
import { projectFileUrl } from '../providers/registry';
import { splitOnQuestionForms, type QuestionForm } from '../artifacts/question-form';
import { QuestionFormView, parseSubmittedAnswers } from './QuestionForm';
import { Icon } from './Icon';
import { useT } from '../i18n';
import { unfinishedTodosFromEvents, type TodoItem } from '../runtime/todos';
import type { Dict } from '../i18n/types';
import { agentDisplayName, exactAgentDisplayName } from '../utils/agentLabels';
import { exactDateTime, messageTime, relativeTimeLong } from '../utils/chatTime';
import type { AgentEvent, ChatMessage, ProjectFile } from '../types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

interface Props {
  message: ChatMessage;
  streaming: boolean;
  projectId: string | null;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
  // True only for the most recent assistant message — gate question-form
  // interactivity on this so older forms render as a locked "answered"
  // capsule instead of being re-submittable.
  isLast?: boolean;
  // The user message that immediately follows this assistant turn (if
  // any). Used to detect that a form was already answered so we can
  // render its locked state with the user's picks visible.
  nextUserContent?: string;
  // Submit handler the form fires when the user picks answers — opaque
  // to AssistantMessage; ProjectView wires it into onSend.
  onSubmitForm?: (text: string) => void;
  onContinueRemainingTasks?: (todos: TodoItem[]) => void;
}

/**
 * Renders an assistant message as an interleaved flow of:
 *   - prose blocks (consecutive `text` events merged)
 *   - thinking blocks (collapsible)
 *   - grouped tool action cards — runs of consecutive same-name tools
 *     collapse into a single pill ("Editing ×3, Done") that expands to show
 *     the individual tool cards. Mirrors the chat surface in screenshot 9.
 *   - status pills
 */
export function AssistantMessage({
  message,
  streaming,
  projectId,
  projectFileNames,
  onRequestOpenFile,
  isLast,
  nextUserContent,
  onSubmitForm,
  onContinueRemainingTasks,
}: Props) {
  const t = useT();
  const events = message.events ?? [];
  const blocks = buildBlocks(events);
  const usage = events.find((e) => e.kind === 'usage') as
    | Extract<AgentEvent, { kind: 'usage' }>
    | undefined;
  const produced = message.producedFiles ?? [];
  const roleLabel = assistantRoleLabel(message, t);
  const unfinishedTodos = streaming ? [] : unfinishedTodosFromEvents(events);
  const canContinueTodos =
    !streaming && !!isLast && unfinishedTodos.length > 0 && !!onContinueRemainingTasks;
  // Track which forms the user submitted in this session so we lock them
  // immediately on click (without waiting for the parent to re-render).
  const [locallySubmitted, setLocallySubmitted] = useState<Set<string>>(() => new Set());

  return (
    <div className="msg assistant">
      <div className="role">
        <span>{roleLabel}</span>
        <MessageTimestamp message={message} t={t} />
      </div>
      <div className="assistant-flow">
        {blocks.length === 0 && streaming ? (
          <WaitingPill startedAt={message.startedAt} latestStatus={latestStatusLabel(events)} />
        ) : null}
        {blocks.map((b, i) => {
          if (b.kind === 'text')
            return (
              <ProseBlock
                key={i}
                text={b.text}
                isLastAssistant={!!isLast}
                streaming={streaming}
                nextUserContent={nextUserContent}
                locallySubmitted={locallySubmitted}
                onSubmitForm={(formId, text) => {
                  setLocallySubmitted((prev) => {
                    const next = new Set(prev);
                    next.add(formId);
                    return next;
                  });
                  onSubmitForm?.(text);
                }}
              />
            );
          if (b.kind === 'thinking') return <ThinkingBlock key={i} text={b.text} />;
          if (b.kind === 'tool-group') {
            return (
              <ToolGroupCard
                key={i}
                items={b.items}
                runStreaming={streaming}
                projectFileNames={projectFileNames}
                onRequestOpenFile={onRequestOpenFile}
              />
            );
          }
          if (b.kind === 'status') return <StatusPill key={i} label={b.label} detail={b.detail} />;
          return null;
        })}
        {!streaming && produced.length > 0 && projectId ? (
          <ProducedFiles
            files={produced}
            projectId={projectId}
            onRequestOpenFile={onRequestOpenFile}
          />
        ) : null}
        {!streaming && unfinishedTodos.length > 0 ? (
          <UnfinishedTodosPanel
            todos={unfinishedTodos}
            canContinue={canContinueTodos}
            onContinue={() => onContinueRemainingTasks?.(unfinishedTodos)}
          />
        ) : null}
        <AssistantFooter
          streaming={streaming}
          startedAt={message.startedAt}
          endedAt={message.endedAt}
          usage={usage}
          hasUnfinishedTodos={unfinishedTodos.length > 0}
        />
      </div>
    </div>
  );
}

function MessageTimestamp({ message, t }: { message: ChatMessage; t: TranslateFn }) {
  const ts = messageTime(message);
  if (!ts) return null;
  return (
    <time className="msg-time" dateTime={new Date(ts).toISOString()} title={exactDateTime(ts)}>
      {relativeTimeLong(ts, t)}
    </time>
  );
}

export function assistantRoleLabel(message: ChatMessage, t: TranslateFn): string {
  const model = assistantModelDetail(message);
  const fromName = message.agentName?.trim();
  if (fromName) return appendRoleModel(exactAgentDisplayName(fromName) ?? fromName, model);
  const fromId = agentDisplayName(message.agentId);
  if (fromId) return appendRoleModel(fromId, model);
  const starting = message.events?.find(
    (e) => e.kind === 'status' && e.label === 'starting' && e.detail,
  ) as Extract<AgentEvent, { kind: 'status' }> | undefined;
  return appendRoleModel(agentDisplayName(starting?.detail) ?? t('assistant.role'), model);
}

function assistantModelDetail(message: ChatMessage): string | null {
  const initializing = message.events?.find(
    (e) => e.kind === 'status' && e.label === 'initializing' && e.detail,
  ) as Extract<AgentEvent, { kind: 'status' }> | undefined;
  const detail = initializing?.detail?.trim();
  if (!detail || detail === 'default') return null;
  return detail;
}

function appendRoleModel(label: string, model: string | null): string {
  if (!model || label.includes(' · ')) return label;
  return `${label} · ${model}`;
}

function AssistantFooter({
  streaming,
  startedAt,
  endedAt,
  usage,
  hasUnfinishedTodos,
}: {
  streaming: boolean;
  startedAt: number | undefined;
  endedAt: number | undefined;
  usage: Extract<AgentEvent, { kind: 'usage' }> | undefined;
  hasUnfinishedTodos: boolean;
}) {
  const t = useT();
  const elapsed = useLiveElapsed(streaming, startedAt, endedAt);
  if (!streaming && !elapsed && !usage && !hasUnfinishedTodos) return null;
  return (
    <div className="assistant-footer" data-unfinished={hasUnfinishedTodos ? 'true' : 'false'}>
      <span className="dot" data-active={streaming ? 'true' : 'false'} />
      <span className="assistant-label">
        {streaming
          ? t('assistant.workingLabel')
          : hasUnfinishedTodos
            ? t('assistant.unfinishedLabel')
            : t('assistant.doneLabel')}
      </span>
      <span className="assistant-stats">
        {elapsed}
        {usage?.outputTokens != null
          ? ` · ${t('assistant.outTokens', { n: usage.outputTokens })}`
          : ''}
        {typeof usage?.costUsd === 'number'
          ? ` · $${usage.costUsd.toFixed(4)}`
          : ''}
      </span>
    </div>
  );
}

function UnfinishedTodosPanel({
  todos,
  canContinue,
  onContinue,
}: {
  todos: TodoItem[];
  canContinue: boolean;
  onContinue: () => void;
}) {
  const t = useT();
  const visible = todos.slice(0, 3);
  const hiddenCount = todos.length - visible.length;
  return (
    <div className="unfinished-todos">
      <div className="unfinished-todos-head">
        <span className="unfinished-todos-title">
          {t('assistant.unfinishedSummary', { n: todos.length })}
        </span>
        {canContinue ? (
          <button type="button" className="unfinished-todos-continue" onClick={onContinue}>
            {t('assistant.continueRemaining')}
          </button>
        ) : null}
      </div>
      <ul className="unfinished-todos-list">
        {visible.map((todo, i) => (
          <li key={`${todo.status}-${todo.content}-${i}`}>
            {todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <div className="unfinished-todos-more">
          {t('assistant.unfinishedMore', { n: hiddenCount })}
        </div>
      ) : null}
    </div>
  );
}

function ProducedFiles({
  files,
  projectId,
  onRequestOpenFile,
}: {
  files: ProjectFile[];
  projectId: string;
  onRequestOpenFile?: (name: string) => void;
}) {
  const t = useT();
  return (
    <div className="produced-files">
      <div className="produced-files-label">{t('assistant.producedFiles')}</div>
      <div className="produced-files-list">
        {files.map((f) => (
          <div key={f.name} className="produced-file">
            <span className="produced-file-icon" aria-hidden>
              <Icon name={kindIconName(f.kind)} size={14} />
            </span>
            <span className="produced-file-name" title={f.name}>{f.name}</span>
            <span className="produced-file-size">{humanBytes(f.size)}</span>
            <div className="produced-file-actions">
              {onRequestOpenFile ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onRequestOpenFile(f.name)}
                >
                  {t('assistant.openFile')}
                </button>
              ) : null}
              <a
                className="ghost-link"
                href={projectFileUrl(projectId, f.name)}
                download={f.name}
              >
                {t('assistant.downloadFile')}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function kindIconName(
  kind: ProjectFile['kind'],
): 'file-code' | 'image' | 'pencil' | 'file' {
  if (kind === 'html') return 'file-code';
  if (kind === 'image') return 'image';
  if (kind === 'sketch') return 'pencil';
  if (kind === 'code') return 'file-code';
  return 'file';
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The pre-first-block waiting indicator. Shows "Waiting for first output…"
 * normally, the latest status label (initializing / starting / thinking /
 * streaming) once we have one, plus a soft hint after ~12 seconds telling
 * the user they can stop the run if it really seems stuck.
 */
function WaitingPill({
  startedAt,
  latestStatus,
}: {
  startedAt?: number;
  latestStatus?: { label: string; detail?: string | undefined };
}) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsedSec = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const slow = elapsedSec >= 12;
  const label = latestStatus?.label
    ? humanizeStatus(latestStatus.label, t)
    : t('assistant.waitingFirstOutput');
  return (
    <div className="op-waiting">
      <span className="op-waiting-dot" aria-hidden />
      <span className="op-waiting-label">{label}</span>
      {latestStatus?.detail ? (
        <code className="op-waiting-detail">{latestStatus.detail}</code>
      ) : null}
      {slow ? (
        <span className="op-waiting-hint">{t('assistant.slowHint')}</span>
      ) : null}
    </div>
  );
}

function humanizeStatus(label: string, t: (k: keyof Dict) => string): string {
  if (label === 'initializing') return t('assistant.statusBootingAgent');
  if (label === 'starting') return t('assistant.statusStarting');
  if (label === 'requesting') return t('assistant.statusRequesting');
  if (label === 'thinking') return t('assistant.statusThinking');
  if (label === 'streaming') return t('assistant.statusStreaming');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function latestStatusLabel(
  events: AgentEvent[],
): { label: string; detail?: string | undefined } | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.kind === 'status') return { label: ev.label, detail: ev.detail };
  }
  return undefined;
}

function ProseBlock({
  text,
  isLastAssistant,
  streaming,
  nextUserContent,
  locallySubmitted,
  onSubmitForm,
}: {
  text: string;
  isLastAssistant: boolean;
  streaming: boolean;
  nextUserContent?: string;
  locallySubmitted: Set<string>;
  onSubmitForm: (formId: string, text: string) => void;
}) {
  const cleaned = useMemo(() => stripArtifact(text), [text]);
  const segments = useMemo(() => splitOnQuestionForms(cleaned), [cleaned]);
  // Each text segment is further split on `<system-reminder>` blocks so
  // those render as their own collapsible chip instead of raw markup.
  const renderable = segments.flatMap((seg, idx): Array<
    | { key: string; kind: 'text'; text: string }
    | { key: string; kind: 'reminder'; text: string }
    | { key: string; kind: 'form'; form: QuestionForm }
  > => {
    if (seg.kind === 'form') {
      return [{ key: `f-${idx}`, kind: 'form', form: seg.form }];
    }
    if (seg.text.trim().length === 0) return [];
    const sub = splitSystemReminders(seg.text);
    return sub.map((s, j) => ({ key: `t-${idx}-${j}`, kind: s.kind, text: s.text }));
  });
  if (renderable.length === 0) return null;
  return (
    <div className="prose-block">
      {renderable.map((seg) => {
        if (seg.kind === 'reminder') {
          return <SystemReminderBlock key={seg.key} text={seg.text} />;
        }
        if (seg.kind === 'text') {
          return <Fragment key={seg.key}>{renderMarkdown(seg.text)}</Fragment>;
        }
        return (
          <FormBlock
            key={seg.key}
            form={seg.form}
            isLastAssistant={isLastAssistant}
            streaming={streaming}
            nextUserContent={nextUserContent}
            locallySubmitted={locallySubmitted}
            onSubmitForm={onSubmitForm}
          />
        );
      })}
    </div>
  );
}

function FormBlock({
  form,
  isLastAssistant,
  streaming,
  nextUserContent,
  locallySubmitted,
  onSubmitForm,
}: {
  form: QuestionForm;
  isLastAssistant: boolean;
  streaming: boolean;
  nextUserContent?: string;
  locallySubmitted: Set<string>;
  onSubmitForm: (formId: string, text: string) => void;
}) {
  // Reconstruct prior answers from a follow-up user message so older
  // forms in the scrollback render in their answered state.
  const submittedFromHistory = useMemo(() => {
    if (!nextUserContent) return null;
    return parseSubmittedAnswers(form, nextUserContent);
  }, [form, nextUserContent]);
  const wasSubmittedLocally = locallySubmitted.has(form.id);
  const interactive =
    isLastAssistant && !streaming && !submittedFromHistory && !wasSubmittedLocally;
  return (
    <QuestionFormView
      form={form}
      interactive={interactive}
      submittedAnswers={submittedFromHistory ?? undefined}
      onSubmit={(text) => onSubmitForm(form.id, text)}
    />
  );
}

function SystemReminderBlock({ text }: { text: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  const preview = trimmed.split('\n')[0]?.slice(0, 120) ?? '';
  return (
    <div className="system-reminder-block">
      <button
        className="system-reminder-toggle"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="system-reminder-icon" aria-hidden>
          <Icon name="settings" size={12} />
        </span>
        <span className="system-reminder-label">{t('assistant.systemReminder')}</span>
        <span className="system-reminder-preview">
          {open ? '' : preview}
          {!open && trimmed.length > preview.length ? '…' : ''}
        </span>
        <span className="system-reminder-chev">
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
        </span>
      </button>
      {open ? <pre className="system-reminder-body">{trimmed}</pre> : null}
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const preview = text.trim().slice(0, 140);
  return (
    <div className="thinking-block">
      <button className="thinking-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="thinking-icon" aria-hidden>
          <Icon name="sparkles" size={12} />
        </span>
        <span className="thinking-label">{t('assistant.thinking')}</span>
        <span className="thinking-preview">{open ? '' : preview}{!open && text.length > 140 ? '…' : ''}</span>
        <span className="thinking-chev">
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
        </span>
      </button>
      {open ? <pre className="thinking-body">{text}</pre> : null}
    </div>
  );
}

function StatusPill({ label, detail }: { label: string; detail?: string | undefined }) {
  return (
    <div className="status-pill">
      <span className="status-label">{label}</span>
      {detail ? <span className="status-detail">{detail}</span> : null}
    </div>
  );
}

interface ToolItem {
  use: Extract<AgentEvent, { kind: 'tool_use' }>;
  result?: Extract<AgentEvent, { kind: 'tool_result' }>;
}

function ToolGroupCard({
  items,
  runStreaming,
  projectFileNames,
  onRequestOpenFile,
}: {
  items: ToolItem[];
  runStreaming: boolean;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // A run of one tool collapses to that tool's card directly so we don't
  // wrap a single child in a redundant disclosure.
  if (items.length === 1) {
    return (
      <ToolCard
        use={items[0]!.use}
        result={items[0]!.result}
        runStreaming={runStreaming}
        projectFileNames={projectFileNames}
        onRequestOpenFile={onRequestOpenFile}
      />
    );
  }

  const summary = summarizeGroup(items, t);
  const running = items.some((it) => !it.result);
  return (
    <div className="action-card">
      <button
        type="button"
        className={`action-card-toggle ${running ? 'running' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="ico" aria-hidden>{summary.icon}</span>
        <span className="summary"><strong>{summary.label}</strong></span>
        <span className="chev" aria-hidden>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
        </span>
      </button>
      {open ? (
        <div className="action-card-body">
          {items.map((it, i) => (
            <ToolCard
              key={i}
              use={it.use}
              result={it.result}
              runStreaming={runStreaming}
              projectFileNames={projectFileNames}
              onRequestOpenFile={onRequestOpenFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function summarizeGroup(
  items: ToolItem[],
  t: (k: keyof Dict, vars?: Record<string, string | number>) => string,
): { label: string; icon: string } {
  // All items share a tool family because the grouper only merges by name.
  const name = items[0]?.use.name ?? '';
  const family = toolFamily(name);
  const icon = familyIcon(family);
  const verbs = items.map((it) => verbForState(it, t));
  // Roll the verbs into a comma-list with deduplicated last-state. So three
  // edits whose results are all 'Done' render as "Editing ×3, Done"; mixed
  // states render as "Editing, Reading, Done".
  const head = countLabel(family, items.length, t);
  const tail = lastStateLabel(verbs, t);
  return { label: tail ? `${head}, ${tail}` : head, icon };
}

function toolFamily(name: string): string {
  if (name === 'Edit' || name === 'str_replace_edit') return 'edit';
  if (name === 'Write' || name === 'create_file') return 'write';
  if (name === 'Read' || name === 'read_file') return 'read';
  if (name === 'Glob' || name === 'list_files') return 'glob';
  if (name === 'Grep') return 'grep';
  if (name === 'Bash') return 'bash';
  if (name === 'TodoWrite') return 'todo';
  if (name === 'WebFetch' || name === 'web_fetch') return 'fetch';
  if (name === 'WebSearch' || name === 'web_search') return 'search';
  return name.toLowerCase();
}

function familyIcon(family: string): string {
  if (family === 'edit') return '✎';
  if (family === 'write') return '+';
  if (family === 'read') return '↗';
  if (family === 'glob' || family === 'grep' || family === 'search') return '⌕';
  if (family === 'bash') return '$';
  if (family === 'todo') return '☐';
  if (family === 'fetch') return '↬';
  return '·';
}

function countLabel(
  family: string,
  n: number,
  t: (k: keyof Dict) => string,
): string {
  const verb =
    family === 'edit'
      ? t('assistant.verbEditing')
      : family === 'write'
        ? t('assistant.verbWriting')
        : family === 'read'
          ? t('assistant.verbReading')
          : family === 'glob' || family === 'grep' || family === 'search'
            ? t('assistant.verbSearching')
            : family === 'bash'
              ? t('assistant.verbRunning')
              : family === 'todo'
                ? t('assistant.verbTodos')
                : family === 'fetch'
                  ? t('assistant.verbFetching')
                  : t('assistant.verbCalling');
  return n > 1 ? `${verb} ×${n}` : verb;
}

function verbForState(
  it: ToolItem,
  t: (k: keyof Dict) => string,
): string {
  if (!it.result) return t('assistant.verbRunning');
  if (it.result.isError) return t('tool.error');
  return t('tool.done');
}

function lastStateLabel(
  verbs: string[],
  t: (k: keyof Dict) => string,
): string {
  const set = new Set(verbs);
  if (set.size === 1) return verbs[verbs.length - 1] ?? '';
  // Mixed states: surface error first, else running, else any.
  if (set.has(t('tool.error'))) return t('tool.error');
  if (set.has(t('assistant.verbRunning'))) return t('assistant.verbRunning');
  return verbs[verbs.length - 1] ?? '';
}

type Block =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool-group'; items: ToolItem[] }
  | { kind: 'status'; label: string; detail?: string | undefined };

/**
 * Walk the event stream and build the rendering layout list. We additionally
 * collapse runs of consecutive tool_uses sharing the same tool family into a
 * single tool-group block so the chat surface stays compact during chains
 * of edits / reads.
 */
function buildBlocks(events: AgentEvent[]): Block[] {
  const out: Block[] = [];
  const resultByToolId = new Map<string, Extract<AgentEvent, { kind: 'tool_result' }>>();
  for (const ev of events) {
    if (ev.kind === 'tool_result') resultByToolId.set(ev.toolUseId, ev);
  }
  for (const ev of events) {
    if (ev.kind === 'text') {
      const last = out[out.length - 1];
      if (last && last.kind === 'text') last.text += ev.text;
      else out.push({ kind: 'text', text: ev.text });
      continue;
    }
    if (ev.kind === 'thinking') {
      const last = out[out.length - 1];
      if (last && last.kind === 'thinking') last.text += ev.text;
      else out.push({ kind: 'thinking', text: ev.text });
      continue;
    }
    if (ev.kind === 'tool_use') {
      const result = resultByToolId.get(ev.id);
      const item: ToolItem = result ? { use: ev, result } : { use: ev };
      const last = out[out.length - 1];
      const fam = toolFamily(ev.name);
      if (
        last &&
        last.kind === 'tool-group' &&
        toolFamily(last.items[last.items.length - 1]!.use.name) === fam
      ) {
        last.items.push(item);
      } else {
        out.push({ kind: 'tool-group', items: [item] });
      }
      continue;
    }
    if (ev.kind === 'tool_result') continue;
    if (ev.kind === 'status') {
      if (ev.label === 'streaming' || ev.label === 'starting' || ev.label === 'requesting' || ev.label === 'thinking') continue;
      const last = out[out.length - 1];
      if (last && last.kind === 'status' && last.label === ev.label) continue;
      out.push({ kind: 'status', label: ev.label, detail: ev.detail });
      continue;
    }
  }
  return out;
}

function stripArtifact(content: string): string {
  const open = content.indexOf('<artifact');
  if (open === -1) return content;
  const closeTag = content.indexOf('>', open);
  const end = content.indexOf('</artifact>', closeTag);
  return (
    content.slice(0, open) + content.slice(end === -1 ? content.length : end + 11)
  ).trim();
}

// Split prose into alternating plain-text and `<system-reminder>` segments.
// Claude Code injects `<system-reminder>...</system-reminder>` blocks into the
// agent's input (memory hints, tool reminders, etc.); the model occasionally
// echoes those tags into its response. Rendering the raw markup as prose
// looks broken — surface them as their own collapsible block, and strip stray
// orphan open/close tags from the surrounding text.
type ProseSegment = { kind: 'text' | 'reminder'; text: string };

function splitSystemReminders(input: string): ProseSegment[] {
  const re = /<system-reminder>([\s\S]*?)<\/system-reminder>/g;
  const out: ProseSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > lastIndex) {
      out.push({ kind: 'text', text: input.slice(lastIndex, m.index) });
    }
    out.push({ kind: 'reminder', text: m[1] ?? '' });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < input.length) {
    out.push({ kind: 'text', text: input.slice(lastIndex) });
  }
  // Drop any orphan tags that survived (open without close, or vice versa)
  // and discard text segments that became empty after stripping.
  return out
    .map((seg) =>
      seg.kind === 'text'
        ? { ...seg, text: seg.text.replace(/<\/?system-reminder>/g, '') }
        : seg,
    )
    .filter((seg) => seg.kind === 'reminder' || seg.text.trim().length > 0);
}

function useLiveElapsed(
  streaming: boolean,
  startedAt: number | undefined,
  endedAt: number | undefined,
): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!streaming) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [streaming]);
  if (!startedAt) return '';
  const end = streaming ? now : (endedAt ?? now);
  const ms = Math.max(0, end - startedAt);
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s - m * 60);
  return `${m}m ${rem.toString().padStart(2, '0')}s`;
}
