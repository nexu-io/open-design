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
import { isTodoWriteToolName, parseTodoWriteInput } from '../runtime/todos';
import { getToolRenderer, toRenderProps } from '../runtime/tool-renderers';
import type { AgentEvent } from '../types';
import { Icon } from './Icon';

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
}

export function ToolCard({
  use,
  result,
  runStreaming,
  runSucceeded,
  projectFileNames,
  onRequestOpenFile,
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
  if (isTodoWriteToolName(name)) return <TodoCard input={use.input} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'Write' || name === 'write' || name === 'create_file')
    return <FileWriteCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (name === 'Edit' || name === 'str_replace_edit')
    return <FileEditCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (name === 'Read' || name === 'read_file')
    return <FileReadCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (name === 'Bash') return <BashCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'Glob' || name === 'list_files') return <GlobCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'Grep') return <GrepCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'WebFetch' || name === 'web_fetch') return <WebFetchCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (name === 'WebSearch' || name === 'web_search') return <WebSearchCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (isAskUserQuestionName(name))
    return <LegacyAskUserQuestionCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  return <GenericCard name={name} input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
}

// The interactive `AskUserQuestion` mechanism was retired in favor of the
// unified `<question-form>` flow, but chat history survives app upgrades, so
// existing projects still carry persisted `AskUserQuestion` tool_use events.
// Without a dedicated renderer they fall through to GenericCard and surface
// the raw `{"questions":[...]}` JSON payload under an "AskUserQuestion" title.
// This read-only card renders those historical turns as an inert question
// summary — no submit path, no interactive answer route — so old history stays
// legible after the cleanup.
export function isAskUserQuestionName(name: string): boolean {
  return name === 'AskUserQuestion' || name === 'ask_user_question';
}

type LegacyAuqQuestion = { question: string; header?: string; options: string[] };

// Minimal, defensive parse of the legacy AUQ input shape
// `{ questions: [{ question, header, options: [{ label }] | [string] }] }`.
// Kept inline (the dedicated parser module was deleted with the mechanism);
// this only needs enough to render a read-only summary.
function parseLegacyAskUserQuestion(input: unknown): LegacyAuqQuestion[] {
  const obj = (input ?? {}) as { questions?: unknown };
  if (!Array.isArray(obj.questions)) return [];
  const out: LegacyAuqQuestion[] = [];
  for (const raw of obj.questions) {
    if (!raw || typeof raw !== 'object') continue;
    const q = raw as Record<string, unknown>;
    const question = typeof q.question === 'string' ? q.question : '';
    if (!question) continue;
    const header = typeof q.header === 'string' && q.header.trim() ? q.header.trim() : undefined;
    const options: string[] = [];
    if (Array.isArray(q.options)) {
      for (const opt of q.options) {
        if (typeof opt === 'string') {
          if (opt) options.push(opt);
          continue;
        }
        if (opt && typeof opt === 'object' && typeof (opt as { label?: unknown }).label === 'string') {
          const label = (opt as { label: string }).label;
          if (label) options.push(label);
        }
      }
    }
    out.push(header ? { question, header, options } : { question, options });
  }
  return out;
}

// Recover the user's persisted answer from a completed AUQ `tool_result`. The
// retired interactive card serialized answers as one `${question}\n${answer}`
// block per question, blocks joined by a blank line, with multi-select answers
// written as `- option` bullet lines. Surfacing it keeps old conversations
// auditable — two different answers no longer render identically.
function parseLegacyAuqAnswer(content: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!content) return map;
  for (const block of content.split('\n\n')) {
    const nl = block.indexOf('\n');
    if (nl === -1) continue;
    const q = block.slice(0, nl).trim();
    const a = block
      .slice(nl + 1)
      .split('\n')
      .map((s) => s.replace(/^- /, '').trim())
      .filter(Boolean)
      .join(', ');
    if (q && a) map.set(q, a);
  }
  return map;
}

