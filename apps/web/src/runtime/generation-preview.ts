import type { AgentEvent, ChatMessage, LiveArtifactSummary, ProjectFile } from '../types';
import { isLiveArtifactTabId, liveArtifactTabId } from '../types';
import { isTodoWriteToolName, latestTodosFromEvents, type TodoItem } from './todos';

export type GenerationStepStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export type GenerationPhase = 'generating' | 'awaiting-input' | 'stopped' | 'failed';

export interface GenerationPreviewStep {
  id: 'understand' | 'generate' | 'prepare';
  status: GenerationStepStatus;
}

export interface GenerationPreviewModel {
  startedAt: number;
  steps: GenerationPreviewStep[];
  phase: GenerationPhase;
  failed: boolean;
  errorMessage: string | null;
  progressPercent: number;
  /**
   * Latest human-readable activity snippet pulled from the streamed
   * events. Only set while actively generating so the waiting surface
   * shows real movement instead of a frozen card.
   */
  activityLabel: string | null;
  /**
   * Concrete sub-status for the long "generating" phase, e.g. the
   * in-progress task ("Writing index.html") or the current write target.
   * Lets the middle step show movement without splitting into more
   * (less reliable) discrete steps. Only set while generating.
   */
  detailLabel: string | null;
  /**
   * Task counter derived from the agent's TodoWrite plan, e.g. 3/8. The
   * in-progress task counts toward `done` to match the chat-side todo card.
   * Only set while generating and when the agent emitted a plan.
   */
  todoProgress: { done: number; total: number } | null;
}

// Matches the inline forms the agent emits to ask the user clarifying
// questions before continuing (see artifacts/question-form.ts).
const QUESTION_FORM_RE = /<(question-form|ask-question)\b/i;

// Tools that represent concrete generation work (writing/editing files,
// running commands) as opposed to reads/plans.
const WRITE_LIKE_TOOL_RE = /^(write|edit|multiedit|bash|run_terminal_cmd)$/i;

const PREVIEWABLE_FILE = /\.(html?|jsx|tsx|svg|md|pdf|pptx?|key)$/i;

export function workspaceHasPreviewSurface(input: {
  activeTab: string | null;
  projectFiles: ProjectFile[];
  liveArtifacts: LiveArtifactSummary[];
  streamingArtifactHtml?: string | null | undefined;
}): boolean {
  if (input.streamingArtifactHtml?.trim()) return true;
  const active = input.activeTab;
  if (!active) return false;
  if (isLiveArtifactTabId(active)) {
    return input.liveArtifacts.some((entry) => liveArtifactTabId(entry.id) === active);
  }
  const file = input.projectFiles.find((item) => item.name === active);
  if (!file) return false;
  if (file.kind === 'image' || file.kind === 'video' || file.kind === 'audio' || file.kind === 'sketch') {
    return true;
  }
  if (PREVIEWABLE_FILE.test(file.name)) return true;
  return file.kind === 'html' || file.kind === 'code' || file.kind === 'text';
}

export function deriveGenerationPreviewModel(input: {
  events: AgentEvent[];
  hasArtifactHtml: boolean;
  hasPreviewSurface: boolean;
  failed: boolean;
  errorMessage?: string | null;
}): Pick<GenerationPreviewModel, 'steps' | 'progressPercent' | 'errorMessage'> {
  const steps = derivePrototypeGenerationSteps({
    events: input.events,
    hasArtifactHtml: input.hasArtifactHtml,
    hasPreviewSurface: input.hasPreviewSurface,
    failed: input.failed,
  });
  const progressPercent = generationPreviewProgress(steps);
  return {
    steps,
    progressPercent,
    errorMessage: input.failed ? input.errorMessage?.trim() || failureMessageFromEvents(input.events) : null,
  };
}

