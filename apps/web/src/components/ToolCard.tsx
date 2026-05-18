/**
 * Renders a single tool_use (optionally paired with its tool_result) as an
 * inline card in the assistant message stream. Lookup order:
 *
 *   1. user-registered renderer in `tool-renderers` (the extension point
 *      analogous to CopilotKit's `useCopilotAction({ render })`)
 *   2. hardcoded family card for tools we ship with (TodoWrite / Write /
 *      Edit / Read / Bash / Glob / Grep / WebFetch / WebSearch)
 *   3. generic command/output fallback
 */
import { useState } from 'react';
import { useT } from '../i18n';
import { parseTodoWriteInput } from '../runtime/todos';
import { getToolRenderer, toRenderProps } from '../runtime/tool-renderers';
import type { AgentEvent } from '../types';

interface Props {
  use: Extract<AgentEvent, { kind: 'tool_use' }>;
  result?: Extract<AgentEvent, { kind: 'tool_result' }> | undefined;
  // True while the parent run is still streaming. Forwarded to registered
  // renderers via `status` so they can show live execution.
  runStreaming?: boolean;
  // True when the parent run reached a successful terminal status. Missing
  // tool results in successful completed turns are rendered as done.
  runSucceeded?: boolean;
  // Set of file names that exist in the project folder. When the tool's
  // `file_path`/`path` argument's basename appears in this set we surface
  // an "open" button on the card. Pass `undefined` to skip the existence
  // check (the button is then always shown for file-shaped tools).
  projectFileNames?: Set<string>;
  // Lifts a basename up to ProjectView so it can focus the matching tab
  // in FileWorkspace.
  onRequestOpenFile?: (name: string) => void;
  // True only for tool calls inside the most recent assistant message.
  // Older AskUserQuestion cards lock to a read-only summary so the user
  // cannot re-answer a stale question.
  isLast?: boolean;
  // Submit handler for interactive tool cards (currently AskUserQuestion).
  // Opaque to ToolCard. ChatPane / ProjectView wire it into the normal
  // chat send pipeline so the answer flows back to the model as the next
  // user message. Used as a fallback when no live `onAnswerToolUse` route
  // is available.
  onSubmitForm?: (text: string) => void;
  // When set, AskUserQuestion cards route the user's pick directly back to
  // the still-open stream-json child via /api/runs/:id/tool-result instead
  // of sending it as a fresh user message. AssistantMessage derives it
  // from `message.runId` so each assistant turn targets its own run.
  onAnswerToolUse?: (toolUseId: string, content: string) => Promise<boolean> | boolean;
}

export function ToolCard({
  use,
  result,
  runStreaming,
  runSucceeded,
  projectFileNames,
  onRequestOpenFile,
  isLast,
  onSubmitForm,
  onAnswerToolUse,
}: Props) {
  const name = use.name;
  const isStreaming = runStreaming ?? false;
  const isSucceeded = runSucceeded ?? false;
  const custom = getToolRenderer(name);
  if (custom) {
    // A misbehaving third-party renderer must not take down the whole
    // assistant message — catch synchronous throws and fall through to the
    // built-in family card. (React's own error boundaries still cover
    // throws raised inside the returned tree once it's mounted.)
    try {
      const node = custom(toRenderProps(use, result, isStreaming, isSucceeded));
      if (node !== undefined && node !== null && node !== false) return <>{node}</>;
    } catch (err) {
      console.error(`[ToolCard] custom renderer for "${name}" threw; falling back`, err);
    }
  }
  const ctx: FileToolCtx = { projectFileNames, onRequestOpenFile };
  if (name === 'AskUserQuestion' || name === 'ask_user_question')
    return (
      <AskUserQuestionCard
        toolUseId={use.id}
        input={use.input}
        result={result}
        runStreaming={isStreaming}
        runSucceeded={isSucceeded}
        isLast={isLast ?? false}
        onSubmitForm={onSubmitForm}
        onAnswerToolUse={onAnswerToolUse}
      />
    );
  if (name === 'TodoWrite' || name === 'todowrite') return <TodoCard input={use.input} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'Write' || name === 'write' || name === 'create_file')
    return <FileWriteCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (name === 'Edit' || name === 'str_replace_edit')
    return <FileEditCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (name === 'Read' || name === 'read_file')
    return <FileReadCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (name === 'Bash') return <BashCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'Glob' || name === 'list_files') return <GlobCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'Grep') return <GrepCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'WebFetch' || name === 'web_fetch') return <WebFetchCard input={use.input} />;
  if (name === 'WebSearch' || name === 'web_search') return <WebSearchCard input={use.input} />;
  return <GenericCard name={name} input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
}

