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
import { Icon, type IconName } from './Icon';

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

/** Stable product-level categories for execution details. */
export type ToolCategory =
  | 'todo'
  | 'write'
  | 'edit'
  | 'read'
  | 'run'
  | 'search'
  | 'fetch'
  | 'skill'
  | 'ask'
  | 'other';

const TOOL_CATEGORY_ICON: Record<ToolCategory, IconName> = {
  todo: 'kanban',
  write: 'file-code',
  edit: 'pencil',
  read: 'eye',
  run: 'terminal',
  search: 'search',
  fetch: 'globe',
  skill: 'puzzle',
  ask: 'help-circle',
  other: 'blocks',
};

export function toolCategoryForName(name: string): ToolCategory {
  if (isTodoWriteToolName(name)) return 'todo';
  const normalized = name.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['write', 'create_file'].includes(normalized)) return 'write';
  if (['edit', 'str_replace_edit', 'multiedit', 'notebookedit'].includes(normalized)) return 'edit';
  if (['read', 'read_file'].includes(normalized)) return 'read';
  if (['bash', 'shell', 'terminal', 'exec', 'exec_command', 'run_command'].includes(normalized)) return 'run';
  if (
    ['glob', 'grep', 'find', 'list_files'].includes(normalized) ||
    normalized.includes('search')
  ) return 'search';
  if (['webfetch', 'web_fetch', 'fetch', 'fetch_url'].includes(normalized)) return 'fetch';
  if (['skill', 'use_skill', 'run_skill'].includes(normalized) || normalized.endsWith('_skill')) return 'skill';
  if (isAskUserQuestionName(name)) return 'ask';
  return 'other';
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
  const category = toolCategoryForName(name);
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
  if (category === 'todo') return <TodoCard input={use.input} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (category === 'write')
    return <FileWriteCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (category === 'edit')
    return <FileEditCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (category === 'read')
    return <FileReadCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} ctx={ctx} />;
  if (category === 'run') return <BashCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (category === 'search') return <SearchCard toolName={name} input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (category === 'fetch') return <WebFetchCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  if (category === 'ask')
    return <LegacyAskUserQuestionCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
  return <GenericCard name={name} category={category} input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
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
    return <GenericCard name="AskUserQuestion" category="ask" input={input} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
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
        <ResultBadge category="ask" result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
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

