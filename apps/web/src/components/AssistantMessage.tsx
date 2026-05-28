import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolCard } from "./ToolCard";
import { FileOpsSummary } from "./FileOpsSummary";
import {
  renderMarkdown,
  type MarkdownLinkClickHandler,
} from "../runtime/markdown";
import { asInProjectFilePath } from "../runtime/in-project-link";
import { projectFileUrl } from "../providers/registry";
import { submitChatRunToolResult } from "../providers/daemon";
import { useAnalytics } from "../analytics/provider";
import {
  trackAssistantFeedbackButtonClick,
  trackAssistantFeedbackClick,
  trackAssistantFeedbackReasonClick,
  trackAssistantFeedbackReasonPanelSurfaceView,
  trackAssistantFeedbackReasonSubmit,
  trackAssistantFeedbackReasonSubmitClick,
  trackAssistantFeedbackReasonView,
  trackFeedbackSubmitResult,
} from "../analytics/events";
import {
  feedbackAgentProviderIdToTracking,
  normalizeCustomReason,
  type TrackingFeedbackReasonCode,
  type TrackingFeedbackRatingWithNone,
  type TrackingProjectKind,
} from "@open-design/contracts/analytics";
import {
  splitOnQuestionForms,
  type QuestionForm,
} from "../artifacts/question-form";
import { stripArtifact } from "../artifacts/strip";
import { QuestionFormView, parseSubmittedAnswers } from "./QuestionForm";
import {
  getPluginFolderCandidates,
  type PluginFolderCandidate,
} from "./design-files/pluginFolders";
import type { PluginFolderAgentAction } from "./design-files/pluginFolderActions";
import { Icon } from "./Icon";
import { useT } from "../i18n";
import { deriveFileOps, type FileOpEntry } from "../runtime/file-ops";
import {
  isTodoWriteToolName,
  unfinishedTodosFromEvents,
  type TodoItem,
} from "../runtime/todos";
import type { Dict } from "../i18n/types";
import { agentDisplayName, exactAgentDisplayName } from "../utils/agentLabels";
import {
  exactDateTime,
  messageTime,
  relativeTimeLong,
} from "../utils/chatTime";
import type {
  AgentEvent,
  ChatMessage,
  ChatMessageFeedbackChange,
  ChatMessageFeedbackRating,
  ChatMessageFeedbackReasonCode,
  ProjectFile,
} from "../types";

type TranslateFn = (
  key: keyof Dict,
  vars?: Record<string, string | number>
) => string;

const DISCORD_INVITE_URL = "https://discord.gg/mHAjSMV6gz";

interface ActionNotice {
  message: string;
  url?: string;
}

