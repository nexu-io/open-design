import { Fragment, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolCard } from "./ToolCard";
import { FileOpsSummary } from "./FileOpsSummary";
import {
  renderMarkdown,
  type MarkdownLinkClickHandler,
} from "../runtime/markdown";
import {
  asInProjectFilePath,
  isPathLikeChatHref,
  resolveChatFileLink,
} from "../runtime/in-project-link";
import { navigate } from "../router";
import { projectFileUrl } from "../providers/registry";
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
  modelIdForTracking,
  normalizeCustomReason,
  type TrackingFeedbackProviderId,
  type TrackingFeedbackReasonCode,
  type TrackingFeedbackRatingWithNone,
  type TrackingProjectKind,
} from "@open-design/contracts/analytics";
import {
  hasUnterminatedQuestionForm,
  splitOnQuestionForms,
  stripTrailingOpenQuestionForm,
  type QuestionForm,
} from "../artifacts/question-form";
import {
  hasOdCard,
  splitOnOdCards,
  stripTrailingOpenOdCard,
  type ChatSessionMode,
  type OdCard,
  type OdCardBrandBrowserAssist,
} from "@open-design/contracts";
import { OdCardView, type BrandBrowserAssistConfirm } from "./OdCard";
import { parseSubmittedAnswers } from "./QuestionForm";
import { splitStreamingArtifact, stripArtifact, stripRecoveredHtmlFallbackForDisplay } from "../artifacts/strip";
import { BRAND_BROWSER_TAB_ID } from "../runtime/brand-browser-bridge";
import {
  getPluginFolderCandidates,
  type PluginFolderCandidate,
} from "./design-files/pluginFolders";
import type { PluginFolderAgentAction } from "./design-files/pluginFolderActions";
import { Icon } from "./Icon";
import { NextStepActions, type NextStepActionsVariant } from "./NextStepActions";
import type { DesignToolboxActionId } from "../runtime/design-toolbox";
import { copyToClipboard } from "../lib/copy-to-clipboard";
import { useT } from "../i18n";
import { deriveFileOps, type FileOpEntry } from "../runtime/file-ops";
import { dedupeToolUsesById } from "../runtime/tool-events";
import {
  isTodoWriteToolName,
  unfinishedTodosFromEvents,
  type TodoItem,
} from "../runtime/todos";
import type { Dict } from "../i18n/types";
import { agentDisplayName, agentIconId, exactAgentDisplayName } from "../utils/agentLabels";
import { AgentIcon } from "./AgentIcon";
import { filterImplicitProducedFiles } from "../produced-files";
import type {
  AgentEvent,
  ChatMessage,
  ChatMessageFeedbackChange,
  ChatMessageFeedbackRating,
  ChatMessageFeedbackReasonCode,
  ProjectFile,
  ProjectMetadata,
  SkillSummary,
} from "../types";

type TranslateFn = (
  key: keyof Dict,
  vars?: Record<string, string | number>
) => string;

export type QuestionFormOpenRequest = {
  form: QuestionForm;
  messageId: string;
  submittedAnswers?: Record<string, string | string[]>;
};

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

function isBrandExtractionNextStepVariant(variant: NextStepActionsVariant): boolean {
  return (
    variant === 'brand-extraction' ||
    variant === 'brand-extraction-incomplete' ||
    variant === 'brand-programmatic-incomplete'
  );
}

function textNeedsBrandBrowserAssistFallback(content: string): boolean {
  if (!content.trim() || hasOdCard(content)) return false;
  return (
    /browser assist card|browser assist/i.test(content) ||
    /浏览器辅助卡片|瀏覽器輔助卡片/.test(content) ||
    /More\s*>\s*Download Page/i.test(content) ||
    /More\s*>\s*(下载页面|下載頁面)/.test(content)
  );
}