function LegacyAskUserQuestionCard({
  input,
  result,
  runStreaming,
  runSucceeded,
}: {
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
}) {
  const questions = parseLegacyAskUserQuestion(input);
  const first = questions[0];
  // Unparseable payload → defer to the generic card rather than inventing UI.
  if (!first)
    return <GenericCard name="AskUserQuestion" input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  // Title + summary are model-authored text (already in the user's locale), so
  // no new i18n keys are needed for this historical-only surface.
  const title = first.header ?? truncate(first.question, 60);
  const answers = result && !result.isError ? parseLegacyAuqAnswer(result.content) : new Map<string, string>();
  // Surface the persisted pick(s) so completed history shows the actual answer,
  // not just the prompt. Falls back to the bare prompt when no answer is stored.
  const summary = questions
    .map((q) => {
      const answer = answers.get(q.question);
      return answer ? `${q.question} → ${answer}` : q.question;
    })
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="op-card op-generic">
      <div className="op-card-head">
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{title}</span>
        {summary ? <span className="op-meta">{truncate(summary, 240)}</span> : null}
      </div>
    </div>
  );
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

export function TodoCard({ input, runStreaming, runSucceeded, onDismiss }: { input: unknown; runStreaming: boolean; runSucceeded: boolean; onDismiss?: () => void }) {
  const t = useT();
  const todos = parseTodoWriteInput(input);
  // Mirror the pattern other agent UIs (Cursor, Codex) use: default the
  // todo list to expanded while there is in-progress work or anything
  // pending, collapse it to a one-line summary when everything is done.
  // The user can flip it manually via the header button — that local
  // override sticks for the lifetime of this card.
  const hasInProgress = todos.some((todo) => todo.status === 'in_progress');
  const hasPending = todos.some((todo) => todo.status === 'pending' || todo.status === 'in_progress');
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
                  {todo.status === 'completed'
                    ? '✓'
                    : todo.status === 'in_progress'
                      ? '◐'
                      : todo.status === 'stopped'
                        ? '!'
                        : '○'}
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
  const [open, setOpen] = useState(false);
  const obj = (input ?? {}) as { file_path?: string; filePath?: string; path?: string; content?: string };
  const file = obj.file_path ?? obj.filePath ?? obj.path ?? '(unnamed)';
  const baseName = file.split('/').pop() ?? file;
  const lines = typeof obj.content === 'string' ? obj.content.split('\n').length : null;
  const isRunning = runStreaming && !result;
  return (
    <div className="op-card op-file">
      <button type="button" className="op-card-head" onClick={() => setOpen((o) => !o)}>
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className={`op-title${isRunning ? ' shimmer-text' : ''}`}>{t('tool.write')}</span>
        <span className="op-meta">{baseName}{lines !== null ? ` · ${t('tool.lines', { n: lines })}` : ''}</span>
        <span className="op-expand-chev" aria-hidden>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={11} />
        </span>
      </button>
      <div className={`accordion-collapsible${open ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <div className="op-card-detail op-card-file-detail">
            <code className="op-path">{file}</code>
            <OpenInTabButton filePath={file} ctx={ctx} />
          </div>
        </div>
      </div>
      <FileErrorDetail result={result} />
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
  const [open, setOpen] = useState(false);
  const obj = (input ?? {}) as {
    file_path?: string;
    filePath?: string;
    path?: string;
    old_string?: string;
    new_string?: string;
    edits?: { old_string?: string; new_string?: string }[];
  };
  const file = obj.file_path ?? obj.filePath ?? obj.path ?? '(unnamed)';
  const baseName = file.split('/').pop() ?? file;
  const editCount = Array.isArray(obj.edits) ? obj.edits.length : 1;
  const isRunning = runStreaming && !result;
  return (
    <div className="op-card op-file">
      <button type="button" className="op-card-head" onClick={() => setOpen((o) => !o)}>
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className={`op-title${isRunning ? ' shimmer-text' : ''}`}>{t('tool.edit')}</span>
        <span className="op-meta">{baseName} · {editCount} {editCount === 1 ? t('tool.changeSingular') : t('tool.changePlural')}</span>
        <span className="op-expand-chev" aria-hidden>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={11} />
        </span>
      </button>
      <div className={`accordion-collapsible${open ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <div className="op-card-detail op-card-file-detail">
            <code className="op-path">{file}</code>
            <OpenInTabButton filePath={file} ctx={ctx} />
          </div>
        </div>
      </div>
      <FileErrorDetail result={result} />
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
  const [open, setOpen] = useState(false);
  const obj = (input ?? {}) as { file_path?: string; filePath?: string; path?: string };
  const file = obj.file_path ?? obj.filePath ?? obj.path ?? '(unnamed)';
  const baseName = file.split('/').pop() ?? file;
  const isRunning = runStreaming && !result;
  return (
    <div className="op-card op-file">
      <button type="button" className="op-card-head" onClick={() => setOpen((o) => !o)}>
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className={`op-title${isRunning ? ' shimmer-text' : ''}`}>{t('tool.read')}</span>
        <span className="op-meta">{baseName}</span>
        <span className="op-expand-chev" aria-hidden>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={11} />
        </span>
      </button>
      <div className={`accordion-collapsible${open ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <div className="op-card-detail op-card-file-detail">
            <code className="op-path">{file}</code>
            <OpenInTabButton filePath={file} ctx={ctx} />
          </div>
        </div>
      </div>
      <FileErrorDetail result={result} />
    </div>
  );
}

function BashCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { command?: string; description?: string };
  const command = obj.command ?? '';
  const desc = obj.description;
  const [open, setOpen] = useState(false);
  const isRunning = runStreaming && !result;
  return (
    <div className="op-card op-bash">
      <button type="button" className="op-card-head" onClick={() => setOpen((o) => !o)}>
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className={`op-title${isRunning ? ' shimmer-text' : ''}`}>{t('tool.bash')}</span>
        {desc ? <span className="op-meta op-desc">{desc}</span> : null}
        <span className="op-expand-chev" aria-hidden>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={11} />
        </span>
      </button>
      <div className={`accordion-collapsible${open ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <div className="op-card-detail">
            <pre className="op-command">{truncate(command, 400)}</pre>
            {result?.content ? (
              <pre className="op-output">{truncate(result.content, 4000)}</pre>
            ) : null}
          </div>
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
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{t('tool.glob')}</span>
        <span className="op-meta">{obj.pattern ?? '*'}{obj.path ? ` in ${obj.path}` : ''}</span>
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
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{t('tool.grep')}</span>
        <span className="op-meta">{obj.pattern ?? ''}{obj.path ? ` in ${obj.path}` : ''}</span>
      </div>
    </div>
  );
}

function WebFetchCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { url?: string };
  return (
    <div className="op-card op-web">
      <div className="op-card-head">
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{t('tool.fetch')}</span>
        <span className="op-meta">{obj.url ?? ''}</span>
      </div>
    </div>
  );
}

function WebSearchCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { query?: string };
  return (
    <div className="op-card op-web">
      <div className="op-card-head">
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{t('tool.search')}</span>
        <span className="op-meta">{obj.query ?? ''}</span>
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
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{name}</span>
        {summary ? <span className="op-meta">{truncate(summary, 200)}</span> : null}
      </div>
    </div>
  );
}

function ResultBadge({ result, runStreaming, runSucceeded }: { result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  if (!result && runStreaming) return <span className="op-status op-status-running" title={t('tool.running')}><Icon name="spinner" size={14} /></span>;
  if (!result && !runSucceeded) return <span className="op-status op-status-error" title={t('tool.error')}><Icon name="close" size={14} /></span>;
  if (result?.isError) return <span className="op-status op-status-error" title={result.content || t('tool.error')}><Icon name="close" size={14} /></span>;
  return <span className="op-status op-status-ok" title={t('tool.done')}><Icon name="check" size={14} /></span>;
}

function FileErrorDetail({ result }: { result?: Props['result'] }) {
  if (!result?.isError || !result.content.trim()) return null;
  return <pre className="op-output">{truncate(result.content, 1200)}</pre>;
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