export function buildGenerationPreviewState(input: {
  designSystemProject: boolean;
  messages: ChatMessage[];
  streaming: boolean;
  activeTab: string | null;
  projectFiles: ProjectFile[];
  liveArtifacts: LiveArtifactSummary[];
  artifactHtml?: string | null;
  conversationError?: string | null;
}): (GenerationPreviewModel & { retryTarget: ChatMessage | null }) | null {
  if (input.designSystemProject) return null;

  const hasPreviewSurface = workspaceHasPreviewSurface({
    activeTab: input.activeTab,
    projectFiles: input.projectFiles,
    liveArtifacts: input.liveArtifacts,
    streamingArtifactHtml: input.artifactHtml,
  });

  const latestAssistant = [...input.messages]
    .reverse()
    .find((message) => message.role === 'assistant');

  if (!latestAssistant) return null;

  const status = latestAssistant.runStatus;
  const runActive = isActiveRunStatus(status) || input.streaming;
  const runFailed = status === 'failed';
  const runStopped = status === 'canceled';
  // The agent finished its turn but is waiting on the user to answer an
  // inline question form before it can keep going.
  const awaitingInput =
    !runActive && !runFailed && !runStopped && messageHasPendingQuestion(latestAssistant);

  let phase: GenerationPhase;
  if (runFailed) {
    phase = 'failed';
  } else if (runActive) {
    phase = 'generating';
  } else if (runStopped) {
    phase = 'stopped';
  } else if (awaitingInput) {
    phase = 'awaiting-input';
  } else {
    return null;
  }

  // Once the user has something previewable, only the error state takes
  // over the surface; the calmer waiting states defer to the live preview
  // so we never hide a finished artifact behind a status card.
  if (hasPreviewSurface && phase !== 'failed') return null;

  const failed = phase === 'failed';
  const events = latestAssistant.events ?? [];
  const derived = deriveGenerationPreviewModel({
    events,
    hasArtifactHtml: Boolean(input.artifactHtml?.trim()),
    hasPreviewSurface,
    failed,
    errorMessage: input.conversationError,
  });

  const startedAt = latestAssistant.startedAt ?? latestAssistant.createdAt ?? Date.now();

  const generating = phase === 'generating';
  const todos = generating ? latestTodosFromEvents(events) : [];
  const todoProgress =
    todos.length > 0
      ? {
          done: todos.filter(
            (todo) => todo.status === 'completed' || todo.status === 'in_progress',
          ).length,
          total: todos.length,
        }
      : null;

  return {
    startedAt,
    steps: derived.steps,
    phase,
    failed,
    errorMessage: derived.errorMessage,
    progressPercent: derived.progressPercent,
    activityLabel: generating ? latestActivityLabel(events) : null,
    detailLabel: generating ? generationDetailLabel(events, todos) : null,
    todoProgress,
    retryTarget: failed ? latestAssistant : null,
  };
}

export function derivePrototypeGenerationSteps(input: {
  events: AgentEvent[];
  hasArtifactHtml: boolean;
  hasPreviewSurface: boolean;
  failed: boolean;
}): GenerationPreviewStep[] {
  const hasStatus = (labels: string[]) =>
    eventsHaveStatus(input.events, labels);
  const hasToolUse = input.events.some((event) => event.kind === 'tool_use');
  const hasWriteLikeTool = input.events.some(
    (event) =>
      event.kind === 'tool_use'
      && typeof event.name === 'string'
      && /^(write|edit|bash|run_terminal_cmd)$/i.test(event.name),
  );
  const hasArtifactStart = input.events.some(
    (event) => event.kind === 'text' && event.text.includes('<artifact'),
  ) || input.hasArtifactHtml;
  const hasText = input.events.some((event) => event.kind === 'text' && event.text.trim().length > 0);

  let understand: GenerationStepStatus = 'running';
  if (input.failed && !hasText && !hasToolUse) {
    understand = 'failed';
  } else if (hasText || hasStatus(['thinking', 'streaming']) || hasToolUse) {
    // `requesting`/`starting` only mean the request left the client — the
    // model hasn't produced anything yet, so we keep "understand" in
    // progress until real thinking/output/tool activity arrives. This lets
    // the UI reveal the steps one at a time instead of jumping straight to
    // a fully populated row.
    understand = 'succeeded';
  }

  let generate: GenerationStepStatus = 'pending';
  if (understand === 'succeeded') {
    generate = 'running';
  }
  if (hasWriteLikeTool || hasArtifactStart) {
    generate = 'succeeded';
  }
  if (input.failed && understand === 'succeeded' && !hasWriteLikeTool && !hasArtifactStart) {
    generate = 'failed';
  }

  let prepare: GenerationStepStatus = 'pending';
  if (generate === 'succeeded') {
    prepare = 'running';
  }
  if (input.hasPreviewSurface || input.hasArtifactHtml) {
    prepare = 'succeeded';
  }
  if (input.failed && generate === 'succeeded' && !input.hasPreviewSurface && !input.hasArtifactHtml) {
    prepare = 'failed';
  }

  return [
    { id: 'understand', status: understand },
    { id: 'generate', status: generate },
    { id: 'prepare', status: prepare },
  ];
}