export function TodoCard({
  input,
  runStreaming,
  runSucceeded,
  onContinue,
}: {
  input: unknown;
  runStreaming: boolean;
  runSucceeded: boolean;
  onContinue?: () => void;
}) {
  const t = useT();
  const todos = parseTodoWriteInput(input);
  // Mirror the pattern other agent UIs (Cursor, Codex) use: default the
  // todo list to expanded while there is in-progress work or anything
  // pending, and collapse it to its progress summary when everything is done.
  // The summary always remains a disclosure button, so completed tasks can be
  // reviewed without making every completed turn permanently verbose.
  const hasInProgress = todos.some((todo) => todo.status === 'in_progress');
  const hasPending = todos.some((todo) => todo.status === 'pending' || todo.status === 'in_progress');
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
  // All-complete state wins over an in-flight response: an agent may still be
  // writing its final prose after marking every task complete, so the details
  // start collapsed. The summary remains in the conversation as part of the
  // task history and can always be expanded for review.
  const allComplete = todos.length > 0 && completed === todos.length;
  const defaultExpanded = !allComplete && runStreaming && (hasInProgress || hasPending);
  const [overrideExpanded, setOverrideExpanded] = useState<boolean | null>(null);
  const expanded = overrideExpanded ?? defaultExpanded;
  if (todos.length === 0) return <GenericCard name="TodoWrite" category="todo" input={input} runStreaming={runStreaming} runSucceeded={runSucceeded} />;
  const showContinue = !!onContinue && !allComplete && !runStreaming;
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
          <span className="op-todo-icon" data-tool-category="todo" aria-hidden>
            <Icon name={TOOL_CATEGORY_ICON.todo} size={14} strokeWidth={2} />
          </span>
          <span className="op-title">{t('tool.todos')}</span>
          <span className="op-meta">
            {done}/{todos.length}
          </span>
          {allComplete ? <span className="op-todo-complete">{t('tool.todosDone')}</span> : null}
          {!expanded && inProgressTodo ? (
            <span className="op-todo-current">
              {inProgressTodo.activeForm || inProgressTodo.content}
            </span>
          ) : null}
          <span className="op-todo-chev" aria-hidden>
            <Icon name="chevron-down" size={14} />
          </span>
        </button>
        {showContinue ? (
          <button
            type="button"
            className="op-todo-continue"
            onClick={() => onContinue?.()}
          >
            {t('assistant.continueRemaining')}
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
      <button type="button" className="op-card-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ResultBadge category="write" result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
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
      <button type="button" className="op-card-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ResultBadge category="edit" result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
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
      <button type="button" className="op-card-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ResultBadge category="read" result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className={`op-title${isRunning ? ' shimmer-text' : ''}`}>{t('tool.read')}</span>
        <span className="op-meta">{baseName}</span>
        <span className="op-expand-chev" aria-hidden>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={11} />
        </span>
      </button>
      <div className={`accordion-collapsible${open ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <div className="op-card-detail op-card-file-detail op-card-read-detail">
            <div className="op-card-file-path-row">
              <code className="op-path">{file}</code>
              <OpenInTabButton filePath={file} ctx={ctx} />
            </div>
            {result?.content && !result.isError ? (
              <pre className="op-output">{truncate(result.content, 4000)}</pre>
            ) : null}
          </div>
        </div>
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
  const isRunning = runStreaming && !result;
  return (
    <div className="op-card op-bash">
      <button type="button" className="op-card-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ResultBadge category="run" result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
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
            {result?.content && !result.isError ? (
              <pre className="op-output">{truncate(result.content, 4000)}</pre>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchCard({ toolName, input, result, runStreaming, runSucceeded }: { toolName: string; input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { query?: string; pattern?: string; glob?: string; path?: string };
  const query = obj.query ?? obj.pattern ?? obj.glob ?? '*';
  const isWebSearch = toolName.toLowerCase().includes('web');
  return (
    <CompactResultCard
      className={isWebSearch ? 'op-web' : 'op-search'}
      category="search"
      title={t('tool.search')}
      summary={`${query}${obj.path ? ` in ${obj.path}` : ''}`}
      result={result}
      runStreaming={runStreaming}
      runSucceeded={runSucceeded}
    />
  );
}

function WebFetchCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { url?: string };
  return (
    <CompactResultCard
      className="op-web"
      category="fetch"
      title={t('tool.fetch')}
      summary={obj.url ?? ''}
      result={result}
      runStreaming={runStreaming}
      runSucceeded={runSucceeded}
    />
  );
}

function CompactResultCard({
  className,
  category,
  title,
  summary,
  result,
  runStreaming,
  runSucceeded,
}: {
  className: string;
  category: ToolCategory;
  title: string;
  summary: string;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasOutput = !!result?.content.trim() && !result.isError;
  const head = (
    <>
      <ResultBadge category={category} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
      <span className="op-title">{title}</span>
      {summary ? <span className="op-meta">{summary}</span> : null}
      {hasOutput ? (
        <span className="op-expand-chev" aria-hidden>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
        </span>
      ) : null}
    </>
  );
  return (
    <div className={`op-card ${className}`}>
      {hasOutput ? (
        <button
          type="button"
          className="op-card-head"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {head}
        </button>
      ) : (
        <div className="op-card-head op-card-head--static">{head}</div>
      )}
      {hasOutput ? (
        <div className={`accordion-collapsible${open ? ' open' : ''}`}>
          <div className="accordion-collapsible-inner">
            <div className="op-card-detail">
              <pre className="op-output">{truncate(result?.content ?? '', 4000)}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GenericCard({
  name,
  category,
  input,
  result,
  runStreaming,
  runSucceeded,
}: {
  name: string;
  category: ToolCategory;
  input: unknown;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
}) {
  const summary = describeInput(input);
  return (
    <div className="op-card op-generic">
      <div className="op-card-head">
        <ResultBadge category={category} result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{name}</span>
        {summary ? <span className="op-meta">{truncate(summary, 200)}</span> : null}
      </div>
    </div>
  );
}

function ResultBadge({
  category,
  result,
  runStreaming,
  runSucceeded,
}: {
  category: ToolCategory;
  result?: Props['result'];
  runStreaming: boolean;
  runSucceeded: boolean;
}) {
  const t = useT();
  const failed = result?.isError || (!result && !runStreaming && !runSucceeded);
  const completed = !failed && (!!result || (!runStreaming && runSucceeded));
  const state = failed ? 'error' : completed ? 'completed' : 'running';
  const title = failed
    ? result?.content || t('tool.error')
    : completed
      ? t('tool.done')
      : t('tool.running');
  return (
    <span
      className="op-status op-status-category"
      data-tool-category={category}
      data-tool-state={state}
      title={title}
    >
      <Icon name={TOOL_CATEGORY_ICON[category]} size={14} />
    </span>
  );
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