interface FileToolCtx {
  projectFileNames?: Set<string> | undefined;
  onRequestOpenFile?: ((name: string) => void) | undefined;
}

function OpenInTabButton({ filePath, ctx }: { filePath: string; ctx: FileToolCtx }) {
  const t = useT();
  if (!ctx.onRequestOpenFile) return null;
  if (!filePath || filePath === '(unnamed)') return null;
  // The agent uses absolute paths; the project-file API keys on basename.
  const baseName = filePath.split('/').pop() ?? filePath;
  if (!baseName) return null;
  if (ctx.projectFileNames && !ctx.projectFileNames.has(baseName)) return null;
  const open = ctx.onRequestOpenFile;
  return (
    <button
      type="button"
      className="op-open"
      onClick={() => open(baseName)}
      title={t('tool.openInTab', { name: baseName })}
    >
      {t('tool.open')}
    </button>
  );
}

// Inline rendering of Claude's `AskUserQuestion` tool. The tool ships as
// part of the Claude Agent SDK (no daemon-side execution); when the model
// calls it the host is expected to collect the user's selection and feed
// it back as the tool result. We hijack the same `onSubmitForm` channel
// QuestionFormView uses, which ChatPane / ProjectView route into a normal
// chat send, so the answer arrives at the next turn as a user message.
//
// Input shape (per the SDK):
//   { questions: [{ question, header, options: [{ label, description }],
//     multiSelect }, ...] }
// We accept either array of objects or array of plain strings for `options`
// to stay tolerant of small protocol drift.
type AuqOption = { label: string; description?: string };
type AuqQuestion = {
  question: string;
  header?: string;
  options: AuqOption[];
  multiSelect: boolean;
};

function parseAskUserQuestionInput(input: unknown): AuqQuestion[] {
  const obj = (input ?? {}) as { questions?: unknown };
  if (!Array.isArray(obj.questions)) return [];
  const result: AuqQuestion[] = [];
  for (const raw of obj.questions) {
    if (!raw || typeof raw !== 'object') continue;
    const q = raw as Record<string, unknown>;
    const question = typeof q.question === 'string' ? q.question : '';
    if (!question) continue;
    const header = typeof q.header === 'string' ? q.header : undefined;
    const multiSelect = q.multiSelect === true;
    const rawOptions = Array.isArray(q.options) ? q.options : [];
    const options: AuqOption[] = [];
    for (const opt of rawOptions) {
      if (typeof opt === 'string') options.push({ label: opt });
      else if (opt && typeof opt === 'object') {
        const o = opt as Record<string, unknown>;
        const label = typeof o.label === 'string' ? o.label : '';
        if (!label) continue;
        const description = typeof o.description === 'string' ? o.description : undefined;
        options.push(description ? { label, description } : { label });
      }
    }
    if (options.length === 0) continue;
    result.push({ question, header, options, multiSelect });
  }
  return result;
}