function buildBrandBrowserAssistFallbackCard({
  content,
  metadata,
  nextStepVariant,
}: {
  content: string;
  metadata?: ProjectMetadata;
  nextStepVariant: NextStepActionsVariant;
}): OdCardBrandBrowserAssist | null {
  if (!isBrandExtractionNextStepVariant(nextStepVariant)) return null;
  if (!textNeedsBrandBrowserAssistFallback(content)) return null;
  const brandId = metadata?.brandId?.trim();
  if (!brandId) return null;
  const url = metadata?.brandSourceUrl?.trim();
  return {
    kind: 'brand-browser-assist',
    brandId,
    browserTabId: BRAND_BROWSER_TAB_ID,
    ...(url ? { url } : {}),
    reason: 'Browser',
  };
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
  onRequestOpenFile,
}: {
  block: SkillPluginCandidateBlock;
  projectId?: string | null;
  onRequestOpenFile?: (name: string) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<null | "draft" | "contribute">(null);
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

  async function share(action: "contribute-open-design") {
    if (!projectId) return;
    setBusy("contribute");
    setNotice(null);
    try {
      const data = await post(
        `/api/projects/${encodeURIComponent(projectId)}/plugin-candidates/${encodeURIComponent(block.candidateId)}/share-tasks`,
        { action },
      );
      setNotice({
        message: `Open Design contribution task started for ${data?.path ?? "the draft"}.`,
      });
    } catch (err) {
      setNotice({ message: err instanceof Error ? err.message : String(err) });
    } finally {
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
              onClick={() => void share("contribute-open-design")}
            >
              <Icon name={busy === "contribute" ? "spinner" : "share"} size={13} />
              <span>{busy === "contribute" ? "Starting..." : t("skillPluginCandidate.contributeToMain")}</span>
            </button>
            <button
              type="button"
              className="plugin-action-button"
              disabled={disabled}
              onClick={() => void createDraft()}
            >
              <Icon name={busy === "draft" ? "spinner" : "plus"} size={13} />
              <span>{busy === "draft" ? "Creating..." : t("skillPluginCandidate.createForMe")}</span>
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
  // Live-only streaming tool-input partials keyed by tool-use id (raw,
  // mid-token JSON accumulated from `input_json_delta`). Used to render an
  // in-flight Write/Edit's code in real time before the full `tool_use`
  // arrives. Never persisted.
  liveToolInput?: Record<string, { name: string; text: string; seq?: number }>;
  // ChatPane renders the canonical conversation-level TodoWrite card as its
  // own row, while this message strips TodoWrite tool groups to avoid a
  // duplicate per-message card.
  showConversationTodoCard?: boolean;
  conversationTodoInput?: unknown | null;
  projectId?: string | null;
  // Analytics context for the assistant_feedback_* events. Defaults
  // applied at the call site keep AssistantMessage usable in tests
  // that don't care about telemetry.
  projectKind?: TrackingProjectKind | null;
  conversationId?: string | null;
  projectFiles?: ProjectFile[];
  projectMetadata?: ProjectMetadata;
  projectFileNames?: Set<string>;
  // Daemon-resolved on-disk working directory of the current project
  // (`GET /api/projects/:id` → `resolvedDir`). Positive-proof anchor for
  // classifying absolute disk hrefs in chat file links — see
  // `resolveChatFileLink`.
  projectResolvedDir?: string | null;
  onRequestOpenFile?: (name: string) => void;
  // Client-side action for a <od-card type="brand-browser-assist"> button: open
  // or focus the Browser tab so the user can clear verification. Excluded from
  // the memo comparison (routed through ChatPane's stable callbacks ref).
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
  onRequestPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string; url?: string } | void> | { message?: string; url?: string } | void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  // Click handler for the post-completion "Share to Open Design" submission
  // action. ProjectView wires this to handleSend with the bundled
  // `od-share-to-community` trigger prompt.
  onShareToOpenDesign?: () => void;
  shareToOpenDesignBusy?: boolean;
  // True only for the most recent assistant message.
  isLast?: boolean;
  // Assistant message id whose run-failure error is rendered as ChatPane's
  // top-level error card; that message's per-message error pill is suppressed
  // to avoid duplication. Other messages keep their error pill.
  errorCardOwnerId?: string | null;
  // The user message that immediately follows this assistant turn, if any.
  // Kept for ChatPane compatibility; chat-side question forms now always
  // render as a compact Questions banner.
  nextUserContent?: string;
  // Open the right-hand Questions tab. The active discovery form renders
  // there (Claude-Design style) instead of inline; this assistant message
  // shows a banner that focuses the tab on click.
  onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
  onContinueRemainingTasks?: (todos: TodoItem[]) => void;
  onForkFromMessage?: () => void;
  forking?: boolean;
  onFeedback?: (change: ChatMessageFeedbackChange) => void;
  suppressDirectionForms?: boolean;
  hasDesignSystemContext?: boolean;
  // "Next step" affordance handlers, surfaced under the latest settled
  // assistant message. Omitting them hides the affordance entirely (e.g. in
  // tests that don't wire chat send).
  onArtifactShare?: (fileName: string) => void;
  // Featured design-toolbox follow-up rows on the "next step" card. Seeding the
  // composer with an action / opening the toolbox both route through the
  // composer; see ChatPane's composer ref wiring.
  onToolboxAction?: (id: DesignToolboxActionId) => void;
  onNextStepPromptAction?: (
    prompt: string,
    options?: { sessionMode?: ChatSessionMode },
  ) => void;
  onNextStepAiOptimize?: () => void;
  nextStepAiOptimizeBusy?: boolean;
  onNextStepContinueExtraction?: () => void;
  nextStepContinueExtractionBusy?: boolean;
  onNextStepContinueAiExtraction?: () => void;
  nextStepContinueAiExtractionBusy?: boolean;
  onNextStepCreateDesign?: () => void;
  nextStepCreateDesignBusy?: boolean;
  onNextStepCreateDesignSystem?: () => void;
  nextStepCreateDesignSystemBusy?: boolean;
  onPickSkill?: (skillId: string) => void;
  onArtifactDownload?: (fileName: string) => void;
  nextStepSkills?: SkillSummary[];
  toolboxSkillNames?: Partial<Record<DesignToolboxActionId, string | null>>;
  nextStepVariant?: NextStepActionsVariant;
}

// Props compared by reference to decide whether a memoized AssistantMessage can
// skip re-rendering. The interaction callbacks (onContinueRemainingTasks,
// onForkFromMessage, onFeedback, and next-step actions) are DELIBERATELY
// excluded: ChatPane re-creates them per render, but routes them through a ref
// so their behavior is reference-stable — comparing them would defeat the memo
// on every streamed frame. `isLast` is compared, which captures the only state
// transition those callbacks' presence depends on. The remaining context props
// (projectFiles, the Set props, handlers) come from ProjectView as stable
// useState/useMemo/useCallback values, so reference comparison is correct and
// cheap.
const ASSISTANT_MESSAGE_COMPARED_PROPS: Array<keyof Props> = [
  'message',
  'streaming',
  'showConversationTodoCard',
  'conversationTodoInput',
  'projectId',
  'projectKind',
  'conversationId',
  'projectFiles',
  'projectMetadata',
  'projectFileNames',
  'projectResolvedDir',
  'onRequestOpenFile',
  'onRequestPluginFolderAgentAction',
  'activePluginActionPaths',
  'hiddenPluginActionPaths',
  'isLast',
  'errorCardOwnerId',
  'nextUserContent',
  'forking',
  'shareToOpenDesignBusy',
  'suppressDirectionForms',
  'hasDesignSystemContext',
  'nextStepAiOptimizeBusy',
  'nextStepContinueExtractionBusy',
  'nextStepContinueAiExtractionBusy',
  'nextStepCreateDesignBusy',
  'nextStepCreateDesignSystemBusy',
  // Memoized + stable from ChatPane; compared so a late skill-list load
  // refreshes the featured next-step rows' `@skill` hover detail and the
  // More → Design toolbox global resources.
  'toolboxSkillNames',
  'nextStepSkills',
  'nextStepVariant',
  // Live streaming tool input changes identity on every `tool_input_delta`.
  // ChatPane passes it only to the streaming row (undefined elsewhere), so
  // comparing it re-renders just that row as the card grows — without it the
  // memo swallows the deltas and the card only updates on the final tool_use.
  'liveToolInput',
];

function areAssistantMessagePropsEqual(prev: Props, next: Props): boolean {
  for (const key of ASSISTANT_MESSAGE_COMPARED_PROPS) {
    if (!Object.is(prev[key], next[key])) return false;
  }
  return true;
}

/**
 * Memoized so a streamed frame only re-renders the ONE assistant message whose
 * `message` object changed identity (the streaming turn), not all N messages in
 * the conversation. See `areAssistantMessagePropsEqual` for the comparison.
 */
export const AssistantMessage = memo(AssistantMessageImpl, areAssistantMessagePropsEqual);

/**
 * Renders an assistant message as an interleaved flow of:
 *   - prose blocks (consecutive `text` events merged)
 *   - thinking blocks (collapsible)
 *   - grouped tool action cards — runs of consecutive same-name tools
 *     collapse into a single pill ("Editing ×3, Done") that expands to show
 *     the individual tool cards. Mirrors the chat surface in screenshot 9.
 *   - status pills
 */
function AssistantMessageImpl({
  message,
  streaming,
  liveToolInput,
  showConversationTodoCard = false,
  conversationTodoInput = null,
  projectId = null,
  projectKind = null,
  conversationId = null,
  projectFiles = [],
  projectMetadata,
  projectFileNames,
  projectResolvedDir,
  onRequestOpenFile,
  onBrandBrowserAssistConfirm,
  onRequestPluginFolderAgentAction,
  activePluginActionPaths = new Set(),
  hiddenPluginActionPaths = new Set(),
  onShareToOpenDesign,
  shareToOpenDesignBusy = false,
  isLast,
  errorCardOwnerId = null,
  nextUserContent,
  onOpenQuestions,
  onContinueRemainingTasks,
  onForkFromMessage,
  forking = false,
  onFeedback,
  suppressDirectionForms = false,
  hasDesignSystemContext = false,
  onArtifactShare,
  onToolboxAction,
  onNextStepPromptAction,
  onNextStepAiOptimize,
  nextStepAiOptimizeBusy,
  onNextStepContinueExtraction,
  nextStepContinueExtractionBusy,
  onNextStepContinueAiExtraction,
  nextStepContinueAiExtractionBusy,
  onNextStepCreateDesign,
  nextStepCreateDesignBusy,
  onNextStepCreateDesignSystem,
  nextStepCreateDesignSystemBusy,
  onPickSkill,
  onArtifactDownload,
  nextStepSkills,
  toolboxSkillNames,
  nextStepVariant = 'default',
}: Props) {
  const t = useT();
  // Thinking text renders markdown too — its file links must route in-app
  // exactly like prose links (ProseBlock builds the same handler itself).
  const thinkingLinkClick = useMemo(
    () => chatFileLinkClickHandler(onRequestOpenFile, projectFileNames, projectId, projectResolvedDir),
    [onRequestOpenFile, projectFileNames, projectId, projectResolvedDir],
  );
  const events =
    (message.events?.length ?? 0) > 0
      ? message.events!
      : message.content.trim()
        ? ([{ kind: "text", text: message.content }] satisfies AgentEvent[])
        : [];
  const displayEvents = useMemo(() => dedupeToolUsesById(events), [events]);
  // ChatPane renders the canonical TodoWrite card as a standalone chat row, so
  // we strip TodoWrite tool-groups out of the per-message flow to avoid the
  // same task list rendering twice.
  const settledUseIds = useMemo(
    () => new Set(displayEvents.filter((e) => e.kind === "tool_use").map((e) => e.id)),
    [displayEvents],
  );
  // Live code boxes (Write/Edit streaming) append after everything else.
  const liveCodeBlocks = useMemo<Block[]>(() => {
    if (!streaming || !liveToolInput) return [];
    const out: Block[] = [];
    for (const [id, entry] of Object.entries(liveToolInput)) {
      if (settledUseIds.has(id)) continue;
      if (!isLiveCodeToolName(entry.name)) continue;
      out.push({ kind: "live-tool", id, name: entry.name, raw: entry.text });
    }
    return out;
  }, [streaming, liveToolInput, settledUseIds]);
  // Compose the block list, then run the strip/suppress pipeline once.
  const blocks = useMemo(() => {
    const rawBlocks = [...buildBlocks(displayEvents), ...liveCodeBlocks];
    return placeConversationTodoCard(
      stripEmptyThinkingBlocks(suppressDuplicateQuestionForms(rawBlocks)),
      {
        show: showConversationTodoCard,
        input: conversationTodoInput,
      },
    );
  }, [displayEvents, liveCodeBlocks, showConversationTodoCard, conversationTodoInput]);
  const fileOps = useMemo(() => deriveFileOps(displayEvents), [displayEvents]);
  const produced = message.producedFiles ?? [];
  const displayedProduced = useMemo(
    () => {
      const linkedFiles = recoverLinkedProjectFilesFromContent(
        message.content,
        projectFiles,
        projectId,
        message,
      );
      const baseFiles =
        produced.length > 0
          ? produced
          : inferProducedFilesFromTurn({
              message,
              projectFiles,
              blocks,
              fileOps,
              streaming,
            });
      return mergeProjectFiles(baseFiles, linkedFiles);
    },
    [blocks, fileOps, message, produced, projectFiles, projectId, streaming],
  );
  const turnFileOps = useMemo(
    () => mergeProducedFilesIntoFileOps(fileOps, displayedProduced),
    [displayedProduced, fileOps],
  );
  // The single artifact the "next step" affordance anchors to: prefer the HTML
  // produced by THIS turn; if the final turn emitted none (a summary / continue
  // message) fall back to the most recently modified HTML in the project so
  // Share / Download still target the deliverable the user just made.
  const nextStepArtifactName = useMemo(
    () => pickPreviewableArtifact(displayedProduced) ?? pickLatestPreviewableArtifact(projectFiles),
    [displayedProduced, projectFiles],
  );
  const planNextStepName = useMemo(
    () => pickPlanDocument(displayedProduced) ?? pickLatestPlanDocument(projectFiles),
    [displayedProduced, projectFiles],
  );
  const isPlanNextStep = nextStepVariant === 'plan' || message.sessionMode === 'plan';
  const nextStepFileName = isPlanNextStep
    ? (planNextStepName ?? nextStepArtifactName)
    : nextStepArtifactName;
  const pluginActionFolders = useMemo(
    () =>
      !streaming && isLast && projectId
        ? pluginFoldersTouchedThisTurn(projectFiles, turnFileOps, displayedProduced, message.content)
            .filter((folder) => !hiddenPluginActionPaths.has(folder.path))
        : [],
    [displayedProduced, hiddenPluginActionPaths, isLast, message.content, projectFiles, projectId, streaming, turnFileOps],
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
  const roleName = assistantRoleName(message, t);
  const roleIconId = agentIconId(message.agentId, message.agentName);
  const hasEmptyResponse = events.some(
    (e) => e.kind === "status" && e.label === "empty_response"
  );
  const hasResultDeliveryFailure =
    message.resultDeliveryState === "no_result" ||
    message.resultDeliveryState === "delivery_failed";
  const isBrandBrowserAssistMessage =
    isBrandExtractionNextStepVariant(nextStepVariant) &&
    (message.content.includes('<od-card type="brand-browser-assist"') ||
      textNeedsBrandBrowserAssistFallback(message.content));
  const brandBrowserAssistFallbackCard = useMemo(
    () =>
      streaming
        ? null
        : buildBrandBrowserAssistFallbackCard({
            content: message.content,
            metadata: projectMetadata,
            nextStepVariant,
          }),
    [message.content, nextStepVariant, projectMetadata, streaming],
  );
  const unfinishedTodos = streaming ? [] : unfinishedTodosFromEvents(events);
  const runSucceeded =
    !streaming &&
    !hasResultDeliveryFailure &&
    (
      message.runStatus === "succeeded" ||
      (!message.runStatus && !!message.endedAt) ||
      isBrandBrowserAssistMessage
    );
  const runTerminal =
    !streaming &&
    (
      (message.runStatus ? isTerminalRunStatus(message.runStatus) : false) ||
      (!message.runStatus && !!message.endedAt) ||
      isBrandBrowserAssistMessage
    );
  const canContinueTodos =
    !streaming &&
    !!isLast &&
    unfinishedTodos.length > 0 &&
    !!onContinueRemainingTasks;
  const canFork = !streaming && !!onForkFromMessage;
  const copyMarkdown = message.content.trim().length > 0 ? message.content : undefined;
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
    hasEmptyResponse ||
    !!copyMarkdown ||
    canFork;
  const canShowOpenDesignSubmission = !!onShareToOpenDesign && showFeedback && runSucceeded;
  const showOpenDesignSubmission =
    canShowOpenDesignSubmission && (!!isLast || shareToOpenDesignBusy);
  const effectiveNextStepVariant: NextStepActionsVariant =
    nextStepVariant === 'brand-extraction' && (!runSucceeded || !nextStepArtifactName)
      ? 'brand-programmatic-incomplete'
      : nextStepVariant === 'default' && (!runSucceeded || !nextStepArtifactName)
        ? 'project-incomplete'
        : nextStepVariant;
  const hasNextStepPrimary =
    effectiveNextStepVariant === 'brand-extraction'
      ? !!onNextStepAiOptimize || !!onNextStepCreateDesign || !!onNextStepContinueExtraction
      : effectiveNextStepVariant === 'brand-extraction-incomplete' ||
          effectiveNextStepVariant === 'brand-programmatic-incomplete'
        ? !!onNextStepContinueExtraction || !!onNextStepContinueAiExtraction
        : effectiveNextStepVariant === 'brand-ai-incomplete'
          ? !!onNextStepContinueAiExtraction
        : effectiveNextStepVariant === 'design-system'
          ? !!onNextStepPromptAction
          : effectiveNextStepVariant === 'plan'
            ? !!onNextStepPromptAction
          : effectiveNextStepVariant === 'project-incomplete'
            ? !!onNextStepPromptAction ||
              !!onToolboxAction ||
              !!onNextStepCreateDesignSystem ||
              (!!nextStepArtifactName && (!!onArtifactShare || !!onArtifactDownload))
            : !!onToolboxAction ||
              !!onNextStepCreateDesignSystem ||
              (!!nextStepArtifactName && (!!onArtifactShare || !!onArtifactDownload));
  // A clarification turn terminates its run while the emitted <question-form>
  // is still waiting for the user in the Questions tab. Until the immediate
  // user reply submits that form's answers (skip-all submits through the same
  // path), the turn is mid-handshake, not settled. Suppressed direction forms
  // render as a locked pill the user cannot answer, so they don't hold the
  // card back.
  const hasPendingQuestionForm = useMemo(() => {
    if (hasUnterminatedQuestionForm(message.content)) return true;
    return splitOnQuestionForms(message.content).some(
      (seg) =>
        seg.kind === "form" &&
        !(suppressDirectionForms && isDirectionForm(seg.form)) &&
        (!nextUserContent || !parseSubmittedAnswers(seg.form, nextUserContent)),
    );
  }, [message.content, nextUserContent, suppressDirectionForms]);
  // Terminal turns should leave the user with an actionable path, including
  // canceled/failed/no-artifact turns. Artifact-backed cards still wire Share
  // and Download to the chosen file; incomplete cards fall back to composer
  // prompts or toolbox actions. A turn still waiting on question-form answers
  // is the exception: the next step IS answering the form.
  const showNextStepActions =
    !streaming &&
    runTerminal &&
    !hasPendingQuestionForm &&
    ((!!isLast && hasNextStepPrimary) || showOpenDesignSubmission);
  // Pre-output vs working: before any real content (text / thinking / tools /
  // files) the footer shimmers "Preparing…"; the moment content lands it
  // flips to "Working". The elapsed clock stays anchored to the persisted run
  // start so switching project tabs or remounting the message cannot restart it.
  const hasContent = blocks.some((b) => b.kind !== "status") || turnFileOps.length > 0;
  const preparing = streaming && !hasContent;
  const preparingStatus = preparing && events.some((e) => e.kind === "status" && e.label === "thinking")
    ? "thinking"
    : "preparing";

  // Index of the trailing text block — the streaming caret rides the end of
  // the last prose block so it tracks the final character as tokens arrive.
  let lastTextBlockIndex = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i]?.kind === "text") {
      lastTextBlockIndex = i;
      break;
    }
  }

  return (
    <div
      id={`assistant-message-${message.id}`}
      className="msg assistant"
      data-assistant-message-id={message.id}
      tabIndex={-1}
    >
      <div className="role">
        <AgentIcon id={roleIconId} size={20} className="role-agent-icon" />
        <span className="role-name">{roleName}</span>
      </div>
      <div className="assistant-flow">
        {blocks.map((b, i) => {
          if (b.kind === "text")
            return (
              <ProseBlock
                key={i}
                text={b.text}
                hideRecoveredHtmlFallback={(message.agentId === "grok-build" || message.agentId === "claude") && !streaming}
                assistantMessageId={message.id}
                isLastAssistant={!!isLast}
                streaming={streaming}
                showStreamCursor={streaming && i === lastTextBlockIndex}
                nextUserContent={nextUserContent}
                suppressDirectionForms={suppressDirectionForms}
                onOpenQuestions={onOpenQuestions}
                projectId={projectId}
                conversationId={conversationId}
                runId={message.runId ?? null}
                projectFileNames={projectFileNames}
                projectResolvedDir={projectResolvedDir}
                onRequestOpenFile={onRequestOpenFile}
                onBrandBrowserAssistConfirm={onBrandBrowserAssistConfirm}
              />
            );
          if (b.kind === "thinking")
            // Thinking is only "in progress" while this is the trailing block.
            // Once any block (prose / tools) lands after it, the model has
            // moved past thinking, so the block flips to its finished state.
            return (
              <ThinkingBlock
                key={i}
                text={b.text}
                streaming={streaming && i === blocks.length - 1}
                onLinkClick={thinkingLinkClick}
              />
            );
          if (b.kind === "tool-group") {
            return (
              <ToolGroupCard
                key={i}
                items={b.items}
                runStreaming={streaming}
                runSucceeded={runSucceeded}
                projectFileNames={projectFileNames}
                onRequestOpenFile={onRequestOpenFile}
              />
            );
          }
          if (b.kind === "live-tool") {
            return <LiveCodeBox key={b.id} name={b.name} raw={b.raw} />;
          }
          if (b.kind === "plugin-candidate") {
            return (
              <SkillPluginCandidateCard
                key={i}
                block={b}
                projectId={projectId}
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
            // The pre-output "initializing" status is surfaced by the footer's
            // shimmering "Preparing…" label instead of its own pill.
            if (b.label === "initializing") return null;
            return <StatusPill key={i} label={b.label} detail={b.detail} />;
          }
          return null;
        })}
        {brandBrowserAssistFallbackCard ? (
          <OdCardView
            card={brandBrowserAssistFallbackCard}
            onBrandBrowserAssistConfirm={onBrandBrowserAssistConfirm}
            instanceScope={[
              projectId ?? "no-project",
              conversationId ?? "no-conversation",
              message.runId ?? "no-run",
              message.id,
              "brand-browser-assist-fallback",
            ].join(":")}
          />
        ) : null}
        {turnFileOps.length > 0 ? (
          <FileOpsSummary
            entries={turnFileOps}
            streaming={streaming}
            projectFileNames={projectFileNames}
            onRequestOpenFile={onRequestOpenFile}
          />
        ) : null}
        {!streaming && turnFileOps.length === 0 && displayedProduced.length > 0 && projectId ? (
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
                modelId={modelIdForTracking(assistantFeedbackModelId(message))}
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
                  preparing,
                  preparingStatus,
                  copyMarkdown,
                  onFork: canFork ? onForkFromMessage : undefined,
                  forking,
                  forceVisible: true,
                  isLast: !!isLast,
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
                preparing={preparing}
                preparingStatus={preparingStatus}
                copyMarkdown={copyMarkdown}
                onFork={canFork ? onForkFromMessage : undefined}
                forking={forking}
                isLast={!!isLast}
              />
            )}
          </div>
        ) : null}
        {showNextStepActions ? (
          <NextStepActions
            fileName={isLast ? nextStepFileName : null}
            planFileName={isLast ? planNextStepName : null}
            artifactFileName={isLast ? nextStepArtifactName : null}
            onShare={isLast && nextStepArtifactName && !isPlanNextStep ? onArtifactShare : undefined}
            onToolboxAction={isLast ? onToolboxAction : undefined}
            onPromptAction={isLast ? onNextStepPromptAction : undefined}
            onAiOptimize={isLast ? onNextStepAiOptimize : undefined}
            aiOptimizeBusy={Boolean(isLast && nextStepAiOptimizeBusy)}
            onContinueExtraction={isLast ? onNextStepContinueExtraction : undefined}
            continueExtractionBusy={Boolean(isLast && nextStepContinueExtractionBusy)}
            onContinueAiExtraction={isLast ? onNextStepContinueAiExtraction : undefined}
            continueAiExtractionBusy={Boolean(isLast && nextStepContinueAiExtractionBusy)}
            onCreateDesign={isLast ? onNextStepCreateDesign : undefined}
            createDesignBusy={Boolean(isLast && nextStepCreateDesignBusy)}
            onCreateDesignSystem={isLast ? onNextStepCreateDesignSystem : undefined}
            createDesignSystemBusy={Boolean(isLast && nextStepCreateDesignSystemBusy)}
            onPickSkill={isLast ? onPickSkill : undefined}
            onDownload={isLast && nextStepFileName ? onArtifactDownload : undefined}
            skills={isLast ? nextStepSkills : undefined}
            toolboxSkillNames={isLast ? toolboxSkillNames : undefined}
            onShareToOpenDesign={showOpenDesignSubmission ? onShareToOpenDesign : undefined}
            shareToOpenDesignBusy={shareToOpenDesignBusy}
            variant={effectiveNextStepVariant}
          />
        ) : null}
      </div>
    </div>
  );
}