export function generationPreviewProgress(steps: GenerationPreviewStep[]): number {
  if (steps.length === 0) return 8;
  const weights = { pending: 0, running: 0.45, succeeded: 1, failed: 0.2 };
  const score = steps.reduce((sum, step) => sum + weights[step.status], 0) / steps.length;
  return Math.max(8, Math.min(steps.some((step) => step.status === 'failed') ? 72 : 92, Math.round(score * 100)));
}

function isActiveRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'queued' || status === 'running';
}

function messageHasPendingQuestion(message: ChatMessage): boolean {
  if (typeof message.content === 'string' && QUESTION_FORM_RE.test(message.content)) {
    return true;
  }
  const events = message.events ?? [];
  return events.some((event) => event.kind === 'text' && QUESTION_FORM_RE.test(event.text));
}

function latestActivityLabel(events: AgentEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.kind === 'thinking' && event.text.trim()) {
      return truncateActivity(event.text);
    }
    if (event.kind === 'text' && event.text.trim() && !QUESTION_FORM_RE.test(event.text)) {
      return truncateActivity(event.text);
    }
    // Intentionally skip `status` details: their payload is often an
    // internal identifier (e.g. the model slug from a `requesting` event)
    // rather than human-readable progress, so surfacing it reads as noise.
  }
  return null;
}

function truncateActivity(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > 80 ? `${collapsed.slice(0, 79)}…` : collapsed;
}

// The concrete operation behind the "generating" step. Prefers the agent's
// own in-progress task label (TodoWrite `activeForm`/content), then falls
// back to the most recent write/edit target file so the middle phase still
// shows movement when no plan was emitted.
function generationDetailLabel(events: AgentEvent[], todos: TodoItem[]): string | null {
  const active = todos.find((todo) => todo.status === 'in_progress');
  if (active) {
    const label = active.activeForm?.trim() || active.content.trim();
    if (label) return truncateActivity(label);
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (
      event.kind === 'tool_use'
      && typeof event.name === 'string'
      && !isTodoWriteToolName(event.name)
      && WRITE_LIKE_TOOL_RE.test(event.name)
    ) {
      const target = toolTargetName(event.input);
      if (target) return target;
    }
  }
  return null;
}

function toolTargetName(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  const raw = obj.file_path ?? obj.filePath ?? obj.path ?? obj.file;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const segments = raw.trim().split(/[\\/]/);
  return segments[segments.length - 1] || raw.trim();
}

function eventsHaveStatus(events: AgentEvent[], labels: string[]): boolean {
  const normalized = new Set(labels.map((label) => label.toLowerCase()));
  return events.some(
    (event) =>
      event.kind === 'status'
      && normalized.has(event.label.toLowerCase()),
  );
}

function failureMessageFromEvents(events: AgentEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.kind === 'text' && event.text.trim()) return event.text.trim();
    if (event.kind === 'status' && event.detail?.trim()) return event.detail.trim();
  }
  return null;
}