function AskUserQuestionCard({
  toolUseId,
  input,
  result,
  runStreaming,
  runSucceeded,
  isLast,
  onSubmitForm,
  onAnswerToolUse,
}: {
  toolUseId: string;
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
  isLast: boolean;
  onSubmitForm?: (text: string) => void;
  onAnswerToolUse?: (toolUseId: string, content: string) => Promise<boolean> | boolean;
}) {
  const t = useT();
  const questions = parseAskUserQuestionInput(input);
  // Initial selections: empty string per question for single-select, empty
  // array for multi-select. Indexing by question text keeps things simple
  // because the SDK does not assign explicit ids.
  const [selections, setSelections] = useState<Record<string, string | string[]>>(() => {
    const seed: Record<string, string | string[]> = {};
    for (const q of questions) seed[q.question] = q.multiSelect ? [] : '';
    return seed;
  });
  // Track local submission so the card locks immediately on Submit. We
  // cannot rely on `result` alone because `claude-code -p` ships an auto
  // error tool_result that does not represent a real answer.
  const [submitted, setSubmitted] = useState(false);
  if (questions.length === 0) {
    return <GenericCard name="AskUserQuestion" input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  }
  // Real answer == non-error upstream tool_result OR our local submit
  // flag. Headless mode's auto error never lands in this bucket.
  const hasRealAnswer = (!!result && !result.isError) || submitted;
  // After a page reload the locally-held `selections` is empty because
  // useState resets, so the card would render its locked summary with no
  // chips highlighted. The persisted answer lives on `result.content`
  // (the tool_result the daemon wrote back into the run); parse it so the
  // user's pick stays visible across reloads. Multi-select answers are
  // serialized as a `- ` bullet list (one option per line) so labels
  // containing commas round-trip exactly.
  const answeredSelections = (() => {
    if (!result || result.isError || !result.content) return null;
    const out: Record<string, string | string[]> = {};
    const pairs = result.content.split('\n\n');
    for (const pair of pairs) {
      const newlineIdx = pair.indexOf('\n');
      if (newlineIdx === -1) continue;
      const q = pair.slice(0, newlineIdx).trim();
      const a = pair.slice(newlineIdx + 1).trim();
      if (!q) continue;
      const question = questions.find((qq) => qq.question === q);
      if (!question) continue;
      out[q] = question.multiSelect
        ? a.split('\n').map((s) => s.replace(/^- /, '').trim()).filter(Boolean)
        : a;
    }
    return out;
  })();
  // While the user is actively picking (card not yet locked), the local
  // `selections` is authoritative. Once locked, prefer the persisted
  // answer if available so reloads / cached messages still highlight.
  const effectiveSelections = hasRealAnswer && answeredSelections
    ? answeredSelections
    : selections;
  // We need at least one viable submit channel to be interactive: the live
  // `onAnswerToolUse` (preferred — feeds the tool_result back into the
  // open stream-json child) or the legacy `onSubmitForm` (fallback that
  // sends the answer as a fresh user message).
  const canSubmit = !!onAnswerToolUse || !!onSubmitForm;
  const locked = hasRealAnswer || !isLast || !canSubmit;
  const ready = questions.every((q) => {
    const v = selections[q.question];
    return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0;
  });
  function pickSingle(question: string, label: string) {
    if (locked) return;
    setSelections((prev) => ({ ...prev, [question]: label }));
  }
  function toggleMulti(question: string, label: string) {
    if (locked) return;
    setSelections((prev) => {
      const current = Array.isArray(prev[question]) ? (prev[question] as string[]) : [];
      const next = current.includes(label)
        ? current.filter((v) => v !== label)
        : [...current, label];
      return { ...prev, [question]: next };
    });
  }
  async function handleSubmit() {
    if (locked || !ready) return;
    const lines = questions.map((q) => {
      const v = selections[q.question];
      const answer = Array.isArray(v) ? v.map((s) => `- ${s}`).join('\n') : (v ?? '');
      return `${q.question}\n${answer}`;
    });
    const formatted = lines.join('\n\n');
    // Prefer the direct tool-result route: keeps the answer scoped to the
    // open stream-json child so claude-code's `AskUserQuestion` returns
    // without an auto error. Fall back to onSubmitForm only if no run is
    // wired up (e.g. older messages where the run already terminated).
    if (onAnswerToolUse) {
      setSubmitted(true);
      try {
        const ok = await onAnswerToolUse(toolUseId, formatted);
        if (ok === false) {
          // Live route failed (run gone, stdin closed). Revert the local
          // lock and try the legacy fallback so the user is not stuck.
          setSubmitted(false);
          onSubmitForm?.(formatted);
        }
      } catch {
        setSubmitted(false);
        onSubmitForm?.(formatted);
      }
      return;
    }
    if (onSubmitForm) {
      setSubmitted(true);
      onSubmitForm(formatted);
    }
  }
  // Status pill driven by our own answered/pending state, not the upstream
  // tool_result. claude-code's headless auto-error would otherwise surface
  // as a misleading `error` badge on what is really an open question. When
  // the card is locked because the user moved past it without a real
  // answer, drop the pill entirely.
  const statusLabel = hasRealAnswer
    ? t('tool.askQuestionAnswered')
    : !locked
      ? t('tool.askQuestionPending')
      : null;
  // Use the awaiting variant instead of `op-status-running`: pending input
  // is a steady waiting state, not active work, so the global pulsing
  // animation on `op-status-running` is misleading and noisy.
  const statusClass = hasRealAnswer ? 'op-status-ok' : 'op-status-awaiting';
  return (
    <div className={`op-card op-ask-question${locked ? ' op-ask-question-locked' : ''}`} data-testid="ask-user-question">
      <div className="op-card-head">
        <span className="op-icon" aria-hidden>?</span>
        <span className="op-title">{t('tool.askQuestion')}</span>
        {statusLabel ? (
          <span className={`op-status ${statusClass}`}>{statusLabel}</span>
        ) : null}
      </div>
      <div className="op-ask-question-body">
        {questions.map((q) => {
          const selected = effectiveSelections[q.question];
          return (
            <div key={q.question} className="op-ask-question-field">
              {q.header ? (
                <div className="op-ask-question-header">{q.header}</div>
              ) : null}
              <div className="op-ask-question-prompt">{q.question}</div>
              <div className="op-ask-question-options">
                {q.options.map((opt) => {
                  const isOn = Array.isArray(selected)
                    ? selected.includes(opt.label)
                    : selected === opt.label;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      className={`op-ask-question-option${isOn ? ' on' : ''}`}
                      aria-pressed={isOn}
                      disabled={locked}
                      onClick={() => (q.multiSelect ? toggleMulti(q.question, opt.label) : pickSingle(q.question, opt.label))}
                    >
                      <span className="op-ask-question-option-label">{opt.label}</span>
                      {opt.description ? (
                        <span className="op-ask-question-option-desc">{opt.description}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {!locked ? (
        <div className="op-ask-question-foot">
          <button
            type="button"
            className="op-ask-question-submit"
            disabled={!ready}
            onClick={handleSubmit}
          >
            {t('tool.askQuestionSubmit')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TodoCard({ input, runStreaming, runSucceeded, onDismiss }: { input: unknown; runStreaming: boolean; runSucceeded: boolean; onDismiss?: () => void }) {
  const t = useT();
  const todos = parseTodoWriteInput(input);
  // Mirror the pattern other agent UIs (Cursor, Codex) use: default the
  // todo list to expanded while there is in-progress work or anything
  // pending, collapse it to a one-line summary when everything is done.
  // The user can flip it manually via the header button — that local
  // override sticks for the lifetime of this card.
  const hasInProgress = todos.some((todo) => todo.status === 'in_progress');
  const hasPending = todos.some((todo) => todo.status !== 'completed');
  const defaultExpanded = todos.length > 0 && (hasInProgress || hasPending || runStreaming);
  const [overrideExpanded, setOverrideExpanded] = useState<boolean | null>(null);
  const expanded = overrideExpanded ?? defaultExpanded;
  if (todos.length === 0) return <GenericCard name="TodoWrite" input={input} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  // The counter reads as "active progress / total" — a task that is
  // currently in_progress counts toward the numerator alongside completed
  // ones, matching how Cursor / Codex tally tasks. Without this the user
  // sees 0/4 the entire time the first task is being worked, which is
  // confusing because something is clearly underway.
  const inProgressTodo = todos.find((todo) => todo.status === 'in_progress');
  const completed = todos.filter((todo) => todo.status === 'completed').length;
  const done = todos.filter(
    (todo) => todo.status === 'completed' || todo.status === 'in_progress',
  ).length;
  // All-complete state surfaces the Done dismiss button (when wired) so the
  // pinned task list can be cleared once the whole plan is finished.
  const allComplete = completed === todos.length;
  const showDismiss = !!onDismiss && allComplete;
  return (
    <div className={`op-card op-todo${expanded ? '' : ' op-todo-collapsed'}`}>
      <div className="op-card-head op-todo-head">
        <button
          type="button"
          className="op-todo-toggle"
          aria-expanded={expanded}
          onClick={() => setOverrideExpanded(!expanded)}
          title={expanded ? t('tool.todosCollapse') : t('tool.todosExpand')}
        >
          <span className="op-icon" aria-hidden>☐</span>
          <span className="op-title">{t('tool.todos')}</span>
          <span className="op-meta">
            {done}/{todos.length}
          </span>
          {!expanded && inProgressTodo ? (
            <span className="op-todo-current">
              {inProgressTodo.activeForm || inProgressTodo.content}
            </span>
          ) : null}
          <span className="op-todo-chev" aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
        </button>
        {showDismiss ? (
          <button
            type="button"
            className="op-todo-done"
            onClick={() => onDismiss?.()}
            title={t('tool.todosDismiss')}
          >
            {t('tool.todosDone')}
          </button>
        ) : null}
      </div>
      <div className={`accordion-collapsible${expanded ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <ul className="todo-list">
            {todos.map((todo, i) => (
              <li key={i} className={`todo-item todo-${todo.status}`}>
                <span className="todo-check" aria-hidden>
                  {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '◐' : '○'}
                </span>
                <span className="todo-text">
                  {todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FileWriteCard({
  input,
  result,
  runStreaming,
  runSucceeded,
  ctx,
}: {
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
  ctx: FileToolCtx;
}) {
  const t = useT();
  const obj = (input ?? {}) as { file_path?: string; filePath?: string; path?: string; content?: string };
  const file = obj.file_path ?? obj.filePath ?? obj.path ?? '(unnamed)';
  const lines = typeof obj.content === 'string' ? obj.content.split('\n').length : null;
  return (
    <div className="op-card op-file">
      <div className="op-card-head">
        <span className="op-icon op-icon-write" aria-hidden>+</span>
        <span className="op-title">{t('tool.write')}</span>
        <code className="op-path">{file}</code>
        {lines !== null ? (
          <span className="op-meta">{t('tool.lines', { n: lines })}</span>
        ) : null}
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <OpenInTabButton filePath={file} ctx={ctx} />
      </div>
    </div>
  );
}

function FileEditCard({
  input,
  result,
  runStreaming,
  runSucceeded,
  ctx,
}: {
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
  ctx: FileToolCtx;
}) {
  const t = useT();
  const obj = (input ?? {}) as {
    file_path?: string;
    filePath?: string;
    path?: string;
    old_string?: string;
    new_string?: string;
    edits?: { old_string?: string; new_string?: string }[];
  };
  const file = obj.file_path ?? obj.filePath ?? obj.path ?? '(unnamed)';
  const editCount = Array.isArray(obj.edits) ? obj.edits.length : 1;
  return (
    <div className="op-card op-file">
      <div className="op-card-head">
        <span className="op-icon op-icon-edit" aria-hidden>✎</span>
        <span className="op-title">{t('tool.edit')}</span>
        <code className="op-path">{file}</code>
        <span className="op-meta">
          {editCount} {editCount === 1 ? t('tool.changeSingular') : t('tool.changePlural')}
        </span>
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <OpenInTabButton filePath={file} ctx={ctx} />
      </div>
    </div>
  );
}

function FileReadCard({
  input,
  result,
  runStreaming,
  runSucceeded,
  ctx,
}: {
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
  ctx: FileToolCtx;
}) {
  const t = useT();
  const obj = (input ?? {}) as { file_path?: string; filePath?: string; path?: string };
  const file = obj.file_path ?? obj.filePath ?? obj.path ?? '(unnamed)';
  return (
    <div className="op-card op-file">
      <div className="op-card-head">
        <span className="op-icon op-icon-read" aria-hidden>↗</span>
        <span className="op-title">{t('tool.read')}</span>
        <code className="op-path">{file}</code>
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <OpenInTabButton filePath={file} ctx={ctx} />
      </div>
    </div>
  );
}

function BashCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { command?: string; description?: string };
  const command = obj.command ?? '';
  const desc = obj.description;
  const [open, setOpen] = useState(false);
  return (
    <div className="op-card op-bash">
      <div className="op-card-head">
        <span className="op-icon" aria-hidden>$</span>
        <span className="op-title">{t('tool.bash')}</span>
        {desc ? <span className="op-meta op-desc">{desc}</span> : null}
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        {result && result.content ? (
          <button className="op-toggle" onClick={() => setOpen((o) => !o)}>
            {open ? t('tool.hide') : t('tool.output')}
          </button>
        ) : null}
      </div>
      <pre className="op-command">{truncate(command, 400)}</pre>
      <div className={`accordion-collapsible${open && result ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          {result ? (
            <pre className="op-output">{truncate(result.content, 4000)}</pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GlobCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { pattern?: string; path?: string };
  return (
    <div className="op-card op-search">
      <div className="op-card-head">
        <span className="op-icon" aria-hidden>⌕</span>
        <span className="op-title">{t('tool.glob')}</span>
        <code className="op-path">{obj.pattern ?? '*'}</code>
        {obj.path ? (
          <span className="op-meta">{t('tool.in', { path: obj.path })}</span>
        ) : null}
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
      </div>
    </div>
  );
}

function GrepCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { pattern?: string; path?: string; glob?: string };
  return (
    <div className="op-card op-search">
      <div className="op-card-head">
        <span className="op-icon" aria-hidden>⌕</span>
        <span className="op-title">{t('tool.grep')}</span>
        <code className="op-path">{obj.pattern ?? ''}</code>
        {obj.path ? (
          <span className="op-meta">{t('tool.in', { path: obj.path })}</span>
        ) : null}
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
      </div>
    </div>
  );
}

function WebFetchCard({ input }: { input: unknown }) {
  const t = useT();
  const obj = (input ?? {}) as { url?: string };
  return (
    <div className="op-card op-web">
      <div className="op-card-head">
        <span className="op-icon" aria-hidden>↬</span>
        <span className="op-title">{t('tool.fetch')}</span>
        <code className="op-path">{obj.url ?? ''}</code>
      </div>
    </div>
  );
}

function WebSearchCard({ input }: { input: unknown }) {
  const t = useT();
  const obj = (input ?? {}) as { query?: string };
  return (
    <div className="op-card op-web">
      <div className="op-card-head">
        <span className="op-icon" aria-hidden>⌕</span>
        <span className="op-title">{t('tool.search')}</span>
        <code className="op-path">{obj.query ?? ''}</code>
      </div>
    </div>
  );
}

function GenericCard({
  name,
  input,
  result,
  runStreaming,
  runSucceeded,
}: {
  name: string;
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
}) {
  const summary = describeInput(input);
  return (
    <div className="op-card op-generic">
      <div className="op-card-head">
        <span className="op-icon" aria-hidden>·</span>
        <span className="op-title">{name}</span>
        {summary ? <span className="op-meta">{truncate(summary, 200)}</span> : null}
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
      </div>
    </div>
  );
}

function ResultBadge({ result, runStreaming, runSucceeded }: { result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  if (!result && runStreaming) return <span className="op-status op-status-running">{t('tool.running')}</span>;
  if (!result && !runSucceeded) return <span className="op-status op-status-error">{t('tool.error')}</span>;
  if (result?.isError) return <span className="op-status op-status-error">{t('tool.error')}</span>;
  return <span className="op-status op-status-ok">{t('tool.done')}</span>;
}

function describeInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  if (typeof input !== 'object') return String(input);
  const obj = input as Record<string, unknown>;
  for (const key of ['file_path', 'path', 'pattern', 'url', 'query', 'name', 'command']) {
    const v = obj[key];
    if (typeof v === 'string') return v;
  }
  try {
    return JSON.stringify(obj);
  } catch {
    return '';
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