// Return the name of the first previewable HTML artifact among the produced
// files, or null if this turn produced no shareable/polishable preview. Only
// HTML files drive the preview workspace's Share/Export menu and the
// visual-polish loop, so the "next step" affordance keys off them.
function isPreviewableHtml(f: ProjectFile): boolean {
  return f.kind === "html" || /\.html?$/i.test(f.name);
}

function pickPreviewableArtifact(files: ProjectFile[]): string | null {
  const html = files.find(isPreviewableHtml);
  return html ? html.name : null;
}

// Fallback for when the card-bearing turn produced no HTML itself: pick the
// most recently modified HTML in the project (the deliverable the user just
// made / is looking at) rather than whichever HTML happens to be first, which
// would attach Share/Download to an arbitrary file in a multi-artifact project.
function pickLatestPreviewableArtifact(files: ProjectFile[]): string | null {
  let latest: ProjectFile | null = null;
  for (const f of files) {
    if (!isPreviewableHtml(f)) continue;
    if (!latest || (f.mtime ?? 0) > (latest.mtime ?? 0)) latest = f;
  }
  return latest ? latest.name : null;
}

const PLAN_DOCUMENT_EXCLUDES = new Set(['design.md', 'brand-system.md']);

function isPlanDocument(f: ProjectFile): boolean {
  const name = f.name.toLowerCase();
  if (!/\.mdx?$/.test(name)) return false;
  const basename = name.split('/').pop() ?? name;
  return !PLAN_DOCUMENT_EXCLUDES.has(basename);
}