function buildActionNotice(message: string, url?: string): ActionNotice {
  const trimmedMessage = message.trim();
  const trimmedUrl = url?.trim();
  if (!trimmedUrl) return { message: trimmedMessage };
  const normalizedMessage = trimmedMessage.replace(
    new RegExp(`\\s*${escapeRegExp(trimmedUrl)}\\s*$`),
    "",
  );
  return { message: normalizedMessage.trim() || trimmedUrl, url: trimmedUrl };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ActionNoticeView({ notice }: { notice: ActionNotice | null }) {
  if (!notice) return null;
  return (
    <>
      <span>{notice.message}</span>
      {notice.url ? (
        <>
          {" "}
          <a href={notice.url} target="_blank" rel="noreferrer">
            {notice.url}
          </a>
        </>
      ) : null}
    </>
  );
}

type SkillPluginCandidateBlock = Extract<Block, { kind: "plugin-candidate" }>;

function SkillPluginCandidateCard({
  block,
  projectId,
  onDismissed,
  onRequestOpenFile,
}: {
  block: SkillPluginCandidateBlock;
  projectId: string | null;
  onDismissed: (candidateId: string) => void;
  onRequestOpenFile?: (name: string) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<null | "draft" | "publish" | "contribute" | "dismiss">(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const disabled = !projectId || busy !== null;
  const description =
    block.description === "Reusable skill material detected from a repository link." ||
    block.description === "This repo looks like it could work as a plugin."
      ? t("skillPluginCandidate.repoDescription")
      : block.description || t("skillPluginCandidate.repoDescription");

  async function post(path: string, body: Record<string, unknown> = {}) {
    const resp = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const message =
        data?.message ??
        (typeof data?.error === "string" ? data.error : data?.error?.message) ??
        resp.statusText;
      throw new Error(message || "Plugin candidate action failed.");
    }
    return data;
  }

  async function createDraft() {
    if (!projectId) return;
    setBusy("draft");
    setNotice(null);
    try {
      const data = await post(
        `/api/projects/${encodeURIComponent(projectId)}/plugin-candidates/${encodeURIComponent(block.candidateId)}/draft`,
      );
      const draftPath = String(data?.draftPath ?? "");
      if (data?.validation?.ok === false) {
        setNotice({ message: "Draft created with validation issues." });
      } else if (draftPath) {
        const install = await post(
          `/api/projects/${encodeURIComponent(projectId)}/plugins/install-folder`,
          { path: draftPath },
        );
        if (install?.ok === false) {
          setNotice({ message: install?.message ?? "Plugin draft created, but install failed." });
        } else {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("open-design:plugins-changed"));
          }
          setNotice({ message: install?.message ?? "Plugin draft created and added to My plugins." });
        }
      } else {
        setNotice({ message: "Plugin draft created." });
      }
      if (draftPath && onRequestOpenFile) onRequestOpenFile(`${draftPath}/open-design.json`);
    } catch (err) {
      setNotice({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function share(action: "publish-github" | "contribute-open-design") {
    if (!projectId) return;
    setBusy(action === "publish-github" ? "publish" : "contribute");
    setNotice(null);
    try {
      const data = await post(
        `/api/projects/${encodeURIComponent(projectId)}/plugin-candidates/${encodeURIComponent(block.candidateId)}/share-tasks`,
        { action },
      );
      setNotice({
        message:
          action === "publish-github"
            ? `GitHub publish task started for ${data?.path ?? "the draft"}.`
            : `Open Design contribution task started for ${data?.path ?? "the draft"}.`,
      });
    } catch (err) {
      setNotice({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    if (!projectId) return;
    setBusy("dismiss");
    try {
      await post(
        `/api/projects/${encodeURIComponent(projectId)}/plugin-candidates/${encodeURIComponent(block.candidateId)}/dismiss`,
      );
      onDismissed(block.candidateId);
    } catch (err) {
      setNotice({ message: err instanceof Error ? err.message : String(err) });
      setBusy(null);
    }
  }

  return (
    <div className="plugin-action-panel" data-testid={`skill-plugin-candidate-${block.candidateId}`}>
      <div className="plugin-action-card">
        <div className="plugin-action-card__body">
          <div className="plugin-action-card__title">
            <Icon name="sparkles" size={14} />
            <span>{block.title}</span>
          </div>
          <p className="plugin-action-card__description">
            {description}
          </p>
          <div className="plugin-action-card__actions">
            <button
              type="button"
              className="plugin-action-button plugin-action-button--primary"
              disabled={disabled}
              onClick={() => void createDraft()}
            >
              <Icon name={busy === "draft" ? "spinner" : "plus"} size={13} />
              <span>{busy === "draft" ? "Creating..." : t("skillPluginCandidate.createForMe")}</span>
            </button>
            <button
              type="button"
              className="plugin-action-button"
              disabled={disabled}
              onClick={() => void share("contribute-open-design")}
            >
              <Icon name={busy === "contribute" ? "spinner" : "share"} size={13} />
              <span>{busy === "contribute" ? "Starting..." : t("skillPluginCandidate.contributeToMain")}</span>
            </button>
            <button
              type="button"
              className="plugin-action-button"
              disabled={disabled}
              onClick={() => void share("publish-github")}
            >
              <Icon name={busy === "publish" ? "spinner" : "github"} size={13} />
              <span>{busy === "publish" ? "Starting..." : t("skillPluginCandidate.publishRepo")}</span>
            </button>
            <button
              type="button"
              className="plugin-action-button"
              disabled={disabled}
              onClick={() => void dismiss()}
            >
              <Icon name={busy === "dismiss" ? "spinner" : "close"} size={13} />
              <span>{t("skillPluginCandidate.dismiss")}</span>
            </button>
          </div>
          {notice ? (
            <div className="plugin-action-card__notice" role="status">
              <ActionNoticeView notice={notice} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface Props {
  message: ChatMessage;
  streaming: boolean;
  projectId: string | null;
  // Analytics context for the assistant_feedback_* events. Defaults
  // applied at the call site keep AssistantMessage usable in tests
  // that don't care about telemetry.
  projectKind?: TrackingProjectKind | null;
  conversationId?: string | null;
  projectFiles?: ProjectFile[];
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string; url?: string } | void> | { message?: string; url?: string } | void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  // True only for the most recent assistant message — gate question-form
  // interactivity on this so older forms render as a locked "answered"
  // capsule instead of being re-submittable.
  isLast?: boolean;
  // Assistant message id whose run-failure error is rendered as ChatPane's
  // top-level error card; that message's per-message error pill is suppressed
  // to avoid duplication. Other messages keep their error pill.
  errorCardOwnerId?: string | null;
  // The user message that immediately follows this assistant turn (if
  // any). Used to detect that a form was already answered so we can
  // render its locked state with the user's picks visible.
  nextUserContent?: string;
  // Submit handler the form fires when the user picks answers — opaque
  // to AssistantMessage; ProjectView wires it into onSend.
  onSubmitForm?: (text: string) => void;
  onContinueRemainingTasks?: (todos: TodoItem[]) => void;
  onFeedback?: (change: ChatMessageFeedbackChange) => void;
  suppressDirectionForms?: boolean;
  hasDesignSystemContext?: boolean;
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
  projectKind = null,
  conversationId = null,
  projectFiles = [],
  projectFileNames,
  onRequestOpenFile,
  onRequestPluginFolderAgentAction,
  activePluginActionPaths = new Set(),
  hiddenPluginActionPaths = new Set(),
  isLast,
  errorCardOwnerId = null,
  nextUserContent,
  onSubmitForm,
  onContinueRemainingTasks,
  onFeedback,
  suppressDirectionForms = false,
  hasDesignSystemContext = false,
}: Props) {
  const t = useT();
  const events = message.events ?? [];
  // Claude sometimes hedges by emitting a markdown duplicate of the same
  // questions alongside an `AskUserQuestion` tool call. The card already
  // shows the questions + options, so suppressing the trailing prose
  // avoids rendering the same content twice. The system prompt asks the
  // model not to do this; this is the belt-and-suspenders.
  // The chat-pane-level PinnedTodoBar renders the canonical TodoWrite card
  // above the composer, so we strip any TodoWrite tool-groups out of the
  // per-message flow to avoid the same task list rendering twice.
  const blocks = stripTodoToolGroups(
    suppressDuplicateQuestionForms(
      suppressAskUserQuestionFallbackText(buildBlocks(events)),
    ),
  );
  const fileOps = useMemo(() => deriveFileOps(events), [events]);
  const produced = message.producedFiles ?? [];
  const displayedProduced = useMemo(
    () =>
      produced.length > 0
        ? produced
        : inferProducedFilesFromTurn({
            message,
            projectFiles,
            blocks,
            fileOps,
            streaming,
          }),
    [blocks, fileOps, message, produced, projectFiles, streaming],
  );
  const pluginActionFolders = useMemo(
    () =>
      !streaming && isLast && projectId
        ? pluginFoldersTouchedThisTurn(projectFiles, fileOps, displayedProduced, message.content)
            .filter((folder) => !hiddenPluginActionPaths.has(folder.path))
        : [],
    [displayedProduced, fileOps, hiddenPluginActionPaths, isLast, message.content, projectFiles, projectId, streaming],
  );
  // Plugin action state lives at the AssistantMessage level (not inside
  // PluginActionPanel) so the success notice survives the unmount/remount
  // cycle ProjectView triggers via `hiddenPluginActionPaths` during install
  // (issue #2876). If state lived inside the panel the setNoticeByFolder
  // call after `await onRequestPluginFolderAgentAction(...)` would land on
  // a dead fiber and the user would see nothing change after "Sending...".
  const [pluginBusyKey, setPluginBusyKey] = useState<string | null>(null);
  const [pluginNoticeByFolder, setPluginNoticeByFolder] = useState<Record<string, ActionNotice>>({});
  const runPluginAction = useCallback(
    async (folder: PluginFolderCandidate, action: PluginFolderAgentAction) => {
      if (pluginBusyKey || !onRequestPluginFolderAgentAction) return;
      const key = `${action}:${folder.path}`;
      setPluginBusyKey(key);
      setPluginNoticeByFolder((prev) => {
        if (!(folder.path in prev)) return prev;
        const next = { ...prev };
        delete next[folder.path];
        return next;
      });
      try {
        const outcome = await onRequestPluginFolderAgentAction(folder.path, action);
        const url =
          outcome && typeof outcome === "object" && typeof outcome.url === "string"
            ? outcome.url
            : "";
        const message =
          outcome && typeof outcome === "object" && typeof outcome.message === "string"
            ? outcome.message
            : "";
        // The install endpoint's PluginInstallOutcome contract leaves
        // `message` optional. When both message and url are absent we still
        // need to confirm success — the bug report explicitly describes
        // "the plugin was in fact added successfully, but the original
        // screen did not communicate that outcome." Default to a short
        // success label keyed off the action.
        const notice: ActionNotice | null =
          message || url
            ? buildActionNotice(message || url, url)
            : action === "install"
              ? { message: "Added to My plugins." }
              : null;
        if (notice) {
          setPluginNoticeByFolder((prev) => ({
            ...prev,
            [folder.path]: notice,
          }));
        }
      } catch (err) {
        setPluginNoticeByFolder((prev) => ({
          ...prev,
          [folder.path]: { message: err instanceof Error ? err.message : String(err) },
        }));
      } finally {
        setPluginBusyKey(null);
      }
    },
    [pluginBusyKey, onRequestPluginFolderAgentAction],
  );
  const usage = events.find((e) => e.kind === "usage") as
    | Extract<AgentEvent, { kind: "usage" }>
    | undefined;
  const roleLabel = assistantRoleLabel(message, t);
  const hasEmptyResponse = events.some(
    (e) => e.kind === "status" && e.label === "empty_response"
  );
  const unfinishedTodos = streaming ? [] : unfinishedTodosFromEvents(events);
  const runSucceeded =
    !streaming &&
    (message.runStatus === "succeeded" || (!message.runStatus && !!message.endedAt));
  const canContinueTodos =
    !streaming &&
    !!isLast &&
    unfinishedTodos.length > 0 &&
    !!onContinueRemainingTasks;
  const showFeedback =
    !!onFeedback &&
    isFeedbackEligible({
      streaming,
      message,
      hasEmptyResponse,
      hasUnfinishedTodos: unfinishedTodos.length > 0,
    });
  const showCompletionRow =
    showFeedback ||
    streaming ||
    !!message.startedAt ||
    !!message.endedAt ||
    !!usage ||
    unfinishedTodos.length > 0 ||
    hasEmptyResponse;
  // Track which forms the user submitted in this session so we lock them
  // immediately on click (without waiting for the parent to re-render).
  const [locallySubmitted, setLocallySubmitted] = useState<Set<string>>(
    () => new Set()
  );
  const [dismissedCandidateIds, setDismissedCandidateIds] = useState<Set<string>>(
    () => new Set()
  );
  // Route interactive tool answers (currently AskUserQuestion) back to the
  // still-open stream-json child via the daemon. We resolve to `true` on
  // success so the card can flip into its answered state; on `false` (run
  // already terminated, stdin closed, etc.) the card falls back to the
  // plain-text `onSubmitForm` path so the user is never stuck. Only wire
  // this when we have an active run id and the message is the latest turn
  // — older messages whose run is gone use the fallback exclusively.
  const onAnswerToolUse = useCallback(
    async (toolUseId: string, content: string) => {
      if (!isLast) return false;
      if (!message.runId) return false;
      const resp = await submitChatRunToolResult(message.runId, toolUseId, content);
      return resp.ok;
    },
    [isLast, message.runId],
  );

  return (
    <div className="msg assistant">
      <div className="role">
        <span>{roleLabel}</span>
        <MessageTimestamp message={message} t={t} />
      </div>
      <div className="assistant-flow">
        {blocks.length === 0 && streaming ? (
          <WaitingPill
            startedAt={message.startedAt}
            latestStatus={latestStatusLabel(events)}
          />
        ) : null}
        {fileOps.length > 0 ? (
          <FileOpsSummary
            entries={fileOps}
            streaming={streaming}
            projectFileNames={projectFileNames}
            onRequestOpenFile={onRequestOpenFile}
          />
        ) : null}
        {blocks.map((b, i) => {
          if (b.kind === "text")
            return (
              <ProseBlock
                key={i}
                text={b.text}
                isLastAssistant={!!isLast}
                streaming={streaming}
                nextUserContent={nextUserContent}
                locallySubmitted={locallySubmitted}
                suppressDirectionForms={suppressDirectionForms}
                onSubmitForm={(formId, text) => {
                  setLocallySubmitted((prev) => {
                    const next = new Set(prev);
                    next.add(formId);
                    return next;
                  });
                  onSubmitForm?.(text);
                }}
                onRequestOpenFile={onRequestOpenFile}
              />
            );
          if (b.kind === "thinking")
            return <ThinkingBlock key={i} text={b.text} />;
          if (b.kind === "tool-group") {
            return (
              <ToolGroupCard
                key={i}
                items={b.items}
                runStreaming={streaming}
                runSucceeded={runSucceeded}
                projectFileNames={projectFileNames}
                onRequestOpenFile={onRequestOpenFile}
                isLast={!!isLast}
                onSubmitForm={onSubmitForm}
                onAnswerToolUse={onAnswerToolUse}
              />
            );
          }
          if (b.kind === "plugin-candidate") {
            if (dismissedCandidateIds.has(b.candidateId)) return null;
            return (
              <SkillPluginCandidateCard
                key={i}
                block={b}
                projectId={projectId}
                onDismissed={(candidateId) =>
                  setDismissedCandidateIds((prev) => {
                    const next = new Set(prev);
                    next.add(candidateId);
                    return next;
                  })
                }
                onRequestOpenFile={onRequestOpenFile}
              />
            );
          }
          if (b.kind === "status") {
            // Suppress this message's gray error pill ONLY when ChatPane is
            // rendering the top-level error card for it (the last failed run).
            // Other failed turns — older history, or once a follow-up makes
            // this no longer the last assistant message — keep their pill so
            // the error detail still survives reload / history review.
            if (b.label === "error" && message.id === errorCardOwnerId) return null;
            return <StatusPill key={i} label={b.label} detail={b.detail} />;
          }
          return null;
        })}
        {!streaming && displayedProduced.length > 0 && projectId ? (
          <ProducedFiles
            files={displayedProduced}
            projectId={projectId}
            onRequestOpenFile={onRequestOpenFile}
          />
        ) : null}
        {!streaming && projectId && pluginActionFolders.length > 0 ? (
          <PluginActionPanel
            folders={pluginActionFolders}
            notices={pluginNoticeByFolder}
            busyKey={pluginBusyKey}
            onRunAction={runPluginAction}
            onRequestOpenFile={onRequestOpenFile}
            onRequestPluginFolderAgentAction={onRequestPluginFolderAgentAction}
            activePluginActionPaths={activePluginActionPaths}
          />
        ) : null}
        {/*
          Notices for folders that completed an action while the panel was
          unmounted (the parent toggled `hiddenPluginActionPaths` during the
          install) need a place to render once the panel goes away. Without
          this fallback, a successful "Add to My plugins" that hides the
          folder afterwards would silently swallow the confirmation
          (issue #2876).
         */}
        {!streaming && projectId
          ? Object.entries(pluginNoticeByFolder)
              .filter(([path]) => !pluginActionFolders.some((folder) => folder.path === path))
              .map(([path, notice]) => (
                <div
                  key={`plugin-orphan-notice-${path}`}
                  className="plugin-action-orphan-notice"
                  role="status"
                  data-testid={`plugin-folder-notice-${path}`}
                >
                  <ActionNoticeView notice={notice} />
                </div>
              ))
          : null}
        {!streaming && unfinishedTodos.length > 0 ? (
          <UnfinishedTodosPanel
            todos={unfinishedTodos}
            canContinue={canContinueTodos}
            onContinue={() => onContinueRemainingTasks?.(unfinishedTodos)}
          />
        ) : null}
        {showCompletionRow ? (
          <div className="assistant-completion-row">
            {showFeedback ? (
              <AssistantFeedback
                feedback={message.feedback}
                onFeedback={onFeedback}
                projectId={projectId}
                projectKind={projectKind}
                conversationId={conversationId}
                runId={message.runId ?? null}
                assistantMessageId={message.id}
                modelId={assistantFeedbackModelId(message)}
                agentProviderId={feedbackAgentProviderIdToTracking(message.agentId)}
                producedFileCount={displayedProduced.length}
                hasDesignSystemContext={hasDesignSystemContext}
                footerProps={{
                  streaming,
                  startedAt: message.startedAt,
                  endedAt: message.endedAt,
                  usage,
                  hasUnfinishedTodos: unfinishedTodos.length > 0,
                  hasEmptyResponse,
                  forceVisible: true,
                }}
              />
            ) : (
              <AssistantFooter
                streaming={streaming}
                startedAt={message.startedAt}
                endedAt={message.endedAt}
                usage={usage}
                hasUnfinishedTodos={unfinishedTodos.length > 0}
                hasEmptyResponse={hasEmptyResponse}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function inferProducedFilesFromTurn({
  message,
  projectFiles,
  blocks,
  fileOps,
  streaming,
}: {
  message: ChatMessage;
  projectFiles: ProjectFile[];
  blocks: Block[];
  fileOps: FileOpEntry[];
  streaming: boolean;
}): ProjectFile[] {
  if (streaming || message.role !== "assistant") return [];
  if (message.runStatus !== "succeeded") return [];
  if (!message.startedAt || !message.endedAt) return [];
  if (blocks.some((block) => block.kind === "text" || block.kind === "tool-group")) return [];
  if (fileOps.length > 0) return [];
  const start = message.startedAt - 1_000;
  const end = message.endedAt + 60_000;
  return projectFiles
    .filter((file) => {
      if (file.type === "dir") return false;
      if (!file.name || file.name.startsWith(".")) return false;
      if (file.name.includes("/.")) return false;
      return file.mtime >= start && file.mtime <= end;
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function isFeedbackEligible({
  streaming,
  message,
  hasEmptyResponse,
  hasUnfinishedTodos,
}: {
  streaming: boolean;
  message: ChatMessage;
  hasEmptyResponse: boolean;
  hasUnfinishedTodos: boolean;
}): boolean {
  if (streaming || hasEmptyResponse || hasUnfinishedTodos) return false;
  if (message.runStatus) return message.runStatus === "succeeded";
  return !!message.endedAt;
}

function MessageTimestamp({
  message,
  t,
}: {
  message: ChatMessage;
  t: TranslateFn;
}) {
  const ts = messageTime(message);
  if (!ts) return null;
  return (
    <time
      className="msg-time"
      dateTime={new Date(ts).toISOString()}
      title={exactDateTime(ts)}
    >
      {relativeTimeLong(ts, t)}
    </time>
  );
}

export function assistantRoleLabel(
  message: ChatMessage,
  t: TranslateFn
): string {
  const model = assistantModelDetail(message);
  const fromName = message.agentName?.trim();
  if (fromName)
    return appendRoleModel(exactAgentDisplayName(fromName) ?? fromName, model);
  const fromId = agentDisplayName(message.agentId);
  if (fromId) return appendRoleModel(fromId, model);
  const starting = message.events?.find(
    (e) => e.kind === "status" && e.label === "starting" && e.detail
  ) as Extract<AgentEvent, { kind: "status" }> | undefined;
  return appendRoleModel(
    agentDisplayName(starting?.detail) ?? t("assistant.role"),
    model
  );
}

function assistantModelDetail(message: ChatMessage): string | null {
  const initializing = message.events?.find(
    (e) => e.kind === "status" && e.label === "initializing" && e.detail
  ) as Extract<AgentEvent, { kind: "status" }> | undefined;
  const detail = initializing?.detail?.trim();
  if (!detail || detail === "default") return null;
  return detail;
}

function assistantFeedbackModelId(message: ChatMessage): string | null {
  const detail = assistantModelDetail(message);
  if (detail) return detail;
  const displayName = message.agentName?.trim();
  if (!displayName) return null;
  const parts = displayName.split(" · ");
  const model = parts.length > 1 ? parts[parts.length - 1]?.trim() : "";
  return model || null;
}

function appendRoleModel(label: string, model: string | null): string {
  if (!model || label.includes(" · ")) return label;
  return `${label} · ${model}`;
}

interface AssistantFooterProps {
  streaming: boolean;
  startedAt: number | undefined;
  endedAt: number | undefined;
  usage: Extract<AgentEvent, { kind: "usage" }> | undefined;
  hasUnfinishedTodos: boolean;
  hasEmptyResponse: boolean;
  feedbackControls?: ReactNode;
  forceVisible?: boolean;
}

function AssistantFooter({
  streaming,
  startedAt,
  endedAt,
  usage,
  hasUnfinishedTodos,
  hasEmptyResponse,
  feedbackControls,
  forceVisible = false,
}: AssistantFooterProps) {
  const t = useT();
  const elapsed = useLiveElapsed(streaming, startedAt, endedAt, usage?.durationMs);
  if (
    !forceVisible &&
    !streaming &&
    !elapsed &&
    !usage &&
    !hasUnfinishedTodos &&
    !hasEmptyResponse
  )
    return null;
  return (
    <div
      className="assistant-footer"
      data-unfinished={hasUnfinishedTodos ? "true" : "false"}
    >
      <span className="dot" data-active={streaming ? "true" : "false"} />
      <span className="assistant-label">
        {streaming
          ? t("assistant.workingLabel")
          : hasEmptyResponse
          ? t("assistant.emptyResponseLabel")
          : hasUnfinishedTodos
          ? t("assistant.unfinishedLabel")
          : t("assistant.doneLabel")}
      </span>
      <span className="assistant-stats">
        {elapsed}
        {usage?.outputTokens != null
          ? ` · ${t("assistant.outTokens", { n: usage.outputTokens })}`
          : ""}
        {typeof usage?.costUsd === "number"
          ? ` · $${usage.costUsd.toFixed(4)}`
          : ""}
      </span>
      {feedbackControls}
    </div>
  );
}

function AssistantFeedback({
  feedback,
  onFeedback,
  hasDesignSystemContext,
  footerProps,
  projectId,
  projectKind,
  conversationId,
  runId,
  assistantMessageId,
  modelId,
  agentProviderId,
  producedFileCount,
}: {
  feedback: ChatMessage["feedback"];
  onFeedback: (change: ChatMessageFeedbackChange) => void;
  hasDesignSystemContext: boolean;
  footerProps: AssistantFooterProps;
  projectId: string | null;
  projectKind: TrackingProjectKind | null;
  conversationId: string | null;
  runId: string | null;
  assistantMessageId: string;
  modelId: string | null;
  agentProviderId: ReturnType<typeof feedbackAgentProviderIdToTracking>;
  producedFileCount: number;
}) {
  const t = useT();
  const analytics = useAnalytics();
  // Analytics context the feedback events need. The four ids are either
  // user-anchored (projectId / assistantMessageId) or run-anchored (runId),
  // so we pass them down with a stable identity. `producedFileCount` feeds
  // `has_produced_files` on assistant_feedback_button click.
  const [burstKey, setBurstKey] = useState(0);
  const [reasonRating, setReasonRating] =
    useState<ChatMessageFeedbackRating | null>(null);
  const reasonsRef = useRef<HTMLDivElement | null>(null);
  const [draftReasonCodes, setDraftReasonCodes] = useState<
    Set<ChatMessageFeedbackReasonCode>
  >(() => new Set());
  const [customReason, setCustomReason] = useState("");
  const selected = feedback?.rating;
  useEffect(() => {
    if (selected) return;
    setReasonRating(null);
  }, [selected]);
  useEffect(() => {
    if (!reasonRating) return;
    reasonsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    // P0 surface_view assistant_feedback_reason_panel — fires when the
    // reason panel actually appears (reasonRating flips from null to
    // truthy), not when the buttons render.
    trackAssistantFeedbackReasonPanelSurfaceView(analytics.track, {
      page_name: "chat_panel",
      area: "chat_panel",
      element: "assistant_feedback_reason_panel",
      view_type: "panel",
      project_id: projectId ?? "",
      project_kind: projectKind,
      conversation_id: conversationId,
      assistant_message_id: assistantMessageId,
      run_id: runId ?? "",
      rating: reasonRating,
    });
    // Dedicated assistant_feedback_reason_view event paired with the
    // umbrella surface_view above. Requires the full project + conversation
    // identity (its props type is stricter than the umbrella variant);
    // skipped on test renders that mount AssistantMessage without those.
    if (projectId && projectKind && conversationId) {
      trackAssistantFeedbackReasonView(analytics.track, {
        page: "studio",
        area: "chat_panel",
        element: "assistant_feedback_reason_panel",
        view_type: "panel",
        project_id: projectId,
        project_kind: projectKind,
        conversation_id: conversationId,
        assistant_message_id: assistantMessageId,
        run_id: runId ?? null,
        rating: reasonRating,
      });
    }
  }, [
    reasonRating,
    analytics.track,
    projectId,
    projectKind,
    conversationId,
    assistantMessageId,
    runId,
  ]);
  const toggleFeedback = (rating: ChatMessageFeedbackRating) => {
    const nextRating = selected === rating ? null : rating;
    if (nextRating === "positive") setBurstKey((key) => key + 1);
    setDraftReasonCodes(new Set());
    setCustomReason("");
    setReasonRating(nextRating);
    // P0 ui_click assistant_feedback_button. v1 emitted `rating: null` on
    // the clear path, which lost the signal "user un-thumbed positive vs
    // un-thumbed negative". v2 fixes this: when clearing, `rating` carries
    // the rating that was cleared (the user's most recent gesture target),
    // and `rating_before` records the previous selection state.
    const ratingBefore: "positive" | "negative" | "none" = selected ?? "none";
    trackAssistantFeedbackButtonClick(analytics.track, {
      page_name: "chat_panel",
      area: "chat_panel",
      element: "assistant_feedback_button",
      action: nextRating ? "submit_feedback_rating" : "clear_feedback_rating",
      project_id: projectId ?? "",
      project_kind: projectKind,
      conversation_id: conversationId,
      assistant_message_id: assistantMessageId,
      run_id: runId ?? "",
      rating,
      rating_before: ratingBefore,
      has_produced_files: producedFileCount > 0,
    });
    // Dedicated assistant_feedback_click paired with the umbrella ui_click
    // above. Carries the post-action rating in the widened union (allows
    // 'none' for the clear path).
    if (projectId && projectKind && conversationId) {
      const ratingAfter: TrackingFeedbackRatingWithNone = nextRating ?? "none";
      trackAssistantFeedbackClick(analytics.track, {
        page: "studio",
        area: "chat_panel",
        element: "assistant_feedback_button",
        action: nextRating ? "submit_feedback_rating" : "clear_feedback_rating",
        project_id: projectId,
        project_kind: projectKind,
        conversation_id: conversationId,
        assistant_message_id: assistantMessageId,
        run_id: runId ?? null,
        rating: ratingAfter,
        rating_before: ratingBefore,
        has_produced_files: producedFileCount > 0,
      });
    }
    onFeedback(nextRating ? { rating: nextRating } : null);
  };
  const toggleReasonCode = (code: ChatMessageFeedbackReasonCode) => {
    const next = new Set(draftReasonCodes);
    if (next.has(code)) {
      next.delete(code);
      if (code === "other") setCustomReason("");
    } else {
      next.add(code);
    }
    setDraftReasonCodes(next);
  };
  const submitReasons = () => {
    if (!reasonRating) return;
    const trimmedCustomReason = customReason.trim();
    const reasonCodes = [...draftReasonCodes];
    const reasonJoined = reasonCodes.length > 0 ? reasonCodes.join(",") : undefined;
    const hasCustomReason = draftReasonCodes.has("other") && trimmedCustomReason.length > 0;
    const requestId = analytics.newRequestId();
    // P0 ui_click element=assistant_feedback_reason_submit_button — fires
    // synchronously on the user gesture so the click count never depends on
    // the host's onFeedback persistence resolving.
    trackAssistantFeedbackReasonSubmitClick(
      analytics.track,
      {
        page_name: "chat_panel",
        area: "chat_panel",
        element: "assistant_feedback_reason_submit_button",
        action: "click_submit_feedback_reason",
        project_id: projectId ?? "",
        project_kind: projectKind,
        conversation_id: conversationId,
        assistant_message_id: assistantMessageId,
        run_id: runId ?? "",
        rating: reasonRating,
        ...(reasonJoined ? { reason: reasonJoined } : {}),
        reason_count: reasonCodes.length,
        has_custom_reason: hasCustomReason,
        ...(hasCustomReason ? { custom_reason: trimmedCustomReason } : {}),
      },
      { requestId },
    );
    // P0 feedback_submit_result — paired with the click via requestId so
    // PostHog dashboards can correlate intent → persistence. onFeedback in
    // our app currently completes synchronously, so we emit `success`
    // optimistically; a future error-aware host can flip this to `failed`.
    trackFeedbackSubmitResult(
      analytics.track,
      {
        page_name: "chat_panel",
        area: "chat_panel",
        element: "assistant_feedback_reason_submit",
        action: "submit_feedback_reason",
        project_id: projectId ?? "",
        project_kind: projectKind,
        conversation_id: conversationId,
        assistant_message_id: assistantMessageId,
        run_id: runId ?? "",
        model_id: modelId,
        agent_provider_id: agentProviderId,
        rating: reasonRating,
        ...(reasonJoined ? { reason: reasonJoined } : {}),
        reason_count: reasonCodes.length,
        has_custom_reason: hasCustomReason,
        ...(hasCustomReason ? { custom_reason: trimmedCustomReason } : {}),
        result: "success",
      },
      { requestId },
    );
    // Dedicated assistant_feedback_reason_click + reason_submit paired with
    // the umbrella ui_click + feedback_submit_result above. Both fire under
    // the same `requestId` so PostHog can stitch click → result per the
    // tracking spec.
    if (projectId && projectKind && conversationId) {
      const reasons = reasonCodes as TrackingFeedbackReasonCode[];
      const sharedPayload = {
        page: "studio" as const,
        area: "chat_panel" as const,
        project_id: projectId,
        project_kind: projectKind,
        conversation_id: conversationId,
        assistant_message_id: assistantMessageId,
        run_id: runId ?? null,
        rating: reasonRating,
        reason: reasons,
        reason_count: reasons.length,
        has_custom_reason: hasCustomReason,
        custom_reason: hasCustomReason
          ? normalizeCustomReason(trimmedCustomReason)
          : "",
      };
      trackAssistantFeedbackReasonClick(
        analytics.track,
        {
          ...sharedPayload,
          element: "assistant_feedback_reason_submit_button",
          action: "click_submit_feedback_reason",
        },
        { requestId },
      );
      trackAssistantFeedbackReasonSubmit(
        analytics.track,
        {
          ...sharedPayload,
          element: "assistant_feedback_reason_submit",
          action: "submit_feedback_reason",
        },
        { requestId },
      );
    }
    onFeedback({
      rating: reasonRating,
      reasonCodes,
      customReason:
        draftReasonCodes.has("other") && trimmedCustomReason
          ? trimmedCustomReason
          : undefined,
      reasonsSubmittedAt: Date.now(),
    });
    setReasonRating(null);
  };
  const reasonOptions = reasonRating
    ? feedbackReasonOptions(reasonRating, t, hasDesignSystemContext)
    : [];
  const reasonEmoji = reasonRating === "positive" ? "😊" : "😔";
  const showOtherInput = draftReasonCodes.has("other");
  const canSubmit =
    draftReasonCodes.size > 0 || (showOtherInput && customReason.trim().length > 0);
  const controls = (
    <span
      className="assistant-feedback"
      role="group"
      aria-label={t("assistant.feedbackPrompt")}
    >
      <button
        type="button"
        className="assistant-feedback-button"
        data-selected={selected === "positive" ? "true" : "false"}
        aria-pressed={selected === "positive"}
        aria-label={t("assistant.feedbackPositive")}
        title={t("assistant.feedbackPositive")}
        onClick={() => toggleFeedback("positive")}
      >
        <Icon name="thumbs-up" size={13} />
        {burstKey > 0 ? (
          <span
            key={burstKey}
            className="assistant-feedback-burst"
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className="assistant-feedback-button"
        data-selected={selected === "negative" ? "true" : "false"}
        aria-pressed={selected === "negative"}
        aria-label={t("assistant.feedbackNegative")}
        title={t("assistant.feedbackNegative")}
        onClick={() => toggleFeedback("negative")}
      >
        <Icon name="thumbs-down" size={13} />
      </button>
    </span>
  );
  return (
    <div className="assistant-feedback-wrap">
      <AssistantFooter {...footerProps} feedbackControls={controls} />
      {reasonRating ? (
        <div className="assistant-feedback-reasons" ref={reasonsRef}>
          <div className="assistant-feedback-reason-title">
            <span>{t("assistant.feedbackReasonTitle")}</span>
            <span className="assistant-feedback-reason-emoji" aria-hidden="true">
              {reasonEmoji}
            </span>
          </div>
          <div className="assistant-feedback-reason-options">
            {reasonOptions.map((option) => (
              <label
                key={option.code}
                className="assistant-feedback-reason-option"
                data-selected={draftReasonCodes.has(option.code) ? "true" : "false"}
              >
                <input
                  type="checkbox"
                  checked={draftReasonCodes.has(option.code)}
                  onChange={() => toggleReasonCode(option.code)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          {showOtherInput ? (
            <textarea
              className="assistant-feedback-custom"
              value={customReason}
              placeholder={t("assistant.feedbackReasonPlaceholder")}
              rows={2}
              onChange={(event) => setCustomReason(event.target.value)}
            />
          ) : null}
          {reasonRating === "positive" ? (
            <p className="assistant-feedback-discord-note">
              Share what you made with the{" "}
              <a
                href={DISCORD_INVITE_URL}
                data-testid="assistant-feedback-discord-positive"
              >
                Discord
              </a>{" "}
              community, or drop a screenshot and tell us what worked well.
            </p>
          ) : (
            <p className="assistant-feedback-discord-note">
              Share more context in{" "}
              <a
                href={DISCORD_INVITE_URL}
                data-testid="assistant-feedback-discord-negative"
              >
                Discord
              </a>{" "}
              so the team can understand what went wrong and follow up directly.
            </p>
          )}
          <div className="assistant-feedback-actions">
            <button
              type="button"
              className="assistant-feedback-submit"
              disabled={!canSubmit}
              onClick={submitReasons}
            >
              {t("assistant.feedbackReasonSubmit")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function feedbackReasonOptions(
  rating: ChatMessageFeedbackRating,
  t: TranslateFn,
  hasDesignSystemContext: boolean,
): Array<{ code: ChatMessageFeedbackReasonCode; label: string }> {
  const codes: ChatMessageFeedbackReasonCode[] =
    rating === "positive"
      ? [
          "matched_request",
          "strong_visual",
          "useful_structure",
          "easy_to_continue",
          ...(hasDesignSystemContext ? (["followed_design_system"] as const) : []),
          "other",
        ]
      : [
          "missed_request",
          "weak_visual",
          "incomplete_output",
          "hard_to_use",
          ...(hasDesignSystemContext ? (["missed_design_system"] as const) : []),
          "other",
        ];
  return codes.map((code) => ({ code, label: feedbackReasonLabel(code, t) }));
}

function feedbackReasonLabel(
  code: ChatMessageFeedbackReasonCode,
  t: TranslateFn,
): string {
  switch (code) {
    case "matched_request":
      return t("assistant.feedbackReasonPositiveMatched");
    case "strong_visual":
      return t("assistant.feedbackReasonPositiveVisual");
    case "useful_structure":
      return t("assistant.feedbackReasonPositiveUseful");
    case "easy_to_continue":
      return t("assistant.feedbackReasonPositiveEasy");
    case "followed_design_system":
      return t("assistant.feedbackReasonPositiveDesignSystem");
    case "missed_request":
      return t("assistant.feedbackReasonNegativeMissed");
    case "weak_visual":
      return t("assistant.feedbackReasonNegativeVisual");
    case "incomplete_output":
      return t("assistant.feedbackReasonNegativeIncomplete");
    case "hard_to_use":
      return t("assistant.feedbackReasonNegativeHard");
    case "missed_design_system":
      return t("assistant.feedbackReasonNegativeDesignSystem");
    case "other":
      return t("assistant.feedbackReasonOther");
  }
  return code;
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
          {t("assistant.unfinishedSummary", { n: todos.length })}
        </span>
        {canContinue ? (
          <button
            type="button"
            className="unfinished-todos-continue"
            onClick={onContinue}
          >
            {t("assistant.continueRemaining")}
          </button>
        ) : null}
      </div>
      <ul className="unfinished-todos-list">
        {visible.map((todo, i) => (
          <li key={`${todo.status}-${todo.content}-${i}`}>
            {todo.status === "in_progress" && todo.activeForm
              ? todo.activeForm
              : todo.content}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <div className="unfinished-todos-more">
          {t("assistant.unfinishedMore", { n: hiddenCount })}
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
      <div className="produced-files-label">{t("assistant.producedFiles")}</div>
      <div className="produced-files-list">
        {files.map((f) => (
          <div key={f.name} className="produced-file">
            <span className="produced-file-icon" aria-hidden>
              <Icon name={kindIconName(f.kind)} size={14} />
            </span>
            <span className="produced-file-name" title={f.name}>
              {f.name}
            </span>
            <span className="produced-file-size">{humanBytes(f.size)}</span>
            <div className="produced-file-actions">
              {onRequestOpenFile ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onRequestOpenFile(f.name)}
                >
                  {t("assistant.openFile")}
                </button>
              ) : null}
              <a
                className="ghost-link"
                href={projectFileUrl(projectId, f.name)}
                download={f.name}
              >
                {t("assistant.downloadFile")}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Pure renderer. State (busyKey, notices) and the action runner live in the
// AssistantMessage parent so they survive the panel's unmount/remount cycle
// during install (issue #2876).
function PluginActionPanel({
  folders,
  notices,
  busyKey,
  onRunAction,
  onRequestOpenFile,
  onRequestPluginFolderAgentAction,
  activePluginActionPaths = new Set(),
}: {
  folders: PluginFolderCandidate[];
  notices: Record<string, ActionNotice>;
  busyKey: string | null;
  onRunAction: (
    folder: PluginFolderCandidate,
    action: PluginFolderAgentAction,
  ) => Promise<void> | void;
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string; url?: string } | void> | { message?: string; url?: string } | void;
  activePluginActionPaths?: Set<string>;
}) {
  const noticeByFolder = notices;
  const runAction = onRunAction;

  return (
    <div className="plugin-action-panel" aria-label="Plugin next actions">
      <div className="plugin-action-panel__head">
        <span className="plugin-action-panel__icon" aria-hidden>
          <Icon name="sparkles" size={15} />
        </span>
        <div>
          <div className="plugin-action-panel__title">Plugin ready</div>
          <div className="plugin-action-panel__subtitle">
            Send the next step to the agent so it can run the od CLI.
          </div>
        </div>
      </div>
      <div className="plugin-action-panel__list">
        {folders.map((folder) => {
          const actionBusy = activePluginActionPaths.has(folder.path);
          return (
          <div
            key={folder.path}
            className="plugin-action-card"
            data-testid={`assistant-plugin-actions-${folder.path}`}
          >
            <div className="plugin-action-card__main">
              <span className="plugin-action-card__folder-icon" aria-hidden>
                <Icon name="folder" size={14} />
              </span>
              <div className="plugin-action-card__copy">
                <code className="plugin-action-card__path">{folder.path}</code>
                <span>{folder.fileCount} files ready for My plugins</span>
              </div>
            </div>
              <div className="plugin-action-card__actions">
                <button
                  type="button"
                  className="plugin-action-button plugin-action-button--primary"
                  data-testid={`assistant-plugin-install-${folder.path}`}
                  disabled={actionBusy || busyKey !== null || !onRequestPluginFolderAgentAction}
                  onClick={() => void runAction(folder, "install")}
                >
                  <Icon
                    name={actionBusy && busyKey === `install:${folder.path}` ? "spinner" : "plus"}
                    size={13}
                  />
                  <span>
                    {actionBusy && busyKey === `install:${folder.path}` ? "Sending..." : "Add to My plugins"}
                  </span>
                </button>
                <button
                  type="button"
                  className="plugin-action-button"
                  data-testid={`assistant-plugin-publish-${folder.path}`}
                  disabled={actionBusy || busyKey !== null || !onRequestPluginFolderAgentAction}
                  onClick={() => void runAction(folder, "publish")}
                >
                  <Icon
                    name={actionBusy && busyKey === `publish:${folder.path}` ? "spinner" : "github"}
                    size={13}
                  />
                  <span>
                    {actionBusy && busyKey === `publish:${folder.path}` ? "Sending..." : "Publish repo"}
                  </span>
                </button>
                <button
                  type="button"
                  className="plugin-action-button"
                  data-testid={`assistant-plugin-contribute-${folder.path}`}
                  disabled={actionBusy || busyKey !== null || !onRequestPluginFolderAgentAction}
                  onClick={() => void runAction(folder, "contribute")}
                >
                  <Icon
                    name={actionBusy && busyKey === `contribute:${folder.path}` ? "spinner" : "share"}
                    size={13}
                  />
                  <span>
                    {actionBusy && busyKey === `contribute:${folder.path}`
                      ? "Sending..."
                      : "Open Design PR"}
                  </span>
                </button>
                {onRequestOpenFile ? (
                  <button
                    type="button"
                    className="plugin-action-button"
                    data-testid={`assistant-plugin-open-manifest-${folder.path}`}
                    onClick={() => onRequestOpenFile(folder.manifestPath)}
                  >
                    <Icon name="file-code" size={13} />
                    <span>Open manifest</span>
                  </button>
                ) : null}
              </div>
            {noticeByFolder[folder.path] ? (
              <div className="plugin-action-card__notice" role="status">
                <ActionNoticeView notice={noticeByFolder[folder.path] ?? null} />
              </div>
            ) : null}
          </div>
        )})}
      </div>
    </div>
  );
}

function kindIconName(
  kind: ProjectFile["kind"]
): "file-code" | "image" | "pencil" | "file" {
  if (kind === "html") return "file-code";
  if (kind === "image") return "image";
  if (kind === "sketch") return "pencil";
  if (kind === "code") return "file-code";
  return "file";
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function pluginFoldersTouchedThisTurn(
  projectFiles: ProjectFile[],
  fileOps: FileOpEntry[],
  produced: ProjectFile[],
  messageContent: string,
): PluginFolderCandidate[] {
  const candidates = getPluginFolderCandidates(projectFiles);
  if (candidates.length === 0) return [];
  const directTouchedPaths = [
    ...fileOps.flatMap((entry) => [entry.path, entry.fullPath]),
    ...produced.flatMap((file) => [file.name, file.path]),
  ].filter((path): path is string => typeof path === "string" && path.length > 0);
  const touchedPaths = [...directTouchedPaths, messageContent].filter(
    (path): path is string => typeof path === "string" && path.length > 0,
  );
  const explicitFolders = candidates.filter((folder) =>
    touchedPaths.some((path) => pathTouchesFolder(path, folder.path)),
  );
  if (explicitFolders.length > 0) return explicitFolders;
  if (candidates.length !== 1) return [];
  const candidate = candidates[0];
  if (!candidate) return [];
  if (
    directTouchedPaths.some((path) =>
      pathMatchesFolderFileBasename(path, candidate, projectFiles),
    )
  ) {
    return [candidate];
  }
  return hasPluginFinalActionHint(messageContent) ? [candidate] : [];
}

function pathTouchesFolder(path: string, folderPath: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized === folderPath || normalized.startsWith(`${folderPath}/`)) {
    return true;
  }
  return normalized.includes(`/${folderPath}/`) || normalized.includes(`${folderPath}/`);
}

function pathMatchesFolderFileBasename(
  path: string,
  folder: PluginFolderCandidate,
  projectFiles: ProjectFile[],
): boolean {
  const basename = path.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  if (!basename) return false;
  return projectFiles.some((file) =>
    file.name.startsWith(`${folder.path}/`) && file.name.endsWith(`/${basename}`),
  );
}

function hasPluginFinalActionHint(content: string): boolean {
  return /\b(Add to My plugins|Open Design PR|Publish repo|plugin publish|ready to publish|ready to add)\b/i.test(
    content,
  );
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
  const elapsedSec = startedAt
    ? Math.max(0, Math.round((now - startedAt) / 1000))
    : 0;
  const slow = elapsedSec >= 12;
  const label = latestStatus?.label
    ? humanizeStatus(latestStatus.label, t)
    : t("assistant.waitingFirstOutput");
  return (
    <div className="op-waiting">
      <span className="op-waiting-dot" aria-hidden />
      <span className="op-waiting-label">{label}</span>
      {latestStatus?.detail ? (
        <code className="op-waiting-detail">{latestStatus.detail}</code>
      ) : null}
      {slow ? (
        <span className="op-waiting-hint">{t("assistant.slowHint")}</span>
      ) : null}
    </div>
  );
}

function humanizeStatus(label: string, t: (k: keyof Dict) => string): string {
  if (label === "initializing") return t("assistant.statusBootingAgent");
  if (label === "starting") return t("assistant.statusStarting");
  if (label === "requesting") return t("assistant.statusRequesting");
  if (label === "thinking") return t("assistant.statusThinking");
  if (label === "streaming") return t("assistant.statusStreaming");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function latestStatusLabel(
  events: AgentEvent[]
): { label: string; detail?: string | undefined } | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.kind === "status") return { label: ev.label, detail: ev.detail };
  }
  return undefined;
}

function ProseBlock({
  text,
  isLastAssistant,
  streaming,
  nextUserContent,
  locallySubmitted,
  suppressDirectionForms,
  onSubmitForm,
  onRequestOpenFile,
}: {
  text: string;
  isLastAssistant: boolean;
  streaming: boolean;
  nextUserContent?: string;
  locallySubmitted: Set<string>;
  suppressDirectionForms: boolean;
  onSubmitForm: (formId: string, text: string) => void;
  onRequestOpenFile?: (name: string) => void;
}) {
  const cleaned = useMemo(() => stripArtifact(text), [text]);
  const segments = useMemo(() => splitOnQuestionForms(cleaned), [cleaned]);
  // Route relative file-link clicks (`template.html`, `subdir/hero.html`)
  // through the workspace tab opener. Without this, Electron's window-open
  // handler creates a new app window whose relative href can't resolve, and
  // the user lands on the home screen — the file is never previewed.
  const onLinkClick = useMemo<MarkdownLinkClickHandler | undefined>(() => {
    if (!onRequestOpenFile) return undefined;
    return (href, event) => {
      const path = asInProjectFilePath(href);
      if (!path) return;
      event.preventDefault();
      onRequestOpenFile(path);
    };
  }, [onRequestOpenFile]);
  // Each text segment is further split on `<system-reminder>` blocks so
  // those render as their own collapsible chip instead of raw markup.
  const renderable = segments.flatMap(
    (
      seg,
      idx
    ): Array<
      | { key: string; kind: "text"; text: string }
      | { key: string; kind: "reminder"; text: string }
      | { key: string; kind: "form"; form: QuestionForm }
      | { key: string; kind: "suppressed-direction" }
    > => {
      if (seg.kind === "form") {
        if (suppressDirectionForms && isDirectionForm(seg.form)) {
          return [{ key: `f-${idx}`, kind: "suppressed-direction" }];
        }
        return [{ key: `f-${idx}`, kind: "form", form: seg.form }];
      }
      if (seg.text.trim().length === 0) return [];
      const sub = splitSystemReminders(seg.text);
      return sub.map((s, j) => ({
        key: `t-${idx}-${j}`,
        kind: s.kind,
        text: s.text,
      }));
    }
  );
  if (renderable.length === 0) return null;
  return (
    <div className="prose-block">
      {renderable.map((seg) => {
        if (seg.kind === "reminder") {
          return <SystemReminderBlock key={seg.key} text={seg.text} />;
        }
        if (seg.kind === "text") {
          return (
            <Fragment key={seg.key}>
              {renderMarkdown(seg.text, { onLinkClick })}
            </Fragment>
          );
        }
        if (seg.kind === "suppressed-direction") {
          return (
            <div key={seg.key} className="status-pill">
              <span className="status-label">
                Active design system selected. Visual direction is already locked.
              </span>
            </div>
          );
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

function isDirectionForm(form: QuestionForm): boolean {
  if (form.id.toLowerCase() === "direction") return true;
  if (form.title.toLowerCase().includes("visual direction")) return true;
  return form.questions.some((q) => q.type === "direction-cards");
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
    isLastAssistant &&
    !streaming &&
    !submittedFromHistory &&
    !wasSubmittedLocally;
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
  const preview = trimmed.split("\n")[0]?.slice(0, 120) ?? "";
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
        <span className="system-reminder-label">
          {t("assistant.systemReminder")}
        </span>
        <span className="system-reminder-preview">
          {open ? "" : preview}
          {!open && trimmed.length > preview.length ? "…" : ""}
        </span>
        <span className="system-reminder-chev">
          <Icon name={open ? "chevron-down" : "chevron-right"} size={11} />
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
        <span className="thinking-label">{t("assistant.thinking")}</span>
        <span className="thinking-preview">
          {open ? "" : preview}
          {!open && text.length > 140 ? "…" : ""}
        </span>
        <span className="thinking-chev">
          <Icon name={open ? "chevron-down" : "chevron-right"} size={11} />
        </span>
      </button>
      {open ? <pre className="thinking-body">{text}</pre> : null}
    </div>
  );
}

function StatusPill({
  label,
  detail,
}: {
  label: string;
  detail?: string | undefined;
}) {
  return (
    <div className="status-pill">
      <span className="status-label">{label}</span>
      {detail ? <span className="status-detail">{renderStatusDetail(detail)}</span> : null}
    </div>
  );
}

function renderStatusDetail(detail: string): ReactNode {
  const segments: ReactNode[] = [];
  const urlRe = /(https?:\/\/[^\s)<>]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = urlRe.exec(detail))) {
    if (match.index > lastIndex) {
      segments.push(detail.slice(lastIndex, match.index));
    }
    const [href, suffix] = splitStatusDetailUrlPunctuation(match[1]!);
    segments.push(
      <a
        key={`url-${key++}`}
        className="md-link md-link-bare"
        href={href}
        target="_blank"
        rel="noreferrer noopener"
      >
        {href}
      </a>,
    );
    if (suffix) segments.push(suffix);
    lastIndex = urlRe.lastIndex;
  }

  if (lastIndex < detail.length) {
    segments.push(detail.slice(lastIndex));
  }

  return <>{segments}</>;
}

function splitStatusDetailUrlPunctuation(url: string): [string, string] {
  const match = /([.,!?;:，。！？；：、'"」』】》〉）]+)$/.exec(url);
  if (!match?.[1]) return [url, ''];
  const trimmed = url.slice(0, -match[1].length);
  return trimmed ? [trimmed, match[1]] : [url, ''];
}

interface ToolItem {
  use: Extract<AgentEvent, { kind: "tool_use" }>;
  result?: Extract<AgentEvent, { kind: "tool_result" }>;
}

// Snapshot tools (the call IS the state, later calls supersede earlier
// ones) and tools the model retries verbatim under headless-mode errors
// are noisy when stacked. Collapse identical-input neighbors to the most
// recent. Currently:
//   - TodoWrite / todowrite: the input replaces the previous list, so the
//     latest call is the only one worth showing; older identical or
//     superseded snapshots are pure duplication.
//   - AskUserQuestion / ask_user_question: claude-code -p auto-errors the
//     tool and the model retries with identical input until it gives up.
// Other tool names pass through untouched.
const SNAPSHOT_TOOL_NAMES = new Set([
  "AskUserQuestion",
  "ask_user_question",
  "TodoWrite",
  "todowrite",
  "todo_write",
  "update_plan",
]);

function dedupeSnapshotToolRetries(items: ToolItem[]): ToolItem[] {
  if (items.length <= 1) return items;
  const allSnapshot = items.every((it) => SNAPSHOT_TOOL_NAMES.has(it.use.name));
  if (!allSnapshot) return items;
  // For TodoWrite specifically, the LATEST call always wins regardless of
  // input — it is a state replace, not an append. For AskUserQuestion we
  // group by input so a sequence of distinct questions (rare) renders as
  // distinct cards. The cheap unifying behavior: keep the last item per
  // `(name, JSON.stringify(input))` key; for TodoWrite a single name+input
  // is the snapshot identity, for AskUserQuestion it's the question text.
  const lastByKey = new Map<string, ToolItem>();
  for (const it of items) {
    let key: string;
    try {
      key = `${it.use.name}:${JSON.stringify(it.use.input)}`;
    } catch {
      key = it.use.id;
    }
    lastByKey.set(key, it);
  }
  // For TodoWrite groups, additionally collapse to just the most recent
  // item overall (a later call supersedes an earlier one even when inputs
  // differ). We detect by checking whether all items share a TodoWrite
  // name after the input-key dedupe above.
  const collapsed = Array.from(lastByKey.values());
  const allTodoWrite = collapsed.every((it) => isTodoWriteToolName(it.use.name));
  if (allTodoWrite && collapsed.length > 1) {
    return [collapsed[collapsed.length - 1]!];
  }
  return collapsed;
}

function ToolGroupCard({
  items,
  runStreaming,
  runSucceeded,
  projectFileNames,
  onRequestOpenFile,
  isLast,
  onSubmitForm,
  onAnswerToolUse,
}: {
  items: ToolItem[];
  runStreaming: boolean;
  runSucceeded: boolean;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
  isLast?: boolean;
  onSubmitForm?: (text: string) => void;
  onAnswerToolUse?: (toolUseId: string, content: string) => Promise<boolean> | boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // `claude-code -p` (headless) auto errors `AskUserQuestion` because it
  // cannot prompt the user, so the model retries the call up to ~4 times
  // within a single turn. Each retry produces an identical tool_use event,
  // which used to render as a stack of duplicate question cards. Collapse
  // consecutive AskUserQuestion uses with identical input to the LAST one
  // (it has the most up to date tool_use id, which is what we route the
  // answer against if a backend tool_result wire is added later).
  items = dedupeSnapshotToolRetries(items);

  // A run of one tool collapses to that tool's card directly so we don't
  // wrap a single child in a redundant disclosure.
  if (items.length === 1) {
    return (
      <ToolCard
        use={items[0]!.use}
        result={items[0]!.result}
        runStreaming={runStreaming}
        runSucceeded={runSucceeded}
        projectFileNames={projectFileNames}
        onRequestOpenFile={onRequestOpenFile}
        isLast={isLast}
        onSubmitForm={onSubmitForm}
        onAnswerToolUse={onAnswerToolUse}
      />
    );
  }

  const summary = summarizeGroup(items, t, runStreaming, runSucceeded);
  const running = runStreaming && items.some((it) => !it.result);
  return (
    <div className="action-card">
      <button
        type="button"
        className={`action-card-toggle ${running ? "running" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="ico" aria-hidden>
          {summary.icon}
        </span>
        <span className="summary">
          <strong>{summary.label}</strong>
        </span>
        <span className="chev" aria-hidden>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={11} />
        </span>
      </button>
      <div className={`accordion-collapsible${open ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <div className="action-card-body">
            {items.map((it, i) => (
              <ToolCard
                key={i}
                use={it.use}
                result={it.result}
                runStreaming={runStreaming}
                runSucceeded={runSucceeded}
                projectFileNames={projectFileNames}
                onRequestOpenFile={onRequestOpenFile}
                isLast={isLast}
                onSubmitForm={onSubmitForm}
                onAnswerToolUse={onAnswerToolUse}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function summarizeGroup(
  items: ToolItem[],
  t: (k: keyof Dict, vars?: Record<string, string | number>) => string,
  runStreaming: boolean,
  runSucceeded: boolean
): { label: string; icon: string } {
  // All items share a tool family because the grouper only merges by name.
  const name = items[0]?.use.name ?? "";
  const family = toolFamily(name);
  const icon = familyIcon(family);
  const verbs = items.map((it) =>
    verbForState(it, t, runStreaming, runSucceeded)
  );
  // Roll the verbs into a comma-list with deduplicated last-state. So three
  // edits whose results are all 'Done' render as "Editing ×3, Done"; mixed
  // states render as "Editing, Reading, Done".
  const head = countLabel(family, items.length, t);
  const tail = lastStateLabel(verbs, t);
  return { label: tail ? `${head}, ${tail}` : head, icon };
}

function toolFamily(name: string): string {
  if (name === "Edit" || name === "str_replace_edit") return "edit";
  if (name === "Write" || name === "write" || name === "create_file") return "write";
  if (name === "Read" || name === "read_file") return "read";
  if (name === "Glob" || name === "list_files") return "glob";
  if (name === "Grep") return "grep";
  if (name === "Bash") return "bash";
  if (isTodoWriteToolName(name)) return "todo";
  if (name === "WebFetch" || name === "web_fetch") return "fetch";
  if (name === "WebSearch" || name === "web_search") return "search";
  return name.toLowerCase();
}

function familyIcon(family: string): string {
  if (family === "edit") return "✎";
  if (family === "write") return "+";
  if (family === "read") return "↗";
  if (family === "glob" || family === "grep" || family === "search") return "⌕";
  if (family === "bash") return "$";
  if (family === "todo") return "☐";
  if (family === "fetch") return "↬";
  return "·";
}

function countLabel(
  family: string,
  n: number,
  t: (k: keyof Dict) => string
): string {
  const verb =
    family === "edit"
      ? t("assistant.verbEditing")
      : family === "write"
      ? t("assistant.verbWriting")
      : family === "read"
      ? t("assistant.verbReading")
      : family === "glob" || family === "grep" || family === "search"
      ? t("assistant.verbSearching")
      : family === "bash"
      ? t("assistant.verbRunning")
      : family === "todo"
      ? t("assistant.verbTodos")
      : family === "fetch"
      ? t("assistant.verbFetching")
      : t("assistant.verbCalling");
  return n > 1 ? `${verb} ×${n}` : verb;
}

function verbForState(
  it: ToolItem,
  t: (k: keyof Dict) => string,
  runStreaming = false,
  runSucceeded = false
): string {
  if (!it.result && runStreaming) return t("assistant.verbRunning");
  if (!it.result && !runSucceeded) return t("tool.error");
  if (it.result?.isError) return t("tool.error");
  return t("tool.done");
}

function lastStateLabel(verbs: string[], t: (k: keyof Dict) => string): string {
  const set = new Set(verbs);
  if (set.size === 1) return verbs[verbs.length - 1] ?? "";
  // Mixed states: surface error first, else running, else any.
  if (set.has(t("tool.error"))) return t("tool.error");
  if (set.has(t("assistant.verbRunning"))) return t("assistant.verbRunning");
  return verbs[verbs.length - 1] ?? "";
}

type Block =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool-group"; items: ToolItem[] }
  | {
      kind: "plugin-candidate";
      candidateId: string;
      title: string;
      description?: string | undefined;
      confidence?: number | undefined;
      draftPath?: string | null | undefined;
    }
  | { kind: "status"; label: string; detail?: string | undefined };

/**
 * Walk the event stream and build the rendering layout list. We additionally
 * collapse runs of consecutive tool_uses sharing the same tool family into a
 * single tool-group block so the chat surface stays compact during chains
 * of edits / reads.
 */
// Drop any tool-group composed entirely of TodoWrite calls. ChatPane
// renders one canonical TodoCard above the composer using
// `latestTodosFromConversation`, so leaving the same task list inline in
// each assistant message just duplicates the view.
function stripTodoToolGroups(blocks: Block[]): Block[] {
  return blocks.filter((block) => {
    if (block.kind !== "tool-group") return true;
    return !block.items.every((it) => isTodoWriteToolName(it.use.name));
  });
}

// The prompt asks for one discovery form and then a stop, but LLMs can still
// emit a tailored discovery form followed by the default Quick brief in the
// same assistant turn. Keep the first form for each id and drop later repeats.
function suppressDuplicateQuestionForms(blocks: Block[]): Block[] {
  const seenFormIds = new Set<string>();
  return blocks.map((block) => {
    if (block.kind !== "text") return block;
    const segments = splitOnQuestionForms(block.text);
    let changed = false;
    const nextText = segments
      .map((segment) => {
        if (segment.kind === "text") return segment.text;
        const formKey = segment.form.id.trim().toLowerCase();
        if (seenFormIds.has(formKey)) {
          changed = true;
          return "";
        }
        seenFormIds.add(formKey);
        return segment.raw;
      })
      .join("");
    return changed ? { ...block, text: nextText } : block;
  });
}

// Hide text blocks that follow an `AskUserQuestion` tool use in the same
// assistant message. Claude tends to also write the same questions as
// markdown text alongside the tool call. The card already shows the
// content; the prose is hedge that duplicates and confuses the user.
function suppressAskUserQuestionFallbackText(blocks: Block[]): Block[] {
  let seenAskUserQuestion = false;
  const filtered: Block[] = [];
  for (const block of blocks) {
    if (block.kind === "tool-group") {
      const hasAuq = block.items.some(
        (it) =>
          it.use.name === "AskUserQuestion" ||
          it.use.name === "ask_user_question",
      );
      if (hasAuq) seenAskUserQuestion = true;
      filtered.push(block);
      continue;
    }
    if (seenAskUserQuestion && block.kind === "text") {
      continue;
    }
    filtered.push(block);
  }
  return filtered;
}

function buildBlocks(events: AgentEvent[]): Block[] {
  const out: Block[] = [];
  const resultByToolId = new Map<
    string,
    Extract<AgentEvent, { kind: "tool_result" }>
  >();
  for (const ev of events) {
    if (ev.kind === "tool_result") resultByToolId.set(ev.toolUseId, ev);
  }
  for (const ev of events) {
    if (ev.kind === "text") {
      const last = out[out.length - 1];
      if (last && last.kind === "text") last.text += ev.text;
      else out.push({ kind: "text", text: ev.text });
      continue;
    }
    if (ev.kind === "thinking") {
      const last = out[out.length - 1];
      if (last && last.kind === "thinking") last.text += ev.text;
      else out.push({ kind: "thinking", text: ev.text });
      continue;
    }
    if (ev.kind === "tool_use") {
      const result = resultByToolId.get(ev.id);
      const item: ToolItem = result ? { use: ev, result } : { use: ev };
      const last = out[out.length - 1];
      const fam = toolFamily(ev.name);
      if (
        last &&
        last.kind === "tool-group" &&
        toolFamily(last.items[last.items.length - 1]!.use.name) === fam
      ) {
        last.items.push(item);
      } else {
        out.push({ kind: "tool-group", items: [item] });
      }
      continue;
    }
    if (ev.kind === "tool_result") continue;
    if (ev.kind === "plugin_candidate") {
      out.push({
        kind: "plugin-candidate",
        candidateId: ev.candidateId,
        title: ev.title,
        description: ev.description,
        confidence: ev.confidence,
        draftPath: ev.draftPath,
      });
      continue;
    }
    if (ev.kind === "status") {
      if (
        ev.label === "streaming" ||
        ev.label === "starting" ||
        ev.label === "requesting" ||
        ev.label === "thinking" ||
        ev.label === "empty_response"
      )
        continue;
      const last = out[out.length - 1];
      if (last && last.kind === "status" && last.label === ev.label) {
        // Update detail to the latest value rather than skip. When an agent
        // emits multiple status events with the same label (notably
        // `label: 'model'` — fired once after `session/new` with the agent's
        // initial default, then again after the explicit model-selection
        // call completes), the badge UI must reflect the most recent detail,
        // not the first one. Without this update the post-selection model
        // (e.g. `claude-opus-4-7-high`) is silently replaced in the badge
        // by the stale initial default (`swe-1-6-fast`).
        last.detail = ev.detail;
        continue;
      }
      out.push({ kind: "status", label: ev.label, detail: ev.detail });
      continue;
    }
  }
  return out;
}

// Split prose into alternating plain-text and `<system-reminder>` segments.
// Claude Code injects `<system-reminder>...</system-reminder>` blocks into the
// agent's input (memory hints, tool reminders, etc.); the model occasionally
// echoes those tags into its response. Rendering the raw markup as prose
// looks broken — surface them as their own collapsible block, and strip stray
// orphan open/close tags from the surrounding text.
type ProseSegment = { kind: "text" | "reminder"; text: string };

function splitSystemReminders(input: string): ProseSegment[] {
  const re = /<system-reminder>([\s\S]*?)<\/system-reminder>/g;
  const out: ProseSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > lastIndex) {
      out.push({ kind: "text", text: input.slice(lastIndex, m.index) });
    }
    out.push({ kind: "reminder", text: m[1] ?? "" });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < input.length) {
    out.push({ kind: "text", text: input.slice(lastIndex) });
  }
  // Drop any orphan tags that survived (open without close, or vice versa)
  // and discard text segments that became empty after stripping.
  return out
    .map((seg) =>
      seg.kind === "text"
        ? { ...seg, text: seg.text.replace(/<\/?system-reminder>/g, "") }
        : seg
    )
    .filter((seg) => seg.kind === "reminder" || seg.text.trim().length > 0);
}

function useLiveElapsed(
  streaming: boolean,
  startedAt: number | undefined,
  endedAt: number | undefined,
  fixedDurationMs: number | undefined,
): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!streaming) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [streaming]);
  if (!streaming && endedAt === undefined && typeof fixedDurationMs === "number") {
    return formatElapsedMs(fixedDurationMs);
  }
  if (!startedAt || (!streaming && endedAt === undefined)) return "";
  const end = streaming ? now : endedAt;
  const ms = Math.max(0, (end ?? now) - startedAt);
  return formatElapsedMs(ms);
}

function formatElapsedMs(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s - m * 60);
  return `${m}m ${rem.toString().padStart(2, "0")}s`;
}