function pickPlanDocument(files: ProjectFile[]): string | null {
  const doc = files.find(isPlanDocument);
  return doc ? doc.name : null;
}

function pickLatestPlanDocument(files: ProjectFile[]): string | null {
  let latest: ProjectFile | null = null;
  for (const f of files) {
    if (!isPlanDocument(f)) continue;
    if (!latest || (f.mtime ?? 0) > (latest.mtime ?? 0)) latest = f;
  }
  return latest ? latest.name : null;
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
  return filterImplicitProducedFiles(
    projectFiles.filter((file) => {
      if (file.type === "dir") return false;
      if (!file.name || file.name.startsWith(".")) return false;
      if (file.name.includes("/.")) return false;
      return file.mtime >= start && file.mtime <= end;
    }),
  ).sort((a, b) => b.mtime - a.mtime);
}

function mergeProducedFilesIntoFileOps(
  fileOps: FileOpEntry[],
  produced: ProjectFile[],
): FileOpEntry[] {
  if (produced.length === 0) return fileOps;
  const seen = new Set<string>();
  for (const entry of fileOps) {
    seen.add(normalizeTouchedPath(entry.path));
    seen.add(normalizeTouchedPath(entry.fullPath));
  }

  const merged = [...fileOps];
  for (const file of produced) {
    const fullPath = file.path || file.name;
    const path = file.name || fullPath;
    if (!path || seen.has(normalizeTouchedPath(path)) || seen.has(normalizeTouchedPath(fullPath))) {
      continue;
    }
    seen.add(normalizeTouchedPath(path));
    seen.add(normalizeTouchedPath(fullPath));
    merged.push({
      path,
      fullPath,
      ops: ["write"],
      opCounts: { read: 0, write: 1, edit: 0, delete: 0 },
      total: 1,
      status: "done",
    });
  }
  return merged;
}

function normalizeTouchedPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function recoverLinkedProjectFilesFromContent(
  content: string,
  projectFiles: ProjectFile[],
  projectId?: string | null,
  message?: ChatMessage,
): ProjectFile[] {
  if (!content || projectFiles.length === 0) return [];
  const projectFileNames = new Set<string>();
  const byPath = new Map<string, ProjectFile>();
  const basenameFiles = new Map<string, ProjectFile | null>();
  for (const file of projectFiles) {
    if (file.type === "dir") continue;
    for (const value of [file.name, file.path, file.localPath]) {
      if (!value) continue;
      const normalized = normalizeTouchedPath(value);
      projectFileNames.add(normalized);
      byPath.set(normalized, file);
      const basename = normalized.split("/").filter(Boolean).pop();
      if (basename && basename !== normalized) {
        basenameFiles.set(
          basename,
          basenameFiles.has(basename) ? null : file,
        );
      }
    }
  }
  for (const [basename, file] of basenameFiles) {
    if (!file) continue;
    projectFileNames.add(basename);
    byPath.set(basename, file);
  }
  if (projectFileNames.size === 0) return [];

  const recovered = new Map<string, ProjectFile>();
  for (const href of extractContentFileReferences(content, projectFileNames)) {
    const filePath = asInProjectFilePath(href, projectFileNames, projectId);
    if (!filePath) continue;
    const file = byPath.get(normalizeTouchedPath(filePath));
    if (!file) continue;
    if (!shouldRecoverReferencedFile(content, href, file, message)) continue;
    recovered.set(file.path || file.name, file);
  }
  return Array.from(recovered.values());
}

function extractContentFileReferences(
  content: string,
  projectFileNames: ReadonlySet<string>,
): string[] {
  const refs = new Set<string>();
  for (const href of extractMarkdownLinkHrefs(content)) refs.add(href);
  for (const ref of extractInlineCodeFileRefs(content)) refs.add(ref);
  for (const ref of extractKnownProjectFileRefs(content, projectFileNames)) refs.add(ref);
  return Array.from(refs);
}

function extractInlineCodeFileRefs(content: string): string[] {
  const refs: string[] = [];
  const codePattern = /`([^`\n]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = codePattern.exec(content)) !== null) {
    const raw = match[1]?.trim();
    if (raw && looksLikeFileReference(raw)) refs.push(raw);
  }
  return refs;
}

function extractKnownProjectFileRefs(
  content: string,
  projectFileNames: ReadonlySet<string>,
): string[] {
  const refs: string[] = [];
  const names = Array.from(projectFileNames)
    .filter((name) => name.length > 0)
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return refs;
  for (const line of content.split(/\r?\n/)) {
    for (const name of names) {
      if (lineContainsFileReference(line, name)) refs.push(name);
    }
  }
  return refs;
}

function shouldRecoverReferencedFile(
  content: string,
  rawRef: string,
  file: ProjectFile,
  message?: ChatMessage,
): boolean {
  if (isFileMtimeInsideRun(file, message)) return true;
  return contentHasOutputHintForFile(content, rawRef, file);
}

function isFileMtimeInsideRun(file: ProjectFile, message?: ChatMessage): boolean {
  if (!message?.startedAt || !message.endedAt) return false;
  const start = message.startedAt - 1_000;
  const end = message.endedAt + 60_000;
  return file.mtime >= start && file.mtime <= end;
}

function contentHasOutputHintForFile(
  content: string,
  rawRef: string,
  file: ProjectFile,
): boolean {
  const refs = [
    rawRef,
    file.name,
    file.path,
    file.localPath,
    file.name.split("/").filter(Boolean).pop(),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return content.split(/\r?\n/).some((line) => {
    if (!lineHasOutputFileHint(line)) return false;
    return refs.some((ref) => lineContainsFileReference(line, normalizeTouchedPath(ref)));
  });
}

function lineHasOutputFileHint(line: string): boolean {
  return /(?:\b(?:add(?:ed)?|built|chang(?:e|ed)|creat(?:e|ed)|deliverable|edit(?:ed)?|file(?:s)?|generat(?:e|ed)|modif(?:y|ied)|output|produc(?:e|ed)|sav(?:e|ed)|updat(?:e|ed)|writ(?:e|ten|ing)|wrote)\b|产物|创建|生成|交付|输出|保存|文件|新增|更新|修改|完成|已创建|已生成|已写入|写入)/i.test(line);
}

function lineContainsFileReference(line: string, ref: string): boolean {
  const normalizedLine = normalizeTouchedPath(line);
  const normalizedRef = normalizeTouchedPath(ref);
  if (!normalizedRef) return false;
  const escaped = escapeRegExp(normalizedRef);
  return new RegExp(`(^|[\\s\`"'“”‘’\\[\\]()<>{}:：,，.。;；!?！？])${escaped}($|[\\s\`"'“”‘’\\[\\]()<>{}:：,，.。;；!?！？])`).test(normalizedLine);
}

function looksLikeFileReference(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 240) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return true;
  return /(?:^|[/\\])[^/\\]+\.[a-z0-9]{1,12}(?:[#?].*)?$/i.test(trimmed);
}

function extractMarkdownLinkHrefs(content: string): string[] {
  const hrefs: string[] = [];
  const linkPattern = /(!?)\[[^\]\n]*\]\(([^)\n]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(content)) !== null) {
    if (match[1] === "!") continue;
    const href = normalizeMarkdownHref(match[2] ?? "");
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function normalizeMarkdownHref(rawHref: string): string | null {
  const trimmed = rawHref.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("<")) {
    const end = trimmed.indexOf(">");
    return end > 1 ? trimmed.slice(1, end).trim() : null;
  }
  const titled = /^(\S+)\s+(?:"[^"]*"|'[^']*'|\([^)]*\))$/.exec(trimmed);
  return (titled?.[1] ?? trimmed).trim() || null;
}

function mergeProjectFiles(
  first: ProjectFile[],
  second: ProjectFile[],
): ProjectFile[] {
  if (first.length === 0) return second;
  if (second.length === 0) return first;
  const seen = new Set<string>();
  const merged: ProjectFile[] = [];
  for (const file of [...first, ...second]) {
    const key = normalizeTouchedPath(file.path || file.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(file);
  }
  return merged;
}

// A run that reached a terminal state — succeeded, failed, or canceled — has a
// settled assistant turn worth rating. Only queued/running turns are still in
// flight, so they have no outcome to give feedback on yet. Feedback used to be
// gated on success alone, which silently dropped the thumbs row on failed and
// canceled turns even though those are exactly the outcomes a user most wants
// to thumbs-down.
function isTerminalRunStatus(
  status: NonNullable<ChatMessage["runStatus"]>
): boolean {
  return status === "succeeded" || status === "failed" || status === "canceled";
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
  if (
    streaming ||
    hasEmptyResponse ||
    hasUnfinishedTodos ||
    message.resultDeliveryState === "no_result" ||
    message.resultDeliveryState === "delivery_failed"
  ) return false;
  if (message.runStatus) return isTerminalRunStatus(message.runStatus);
  return !!message.endedAt;
}

// The agent name without the trailing model id — the role header shows the
// brand logo + name only, so the `· model` suffix is dropped there.
export function assistantRoleName(
  message: ChatMessage,
  t: TranslateFn
): string {
  const fromName = message.agentName?.trim();
  if (fromName) {
    const base = fromName.split(" · ")[0]?.trim() || fromName;
    return exactAgentDisplayName(base) ?? base;
  }
  const fromId = agentDisplayName(message.agentId);
  if (fromId) return fromId;
  const starting = message.events?.find(
    (e) => e.kind === "status" && e.label === "starting" && e.detail
  ) as Extract<AgentEvent, { kind: "status" }> | undefined;
  return agentDisplayName(starting?.detail) ?? t("assistant.role");
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
  // Pre-output phase: streaming but nothing rendered yet. The label shimmers
  // "Preparing…"; once content lands it flips to "Working".
  preparing?: boolean;
  preparingStatus?: "preparing" | "thinking";
  copyMarkdown?: string;
  onFork?: () => void;
  forking?: boolean;
  feedbackControls?: ReactNode;
  forceVisible?: boolean;
  // The most recent assistant reply keeps its footer permanently visible
  // (not hover-gated), matching Lobe Chat's persistent last-message footer.
  isLast?: boolean;
}

function AssistantFooter({
  streaming,
  startedAt,
  endedAt,
  usage,
  hasUnfinishedTodos,
  hasEmptyResponse,
  preparing = false,
  preparingStatus = "preparing",
  copyMarkdown,
  onFork,
  forking = false,
  feedbackControls,
  forceVisible = false,
  isLast = false,
}: AssistantFooterProps) {
  const t = useT();
  const elapsed = useLiveElapsed(streaming, startedAt, endedAt, usage?.durationMs);
  const formattedCost =
    typeof usage?.costUsd === "number" &&
    Number.isFinite(usage.costUsd) &&
    usage.costUsd > 0
      ? usage.costUsd.toFixed(4)
      : "";
  const costLabel = formattedCost && formattedCost !== "0.0000" ? ` · $${formattedCost}` : "";
  if (
    !forceVisible &&
    !streaming &&
    !elapsed &&
    !usage &&
    !hasUnfinishedTodos &&
    !hasEmptyResponse &&
    !copyMarkdown &&
    !onFork
  )
    return null;
  return (
    <div
      className="assistant-footer"
      data-unfinished={hasUnfinishedTodos ? "true" : "false"}
      data-streaming={streaming ? "true" : "false"}
      data-last={isLast ? "true" : "false"}
    >
      <span className="dot" data-active={streaming ? "true" : "false"} />
      <span className={`assistant-label${streaming && preparing ? " shimmer-text shimmer-prepare" : ""}`}>
        {streaming
          ? preparing
            ? preparingStatus === "thinking"
              ? t("assistant.statusThinking")
              : t("assistant.statusPreparing")
            : t("assistant.workingLabel")
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
        {costLabel}
      </span>
      {copyMarkdown || onFork || feedbackControls ? (
        <span className="assistant-footer-controls">
          {copyMarkdown ? <AssistantMarkdownCopyButton markdown={copyMarkdown} /> : null}
          {onFork ? (
            <AssistantForkButton
              disabled={forking}
              onFork={onFork}
            />
          ) : null}
          {feedbackControls}
        </span>
      ) : null}
    </div>
  );
}

function AssistantForkButton({
  disabled,
  onFork,
}: {
  disabled: boolean;
  onFork: () => void;
}) {
  const t = useT();
  const label = disabled
    ? t("assistant.forkingConversation")
    : t("assistant.forkConversation");
  return (
    <button
      type="button"
      className="assistant-copy-button od-tooltip"
      disabled={disabled}
      data-testid="assistant-fork-button"
      data-tooltip={label}
      data-tooltip-placement="top"
      onClick={onFork}
      aria-label={label}
      title={label}
    >
      <Icon name={disabled ? "spinner" : "fork"} size={13} />
    </button>
  );
}

function AssistantMarkdownCopyButton({ markdown }: { markdown: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    const ok = await copyToClipboard(markdown);
    if (!ok) return;
    setCopied(true);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = undefined;
    }, 2000);
  }

  const label = copied ? t("chat.copyDone") : t("assistant.copyMarkdown");
  return (
    <button
      type="button"
      className="assistant-copy-button od-tooltip"
      data-testid="assistant-copy-markdown"
      data-copied={copied ? "true" : "false"}
      data-tooltip={label}
      data-tooltip-placement="top"
      onClick={() => {
        void handleCopy();
      }}
      aria-label={label}
      title={label}
    >
      <Icon name={copied ? "check" : "copy"} size={13} />
    </button>
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
  modelId: string;
  agentProviderId: TrackingFeedbackProviderId;
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
        agent_provider_id: agentProviderId,
        model_id: modelId,
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
    agentProviderId,
    modelId,
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
      agent_provider_id: agentProviderId,
      model_id: modelId,
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
        agent_provider_id: agentProviderId,
        model_id: modelId,
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
        agent_provider_id: agentProviderId,
        model_id: modelId,
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
        agent_provider_id: agentProviderId,
        model_id: modelId,
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
        agent_provider_id: agentProviderId,
        model_id: modelId,
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
        className="assistant-feedback-button od-tooltip"
        data-testid="assistant-feedback-positive"
        data-selected={selected === "positive" ? "true" : "false"}
        data-tooltip={t("assistant.feedbackPositive")}
        data-tooltip-placement="top"
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
        className="assistant-feedback-button od-tooltip"
        data-testid="assistant-feedback-negative"
        data-selected={selected === "negative" ? "true" : "false"}
        data-tooltip={t("assistant.feedbackNegative")}
        data-tooltip-placement="top"
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
 * Build the markdown link-click handler that keeps chat file links inside
 * the app. Current-project files open through the workspace tab opener;
 * files of another project (e.g. an @-referenced project linked by absolute
 * disk path or app route) navigate to that project's file route in the same
 * window; any remaining path-like href is swallowed, because its only
 * default outcome is a detached Electron window rendering the home screen
 * (0.14.1 acceptance bug: chatpane file links opened a home-page window). External URLs keep their default behavior.
 *
 * The handler is ALWAYS installed: only the workspace-file open action needs
 * `onRequestOpenFile`. Surfaces that mount the chat without a workspace
 * opener (e.g. the design-system chat in `DesignSystemFlow`) still must
 * navigate cross-project targets and swallow unresolvable path-like hrefs —
 * returning no handler there would reintroduce the detached home window for
 * every file link.
 */
function chatFileLinkClickHandler(
  onRequestOpenFile: ((name: string) => void) | undefined,
  projectFileNames: ReadonlySet<string> | undefined,
  projectId: string | null | undefined,
  projectResolvedDir?: string | null,
): MarkdownLinkClickHandler {
  return (href, event) => {
    const target = resolveChatFileLink(href, projectFileNames, projectId, projectResolvedDir);
    if (target) {
      event.preventDefault();
      if (target.kind === "workspace-file") {
        // Without a workspace opener the click stays swallowed: there is no
        // pane that can preview the current project's file on this surface,
        // and the default fallback would only open the home-page window.
        onRequestOpenFile?.(target.filePath);
      } else {
        navigate({ kind: "project", projectId: target.projectId, fileName: target.filePath });
      }
      return;
    }
    if (isPathLikeChatHref(href)) event.preventDefault();
  };
}

function ProseBlock({
  text,
  hideRecoveredHtmlFallback,
  assistantMessageId,
  isLastAssistant,
  streaming,
  showStreamCursor,
  nextUserContent,
  suppressDirectionForms,
  onOpenQuestions,
  projectId,
  conversationId,
  runId,
  projectFileNames,
  projectResolvedDir,
  onRequestOpenFile,
  onBrandBrowserAssistConfirm,
}: {
  text: string;
  hideRecoveredHtmlFallback?: boolean;
  assistantMessageId: string;
  isLastAssistant: boolean;
  streaming: boolean;
  showStreamCursor?: boolean;
  nextUserContent?: string;
  suppressDirectionForms: boolean;
  projectId?: string | null;
  conversationId?: string | null;
  runId?: string | null;
  projectFileNames?: Set<string>;
  projectResolvedDir?: string | null;
  onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
  onRequestOpenFile?: (name: string) => void;
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
}) {
  const t = useT();
  const cleaned = useMemo(() => {
    const stripped = stripArtifact(text);
    return hideRecoveredHtmlFallback ? stripRecoveredHtmlFallbackForDisplay(stripped, text) : stripped;
  }, [hideRecoveredHtmlFallback, text]);
  // While the latest turn is still streaming a not-yet-closed question-form,
  // drop the partial `<question-form>{…` markup from the prose so the chat
  // doesn't flash raw JSON; we surface a banner for it instead. The actual
  // form streams into the right-hand Questions tab. A not-yet-closed
  // `<od-card>{…` block is stripped the same way so its raw JSON doesn't flash
  // before the close tag arrives (the card renders inline once complete).
  const { text: visibleText, hadOpenForm } = useMemo(() => {
    if (!(isLastAssistant && streaming)) return { text: cleaned, hadOpenForm: false };
    const form = stripTrailingOpenQuestionForm(cleaned);
    const card = stripTrailingOpenOdCard(form.text);
    return { text: card.text, hadOpenForm: form.hadOpenForm };
  }, [cleaned, isLastAssistant, streaming]);
  // While an `<artifact type="text/html">` is still streaming (no closing tag
  // yet), surface its body in a live code panel instead of leaking the raw
  // tag + half-written HTML as Markdown text. Once it closes, stripArtifact
  // removes it and the file/preview panel takes over — so this only fires
  // mid-stream.
  const { head, live } = useMemo(
    () => (streaming ? splitStreamingArtifact(visibleText) : { head: visibleText, live: null }),
    [visibleText, streaming]
  );
  const segments = useMemo(() => splitOnQuestionForms(head), [head]);
  // Route file-link clicks away from the default target="_blank" behavior.
  // Without this, Electron's window-open handler creates a new app window
  // whose href can't resolve, and the user lands on the home screen — the
  // file is never previewed (issue #1239 and the 0.14.1 chatpane file-link acceptance bug).
  const onLinkClick = useMemo<MarkdownLinkClickHandler>(
    () => chatFileLinkClickHandler(onRequestOpenFile, projectFileNames, projectId, projectResolvedDir),
    [onRequestOpenFile, projectFileNames, projectId, projectResolvedDir],
  );
  // Each text segment is further split on `<od-card>` blocks (so memory cards
  // render inline, composing with the surrounding question-form handling) and
  // then on `<system-reminder>` blocks (so those render as their own
  // collapsible chip instead of raw markup). Splitting od-cards BEFORE
  // system-reminders keeps a card's JSON body out of the reminder scanner.
  type Renderable =
    | { key: string; kind: "text"; text: string }
    | { key: string; kind: "reminder"; text: string }
    | { key: string; kind: "form"; form: QuestionForm }
    | { key: string; kind: "od-card"; card: OdCard }
    | { key: string; kind: "suppressed-direction" };
  const renderable = segments.flatMap((seg, idx): Renderable[] => {
    if (seg.kind === "form") {
      if (suppressDirectionForms && isDirectionForm(seg.form)) {
        return [{ key: `f-${idx}`, kind: "suppressed-direction" }];
      }
      return [{ key: `f-${idx}`, kind: "form", form: seg.form }];
    }
    if (seg.text.trim().length === 0) return [];
    return splitOnOdCards(seg.text).flatMap((cardSeg, c): Renderable[] => {
      if (cardSeg.kind === "card") {
        return [{ key: `c-${idx}-${c}`, kind: "od-card", card: cardSeg.card }];
      }
      if (cardSeg.text.trim().length === 0) return [];
      return splitSystemReminders(cardSeg.text).map((s, j) => ({
        key: `t-${idx}-${c}-${j}`,
        kind: s.kind,
        text: s.text,
      }));
    });
  });
  if (renderable.length === 0 && !live) return null;
  return (
    <div className="prose-block" data-stream-cursor={showStreamCursor && !live ? "true" : undefined}>
      {renderable.map((seg) => {
        if (seg.kind === "reminder") {
          return <SystemReminderBlock key={seg.key} text={seg.text} variant="injection" />;
        }
        if (seg.kind === "text") {
          return (
            <Fragment key={seg.key}>
              {renderMarkdown(seg.text, { onLinkClick })}
            </Fragment>
          );
        }
        if (seg.kind === "od-card") {
          return (
            <OdCardView
              key={seg.key}
              card={seg.card}
              onBrandBrowserAssistConfirm={onBrandBrowserAssistConfirm}
              instanceScope={[
                projectId ?? "no-project",
                conversationId ?? "no-conversation",
                runId ?? "no-run",
                assistantMessageId,
                seg.key,
              ].join(":")}
            />
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
            assistantMessageId={assistantMessageId}
            nextUserContent={nextUserContent}
            onOpenQuestions={onOpenQuestions}
          />
        );
      })}
      {live ? (
        <StreamingCodeCard
          titleLabel={t("tool.write")}
          metaLabel={live.title || live.identifier || undefined}
          code={live.content}
        />
      ) : null}
      {hadOpenForm ? <QuestionsBanner onOpen={onOpenQuestions} /> : null}
    </div>
  );
}

// Chat-side banner that points to the right-hand Questions tab where discovery
// forms live. The chat column always stays compact: no inline form preview,
// answered or not.
function QuestionsBanner({
  onOpen,
  answered = false,
}: {
  onOpen?: () => void;
  answered?: boolean;
}) {
  const t = useT();
  // Once the form has been answered there is nothing left to open, so the
  // banner becomes a non-interactive "done" marker: no chevron affordance, no
  // click target, muted styling.
  return (
    <button
      type="button"
      className={`questions-banner${answered ? " questions-banner-answered" : ""}`}
      data-testid="questions-banner"
      data-answered={answered ? "true" : undefined}
      disabled={answered}
      onClick={answered ? undefined : () => onOpen?.()}
    >
      <span className="questions-banner-icon" aria-hidden>
        <Icon name={answered ? "check" : "help-circle"} size={15} />
      </span>
      <span className="questions-banner-label">
        {answered ? t("questions.bannerAnswered") : t("questions.banner")}
      </span>
      {answered ? null : (
        <span className="questions-banner-cta" aria-hidden>
          <Icon name="chevron-right" size={14} />
        </span>
      )}
    </button>
  );
}

function isDirectionForm(form: QuestionForm): boolean {
  if (form.id.toLowerCase() === "direction") return true;
  if (form.title.toLowerCase().includes("visual direction")) return true;
  return form.questions.some((q) => q.type === "direction-cards");
}

function FormBlock({
  form,
  assistantMessageId,
  nextUserContent,
  onOpenQuestions,
}: {
  form: QuestionForm;
  assistantMessageId: string;
  nextUserContent?: string;
  onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
}) {
  // A "[form answers …]" reply parked right after this message means the form
  // was already submitted; the banner then renders as an answered/done state.
  const submittedFromHistory = useMemo(
    () => (nextUserContent ? parseSubmittedAnswers(form, nextUserContent) : null),
    [form, nextUserContent],
  );
  return (
    <QuestionsBanner
      answered={submittedFromHistory != null}
      onOpen={() => {
        onOpenQuestions?.({
          form,
          messageId: assistantMessageId,
          submittedAnswers: submittedFromHistory ?? undefined,
        });
      }}
    />
  );
}

function SystemReminderBlock({
  text,
  variant = "trusted",
}: {
  text: string;
  // "injection" — model-echoed <system-reminder> tag (prompt injection risk): amber warning chip.
  // "trusted"   — reserved for harness-sourced reminders; no current call sites use this default.
  variant?: "trusted" | "injection";
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  const preview = trimmed.split("\n")[0]?.slice(0, 120) ?? "";
  const isInjection = variant === "injection";
  return (
    <div className={`system-reminder-block${isInjection ? " injection" : ""}`}>
      <button
        className="system-reminder-toggle"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="system-reminder-icon" aria-hidden>
          <Icon name={isInjection ? "alert-triangle" : "settings"} size={12} />
        </span>
        <span className="system-reminder-label">
          {isInjection
            ? t("assistant.possiblePromptInjection")
            : t("assistant.systemReminder")}
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

function ThinkingBlock({
  text,
  streaming,
  onLinkClick,
}: {
  text: string;
  streaming?: boolean;
  onLinkClick?: MarkdownLinkClickHandler;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const isThinking = streaming === true;
  // Thinking events carry no server timestamps, so the "用时 X 秒" duration is
  // measured client-side: stamp the start when streaming begins and freeze the
  // elapsed once it ends. Blocks restored from history never stream, so they
  // fall back to the plain "已深度思考" label with no seconds.
  const startRef = useRef<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);
  useEffect(() => {
    if (isThinking) {
      if (startRef.current === null) startRef.current = Date.now();
      setElapsedSec(null);
    } else if (startRef.current !== null) {
      setElapsedSec(Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
      startRef.current = null;
    }
  }, [isThinking]);
  const label = isThinking
    ? t("assistant.thinking")
    : elapsedSec != null
      ? t("assistant.thoughtFor", { s: elapsedSec })
      : t("assistant.thought");
  return (
    <div className="thinking-block">
      <button className="thinking-toggle" onClick={() => setOpen((o) => !o)}>
        <span className={`thinking-status${isThinking ? ' op-status-running' : open ? ' thinking-status-active' : ''}`} aria-hidden>
          {isThinking
            ? <Icon name="spinner" size={14} />
            : <Icon name="sparkles" size={14} />
          }
        </span>
        <span className={`thinking-label${isThinking ? ' shimmer-text' : ''}`}>
          {label}
        </span>
        <span className="thinking-chev">
          <Icon name={open ? "chevron-down" : "chevron-right"} size={11} />
        </span>
      </button>
      <div className={`accordion-collapsible${open ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <div className="thinking-body">{renderMarkdown(text, { onLinkClick })}</div>
        </div>
      </div>
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
  const variant =
    label === "error" ? "error" : label === "warning" ? "warning" : undefined;
  return (
    <div
      className={`status-pill${variant ? ` is-${variant}` : ""}`}
      data-status={label}
    >
      <span className="status-label">{label}</span>
      {detail ? <span className="status-detail">{renderStatusDetail(detail)}</span> : null}
    </div>
  );
}

function renderStatusDetail(detail: string): ReactNode {
  const segments: ReactNode[] = [];
  const urlRe = /(https?:\/\/[^\s)<>"}\]]+)/g;
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
  const match = /([.,!?;:，。！？；：、'"」』】》〉）}\]]+)$/.exec(url);
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
// Other tool names pass through untouched.
const SNAPSHOT_TOOL_NAMES = new Set([
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
  // input — it is a state replace, not an append. The cheap unifying
  // behavior: keep the last item per `(name, JSON.stringify(input))` key;
  // for TodoWrite a single name+input is the snapshot identity.
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

// Tools whose streaming JSON input is worth previewing as live code. Other
// tools (Bash, Grep, TodoWrite, …) stream JSON too but a code panel for them
// would be noise.
const LIVE_CODE_TOOL_NAMES = new Set([
  "Write",
  "write",
  "Edit",
  "edit",
  "MultiEdit",
  "multiedit",
  "NotebookEdit",
]);

function isLiveCodeToolName(name: string): boolean {
  return LIVE_CODE_TOOL_NAMES.has(name);
}

// Pull the (possibly still-streaming) value of a top-level JSON string field
// out of a raw, not-yet-closed JSON fragment. Returns the decoded text up to
// wherever the stream currently ends — an unterminated escape or \u sequence
// at the tail is dropped rather than throwing. Returns null when the field /
// its opening quote hasn't arrived yet. Good enough for a live preview; the
// authoritative value comes from the parsed `tool_use.input` once complete.
function extractStreamingJsonString(raw: string, field: string): string | null {
  const marker = `"${field}"`;
  const mi = raw.indexOf(marker);
  if (mi === -1) return null;
  let i = mi + marker.length;
  // Advance to the value's opening quote, past the `:` and any whitespace.
  while (i < raw.length && raw[i] !== '"') i++;
  if (i >= raw.length) return null;
  i++; // step past the opening quote
  let out = "";
  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === "\\") {
      const next = raw[i + 1];
      if (next === undefined) break; // incomplete escape at the streaming tail
      switch (next) {
        case "n": out += "\n"; break;
        case "t": out += "\t"; break;
        case "r": out += "\r"; break;
        case '"': out += '"'; break;
        case "\\": out += "\\"; break;
        case "/": out += "/"; break;
        case "b": out += "\b"; break;
        case "f": out += "\f"; break;
        case "u": {
          const hex = raw.slice(i + 2, i + 6);
          if (hex.length < 4) return out; // incomplete \u escape at the tail
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        default: out += next;
      }
      i += 2;
      continue;
    }
    if (ch === '"') break; // closing quote → value complete
    out += ch;
    i++;
  }
  return out;
}

// Presentational in-flight code panel: a boxed header (spinner + shimmer
// title + optional meta) over a monospace body with a typing caret. Plain
// monospace on purpose — shiki highlighting is async and would thrash on
// every streamed delta; the finished, highlighted view is taken over by the
// normal card once the write/artifact completes. Shared by the tool-call
// path (LiveCodeBox) and the streaming-artifact path (ProseBlock).
function StreamingCodeCard({
  titleLabel,
  metaLabel,
  code,
}: {
  titleLabel: string;
  metaLabel?: string;
  code: string;
}) {
  const preRef = useRef<HTMLPreElement | null>(null);
  // Keep the latest streamed line in view as code grows.
  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [code]);
  return (
    <div className="op-card op-file live-code-box">
      <div className="op-card-head live-code-head">
        <span className="action-card-status op-status-running" aria-hidden>
          <Icon name="spinner" size={14} />
        </span>
        <span className="op-title shimmer-text">{titleLabel}</span>
        {metaLabel ? <span className="op-meta">{metaLabel}</span> : null}
      </div>
      {code ? (
        <pre className="live-code-pre" ref={preRef}>
          <code>
            {code}
            <span className="live-code-caret" aria-hidden />
          </code>
        </pre>
      ) : null}
    </div>
  );
}

// In-flight code panel rendered from a tool call whose JSON input is still
// streaming. The finished view is taken over by the normal tool card once
// `tool_use` lands.
function LiveCodeBox({ name, raw }: { name: string; raw: string }) {
  const t = useT();
  const file =
    extractStreamingJsonString(raw, "file_path") ??
    extractStreamingJsonString(raw, "filePath") ??
    extractStreamingJsonString(raw, "path") ??
    "";
  const baseName = file ? file.split("/").pop() ?? file : "";
  const code =
    extractStreamingJsonString(raw, "content") ??
    extractStreamingJsonString(raw, "new_string") ??
    "";
  const isEdit = /edit/i.test(name);
  return (
    <StreamingCodeCard
      titleLabel={isEdit ? t("tool.edit") : t("tool.write")}
      metaLabel={baseName || undefined}
      code={code}
    />
  );
}

function ToolGroupCard({
  items,
  runStreaming,
  runSucceeded,
  projectFileNames,
  onRequestOpenFile,
}: {
  items: ToolItem[];
  runStreaming: boolean;
  runSucceeded: boolean;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // Snapshot-style tools (TodoWrite and friends) replace their whole state on
  // each call, so a turn that wrote the list several times would otherwise
  // render a stack of superseded cards. Collapse those retries to the latest
  // snapshot; every other tool passes through untouched.
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
      />
    );
  }

  const summary = summarizeGroup(items, t, runStreaming, runSucceeded);
  const running = runStreaming && items.some((it) => !it.result);
  const hasError = items.some((it) => it.result?.isError);
  return (
    <div className="action-card">
      <button
        type="button"
        className={`action-card-toggle ${running ? "running" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`action-card-status ${running ? 'op-status-running' : hasError ? 'op-status-error' : 'op-status-ok'}`} aria-hidden>
          {running
            ? <Icon name="spinner" size={14} />
            : hasError
            ? <Icon name="close" size={14} />
            : <Icon name="check" size={14} />
          }
        </span>
        <span className={`summary${running ? ' shimmer-text' : ''}`}>
          {summary.label}
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
  if (name === "WebFetch" || name === "web_fetch" || name === "webfetch") return "fetch";
  if (name === "WebSearch" || name === "web_search" || name === "websearch") return "search";
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
  | { kind: "live-tool"; id: string; name: string; raw: string }
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
function placeConversationTodoCard(
  blocks: Block[],
  options: { show: boolean; input: unknown | null },
): Block[] {
  let placed = false;
  return blocks.flatMap((block): Block[] => {
    if (block.kind !== "tool-group") return [block];
    if (!block.items.every((it) => isTodoWriteToolName(it.use.name))) return [block];
    if (!options.show || placed) return [];
    placed = true;
    const item = block.items[0];
    if (!item || options.input == null) return [block];
    return [{
      ...block,
      items: [{
        ...item,
        use: {
          ...item.use,
          input: options.input,
        },
      }],
    }];
  });
}

function stripEmptyThinkingBlocks(blocks: Block[]): Block[] {
  return blocks.filter((block) => {
    if (block.kind !== "thinking") return true;
    return block.text.trim().length > 0;
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
        ev.label === "running" ||
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
