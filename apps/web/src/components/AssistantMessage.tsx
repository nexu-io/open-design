import { Fragment, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCharReveal } from "./chat/useCharReveal";
import { ExecutionShell } from "./chat/ExecutionShell";
import { buildTurnBlocks } from "../runtime/chat/build-turn-blocks";
import { copyableTurnText } from "../runtime/chat/copyable-turn";
import type { ExecutionShell as ExecutionShellData } from "../runtime/chat/contract";
import { upstreamActivityAt } from "../runtime/chat/upstream-activity";
import type { RecordFileScope } from "../runtime/chat/record-file-open";
import { FileOpsSummary } from "./FileOpsSummary";
import { messageArtifactRefs } from "../runtime/chat/artifact-refs";
import {
  renderMarkdown,
  type MarkdownLinkClickHandler,
} from "../runtime/markdown";
import {
  asInProjectFilePath,
  isPathLikeChatHref,
  resolveChatFileLink,
} from "../runtime/in-project-link";
import { Button } from "@open-design/components";
import { navigate } from "../router";
import { deleteProjectFile, projectFileUrl, uploadProjectFiles } from "../providers/registry";
import { useProjectCollabContext } from "../collab/collab-context";
import { workspaceProjectHeaders } from "../collab/workspace-identity";
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
  trackQuestionsFormClick,
  trackQuestionsFormSurfaceView,
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
import { questionsFormTrackingId } from "@open-design/contracts/analytics";
import {
  hasUnterminatedQuestionForm,
  splitOnQuestionForms,
  stripTrailingOpenQuestionForm,
  type QuestionForm,
} from "../artifacts/question-form";
import {
  foldArtifactFocusSelections,
  eventsHaveAuthenticatedDoneConclusion,
  declaredArtifactCards,
  hasOdCard,
  narrowProducedFilesToFocus,
  pickPrimaryArtifacts,
  splitOnOdCards,
  stripArtifactFocusMarkers,
  stripCritiqueGrammar,
  stripTrailingOpenOdCard,
  todoStatusIsUnfinished,
  type ChatSessionMode,
  type OdCard,
  type OdCardBrandBrowserAssist,
  type RunContextSelection,
  type WorkspaceContextItem,
} from "@open-design/contracts";
import { OdCardView, type BrandBrowserAssistConfirm } from "./OdCard";
import {
  parseSubmittedAnswers,
  QuestionFormView,
  summarizeQuestionFormAnswers,
  type QuestionFormFileSubmission,
  type QuestionFormInteraction,
} from "./QuestionForm";
import type { VisualStyleContext } from "../runtime/visual-style-catalog";
import { splitStreamingArtifact, stripArtifact, stripRecoveredHtmlFallbackForDisplay } from "../artifacts/strip";
import { stripInternalControlMarkers } from "../artifacts/internal-markers";
import { BRAND_BROWSER_TAB_ID } from "../runtime/brand-browser-bridge";
import {
  getPluginFolderCandidates,
  type PluginFolderCandidate,
} from "./design-files/pluginFolders";
import type { PluginFolderAgentAction } from "./design-files/pluginFolderActions";
import { Icon, type IconName } from "./Icon";
import { UserActionCard } from "./UserActionCard";
import { NextStepActions, type NextStepActionsVariant } from "./NextStepActions";
import type { DesignToolboxActionId } from "../runtime/design-toolbox";
import { copyToClipboard } from "../lib/copy-to-clipboard";
import { useT } from "../i18n";
import { deriveFileOps, type FileOpEntry } from "../runtime/file-ops";
import { dedupeToolUsesById, dropSupersededInFlightToolUses } from "../runtime/tool-events";
import {
  continuableUnfinishedTodos,
  isTodoWriteToolName,
  type TodoItem,
} from "../runtime/todos";
import type { Dict } from "../i18n/types";
import { agentDisplayName, agentIconId, exactAgentDisplayName } from "../utils/agentLabels";
import { AgentIcon } from "./AgentIcon";
import { filterImplicitProducedFiles } from "../produced-files";
import type {
  AgentEvent,
  ChatAttachment,
  ChatMessage,
  ChatMessageFeedbackChange,
  ChatMessageFeedbackRating,
  ChatMessageFeedbackReasonCode,
  ProjectFile,
  ProjectMetadata,
  SkillSummary,
} from "../types";
import type { ProjectMediaTask } from '@open-design/contracts';

type TranslateFn = (
  key: keyof Dict,
  vars?: Record<string, string | number>
) => string;

// The host reports whether it accepted the answer into a real chat turn. A
// `false` result means a pre-run guard (for example the AMR balance gate)
// prevented the send, so the inline form must remain editable.
export type QuestionFormSubmitHandler = (
  text: string,
  attachments?: ChatAttachment[],
  context?: RunContextSelection,
  sourceAssistantMessageId?: string,
  formId?: string,
) => boolean | void | Promise<boolean | void>;

const viewedInlineQuestionForms = new Set<string>();
const QUESTION_FORM_DRAFT_STORAGE_PREFIX = "open-design:question-form-draft:";
const QUESTION_FORM_SUBMITTED_STORAGE_PREFIX =
  "open-design:question-form-submitted:";

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
  const { workspaceContext } = useProjectCollabContext();
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
      headers: {
        "Content-Type": "application/json",
        ...(workspaceContext ? workspaceProjectHeaders(workspaceContext) : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const message =
        data?.message ??
        (typeof data?.error === "string" ? data.error : data?.error?.message) ??
        resp.statusText;
      throw new Error(message || t('chat.pluginAction.failed'));
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
        setNotice({ message: t('chat.pluginAction.validationIssues') });
      } else if (draftPath) {
        const install = await post(
          `/api/projects/${encodeURIComponent(projectId)}/plugins/install-folder`,
          { path: draftPath },
        );
        if (install?.ok === false) {
          setNotice({ message: install?.message ?? t('chat.pluginAction.failed') });
        } else {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("open-design:plugins-changed"));
          }
          setNotice({ message: install?.message ?? t('chat.pluginAction.saved') });
        }
      } else {
        setNotice({ message: t('chat.pluginAction.saved') });
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
        message: t('chat.pluginAction.contributionStarted', {
          path: data?.path ?? t('chat.designToolbox.kind.plugin'),
        }),
      });
    } catch (err) {
      setNotice({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="plugin-action-candidate" data-testid={`skill-plugin-candidate-${block.candidateId}`}>
      <UserActionCard
        dataKind="plugin-suggestion"
        icon="puzzle"
        title={block.title}
        detailsLabel={t("brand.viewDetails")}
        actions={
          <button
            type="button"
            className="plugin-action-button"
            disabled={disabled}
            onClick={() => void share("contribute-open-design")}
          >
            <Icon name={busy === "contribute" ? "spinner" : "share"} size={13} />
            <span>{busy === "contribute" ? t("pluginCard.starting") : t("skillPluginCandidate.contributeToMain")}</span>
          </button>
        }
        details={
          <div className="plugin-action-candidate__details">
            <p className="plugin-action-card__description">{description}</p>
            <button
              type="button"
              className="plugin-action-button"
              disabled={disabled}
              onClick={() => void createDraft()}
            >
              <Icon name={busy === "draft" ? "spinner" : "plus"} size={13} />
              <span>{busy === "draft" ? t("pluginCard.creating") : t("skillPluginCandidate.createForMe")}</span>
            </button>
          </div>
        }
        status={notice ? (
          <span role="status">
            <ActionNoticeView notice={notice} />
          </span>
        ) : null}
      />
    </div>
  );
}

interface Props {
  message: ChatMessage;
  streaming: boolean;
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
  mediaTasks?: ProjectMediaTask[];
  onRequestOpenFile?: (name: string) => void;
  /**
   * 生图失败格的「重试」。这一层不知道怎么重发,只把「第几张砸了」交给 ChatPane ——
   * 由它组一句话走正常发送路径(规格 D59)。
   */
  onRetryImage?: (row: { total: number; done: number; failed: number }, index: number) => void;
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
  // Click handler for the post-completion "Share to OpenDesign" submission
  // action. ProjectView wires this to handleSend with the bundled
  // `od-share-to-community` trigger prompt.
  onShareToOpenDesign?: () => void;
  shareToOpenDesignBusy?: boolean;
  // Consecutive messages from the same assistant share one identity header.
  // ChatPane sets this false after the first item in a contiguous run.
  showRole?: boolean;
  // True only for the most recent assistant message.
  isLast?: boolean;
  // Assistant message id whose run-failure error is rendered as ChatPane's
  // top-level error card; that message's per-message error pill is suppressed
  // to avoid duplication. Other messages keep their error pill.
  errorCardOwnerId?: string | null;
  // The user message that immediately follows this assistant turn, if any.
  // Structured form replies are parsed back into the inline answered summary.
  nextUserContent?: string;
  onSubmitQuestionForm?: QuestionFormSubmitHandler;
  questionFormSubmitDisabled?: boolean;
  /**
   * 更早轮次已经出现过的那份清单(ChatPane 用 `previousTodosByAssistantMessageId` 算)。
   *
   * 它**只做认领**:本轮清单里出现同一条内容时标成召回(划线)。agent 没重发,
   * `previous` 根本不会被查到 —— 这一轮天然一条都不显示,不需要额外规则。
   */
  previousTodos?: TodoItem[];
  onContinueRemainingTasks?: (todos: TodoItem[]) => void;
  onForkFromMessage?: () => void;
  forking?: boolean;
  onFeedback?: (change: ChatMessageFeedbackChange) => void;
  suppressDirectionForms?: boolean;
  hasDesignSystemContext?: boolean;
  // "Next step" affordance handlers, surfaced under the latest settled
  // assistant message. Omitting them hides the affordance entirely (e.g. in
  // tests that don't wire chat send).
  /**
   * 发布这份产物 —— 打开文件并展开预览区**本来那块**分享菜单。
   *
   * `anchorId` **只有产物卡的那枚胶囊会传**:菜单不再开在预览区右上角,而是
   * 开在这枚按钮旁边(产品 2026-08-27)。不带 `anchorId` 的调用(「下一步引导」
   * 那行〔分享〕)照旧开在预览区自己的工具栏下面。
   */
  onArtifactShare?: (fileName: string, anchorId?: string) => void;
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
  /**
   * Send one of this turn's agent-written follow-up suggestions as the user's
   * next message. The suggestion text IS the message — no composer draft, no
   * menu — which is why the rows carry no trailing chevron.
   */
  onNextStepSuggestion?: (text: string) => void;
  /**
   * 导出这份产物 —— 打开文件并展开预览区**本来那块**导出菜单。
   *
   * `anchorId` 的作用同 `onArtifactShare`:产物卡传它,菜单就开在卡上那枚按钮
   * 旁边;「下一步引导」那行〔下载〕不传,菜单开在预览区工具栏下面。
   *
   * 单格式产物(md / 图片 / 视频 / 其它)压根不调这个回调 —— 卡上那枚就是
   * 一条 `<a download>`,见 `runtime/chat/artifact-export.ts`。
   */
  onArtifactDownload?: (fileName: string, anchorId?: string) => void;
  nextStepSkills?: SkillSummary[];
  nextStepVariant?: NextStepActionsVariant;
}

// Props compared by reference to decide whether a memoized AssistantMessage can
// skip re-rendering. The interaction callbacks (onForkFromMessage, onFeedback,
// and next-step actions) are DELIBERATELY
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
  'projectId',
  'projectKind',
  'conversationId',
  'projectFiles',
  'projectMetadata',
  'projectFileNames',
  'projectResolvedDir',
  'mediaTasks',
  'onRequestOpenFile',
  'onRequestPluginFolderAgentAction',
  'activePluginActionPaths',
  'hiddenPluginActionPaths',
  'showRole',
  'isLast',
  'errorCardOwnerId',
  'nextUserContent',
  'questionFormSubmitDisabled',
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
  // refreshes the More → Design toolbox flyout's global resources.
  'nextStepSkills',
  'nextStepVariant',
  // `previousTodos` is deliberately ABSENT. It is derived from the messages
  // BEFORE this one, so ChatPane re-derives it (new array identity) on every
  // streamed frame while its content stays fixed — comparing it would re-render
  // all N messages per token. A settled earlier turn cannot change its task list
  // without the whole message array being replaced, which moves `message`
  // identity and re-renders this row anyway.
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
/**
 * 壳头那颗秒表的两个读数,每秒一起取一次,只在 `active` 期间走。
 *
 *  · `nowMs` —— 「现在」。不这么推的话 React 不会因为墙上时间变了就重渲染,
 *    秒表会冻在最后一次事件那一刻,页面上看着像卡死。
 *  · `lastEventAtMs` —— 上游最近一帧是什么时候到的(S12 的静默起点)。
 *
 * **两个读数必须同一刻取。** 分成两个 hook 就是两个 interval、两次 setState,
 * 而且它们取的「现在」差着毫秒,静默 = now − last 会莫名多出个负数或零头。
 *
 * **为什么从 `upstreamActivityAt` 取,而不是数事件条数。**
 * 上一版这里写的是 `useMemo(() => Date.now(), [displayEvents.length])` ——
 * 想法没错(到达时刻比事件自带的时刻诚实),但那把钥匙在流式期间根本不动:
 * `tool_input_delta` 不进事件数组、claude 的空 `thinking_delta` 被挡在门外、
 * 连续文字被合进最后一条。真机 run `7ed15c2f` 的 161.6 秒窗口里落了 126 条帧,
 * 而 `displayEvents.length` 一次都没变,于是壳头照报「已等 156 秒」。
 * 传输层那张表记的是帧到达,与事件加工无关,也与 agent 填不填时刻无关。
 *
 * 取不到(没有 runId、或这条 run 一帧都还没来过)就返回 undefined,
 * 让 `buildTurnBlocks` 退回轮次开头 —— 「卡在首个 token」那一档要的正是这个。
 */
interface StreamClock {
  nowMs?: number | undefined;
  lastEventAtMs?: number | undefined;
}

function useTickingNow(active: boolean, runId?: string): StreamClock {
  const [tick, setTick] = useState<StreamClock>({});
  useEffect(() => {
    if (!active) {
      setTick({});
      return;
    }
    const sample = (): void => {
      setTick({ nowMs: Date.now(), lastEventAtMs: upstreamActivityAt(runId) ?? undefined });
    };
    sample();
    const id = setInterval(sample, 1000);
    return () => { clearInterval(id); };
  }, [active, runId]);
  return tick;
}

function AssistantMessageImpl({
  message,
  streaming,
  projectId = null,
  projectKind = null,
  conversationId = null,
  projectFiles = [],
  projectMetadata,
  projectFileNames,
  projectResolvedDir,
  mediaTasks = [],
  onRequestOpenFile,
  onRetryImage,
  onBrandBrowserAssistConfirm,
  onRequestPluginFolderAgentAction,
  activePluginActionPaths = new Set(),
  hiddenPluginActionPaths = new Set(),
  onShareToOpenDesign,
  shareToOpenDesignBusy = false,
  showRole = true,
  isLast,
  errorCardOwnerId = null,
  nextUserContent,
  onSubmitQuestionForm,
  questionFormSubmitDisabled = false,
  previousTodos,
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
  onNextStepSuggestion,
  onArtifactDownload,
  nextStepSkills,
  nextStepVariant = 'default',
}: Props) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  const imageSrc = useCallback(
    (path: string) => projectId ? projectFileUrl(projectId, path, workspaceContext) : path,
    [projectId, workspaceContext],
  );
  // A blocked strategy task is a sticky terminal verdict: the daemon rejects
  // every further continuation with 409 STRATEGY_TASK_STATE_MISMATCH, so the
  // turn's question forms must stop accepting submissions and explain why.
  // Prefer the gate's persisted agent-visible text; fall back to the generic
  // localized notice.
  const strategyBlockedNotice =
    message.strategyTaskBlocked === true
      ? message.strategyTaskBlockedText?.trim() || t("questions.strategyBlockedNotice")
      : null;
  // NOTE(sync/main): origin/main also declares a `thinkingLinkClick` memo here
  // and hands it to its own `ThinkingBlock`. This branch moved thinking into the
  // execution shell (`components/chat/ExecutionShell.tsx`), which builds its own
  // link handler, so that memo has no consumer left and is deliberately dropped
  // rather than carried as an unused binding.
  const events =
    (message.events?.length ?? 0) > 0
      ? message.events!
      : message.content.trim()
        ? ([{ kind: "text", text: message.content }] satisfies AgentEvent[])
        : [];
  const displayEvents = useMemo(
    () => dedupeToolUsesById(dropSupersededInFlightToolUses(events)),
    [events],
  );
  const completedWithAuthenticatedDone = useMemo(
    () =>
      message.runStatus === "succeeded" &&
      eventsHaveAuthenticatedDoneConclusion(displayEvents),
    [displayEvents, message.runStatus],
  );
  /**
   * **这一轮的 done 标记到了没有** —— 和上面那个同一条判据,只是**不问 run 结没结束**。
   *
   * 产品 2026-09-04:「输出 done 标记之后,上面的进行中展开收起卡片,就应该自动收起,
   * 而不是等到整个对话 run 完了再收起」。所以这里要的正是「标记到了、run 还在跑」
   * 那一帧,`runStatus` 不参与。
   *
   * 判据借的是共享契约那一份(`eventsHaveAuthenticatedDoneConclusion`):要有 `done_key`、
   * 要有对得上的标记、标记后面要真的开始有结论。**不在这一层另写一份正则** ——
   * 标记的形状是 daemon / web 共用的契约,两边各留一份迟早会分歧,而分歧的表现形式
   * 就是协议标签出现在用户屏幕上(`api/done-marker` 的注释里记着这条)。
   *
   * ⚠️ 认的**只有真标记**。`buildTurnBlocks` 内部还有一档「隐式 done」——
   * `<question-form>` / `<artifact>` 一出现就当结论开始;那是**分块**用的判据,
   * 不是产品这次说的「done 标记」。拿它一起收会在模型刚要发问、活还没干完的时候
   * 把执行记录藏起来(`stream-cursor-removed.test.tsx` 那一格正是这个形状),
   * 边界钉在 `shell-collapse-on-done.test.tsx`。
   */
  const turnDoneMarkerLanded = useMemo(
    () => eventsHaveAuthenticatedDoneConclusion(displayEvents),
    [displayEvents],
  );
  // ChatPane owns one canonical conversation-level Todo card above the
  // composer. Strip TodoWrite snapshots from individual messages so plans do
  // not appear twice or jump around as history is virtualized.
  const blocks = useMemo(() => {
    return stripTodoToolGroups(
      stripEmptyThinkingBlocks(suppressDuplicateQuestionForms(buildBlocks(displayEvents))),
    );
  }, [displayEvents]);
  /**
   * 这一轮对执行记录来说算什么状态。
   *
   * 三条都不是 `message.runStatus` 自己说得清的:
   *  · **还在流** → 一定是 running,不管落库里写的是什么;
   *  · **不流了但没有 runStatus** → 历史/遗留消息。它已经结束了,只是没人给它盖过章。
   *    当成 running 的话壳永远转下去,而且 D43 的兜底(结论提到壳外)不会触发 ——
   *    整段回答会被关在壳里,`<od-card>` 这类交互块跟着一起消失。
   *  · **产物没送达**(`no_result` / `delivery_failed`)→ 用户视角就是这一轮失败了,
   *    与老链路的 `runFailed` 判据保持一致;失败原因交给下面的报错卡(B18)。
   *
   * 还有一条只对没有 runStatus 的历史消息生效,见 `legacyTurnFailed`。
   */
  let turnRunStatus: NonNullable<ChatMessage['runStatus']>;
  if (streaming) {
    turnRunStatus = 'running';
  } else if (message.runStatus === 'canceled') {
    turnRunStatus = 'canceled';
  } else if (
    message.resultDeliveryState === 'no_result' ||
    message.resultDeliveryState === 'delivery_failed' ||
    (!message.runStatus && legacyTurnFailed(displayEvents, message.endedAt))
  ) {
    turnRunStatus = 'failed';
  } else {
    turnRunStatus = message.runStatus ?? 'succeeded';
  }
  /**
   * 这一轮的执行记录(规格 `chat-panel-next.md`)。
   *
   * 壳内装过程(thinking / 工具行 / done 之前的叙述),壳外只留结论 —— 归属规则全在
   * `buildTurnBlocks` 里,这里不做任何判断。
   */
  /** 壳头那颗秒表的「现在」+ S12 的静默起点,每秒同刻取一次(见 `useTickingNow`)。 */
  const { nowMs, lastEventAtMs } = useTickingNow(streaming, message.runId);

  /**
   * 执行记录里的文件名要判归属才决定做不做链接(产品 2026-08-27:
   * 「这些文件不要变成可点击的.. 因为读的不一定是我们项目文件夹下的文件....」)。
   * 这三样就是正文 markdown 链接判归属用的同一套(见 `chatFileLinkClickHandler`),
   * 判据本身在 `runtime/chat/record-file-open.ts`,这里只负责递过去。
   */
  const recordFileScope = useMemo<RecordFileScope>(
    () => ({ projectId, projectFileNames, projectResolvedDir }),
    [projectId, projectFileNames, projectResolvedDir],
  );
  const nextTurn = useMemo(() => {
    const turn = buildTurnBlocks({
      events: displayEvents,
      ...(mediaTasks.length ? { mediaTasks } : {}),
      runStatus: turnRunStatus,
      // 只在本轮清单里出现过的条目上取值(`build-turn-blocks` 的 `previous.has`),
      // 所以 agent 不重发时它是纯空转,不会凭空造出任何一行。
      ...(previousTodos?.length ? { previousTodos } : {}),
      ...(nowMs != null ? { nowMs } : {}),
      // 「一件事都还没发生」那一格(S12)靠它算静默时长;它同时也是壳头耗时的
      // 兜底起点 —— 不发工具事件的那批 agent(plain-stream / qoder)整轮没有一个
      // 带时刻的事件,没有这一对起止,壳头就只有一句光秃秃的「已完成」。
      ...(message.createdAt != null ? { startedAtMs: message.createdAt } : {}),
      ...(message.endedAt != null ? { endedAtMs: message.endedAt } : {}),
      // 取不到就**不传** —— 让 `shellQuiet` 退回轮次开头,而不是拿一个假的
      // 「刚刚」把 S12 悄悄关掉(「卡在首个 token」那一档每月 5,547 次)。
      ...(streaming && lastEventAtMs != null ? { lastEventAtMs } : {}),
    });
    return {
      /**
       * **原样的块序** —— 壳和结论段按它们在流里发生的先后交替排列。
       *
       * 一轮跑一张壳时它只有两项,看不出所以然;跨轮折叠(`foldStrategyTaskTurns`)
       * 之后就不是了:「先问后做」的会话是两个 run 接成一条事件流,run 0 末尾那张
       * `<question-form>` 是**夹在两张壳中间**的结论段。下面两个数组按 kind 一分,
       * 这个先后就没了 —— 谁在前谁在后必须由这一条来还原(OPEND-2592)。
       */
      blocks: turn,
      shells: turn.filter((b): b is ExecutionShellData => b.kind === 'shell'),
      /** 壳【外】的结论(D43)—— done 之后的那几段 */
      prose: turn.filter((b) => b.kind === 'prose').map((b) => (b as { text: string }).text),
    };
    // `message.endedAt` 从 undefined 变成时刻**就在轮次终止那一刻** —— 不进依赖的话
    // 兜底耗时会停在「还没有终点」的那一版,壳头刚收起时秒数是空的。
  }, [displayEvents, turnRunStatus, nowMs, previousTodos, message.endedAt, streaming, lastEventAtMs, mediaTasks]);
  /**
   * 执行记录里**真的有东西**。
   *
   * 壳本身是永远出现的(D10),所以「有没有壳」问不出这个 —— 要问壳里有没有内容。
   * 两处消费方靠它,语义都是老链路 `taskActivity !== null` 的那一条:
   *  · 页脚的「准备中 → 进行中」翻面判据(有内容了就不再是准备中);
   *  · 回合状态行的去重(有执行记录时状态在壳头上,页脚不再重复一遍)。
   *    稿子要两处都显示,但那是待决项 T19,产品没拍 —— 这里保持现状。
   */
  const recordHasContent = nextTurn.shells.some(
    (shell) => shell.items.length > 0 || shell.segments.length > 0,
  );
  /**
   * 壳外要渲染的块。
   *
   * 执行记录已经拥有 thinking、工具调用与 done 之前的过程叙述,这三种块不能再出现在壳外
   * (出现就是同一件事画两遍)。剩下的 —— 问答表单、`<od-card>`、产物面板、插件候选、
   * 状态行 —— 原样留在这一层,因为它们挂着交互,不属于执行记录。
   *
   * 正文只有一个来源:`buildTurnBlocks` 算出来的结论段。它必须走**和消息层同一条加工链**
   * (去重表单 / 丢空 thinking / 剥 TodoWrite 快照),直接把字符串塞进去会绕过去重,
   * 同一张表单会渲染两次(`next-record-integration.test.tsx` 钉住了这一点)。
   */
  /**
   * 结论段**按它在流里的位置分组**,一组一个落点(OPEND-2592)。
   *
   * 原来这里把所有结论段 `join('\n\n')` 成一段再加工,于是「第几段」这件事被抹平,
   * 渲染时只能整坨压在所有壳的后面。跨轮折叠之后这就是错的:用户在两个 run **中间**
   * 答的表单,收口(「已确认」)会被甩到最底下 —— 用户 2026-09-02 的原话是
   * 「如果是我中间时回答的,那就得放中间呢,不能放最底下」。
   *
   * 加工链一个字没换,只是拆成两半跑,好让分组边界活到渲染:
   *  · 两道 strip 是**逐块的过滤**,按组各跑一遍与拍平跑一遍等价;
   *  · 表单去重是**整轮**的 first-wins(第一张留下、后面同 id 的清掉),必须跨组共享
   *    那本账,所以拍平之后跑;它是逐块 `map`、长度不变,再按各组块数切回来就是原样。
   */
  const proseGroups = useMemo(() => {
    const cleaned = nextTurn.prose.map((text) =>
      text.trim()
        ? stripTodoToolGroups(stripEmptyThinkingBlocks(buildBlocks([{ kind: 'text', text }])))
        : [],
    );
    const flat = suppressDuplicateQuestionForms(cleaned.flat());
    const groups: Block[][] = [];
    let at = 0;
    for (const group of cleaned) {
      groups.push(flat.slice(at, at + group.length));
      at += group.length;
    }
    return groups;
  }, [nextTurn]);
  /** 不属于执行记录、也不属于结论的那些块 —— 状态行 / 插件候选,统一收在最后 */
  const restBlocks = useMemo(
    () => blocks.filter((b) => b.kind !== 'text' && b.kind !== 'thinking' && b.kind !== 'tool-group'),
    [blocks],
  );
  const outerBlocks = useMemo(
    () => [...proseGroups.flat(), ...restBlocks],
    [proseGroups, restBlocks],
  );
  /**
   * 屏幕上从上到下的编排:壳与结论段交替,顺序就是 `buildTurnBlocks` 算出来的那一版。
   *
   * ⚠️ 别再改回「先把壳全画完、再画结论」。一轮一壳时两种写法看不出差别,
   * 跨轮折叠时后者会把中途的表单收口踢到最底下(`cross-run-form-placement.test.tsx`)。
   */
  const turnFlow = useMemo(() => {
    let proseAt = 0;
    /**
     * 这张壳后面**已经有结论段**了没有 —— 也就是这一轮的 done 标记到没到。
     *
     * 产品 2026-09-04:「输出 done 标记之后,上面的进行中展开收起卡片,就应该自动收起,
     * 而不是等到整个对话 run 完了再收起」。`buildTurnBlocks` 里那只 `doneSeen` 闩没有
     * 出口(壳的契约里没有这个字段),而它的**可观察后果**恰好就在块序上:done 一判定,
     * 后面的正文就不再进壳,而是成为壳外的 `ProseBlock`(D43)。所以「后面有结论段」
     * 等价于「这张壳的 done 已经来了」。
     *
     * 两个信号必须同时成立:
     *  · `turnDoneMarkerLanded` —— 这一轮真的发过 done 标记(共享契约那一份判据,
     *    **不认**隐式 done,理由见它自己的注释);
     *  · 这张壳后面已经有结论段 —— 把轮次级的事实收到**这一张壳**上。
     *
     * ⚠️ 已知边界两条,都不是回归(改动前一律等 run 结束才收):
     *  · agent 发完 done 就闭嘴、一个字的结论都没有时,这里推不出来;
     *  · 跨轮折叠(`foldStrategyTaskTurns`)把几个物理 run 接成一条流时,前一个 run
     *    的标记会让后一个 run 的壳也满足轮次级那半条 —— 但后一个 run 的壳后面此刻
     *    没有结论段,所以仍然收不起来,只有它自己也开始写结论时才收。
     * 要收得再准一步,得让 `buildTurnBlocks` 把它那只 `doneSeen` 挂到壳上;
     * 那个文件另有改动在飞,先不动。
     */
    const concludedAt = new Set<number>();
    let sawProse = false;
    for (let i = nextTurn.blocks.length - 1; i >= 0; i -= 1) {
      const b = nextTurn.blocks[i]!;
      if (b.kind === 'shell') {
        if (turnDoneMarkerLanded && sawProse) concludedAt.add(i);
      } else if (b.text.trim()) {
        sawProse = true;
      }
    }
    return nextTurn.blocks.map((b, i) =>
      b.kind === 'shell'
        ? ({ kind: 'shell', key: b.id, shell: b, concluded: concludedAt.has(i) } as const)
        // key 认**第几段结论**,不认它在块序里的下标:空壳在轮次收尾那一刻会被丢掉
        // (`build-turn-blocks` 的 `kept`),下标会跟着挪,而挪一次就是把表单重挂一遍
        // —— 用户填了一半的草稿会当场清空。
        : ({ kind: 'prose', key: `prose-${proseAt}`, at: proseAt++ } as const),
    );
  }, [nextTurn, turnDoneMarkerLanded]);

  /*
   * 把项目上下文递进去,`FileOpEntry.path` 才能是**项目相对路径** —— 产物卡、
   * 结果行、封面地址、导出 / 分享全都拿它当项目文件的钥匙(不变式写在
   * `runtime/file-ops.ts` 的 `FileOpEntry.path` 上)。少了 `resolvedDir`,
   * agent 给的绝对路径只能退回基名,住在子目录里的产物就点不开、封面也画不出来。
   */
  const fileOpScope = useMemo(
    () => ({ projectId, resolvedDir: projectResolvedDir }),
    [projectId, projectResolvedDir],
  );
  const fileOps = useMemo(
    () => deriveFileOps(displayEvents, fileOpScope),
    [displayEvents, fileOpScope],
  );
  const rawProduced = message.producedFiles ?? [];
  /**
   * 这一轮 agent 自己声明的「显示什么」—— `<od-focus …/>` 的 `show`。
   *
   * daemon 已经校过 key、折过路径、剥过正文,这里拿到的只有结论。一轮可以发
   * 好几枚(`open` 早发、`show` 晚发),所以**按字段**取最后一个,而不是按事件
   * 整条覆盖 —— 否则晚到的 `show` 会把早到的 `open` 抹掉。
   *
   * 没有这个事件时 `show` 是 undefined。交付清单(`displayedProduced`,喂 Share /
   * Download / 下一步锚点)退化成恒等;产物卡只保留 daemon 已经归属给本轮的
   * `producedFiles`,不会把正文猜测或裸工具行兜底成卡。这样旧会话 / 漏发协议标记
   * 的模型不会把权威产物丢掉,又不会让「正文提到一个旧文件」重新冒出产物卡。
   */
  const artifactFocus = useMemo(() => {
    const selections: { open?: string; show?: string[] }[] = [];
    for (const event of message.events ?? []) {
      if (event?.kind !== 'artifact_focus') continue;
      selections.push({
        ...(event.open ? { open: event.open } : {}),
        ...(event.show && event.show.length > 0 ? { show: event.show } : {}),
      });
    }
    return foldArtifactFocusSelections(selections);
  }, [message.events]);
  /*
   * `produced` 保持原样 —— 它是 daemon 结算出的**权威清单**,语义不能动。
   *
   * 收窄发生在两个**消费点**,不是在这里:结果面板有两条互斥的输入路 ——
   * 有写 / 改工具记录时用 `summaryArtifactOps`,没有时用 `declaredArtifactFiles`
   * (见下面 `turnArtifactPanelEntries` 的三分支)。两条各收窄一次,各有各的
   * 测试和各自的 ablation;在这里收窄会让其中一条被收两遍,那条的测试就永远
   * 红不了。
   *
   * 注:这两条路原来分别渲染成 `FileOpsSummary` 和 `ProducedFiles` 两个组件,
   * 后者已被产物卡片对齐那一轮删掉、两条汇进同一个 `FileOpsSummary`。
   * **路还是两条、收窄仍是各一次**,只是终点合并了 —— 这句留着,免得下一个人
   * 看到「一个组件」就以为可以把两次收窄合并成一次。
   */
  const produced = rawProduced;
  const displayedProduced = useMemo(
    () => {
      const linkedFiles = recoverLinkedProjectFilesFromContent({
        content: message.content,
        projectFiles,
        projectId,
        message,
        turnTouchedFiles: turnTouchedAnyFile(produced, fileOps),
      });
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
      /*
       * 收窄放在**合并之后**,不是合并之前。
       *
       * `baseFiles` 有两个来源(daemon 结算的清单 / 本地推断),`linkedFiles`
       * 是从正文里捞回来的第三个来源。三条都能往下游塞东西,所以只有在它们汇成
       * 一条之后收窄,才是唯一出口 —— 收在任何一条支流上,另外两条都会绕过去。
       *
       * 这里用的是 `narrowProducedFilesToFocus`(没声明就原样保留),不是
       * `declaredArtifactCards`(没声明就清空):这条值喂的是 Share / Download /
       * 下一步锚点和插件目录扫描,它们在没声明的回合里必须还有目标。产物卡那条
       * 相反的规则挂在 `declaredArtifactFiles` 上。
       */
      const merged = mergeProjectFiles(baseFiles, linkedFiles);
      const narrowed = narrowProducedFilesToFocus(merged, artifactFocus.show);
      return narrowed === merged ? merged : [...narrowed];
    },
    [artifactFocus.show, blocks, fileOps, message, produced, projectFiles, projectId, streaming],
  );
  /**
   * 这一轮**对话里列出来**的产物。
   *
   * 产品拍的板(逐字):「一张都不显示那就不显示呗, 如果有重要的新创建的没给用户
   * 展示那是问题, 但如果没什么重要的或者要让用户看的, 那就不展示呗没啥问题吧?」
   *
   * 有 `show` 时按 agent 声明收窄 `displayedProduced`;没有时只接受 daemon 的
   * `producedFiles`。关键是后半条不能写成 `displayedProduced` 的无条件 fallback:
   * 它还混着正文链接 / mtime 推断,曾把上一轮旧文件误认成本轮产物。OPEND-2515
   * 的反例正相反:daemon 已经给出权威产物,却因为模型没发 `show` 在这里被清空。
  */
  const declaredArtifactFiles = useMemo(
    () => artifactFocus.show
      ? [...declaredArtifactCards(displayedProduced, artifactFocus.show)]
      : [...produced],
    [artifactFocus.show, displayedProduced, produced],
  );
  const turnFileOps = useMemo(
    () => mergeProducedFilesIntoFileOps(fileOps, displayedProduced),
    [displayedProduced, fileOps],
  );
  // The result section must contain artifacts, not inputs the agent merely
  // inspected. Read/delete history remains available in the execution record.
  const turnArtifactOps = useMemo(
    () => turnFileOps.filter((entry) => entry.ops.includes('write') || entry.ops.includes('edit')),
    [turnFileOps],
  );
  // Same artifacts-not-inputs rule, applied to the #5517 summary source. Once
  // the daemon has attached an authoritative produced-file list, the result
  // card must describe that delivered set rather than every attempted tool
  // path. Failed attempts remain visible in the execution disclosure.
  // 第二个收窄点:汇总行。它读的是权威清单,所以收窄要在这里做一次 —— 否则
  // 卡片精简了、汇总行还写着 6 个文件,同一块面板自己跟自己不一致。
  const summaryArtifactOps = useMemo(
    () => summaryArtifactOpsForProducedFiles(
      fileOps,
      message.producedFiles === undefined
        ? undefined
        : artifactFocus.show
          ? [...declaredArtifactCards(message.producedFiles, artifactFocus.show)]
          : message.producedFiles,
      artifactFocus.show,
    ),
    [artifactFocus.show, fileOps, message.producedFiles],
  );
  /**
   * 这一轮的产物面板喂什么 —— **一条消息只算一次**,交给唯一那个组件。
   *
   * 两条来源仍在,但它们现在只是同一个面板的两种输入:
   *  1. 这一轮真有 write/edit 工具行 → 用那份清单(它已经按 daemon 的
   *     `producedFiles` 对齐过,见 `summaryArtifactOpsForProducedFiles`);
   *  2. 没有工具行 → 用产出 / 从正文里找回来的文件,翻成同一种记录形状。
   *
   * 第 2 条要求 `!streaming`:流式过程中「产出」还没定,`displayedProduced` 里
   * 的东西会一边跳一边变形(这是原来 `ProducedFiles` 那道 `!streaming` 闸的
   * 用意,原样保留)。第 1 条不受这道闸约束 —— 工具行本身带 `pending` 态,
   * 边跑边出卡是设计要的(D37)。
   */
  const turnArtifactPanelEntries = useMemo(() => {
    /*
     * 两条支各自已经在消费点做过同一套边界处理
     * (`summaryArtifactOps` / `declaredArtifactFiles`):有 `show` 就按声明收窄,
     * 没有 `show` 就只保留 daemon 权威归属的 `producedFiles`。所以这里不能再回到
     * raw fileOps / `displayedProduced` —— 后两者还混着裸工具行与正文 / mtime 推断。
     */
    if (summaryArtifactOps.length > 0) return summaryArtifactOps;
    if (streaming) return [];
    return producedFilesAsFileOps(declaredArtifactFiles);
  }, [declaredArtifactFiles, streaming, summaryArtifactOps]);
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
              ? { message: t('chat.pluginAction.saved') }
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
    [pluginBusyKey, onRequestPluginFolderAgentAction, t],
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
  // A settled `completed` strategy verdict outranks a stale TodoWrite snapshot:
  // the deliverable was verified on disk, so the footer must not report the
  // turn as stopped with unfinished work (and must not withhold next steps).
  const unfinishedTodos = streaming || completedWithAuthenticatedDone
    ? []
    : continuableUnfinishedTodos({
        events,
        // The rendered text, so "did this turn ask?" is answered from the same
        // source `hasPendingQuestionForm` reads.
        content: message.content,
        runStatus: message.runStatus,
        strategyTaskDelivered: message.strategyTaskDelivered,
      });
  const hasTodoSnapshot = events.some(
    (event) => event.kind === "tool_use" && isTodoWriteToolName(event.name),
  );
  /*
   * 〔继续剩余任务〕这一次要送回去的是哪几条。
   *
   * 这是 **agent 不照做时唯一的用户出口**,所以它不能只认「本轮自己发过清单」——
   * 上一轮留了活、这一轮 agent 判断跟用户新问题无关而没重发,恰恰是最需要这个出口
   * 的那一刻,而那时本轮的 `unfinishedTodos` 是空的。
   *
   * 取值顺序因此是:本轮发过清单就以本轮为准(它是最新事实,可能已经把旧账做掉了);
   * 本轮没发清单才回落到带过来的那份。它不依赖任何 agent 能力 —— 21 家从不发清单的
   * runtime 走的就是第二条路。
   */
  const continuableTodos = streaming || completedWithAuthenticatedDone
    ? []
    : hasTodoSnapshot
      ? unfinishedTodos
      : (previousTodos ?? []).filter((todo) => todoStatusIsUnfinished(todo.status));
  const runSucceeded =
    !streaming &&
    !hasResultDeliveryFailure &&
    (
      message.runStatus === "succeeded" ||
      (!message.runStatus && !!message.endedAt) ||
      isBrandBrowserAssistMessage
    );
  const canFork = !streaming && !!onForkFromMessage;
  /*
   * 复制按钮的判据。正文优先,正文空了退回推理原文 —— 判据本身与理由在
   * `runtime/chat/copyable-turn.ts`。中止的那一轮常常只剩一格「思考过程」,
   * 那也是内容(用户 2026-08-27:「thought 也算能复制的吧?」)。
   */
  const copyMarkdown = copyableTurnText(message.content, nextTurn.shells);
  const showFeedback =
    !!onFeedback &&
    isFeedbackEligible({
      streaming,
      message,
      hasEmptyResponse,
      hasUnfinishedTodos: unfinishedTodos.length > 0,
    });
  /*
   * OPEND-2542 supersedes the 2026-08-26 "last turn only" decision. Every
   * settled reply keeps this row rendered: the latest row is always visible,
   * while historical rows are revealed by message hover/focus in CSS. Keeping
   * the same DOM footprint prevents the transcript from jumping on reveal.
   *
   * Running turns remain excluded: the execution shell already reports their
   * state and this footer would duplicate it (`chat-panel-feedback.md` B50).
   */
  const showCompletionRow =
    !streaming &&
    (showFeedback ||
    !!message.startedAt ||
    !!message.endedAt ||
    !!usage ||
    unfinishedTodos.length > 0 ||
    // 只剩「还欠着上一轮的活」这一条理由时,这一行也得出 —— 出口挂在它上面
    continuableTodos.length > 0 ||
    hasEmptyResponse ||
    !!copyMarkdown ||
    canFork);
  // Continuing unfinished work is current-turn state, unlike copy/feedback/
  // fork. Restoring historical action rows must not revive stale todo work.
  const continueRemaining =
    isLast && onContinueRemainingTasks && continuableTodos.length > 0
      ? () => onContinueRemainingTasks(continuableTodos)
      : undefined;
  const canShowOpenDesignSubmission = !!onShareToOpenDesign && showFeedback && runSucceeded;
  const showOpenDesignSubmission =
    canShowOpenDesignSubmission && (!!isLast || shareToOpenDesignBusy);
  const effectiveNextStepVariant: NextStepActionsVariant =
    nextStepVariant === 'brand-extraction' && (!runSucceeded || !nextStepArtifactName)
      ? 'brand-programmatic-incomplete'
      : nextStepVariant;
  /*
   * 这一轮的三条行为引导。
   *
   * 来源是 daemon 解析 `<od-next key="…">` 之后下发并落库的 `next_steps` 事件 ——
   * **不是**正文里的标记:客户端从来看不到标记本身,所以它不可能漏进正文、
   * 也不会被复制/导出带走。
   *
   * 取**最后一条**:一轮里理应只有一条,但重试会在同一条消息上再来一轮,
   * 那时新的一条才是当前这一轮的。
   *
   * 旧会话没有这个事件 —— 于是这里是空数组,下一步引导整块不出。这是产品
   * 明确要的兼容口径:不退回工具箱、不出空壳。
   */
  const nextStepSuggestions = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (event?.kind !== 'next_steps') continue;
      const list = Array.isArray(event.suggestions) ? event.suggestions : [];
      const cleaned = list
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean);
      if (cleaned.length > 0) return cleaned;
    }
    return [];
  }, [events]);
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
            /*
             * `default` 这一档已经不是工具箱目录了 —— 它**只**渲染 agent 现写
             * 的三条建议。没有建议(旧会话、模型这轮没给、给的一条都用不了)
             * 就没有这一块,不再靠「有工具箱回调」把一张空目录顶上来。
             */
            : nextStepSuggestions.length > 0 && !!onNextStepSuggestion;
  // A clarification turn terminates its run while the emitted <question-form>
  // is still waiting for the user inline. Until the immediate
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
  // "Next step" is a delivery affordance, not a generic terminal-state card.
  // Keep it out of pure Q&A, failures/cancellations and incomplete Todo turns;
  // only a successful turn that actually produced something may surface it.
  const hasTurnDeliverable =
    turnArtifactOps.length > 0 ||
    displayedProduced.length > 0 ||
    pluginActionFolders.length > 0;
  /*
   * 这一轮**凭什么**可以出「下一步引导」。
   *
   * 工具箱那几档(brand / plan / design-system / project-incomplete)的行是
   * **宿主自己造的** —— 分享、下载、继续抽取、生成产物,每一条都指着一个具体
   * 目标。没有产物就没有目标,所以那几档必须先有 `hasTurnDeliverable`,否则
   * 会给出点了没有去处的入口。
   *
   * `default` 档不一样:它整档就是 agent 这一轮**自己写下的**三条建议。
   * 「这一轮有没有值得接着做的事」这个判断已经在 agent 那边做过了 —— host
   * 协议原话是「没有可迭代的东西(打招呼、一句普通回答、以问题收尾的回合)
   * 就一条都别发」。宿主再拿产物清单二次否决,不是加一道保险,是把 agent
   * 已经给出的结论丢掉:引用正文追问、改一处措辞、校对一遍、答一个关于刚
   * 交付物的问题 —— 这些回合宿主都不往产物名下记,建议却是有的,于是三条
   * 建议被静默扔掉(OPEND-2497)。
   *
   * 收口仍然在 `runSucceeded` 上:失败 / 中止的回合出口是重试,不是接着往下做。
   */
  const nextStepDeliveryEvidence =
    effectiveNextStepVariant === 'default'
      ? nextStepSuggestions.length > 0
      : hasTurnDeliverable;
  // Incomplete brand extraction is an explicit recovery workflow, not a
  // generic failed turn: its Continue action is the only way to resume the
  // saved extraction state, even when no artifact was produced yet.
  const isBrandExtractionRecovery =
    message.runStatus !== 'canceled' &&
    (effectiveNextStepVariant === 'brand-extraction-incomplete' ||
      effectiveNextStepVariant === 'brand-programmatic-incomplete' ||
      effectiveNextStepVariant === 'brand-ai-incomplete');
  const showNextStepActions =
    !streaming &&
    unfinishedTodos.length === 0 &&
    !hasPendingQuestionForm &&
    ((!!isLast && hasNextStepPrimary &&
      ((runSucceeded && nextStepDeliveryEvidence) || isBrandExtractionRecovery)) ||
      showOpenDesignSubmission);
  // Pre-output vs working: before any real content (text / thinking / tools /
  // files) the footer shimmers "Preparing…"; the moment content lands it
  // flips to "Working". The elapsed clock stays anchored to the persisted run
  // start so switching project tabs or remounting the message cannot restart it.
  const hasContent =
    outerBlocks.some((b) => b.kind !== "status") ||
    recordHasContent ||
    turnFileOps.length > 0;
  const preparing = streaming && !hasContent;
  const preparingStatus = preparing && events.some((e) => e.kind === "status" && e.label === "thinking")
    ? "thinking"
    : "preparing";

  // Index of the trailing text block — the streaming caret rides the end of
  // the last prose block so it tracks the final character as tokens arrive.
  let lastTextBlockIndex = -1;
  for (let i = outerBlocks.length - 1; i >= 0; i--) {
    if (outerBlocks[i]?.kind === "text") {
      lastTextBlockIndex = i;
      break;
    }
  }

  /**
   * 壳【外】的一块。抽成函数是因为它现在有**两个调用点** —— 交替编排里的结论段,
   * 和收在最后的那些非结论块 —— 两处必须画得一模一样。
   */
  const renderOuterBlock = (b: Block, key: string): ReactNode => {
    if (b.kind === "text")
      return (
        <ProseBlock
          key={key}
          text={b.text}
          hideRecoveredHtmlFallback={(message.agentId === "grok-build" || message.agentId === "claude") && !streaming}
          assistantMessageId={message.id}
          isLastAssistant={!!isLast}
          streaming={streaming}
          nextUserContent={nextUserContent}
          suppressDirectionForms={suppressDirectionForms}
          onSubmitQuestionForm={onSubmitQuestionForm}
          questionFormSubmitDisabled={
            questionFormSubmitDisabled || strategyBlockedNotice !== null
          }
          strategyBlockedNotice={strategyBlockedNotice}
          visualStyleContext={visualStyleContextForProjectKind(projectKind)}
          projectId={projectId}
          conversationId={conversationId}
          runId={message.runId ?? null}
          projectFileNames={projectFileNames}
          projectResolvedDir={projectResolvedDir}
          onRequestOpenFile={onRequestOpenFile}
          onBrandBrowserAssistConfirm={onBrandBrowserAssistConfirm}
        />
      );
    if (b.kind === "plugin-candidate") {
      return (
        <SkillPluginCandidateCard
          key={key}
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
      /*
       * `error` 这一档**一律不出**。稿子里没有这种状态行,用户 2026-08-27
       * 指认过两次:「为什么还会有这种错误样式?? 你的错误卡片呢??」
       * 「设计稿里哪有这种状态行」。
       *
       * 它原来只在「这条消息正好拥有报错卡」时才藏,于是**任何历史失败轮次**
       * 都还把上游英文原文顶着一个红框戳在回答中间。出事了该由谁说:
       *  · 当前那一轮 → 报错卡(标题 + 人话 + 恢复动作);
       *  · 历史轮次   → 壳头那句「运行失败」;
       *  · 上游原文   → 卡上的「查看详情」,不裸奔。
       * `warning` / `initializing` 早就按同一个道理去掉了,这是漏网的那一档。
       */
      if (b.label === "error") return null;
      // The pre-output "initializing" status is surfaced by the footer's
      // shimmering "Preparing…" label instead of its own pill.
      if (b.label === "initializing") return null;
      /*
       * `warning` 这一档**不在对话里出**(产品裁决 2026-08-26:「这个 warning 也不要显示了」)。
       *
       * 真机上撞到的那条是「Skill descriptions were shortened to fit the skills
       * context budget…」—— 这是**内部预算提示**,对用户既不可操作也看不懂,
       * 却顶着一整块橙色戳在回答中间。`error` 那一档留着:那是真出事了。
       */
      if (b.label === "warning") return null;
      return <StatusPill key={key} label={b.label} detail={b.detail} />;
    }
    return null;
  };

  return (
    <div
      id={`assistant-message-${message.id}`}
      className={`msg assistant${showRole ? '' : ' assistant-continuation'}`}
      /* 「接上一条,不再重复报名字」是状态,不是样式的私事 —— 给它自己的出口 */
      data-continuation={showRole ? 'false' : 'true'}
      data-assistant-message-id={message.id}
    >
      {showRole ? (
        <div className="role" data-testid="assistant-role">
          <AgentIcon id={roleIconId} size={20} className="role-agent-icon" />
          <span className="role-name">{roleName}</span>
        </div>
      ) : null}
      <div className="assistant-flow" data-testid="assistant-flow">
        {/*
          壳与结论段**按发生顺序交替**,不再「先把壳全画完再画结论」(OPEND-2592)。
          跨轮折叠的会话里,中途那张表单的收口就夹在两张壳中间;把壳整体提到前面
          会让「已确认」掉到整条消息的最底下,和用户实际回答的时刻对不上。
        */}
        {turnFlow.map((entry) =>
          entry.kind === 'shell' ? (
            <ExecutionShell
              key={entry.key}
              shell={entry.shell}
              onOpenFile={onRequestOpenFile}
              /* 执行记录里的文件名要判「这个路径是不是当前项目的」才决定做不做链接。
                 这三样正是正文 markdown 链接判归属用的同一套(见 chatFileLinkClickHandler),
                 判据本身在 `runtime/chat/record-file-open.ts`。 */
              fileScope={recordFileScope}
              onRetryImage={onRetryImage}
              runTerminal={isTerminalRunStatus(turnRunStatus)}
              imageSrc={imageSrc}
              /* done 一到就收起,不等 run 结束(产品 2026-09-04,见 `concludedAt`) */
              concluded={entry.concluded}
            />
          ) : (
            <Fragment key={entry.key}>
              {(proseGroups[entry.at] ?? []).map((b, i) =>
                renderOuterBlock(b, `${entry.key}-${i}`),
              )}
            </Fragment>
          ),
        )}
        {/* 状态行 / 插件候选不属于执行记录,也没有流里的位置 —— 收在最后 */}
        {restBlocks.map((b, i) => renderOuterBlock(b, `rest-${i}`))}
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
        {/* #5517 shape: the collapsible tool-op summary lists only the ops the
            turn actually emitted, and the produced-files list stays its own
            flat block below it (name / size / Open / Download). Folding the
            produced files into the summary would hide Download behind a
            disclosure, so `fileOps` — not `turnFileOps` — feeds this row.
            Read-only entries are filtered out (they stay in the execution
            record); the summary lists artifacts, not inspected inputs. */}
        {/*
          「这一轮的产物」**只有一个面板,也只有一份实现**。
          ------------------------------------------------------------
          原来这里是两个互斥的组件:有 write/edit 工具行走 `FileOpsSummary`,
          没有就走 `ProducedFiles`。互斥是 P0 `recvqaerXd82bE` 的补丁 ——
          它解决的是「同时出两块、同一个标题不同的计数」,**没有**解决两块长得
          不一样:卡片准入、音频画法、按钮集合、导出行为各写了一份,于是同一份
          `plan.md` / `theme.mp3` 在两条路上是两副长相。

          现在只留 `FileOpsSummary`,产出回退那条支把 `ProjectFile[]` 翻成
          `FileOpEntry[]` 再喂给它(`producedFilesAsFileOps`,复用
          `mergeProducedFilesIntoFileOps` 那条已经在用的映射)。互斥仍然成立,
          而且是**结构上**的:一条消息只调用一次这个组件。

          `onPublish` / `onExport` 不再按 `isLast` 发放 —— 设计稿组件 14 里没有
          这一档:动作是这张卡自己的属性(「这张卡能不能发布」一眼可见),不是
          「这一轮是不是最后一轮」的属性。按轮次发放的结果是同一种产物在历史
          轮次里少一枚按钮,截图里两张卡不一样。**「下一步引导」那一块仍然是
          最后一轮限定**(它讲的是「接下来做什么」,天然只对当前这一轮成立),
          那一处的 `isLast` 原样留着。
        */}
        {turnArtifactPanelEntries.length > 0 ? (
          <FileOpsSummary
            entries={turnArtifactPanelEntries}
            projectFileNames={projectFileNames}
            onRequestOpenFile={onRequestOpenFile}
            projectId={projectId ?? undefined}
            onPublish={onArtifactShare}
            onExport={onArtifactDownload}
            turnIsLive={streaming || turnRunStatus === 'running'}
            /*
             * 这一轮产物的**版本身份**。它决定卡面读当轮快照还是降级
             * (HTML → live iframe 显示最新;图片 → 当前同名文件),以及图片卡
             * 点击时开的是哪一张(设计文档 §4)。
             *
             * 走一个读取函数而不是 `message.artifactRefs`:这个字段的线上 DTO 在
             * `packages/contracts`,和 daemon 侧同批次落地;落地之后旧消息里也仍然
             * 可能没有它。收敛与「只信 ready」的判据都在
             * `runtime/chat/artifact-refs.ts`。
             */
            artifactRefs={messageArtifactRefs(message)}
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
                  hasUnfinishedTodos: unfinishedTodos.length > 0,
                  hasEmptyResponse,
                  canceled: message.runStatus === "canceled",
                  preparing,
                  preparingStatus,
                  copyMarkdown,
                  onFork: canFork ? onForkFromMessage : undefined,
                  forking,
                  forceVisible: true,
                  isLast: !!isLast,
                  createdAt: message.createdAt,
                  /*
                   * 跑完之后这一行**要**报终态(稿子:绿勾 + 已完成)。
                   * 原来只要壳里有内容就把状态词整个藏掉,于是跑完也不出 ——
                   * 用户 2026-08-26 指认「这个状态你好像也丢了」。
                   * 运行中的去重已经由 `showCompletionRow` 整行不出来解决。
                   * 只在报错卡那一轮仍然让位:原因和下一步由报错卡说。
                   */
                  // A clarification run may be process-terminal while its
                  // inline form is still waiting for an answer. Showing the
                  // green Done label here turns that handshake into a false
                  // success, especially when replaying legacy child-tag forms.
                  hideRunStatus: message.id === errorCardOwnerId || hasPendingQuestionForm,
                  onContinueRemaining: continueRemaining,
                }}
              />
            ) : (
              <AssistantFooter
                streaming={streaming}
                hasUnfinishedTodos={unfinishedTodos.length > 0}
                hasEmptyResponse={hasEmptyResponse}
                canceled={message.runStatus === "canceled"}
                preparing={preparing}
                preparingStatus={preparingStatus}
                copyMarkdown={copyMarkdown}
                onFork={canFork ? onForkFromMessage : undefined}
                forking={forking}
                isLast={!!isLast}
                createdAt={message.createdAt}
                hideRunStatus={message.id === errorCardOwnerId || hasPendingQuestionForm}
                onContinueRemaining={continueRemaining}
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
            suggestions={isLast ? nextStepSuggestions : undefined}
            onSuggestion={isLast ? onNextStepSuggestion : undefined}
            onDownload={isLast && nextStepFileName ? onArtifactDownload : undefined}
            skills={isLast ? nextStepSkills : undefined}
            onShareToOpenDesign={showOpenDesignSubmission ? onShareToOpenDesign : undefined}
            shareToOpenDesignBusy={shareToOpenDesignBusy}
            variant={effectiveNextStepVariant}
          />
        ) : null}
        {/* 分叉分界(稿子第 38 格)。
            ------------------------------------------------------------
            它是**这一截带过来的上下文的下边界**,所以必须排在这条消息的**最后** ——
            回合状态行、下一步引导都属于上面那一轮,得在线的**上面**。
            原来它排在下一步引导之前,于是那三行落到了线下面,读起来像是
            「新会话开口就给了三条建议」;用户真机指认过。

            落在**新会话**里,不是源会话:点完分叉页面就跳到新会话,人此刻站在这里,
            而那行脚注「上文已带过来,接着说就行」也只有对着这一截复制过来的上下文
            才说得通。标题用**源会话**的标题 —— 这条线回答的是「上面这些是从哪来的」。
            盖标记的地方在 daemon 的 fork 分支(`routes/project/conversations.ts`)。 */}
        {message.forkedInto ? (
          <>
            {/* `.is-new` 是入场动画的开关(稿子第 38 格「落一下」)。
                这两块只在这里渲染,陈列页那一格是手写的裸类名 —— 稿子交代的
                「钉住展示的那一格不挂 .is-new」因此天然成立。 */}
            <div className="fork-sep is-new" data-testid="assistant-fork-divider">
              <i aria-hidden />
              <span title={message.forkedInto.title}>{message.forkedInto.title}</span>
              <i aria-hidden />
            </div>
            {/* 脚注跟着分界线【居中】:它是这条线的注解,不是新会话里的第一句话。
                左对齐会让人读成「新会话已经开口说了一句」。 */}
            <div className="fork-note is-new" data-testid="assistant-fork-note">
              <Icon name="fork" size={12} />
              {t('assistant.forkNote')}
            </div>
          </>
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

/**
 * `ProjectFile[]` → `FileOpEntry[]`,给「没有工具行的那一轮」用。
 *
 * 直接复用 `mergeProducedFilesIntoFileOps` 的空底座:这条映射(名字、全路径、
 * 记成一次 write、`status: 'done'`)本来就已经在 `turnFileOps` 那条路上跑了,
 * 再写一份只会得到第二种记录形状 —— 而两种形状正是这次要消掉的东西。
 */
function producedFilesAsFileOps(produced: ProjectFile[]): FileOpEntry[] {
  return mergeProducedFilesIntoFileOps([], produced);
}

function summaryArtifactOpsForProducedFiles(
  fileOps: FileOpEntry[],
  produced: ProjectFile[] | undefined,
  declared: readonly string[] | null | undefined,
): FileOpEntry[] {
  const artifactOps = fileOps.filter(
    (entry) => entry.ops.includes('write') || entry.ops.includes('edit'),
  );
  /*
   * 这一轮**有没有**产物,判据只有一个:本轮自己的 write/edit 工具行。
   * 没有工具行就没有卡 —— 声明(`<od-focus show=…>`)只能收窄本轮真写过的
   * 东西,不能凭空造出一张卡。
   */
  if (artifactOps.length === 0) return artifactOps;
  /*
   * 空清单**不是**否决票。
   *
   * `producedFiles` 是客户端拿「回合前后的项目文件名」做差算出来的
   * (`ProjectView.computeProducedFiles`:`next.filter(f => !before.has(f.name))`),
   * 所以它为空有一大堆与「这轮没产物」无关的原因:
   *   · 改的是**已存在**的文件 —— 名字本来就在 before 里,差集天然为空;
   *   · 算不出基线时 `computeProducedFiles` 返回 `undefined`,而五个落库点
   *     一律 `?? []`,把「不知道」直接写成了「空」;
   *   · 文件列表读取与 daemon 退出赛跑,陈旧快照会让这一轮落库成空清单 ——
   *     这条竞态就写在 `ProjectView.tsx` 那句注释里,是 OPEND-2550 的现场。
   *
   * 所以 `[]` 和 `undefined` 在这里是**同一件事**:没有可用的权威清单。
   * 两者都回落到本轮的工具行证据,再按声明收窄一次。权威清单只在**非空**时
   * 才参与,用来补路径和元数据、并把工具行没记全的产物带回来 —— 它是补充项,
   * 不是否决项。把 `[]` 当权威空,正是「生成完了却没有产物卡」的成因。
   */
  if (produced === undefined || produced.length === 0) {
    const candidates = artifactOps.map((entry) => ({
      name: entry.path,
      path: entry.fullPath,
      entry,
    }));
    /*
     * 没声明**不等于**全端出来。
     *
     * 「不声明就一张卡都没有」是原设计,但真机声明率是新建 100% / 只改 25%
     * (W10 从诊断包里量的),所以那条规则在只改文件的轮次上就是「一张卡都没
     * 有」。d17d70e864 把它翻成「全端出来」,于是六张卡又回来了 —— 而标记本来
     * 就是为了消掉这六张。
     *
     * 产品裁决(方案 C)落在这一行:兜底,但只端主产物。判据整条挂在
     * `pickPrimaryArtifacts` 上(页面 / 文档压过图片,`.js` `.css` `.svg`
     * `.json` 这类依赖永不出卡),而不是在这里摊成一串 if —— 同一条判据还要
     * 喂 `run_finished.wrote_only_dependencies` 的埋点,两处必须是同一个函数。
     *
     * 它只在**本轮写过的文件**里挑:改了 `app.js` 不会去找引用它的
     * `index.html`,因为宿主契约禁止把卡指向本轮没产出的文件。那个场景到底
     * 有多常见,先量再说。
     */
    if (!declared?.length) return pickPrimaryArtifacts(candidates).map((c) => c.entry);
    return declaredArtifactCards(candidates, declared).map((candidate) => candidate.entry);
  }

  const unused = new Set(artifactOps);
  return produced.map((file) => {
    const candidates = [...unused]
      .map((entry) => ({ entry, score: producedFileOpMatchScore(entry, file) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => {
        const statusDelta =
          Number(right.entry.status === 'done') - Number(left.entry.status === 'done');
        return statusDelta || right.score - left.score;
      });
    const matched = candidates[0]?.entry;
    if (matched) {
      unused.delete(matched);
      return {
        ...matched,
        path: file.name,
        status: 'done' as const,
      };
    }

    const fullPath = file.path || file.localPath || file.name;
    return {
      path: file.name,
      fullPath,
      ops: ['write'],
      opCounts: { read: 0, write: 1, edit: 0, delete: 0 },
      total: 1,
      status: 'done',
    };
  });
}

function producedFileOpMatchScore(entry: FileOpEntry, file: ProjectFile): number {
  const entryFullPath = normalizeTouchedPath(entry.fullPath);
  const entryPath = normalizeTouchedPath(entry.path);
  const filePaths = [file.path, file.localPath, file.name]
    .filter((path): path is string => Boolean(path))
    .map(normalizeTouchedPath);

  if (filePaths.includes(entryFullPath)) return 3;
  if (filePaths.some((path) => entryFullPath.endsWith(`/${path}`))) return 2;
  if (filePaths.includes(entryPath)) return 1;
  return 0;
}

function normalizeTouchedPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * 这一轮**碰过文件**吗 —— 决定正文里的一句话能不能把一个文件「找」回来当产出。
 *
 * 两条硬证据:daemon 给这一轮结算出的产出清单(`producedFiles`),和本轮记下的
 * 写 / 改工具调用。两条都空,这一轮就是一次没动过文件;此时回答里的
 * 「我已经为你创建了 `x.html`」只是在**复述历史**,不是本轮增量。
 * 真机撞到过:用户只发了一句「你好」,agent 顺口复述了上一轮的成果,
 * 那份 38 分钟前写的文件就被摆成了一张整块的产物预览卡。
 *
 * 文件自己的落盘时间是另一条独立证据,走 `isFileMtimeInsideRun`,不受这里约束 ——
 * 真在本轮落的盘,哪怕这两条都空(工具调用没记上、产出清单也没算进去)也照样认。
 */
function turnTouchedAnyFile(
  produced: readonly ProjectFile[],
  fileOps: readonly FileOpEntry[],
): boolean {
  if (produced.length > 0) return true;
  return fileOps.some((entry) => entry.ops.includes("write") || entry.ops.includes("edit"));
}

function recoverLinkedProjectFilesFromContent({
  content,
  projectFiles,
  projectId,
  message,
  turnTouchedFiles,
}: {
  content: string;
  projectFiles: ProjectFile[];
  projectId?: string | null;
  message?: ChatMessage;
  /** 见 `turnTouchedAnyFile` —— 为 false 时正文里的措辞不再算作产出证据 */
  turnTouchedFiles: boolean;
}): ProjectFile[] {
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
    if (!shouldRecoverReferencedFile(content, href, file, message, turnTouchedFiles)) continue;
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

/**
 * 这个被正文提到的文件,算不算**这一轮的产出**。
 *
 * 两条证据,任一成立即可,但都必须来自**这一轮**:
 *  · 它的落盘时间落在本轮跑的窗口里 —— 这一轮真写了它;
 *  · 这一轮**碰过文件**(见 `turnTouchedAnyFile`),而正文用产出的口气点了它的名 ——
 *    留给「写是写了,但工具调用没记上、产出清单也没算进去」的那一档兜底。
 *
 * 措辞本身**不是**证据。一轮什么文件都没动的回答里,「我已经为你创建了 `x.html`」
 * 说的是上一轮的事,凭它摆出产物卡就是把历史当成了本轮增量。
 */
function shouldRecoverReferencedFile(
  content: string,
  rawRef: string,
  file: ProjectFile,
  message: ChatMessage | undefined,
  turnTouchedFiles: boolean,
): boolean {
  if (isFileMtimeInsideRun(file, message)) return true;
  if (!turnTouchedFiles) return false;
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

/**
 * 这一轮是**用户自己按停的**。
 * ------------------------------------------------------------
 * 停下来的一轮没有「答得好不好」可评 —— 它不是答得差,是压根没答完,
 * 而赞 / 踩问的正是前者。稿子 15-6 因此只留 复制 / Fork 两枚。
 * 跑挂了的那一轮不在此列:那是**结果**,评得动,而且正是最该被点踩的一档。
 */
function userStoppedTheTurn(message: ChatMessage): boolean {
  return message.runStatus === "canceled";
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
    userStoppedTheTurn(message) ||
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
  hasUnfinishedTodos: boolean;
  hasEmptyResponse: boolean;
  canceled?: boolean;
  // Pre-output phase: streaming but nothing rendered yet. The label shimmers
  // "Preparing…"; once content lands it flips to "Working".
  preparing?: boolean;
  preparingStatus?: "preparing" | "thinking";
  copyMarkdown?: string;
  onFork?: () => void;
  forking?: boolean;
  feedbackControls?: ReactNode;
  forceVisible?: boolean;
  // Identifies the latest reply for UI/analytics hooks. Completed controls are
  // hover/focus-gated on pointer devices and remain visible without hover.
  isLast?: boolean;
  // When the turn has an execution disclosure, its run state lives at the top
  // of the answer. The footer keeps only actions so run state is not repeated.
  hideRunStatus?: boolean;
  /**
   * 〔继续剩余任务〕。**只有还欠着活的时候才传** —— 传了就画,没传就不画,
   * 这一行不自己判断有没有未完成的活(镜像陈列页要能单独摆出两种形态)。
   */
  onContinueRemaining?: () => void;
  /** 这一轮的时间,靠右端(设计稿 15-1 的 `.tm`)。拿不到就不显示,不估算 */
  createdAt?: number;
}

/** 导出只为验收:镜像陈列页要单挂这一行去对第 34–39 格。产品里的消费方仍是
 *  `AssistantMessageImpl` 与下面的 `AssistantFeedback`。 */
export function AssistantFooter({
  streaming,
  hasUnfinishedTodos,
  hasEmptyResponse,
  canceled = false,
  preparing = false,
  preparingStatus = "preparing",
  copyMarkdown,
  onFork,
  forking = false,
  feedbackControls,
  forceVisible = false,
  isLast = false,
  hideRunStatus = false,
  onContinueRemaining,
  createdAt,
}: AssistantFooterProps) {
  const t = useT();
  if (
    !forceVisible &&
    !streaming &&
    !hasUnfinishedTodos &&
    !hasEmptyResponse &&
    !canceled &&
    !copyMarkdown &&
    !onFork &&
    !onContinueRemaining
  )
    return null;
  return (
    <div
      className="assistant-footer"
      data-testid="assistant-footer"
      data-unfinished={hasUnfinishedTodos ? "true" : "false"}
      data-streaming={streaming ? "true" : "false"}
      // 中断的那一轮不能戴完成勾:它并没有跑完(稿子 15-6「绿点转灰」)
      data-canceled={canceled ? "true" : "false"}
      data-last={isLast ? "true" : "false"}
    >
      {/* 稿子这一行的头是**一个**元素:`<span class="fin"><svg class="tick"/>已完成</span>` ——
          勾在字里面,不是它旁边的兄弟。原来 dot 和文字是平级的两个 span,
          逐元素比样式时从这里就错开一位。 */}
      {!hideRunStatus ? (
        <>
          <span className={`assistant-label${streaming && preparing ? " shimmer-text shimmer-prepare" : ""}`} data-testid="assistant-label">
            {/* 跑完那一档稿子用的是 `<svg class="tick">`(勾其实是 background 画的,
                里面的 path 被 `.tick > * { display:none }` 关掉了),没跑完那几档用的是 `<i>`。
                标记本身的样子全在 `.dot` 的 CSS 里,这里只决定用哪个标签 —— 标签不一样,
                逐元素比样式时后面整列都要错位。 */}
            {!streaming && !canceled && !hasUnfinishedTodos ? (
              <svg className="dot" viewBox="0 0 24 24" aria-hidden />
            ) : (
              <i className="dot" data-active={streaming ? "true" : "false"} />
            )}
            {streaming
              ? preparing
                ? preparingStatus === "thinking"
                  ? t("assistant.statusThinking")
                  : t("assistant.statusPreparing")
                : t("assistant.workingLabel")
              : hasEmptyResponse
              ? t("assistant.emptyResponseLabel")
              : canceled
              ? t("assistant.canceledLabel")
              : hasUnfinishedTodos
              ? t("assistant.unfinishedLabel")
              : t("assistant.doneLabel")}
          </span>
        </>
      ) : null}
      {copyMarkdown || onFork || feedbackControls || onContinueRemaining ? (
        <span className="assistant-footer-controls">
          {/*
            〔继续剩余任务〕排在最前面。
            ------------------------------------------------------------
            它和后面几个不是一类:复制 / 赞踩 / Fork 是「对这段回答做点什么」,
            这一颗是**把没干完的活接着往下推**,是这一行状态词(「已停止,仍有未完成任务」)
            的直接下一步 —— 挨着那句话才读得通。
            它也是 agent 判断「这一轮跟旧账无关」时用户唯一的出口,不能被折进更里面。
          */}
          {onContinueRemaining ? (
            <button
              type="button"
              className="assistant-copy-button assistant-continue-remaining"
              data-testid="assistant-continue-remaining"
              onClick={onContinueRemaining}
            >
              {t("assistant.continueRemaining")}
            </button>
          ) : null}
          {/* 稿子的顺序是 赞 → 踩 → 复制 → Fork:先是「这答案好不好」,再是「拿它做点什么」 */}
          {feedbackControls}
          {copyMarkdown ? <AssistantMarkdownCopyButton markdown={copyMarkdown} /> : null}
          {onFork ? (
            <AssistantForkButton
              disabled={forking}
              onFork={onFork}
            />
          ) : null}
        </span>
      ) : null}
      {/* 弹簧 + 时间:稿子里这一行是满宽的,时间贴右端。拿不到时间就两样都不出。
          **跑的过程中不出时间** —— 那一刻这一行只该留复制 / Fork 这类动作;
          状态由壳头报,时间等落定了再说(用户 2026-08-26 真机指认「运行中没有这个了」)。 */}
      {createdAt != null && !streaming ? (
        <>
          <span className="assistant-footer-gap" />
          <time className="assistant-footer-time" dateTime={new Date(createdAt).toISOString()}>
            {formatClock(createdAt)}
          </time>
        </>
      ) : null}
    </div>
  );
}

/** 「14:32」—— 只给时分,和稿子一致;跨天与否不在这一行表达 */
function formatClock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

/** 导出只为验收:第 34 / 36 / 37 / 39 格要的是「状态行 + 赞踩」整条,
 *  赞踩两枚是这里注入 `AssistantFooter` 的,单挂 footer 出不来。 */
export function AssistantFeedback({
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
    reasonsRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
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
      /*
       * 取消勾选「其他」**不再清空补充框**。补充框现在是常驻的(稿子第 40 格),
       * 它和「其他」这一颗胶囊已经没有绑定关系;人写完一句话再顺手取消了那颗胶囊,
       * 就把他的话删掉,是在替他做决定。
       */
      next.delete(code);
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
    const hasCustomReason = trimmedCustomReason.length > 0;
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
      /*
       * 补充框常驻之后,这里也不能再要求「勾了『其他』才算数」——
       * 人把话写进去了却因为没勾那一项被丢掉,是我们把他的输入扔了。
       */
      customReason: trimmedCustomReason || undefined,
      reasonsSubmittedAt: Date.now(),
    });
    setReasonRating(null);
  };
  const reasonOptions = reasonRating
    ? feedbackReasonOptions(reasonRating, t, hasDesignSystemContext)
    : [];
  /*
   * 补充框现在常驻(见 `AssistantFeedbackReasons`),所以「能不能提交」也跟着松开:
   * 只写了一句补充、一个原因都没勾,同样是有效反馈 —— 原来那条 `has('other')` 的门
   * 会把这种人挡在外面,而他已经把话打完了。
   */
  const canSubmit = draftReasonCodes.size > 0 || customReason.trim().length > 0;
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
        data-rating="up"
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
            data-testid="assistant-feedback-burst"
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
        data-rating="down"
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
        <AssistantFeedbackReasons
          rating={reasonRating}
          options={reasonOptions}
          selected={draftReasonCodes}
          onToggle={(code) => toggleReasonCode(code as never)}
          customReason={customReason}
          onCustomReasonChange={setCustomReason}
          canSubmit={canSubmit}
          onSubmit={submitReasons}
          onCancel={() => setReasonRating(null)}
          panelRef={reasonsRef}
          t={t as never}
        />
      ) : null}
    </div>
  );
}

/**
 * 导出只为**验收**:镜像陈列页第 40 格要摆产品**真实**的原因项,
 * 不许在夹具里手抄一份稿子的四个词冒充 —— 那样比出来的是夹具,不是实现。
 */
export function feedbackReasonOptions(
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
          "could_not_run",
          "too_slow",
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
    case "could_not_run":
      return t("assistant.feedbackReasonNegativeCouldNotRun");
    case "too_slow":
      return t("assistant.feedbackReasonNegativeTooSlow");
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
  const t = useT();

  return (
    <div className="plugin-action-panel" aria-label={t('chat.pluginAction.aria')}>
      <div className="plugin-action-panel__head">
        <span className="plugin-action-panel__icon" aria-hidden>
          <Icon name="sparkles" size={15} />
        </span>
        <div>
          <div className="plugin-action-panel__title">{t('chat.pluginAction.title')}</div>
          <div className="plugin-action-panel__subtitle">
            {t('chat.pluginAction.subtitle')}
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
                <span>{t('chat.pluginAction.filesReady', { count: folder.fileCount })}</span>
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
                    {actionBusy && busyKey === `install:${folder.path}`
                      ? t('chat.comments.sending')
                      : t('chat.pluginAction.install')}
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
                    {actionBusy && busyKey === `publish:${folder.path}`
                      ? t('chat.comments.sending')
                      : t('pluginCard.publish')}
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
                      ? t('chat.comments.sending')
                      : t('pluginCard.contribute')}
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
                    <span>{t('ds.openManifest')}</span>
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
  return /\b(Add to My plugins|OpenDesign PR|Publish repo|plugin publish|ready to publish|ready to add)\b/i.test(
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
  nextUserContent,
  suppressDirectionForms,
  onSubmitQuestionForm,
  questionFormSubmitDisabled,
  strategyBlockedNotice = null,
  visualStyleContext,
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
  nextUserContent?: string;
  suppressDirectionForms: boolean;
  projectId?: string | null;
  conversationId?: string | null;
  runId?: string | null;
  projectFileNames?: Set<string>;
  projectResolvedDir?: string | null;
  onSubmitQuestionForm?: QuestionFormSubmitHandler;
  questionFormSubmitDisabled: boolean;
  /** Localized blocked-task notice; non-null terminates form interaction. */
  strategyBlockedNotice?: string | null;
  visualStyleContext?: VisualStyleContext;
  onRequestOpenFile?: (name: string) => void;
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
}) {
  const t = useT();
  const cleaned = useMemo(() => {
    /*
     * 三道**协议噪音**先剥干净,再交给按标记找边界的 `stripArtifact`。
     * 三者互不重叠,合在一条链上,谁都不能少:
     *
     * 1. `stripInternalControlMarkers`(origin/main):daemon 的内部控制标记
     *    (`<od-title>` / `open-design-plan-contract` / `open-design-runtime-state`)。
     *    这些本该被 daemon 侧的流式剥离器吃掉,但已经落库的旧消息修不回来。
     * 2. `stripCritiqueGrammar`(本分支):评审剧场语法。daemon 那道
     *    (`panel-grammar-strip.ts`)只管**新流**;用户手上已经有一堆落了库的旧对话,
     *    里面原样写着 `<CRITIQUE_RUN>` / `<PANELIST role="Critic" score="9.0">`。
     * 3. `stripArtifactFocusMarkers`(本分支):`<od-focus>` 展示意图标记。
     *
     * 位置都在最前面:后面 `stripArtifact` 之类都按标记找边界,先把不是标记的
     * 噪音清掉,它们的扫描才不会被岔开。
     * 语法出处在 `@open-design/contracts`,两边共用一份,不会分叉。
     */
    const withoutMarkers = stripArtifactFocusMarkers(
      stripCritiqueGrammar(stripInternalControlMarkers(text, { streaming })),
    );
    const stripped = stripArtifact(withoutMarkers);
    return hideRecoveredHtmlFallback
      ? stripRecoveredHtmlFallbackForDisplay(stripped, withoutMarkers)
      : stripped;
  }, [hideRecoveredHtmlFallback, streaming, text]);
  // While the latest turn is still streaming a not-yet-closed question-form,
  // drop the partial `<question-form>{…` markup from the prose so the chat
  // doesn't flash raw JSON; an inline loading frame takes its place. A not-yet-closed
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
  /**
   * 逐字化开(W9):稿子把流式光标删了,新到的字自己化开就是流式的样子。
   * 判据挂在「这是最后一条且还在流」上 —— 历史消息重渲染时不能再化开一遍。
   */
  const proseRef = useRef<HTMLDivElement>(null);
  useCharReveal(proseRef, Boolean(isLastAssistant && streaming));
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
  /**
   * 一段正文可以「看上去空但仍有东西要画」:还没闭合的 `<question-form>` 被剥掉之后,
   * 留下来的加载框才是这一块此刻的全部内容。
   *
   * 老链路里这种情况不会发生 —— 表单前面的引导语和表单在同一个 text 块里,剥完还剩字。
   * 新执行记录按 D43 把表单之前的过程叙述收进壳内,壳外只剩这半截标记,
   * 于是 `renderable` 真的是空的;在这里返回 null 就把加载框一起吞了。
   */
  if (renderable.length === 0 && !live && !hadOpenForm) return null;
  return (
    <div
      ref={proseRef}
      className="prose-block"
    >
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
            <div key={seg.key} className="status-pill" data-testid="status-pill">
              <span className="status-label">{t("assistant.designSystemDirectionLocked")}</span>
            </div>
          );
        }
        return (
          <FormBlock
            key={seg.key}
            form={seg.form}
            assistantMessageId={assistantMessageId}
            projectId={projectId}
            conversationId={conversationId}
            nextUserContent={nextUserContent}
            interactive={isLastAssistant}
            onSubmit={onSubmitQuestionForm}
            submitDisabled={questionFormSubmitDisabled}
            strategyBlockedNotice={strategyBlockedNotice}
            visualStyleContext={visualStyleContext}
          />
        );
      })}
      {live ? (
        <StreamingCodeCard
          icon="file-code"
          titleLabel={t("tool.write")}
          metaLabel={live.title || live.identifier || undefined}
          code={live.content}
        />
      ) : null}
      {hadOpenForm ? <QuestionFormLoading /> : null}
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
  assistantMessageId,
  projectId,
  conversationId,
  nextUserContent,
  interactive,
  onSubmit,
  submitDisabled,
  strategyBlockedNotice = null,
  visualStyleContext,
}: {
  form: QuestionForm;
  assistantMessageId: string;
  projectId?: string | null;
  conversationId?: string | null;
  nextUserContent?: string;
  interactive: boolean;
  onSubmit?: QuestionFormSubmitHandler;
  submitDisabled: boolean;
  /** Localized blocked-task notice rendered under the disabled form. */
  strategyBlockedNotice?: string | null;
  visualStyleContext?: VisualStyleContext;
}) {
  const t = useT();
  const analytics = useAnalytics();
  const { workspaceContext } = useProjectCollabContext();
  const formKey =
    projectId && conversationId
      ? `${projectId}:${conversationId}:${assistantMessageId}:${form.id}`
      : null;
  const [draftAnswers, setDraftAnswers] = useState<
    Record<string, string | string[]> | undefined
  >(() => readInlineQuestionFormDraft(formKey));
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(() =>
    readInlineQuestionFormSubmitted(formKey),
  );
  const submittingRef = useRef(submitting);
  const pendingUploadCleanupRef = useRef<ChatAttachment[]>([]);
  const submittedFromHistory = useMemo(
    () => (nextUserContent ? parseSubmittedAnswers(form, nextUserContent) : null),
    [form, nextUserContent],
  );
  const submittedSummary = useMemo(() => {
    if (!submittedFromHistory) return { items: [], visualItems: [] };
    // 跳过的题也要占一行。`formatFormAnswers` 已经把它们写成 `(skipped)` 发给模型了,
    // 收口不念出来的话,用户看不出自己跳过了什么;整张表都跳时更会一行不剩,
    // 退回那句「答案已发送」—— 而那一分支恰恰是「一个答案都没有」才成立的。
    return summarizeQuestionFormAnswers(
      form,
      submittedFromHistory,
      visualStyleContext,
      false,
      t('qf.answeredSkipped'),
    );
  }, [form, submittedFromHistory, t, visualStyleContext]);
  useEffect(() => {
    const syncSubmitLock = () => {
      const outstanding = readInlineQuestionFormSubmitted(formKey);
      submittingRef.current = outstanding;
      setSubmitting(outstanding);
    };
    setDraftAnswers(readInlineQuestionFormDraft(formKey));
    setUploadError(null);
    syncSubmitLock();
    pendingUploadCleanupRef.current = [];
    // A submit started before this mount can still be refused after it, and
    // that refusal is the user's only way back into the form.
    return subscribeInlineQuestionFormSubmitted(formKey, syncSubmitLock);
  }, [formKey]);
  useEffect(() => {
    if (!submittedFromHistory) return;
    clearInlineQuestionFormDraft(formKey);
    clearInlineQuestionFormSubmitted(formKey);
    setDraftAnswers(undefined);
  }, [formKey, submittedFromHistory]);
  // The answer landing in history is what ends the submission; a busy
  // conversation only hides the form for as long as it stays busy, so it must
  // not be mistaken for the send having been consumed.
  useEffect(() => {
    if (!submitting || !submittedFromHistory) return;
    submittingRef.current = false;
    setSubmitting(false);
  }, [submittedFromHistory, submitting]);
  const updateDraftAnswers = useCallback(
    (answers: Record<string, string | string[]>) => {
      setUploadError(null);
      setDraftAnswers(answers);
      writeInlineQuestionFormDraft(formKey, answers);
    },
    [formKey],
  );
  useEffect(() => {
    if (submittedFromHistory || !projectId) return;
    const occurrenceKey = `${projectId}:${assistantMessageId}:${form.id}`;
    if (viewedInlineQuestionForms.has(occurrenceKey)) return;
    viewedInlineQuestionForms.add(occurrenceKey);
    trackQuestionsFormSurfaceView(analytics.track, {
      page_name: "chat_panel",
      area: "questions_form",
      project_id: projectId,
      form_id: questionsFormTrackingId(form.id),
    });
  }, [analytics.track, assistantMessageId, form.id, projectId, submittedFromHistory]);

  const handleAnswerChange = useCallback(
    (questionId: string, value: string | string[]) => {
      if (!projectId || typeof value !== "string" || value.length === 0) return;
      const element =
        questionId === "taskType"
          ? ("task_type_chip" as const)
          : questionId === "brand"
            ? ("brand_bg_chip" as const)
            : null;
      if (!element) return;
      trackQuestionsFormClick(analytics.track, {
        page_name: "chat_panel",
        area: "questions_form",
        element,
        chip_id: questionsFormTrackingId(value),
        form_id: questionsFormTrackingId(form.id),
        project_id: projectId,
      });
    },
    [analytics.track, form.id, projectId],
  );

  const handleInteraction = useCallback(
    (interaction: QuestionFormInteraction) => {
      if (!projectId) return;
      trackQuestionsFormClick(analytics.track, {
        page_name: "chat_panel",
        area: "questions_form",
        element: interaction.element,
        form_id: questionsFormTrackingId(form.id),
        question_id: questionsFormTrackingId(interaction.questionId),
        project_id: projectId,
        ...("styleId" in interaction
          ? { style_id: questionsFormTrackingId(interaction.styleId) }
          : {}),
        ...("styleContext" in interaction
          ? { style_context: interaction.styleContext }
          : {}),
        ...("source" in interaction
          ? { interaction_source: interaction.source }
          : {}),
        ...("stepIndex" in interaction
          ? {
              step_index: interaction.stepIndex,
              step_count: interaction.stepCount,
            }
          : {}),
      });
    },
    [analytics.track, form.id, projectId],
  );

  const rollbackPendingUploads = useCallback(async () => {
    const pending = pendingUploadCleanupRef.current;
    if (pending.length === 0) return true;
    if (!projectId) return false;
    const deleted = await Promise.all(
      pending.map((attachment) =>
        deleteProjectFile(projectId, attachment.path, workspaceContext),
      ),
    );
    pendingUploadCleanupRef.current = pending.filter((_, index) => !deleted[index]);
    return pendingUploadCleanupRef.current.length === 0;
  }, [projectId, workspaceContext]);

  const handleSubmit = useCallback(
    async (
      text: string,
      answers: Record<string, string | string[]>,
      source: "submit" | "skip" | "auto",
      fileSubmissions: QuestionFormFileSubmission[] = [],
    ) => {
      if (submittingRef.current) return;
      // The occurrence is locked the moment the answer leaves the form, not
      // when the host finally settles it. Every await below — rolling back a
      // previous upload, uploading this answer's files, and above all the
      // host's own send (which may sit in a pre-run gate or park in a busy
      // conversation's queue) — is a window the user can leave the project
      // through. A lock written only after those awaits is precisely the lock
      // the remount rebuilds as "never submitted".
      const beginSubmission = () => {
        markInlineQuestionFormSubmitted(formKey);
        submittingRef.current = true;
        setSubmitting(true);
      };
      const releaseSubmitLock = () => {
        clearInlineQuestionFormSubmitted(formKey);
        submittingRef.current = false;
        setSubmitting(false);
      };
      beginSubmission();
      if (
        pendingUploadCleanupRef.current.length > 0 &&
        !(await rollbackPendingUploads())
      ) {
        setUploadError(
          t("questions.uploadFailed", { failed: Math.max(1, pendingUploadCleanupRef.current.length) }),
        );
        releaseSubmitLock();
        return;
      }
      let attachments: ChatAttachment[] = [];
      let context: RunContextSelection | undefined;
      let submittedText = text;
      if (fileSubmissions.length > 0) {
        if (!projectId) {
          setUploadError(t("questions.uploadNeedsProject"));
          releaseSubmitLock();
          return;
        }
        const flatFiles = fileSubmissions.flatMap((submission) =>
          submission.files.map((file) => ({
            file,
            questionLabel: submission.questionLabel,
          })),
        );
        setUploadError(null);
        const result = await uploadProjectFiles(
          projectId,
          flatFiles.map((entry) => entry.file),
          undefined,
          workspaceContext,
        ).catch((error) => ({
          uploaded: [],
          failed: flatFiles.map((entry) => ({
            name: entry.file.name,
            error: error instanceof Error ? error.message : String(error),
          })),
          error: error instanceof Error ? error.message : String(error),
        }));
        if (result.failed.length > 0 || result.uploaded.length !== flatFiles.length) {
          pendingUploadCleanupRef.current = result.uploaded;
          await rollbackPendingUploads();
          const detail = result.error ? ` (${result.error})` : "";
          setUploadError(t("questions.uploadFailed", { failed: flatFiles.length }) + detail);
          releaseSubmitLock();
          return;
        }
        attachments = result.uploaded.map((attachment, index) => ({
          ...attachment,
          order: index,
        }));
        context = {
          workspaceItems: workspaceItemsForInlineQuestionUploads(attachments),
        };
        submittedText = appendInlineQuestionUploadSummary(
          submittedText,
          fileSubmissions,
          attachments,
        );
      }
      if (projectId) {
        const answeredCount = form.questions.filter((question) => {
          const value = answers[question.id];
          return Array.isArray(value)
            ? value.length > 0
            : typeof value === "string" && value.trim().length > 0;
        }).length;
        trackQuestionsFormClick(analytics.track, {
          page_name: "chat_panel",
          area: "questions_form",
          element: source === "submit" ? "submit" : "skip",
          ...(source === "skip"
            ? { skip_source: "button" as const }
            : source === "auto"
              ? { skip_source: "countdown" as const }
              : {}),
          answered_count: answeredCount,
          skipped_count: form.questions.length - answeredCount,
          form_id: questionsFormTrackingId(form.id),
          project_id: projectId,
        });
      }
      const rejectSubmission = async () => {
        if (attachments.length > 0) {
          pendingUploadCleanupRef.current = attachments;
          if (!(await rollbackPendingUploads())) {
            setUploadError(
              t("questions.uploadFailed", {
                failed: Math.max(1, pendingUploadCleanupRef.current.length),
              }),
            );
          }
        }
        releaseSubmitLock();
      };
      const acceptSubmission = () => {
        clearInlineQuestionFormDraft(formKey);
        setDraftAnswers(undefined);
      };
      let submitOutcome: boolean | void | Promise<boolean | void>;
      try {
        submitOutcome =
          attachments.length > 0 || context
            ? onSubmit?.(submittedText, attachments, context, undefined, form.id)
            : onSubmit?.(submittedText, undefined, undefined, undefined, form.id);
      } catch {
        void rejectSubmission();
        return;
      }
      void Promise.resolve(submitOutcome).then(
        (started) => {
          if (started === false) {
            void rejectSubmission();
            return;
          }
          acceptSubmission();
        },
        () => void rejectSubmission(),
      );
    },
    [analytics.track, form, formKey, onSubmit, projectId, rollbackPendingUploads, t],
  );

  if (submittedFromHistory) {
    const flat = submittedSummary.items;
    const single = flat.length === 1 && submittedSummary.visualItems.length === 0;
    return (
      /*
       * 已回答的收口(稿子第 23 / 24 / 25 格)。
       *
       * 稿子这一块**没有卡**:一行绿色的「已确认」,底下是 `标签 值` 的纯文本行,
       * 多选就列成几行,视觉方向那格再挂一张 57px 的缩略图。
       * 原来这里是灰底圆角卡 + 一枚 ✓ 圆圈 + 一排胶囊 —— 那是稿子之前的形态。
       *
       * 类名与 `QuestionForm` 里的 `AnsweredSummary` 共用(`.answered / .k / .ab / .ak / .al / .av`),
       * 两条路径(历史回放 vs 当轮提交)长得一样,不再各画一套。
       */
      <div
        className="answered"
        data-testid="question-form-summary"
        data-form-id={form.id}
        data-message-id={assistantMessageId}
      >
        <div className="k">{t("qf.answeredConfirmed")}</div>
        {flat.length === 0 && submittedSummary.visualItems.length === 0 ? (
          <div className="ab">{t("qf.lockedSubmitted")}</div>
        ) : null}
        {single ? (
          <div className="ab">
            <span className="ak">{flat[0]!.label}</span>
            <b>{flat[0]!.value}</b>
          </div>
        ) : flat.length > 0 ? (
          <ul className="al">
            {flat.map((item) => (
              <li key={`${item.label}-${item.value}`}>
                <span className="ak">{item.label}</span>
                <b>{item.value}</b>
              </li>
            ))}
          </ul>
        ) : null}
        {submittedSummary.visualItems.map((item) => (
          <div key={item.label} className="ab">
            <span className="ak">{item.label}</span>
            <b>{item.cards.map((c) => c.title).join(" / ")}</b>
            {item.cards.map((card) => (
              <img key={card.src} className="av" src={card.src} alt={`${item.label}: ${card.title}`} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <QuestionFormView
        form={form}
        interactive={interactive}
        draftAnswers={draftAnswers}
        onDraftChange={updateDraftAnswers}
        onAnswerChange={handleAnswerChange}
        onInteraction={handleInteraction}
        onSubmit={onSubmit ? (...args) => void handleSubmit(...args) : undefined}
        submitDisabled={submitDisabled || submitting}
        visualStyleContext={visualStyleContext}
        autoContinueAfterTimeout
      />
      {strategyBlockedNotice ? (
        <div
          className="qf-blocked-notice"
          role="status"
          data-testid="question-form-blocked-notice"
        >
          {strategyBlockedNotice}
        </div>
      ) : null}
      {uploadError ? (
        <div className="qf-upload-error" role="alert">
          {uploadError}
        </div>
      ) : null}
    </>
  );
}

function workspaceItemsForInlineQuestionUploads(
  attachments: ChatAttachment[],
): WorkspaceContextItem[] {
  return attachments.map((attachment) => ({
    id: `file:${attachment.path}`,
    kind: "file",
    label:
      attachment.path.split("/").filter(Boolean).pop() || attachment.name,
    path: attachment.path,
  }));
}

function appendInlineQuestionUploadSummary(
  text: string,
  fileSubmissions: QuestionFormFileSubmission[],
  attachments: ChatAttachment[],
): string {
  if (attachments.length === 0) return text;
  const labelsByFileName = new Map<string, string[]>();
  for (const submission of fileSubmissions) {
    for (const file of submission.files) {
      const labels = labelsByFileName.get(file.name) ?? [];
      labels.push(submission.questionLabel);
      labelsByFileName.set(file.name, labels);
    }
  }
  const lines = ["[uploaded design files]"];
  attachments.forEach((attachment, index) => {
    const labels = labelsByFileName.get(attachment.name) ?? [];
    const labelSuffix = labels.length > 0 ? ` (for: ${labels.join(", ")})` : "";
    lines.push(`- Uploaded file ${index + 1}: ${attachment.name} -> ${attachment.path}${labelSuffix}`);
  });
  return `${text}\n\n${lines.join("\n")}`;
}

function inlineQuestionFormDraftStorageKey(
  formKey: string | null,
): string | null {
  return formKey ? `${QUESTION_FORM_DRAFT_STORAGE_PREFIX}${formKey}` : null;
}

function readInlineQuestionFormDraft(
  formKey: string | null,
): Record<string, string | string[]> | undefined {
  const key = inlineQuestionFormDraftStorageKey(formKey);
  if (!key || typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const answers: Record<string, string | string[]> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        answers[id] = value;
      } else if (
        Array.isArray(value) &&
        value.every((item) => typeof item === "string")
      ) {
        answers[id] = value;
      }
    }
    return Object.keys(answers).length > 0 ? answers : undefined;
  } catch {
    return undefined;
  }
}

function writeInlineQuestionFormDraft(
  formKey: string | null,
  answers: Record<string, string | string[]>,
): void {
  const key = inlineQuestionFormDraftStorageKey(formKey);
  if (!key || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(answers));
  } catch {
    // Form input remains usable when browser storage is unavailable.
  }
}

function clearInlineQuestionFormDraft(formKey: string | null): void {
  const key = inlineQuestionFormDraftStorageKey(formKey);
  if (!key || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // The submitted answer message remains authoritative.
  }
}

function inlineQuestionFormSubmittedStorageKey(
  formKey: string | null,
): string | null {
  return formKey ? `${QUESTION_FORM_SUBMITTED_STORAGE_PREFIX}${formKey}` : null;
}

/**
 * One form occurrence answers exactly once.
 *
 * A submit lock that lives only in the mounted component is not a lock: every
 * remount — leaving and re-entering the project, a reload, a conversation
 * switch, a virtualized row recycling — rebuilds it as "never submitted" while
 * the first answer is still being persisted or is still parked in the busy
 * conversation's queue. The occurrence key (project + conversation + assistant
 * message + form id) is the identity the lock belongs to, so it is held here
 * instead of in the component, taken the moment the answer leaves the form,
 * and released only by an explicit submit failure or by the answer surfacing
 * in history.
 *
 * Because the submit that takes the lock can outlive the component that
 * started it, a release has to reach whichever form is mounted by the time it
 * lands — hence the listeners, without which an answer refused after the user
 * navigated away would leave the form locked with no way back.
 *
 * Session storage is what carries the lock, so it also survives a reload. When
 * a context denies storage (a private window, an embedded frame) the write
 * throws and the lock falls back to a page-lived set: without it every remount
 * there would read "never submitted" and hand those users the duplicate submit
 * back, which is the whole defect.
 */
const deniedStorageInlineQuestionFormSubmissions = new Set<string>();
const inlineQuestionFormSubmissionListeners = new Map<string, Set<() => void>>();

function readInlineQuestionFormSubmitted(formKey: string | null): boolean {
  const key = inlineQuestionFormSubmittedStorageKey(formKey);
  if (!key) return false;
  if (deniedStorageInlineQuestionFormSubmissions.has(key)) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function subscribeInlineQuestionFormSubmitted(
  formKey: string | null,
  listener: () => void,
): () => void {
  const key = inlineQuestionFormSubmittedStorageKey(formKey);
  if (!key) return () => {};
  const listeners = inlineQuestionFormSubmissionListeners.get(key) ?? new Set();
  listeners.add(listener);
  inlineQuestionFormSubmissionListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      inlineQuestionFormSubmissionListeners.delete(key);
    }
  };
}

function notifyInlineQuestionFormSubmitted(key: string): void {
  const listeners = inlineQuestionFormSubmissionListeners.get(key);
  if (!listeners) return;
  for (const listener of [...listeners]) listener();
}

function markInlineQuestionFormSubmitted(formKey: string | null): void {
  const key = inlineQuestionFormSubmittedStorageKey(formKey);
  if (!key) return;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Denied storage costs the lock its reload survival, not the lock.
      deniedStorageInlineQuestionFormSubmissions.add(key);
    }
  }
  notifyInlineQuestionFormSubmitted(key);
}

function clearInlineQuestionFormSubmitted(formKey: string | null): void {
  const key = inlineQuestionFormSubmittedStorageKey(formKey);
  if (!key) return;
  deniedStorageInlineQuestionFormSubmissions.delete(key);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // A stale stored lock only blocks re-answering one already-sent form,
      // and the denied-storage fallback has already released it.
    }
  }
  notifyInlineQuestionFormSubmitted(key);
}

function QuestionFormLoading() {
  return (
    <div className="question-form question-form-loading" aria-hidden data-testid="question-form-loading">
      <div className="question-form-head">
        <span className="question-form-icon">?</span>
        <div className="question-form-loading-lines">
          <span />
          <span />
        </div>
      </div>
      <div className="question-form-loading-body">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function visualStyleContextForProjectKind(
  projectKind: TrackingProjectKind | null,
): VisualStyleContext | undefined {
  if (projectKind === "slide_deck") return "deck";
  if (
    projectKind === "prototype" ||
    projectKind === "web_clone" ||
    projectKind === "wireframe" ||
    projectKind === "mobile" ||
    projectKind === "live_artifact" ||
    projectKind === "template" ||
    projectKind === "other"
  ) {
    // Generic/template projects share the same HTML product surface and
    // generation rules as prototypes. They must therefore receive the same
    // host-owned visual catalogue when an agent emits `direction-cards`.
    // Without this mapping, the protocol-valid options-only form renders no
    // cards because there is neither a catalogue context nor legacy `cards`
    // metadata in the model payload.
    return "prototype";
  }
  if (projectKind === "document") return "document";
  if (projectKind === "image") return "image";
  if (projectKind === "video" || projectKind === "hyperframes") return "video";
  return undefined;
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

/**
 * 推理段落的 markdown 形态(可展开、按 markdown 渲染、文件链接在应用内打开)。
 *
 * **当前没有消费方。** 原来留着是在等一条拍板:「壳内文字要不要按 markdown 渲染」。
 * **那条拍板已经来了**(用户 2026-09-03:「都要 markdown 啊」),`SayText` 与
 * `ThinkingMarkdown` 现在都走 `renderMarkdown`,链接也一起回来了 —— 所以这一份
 * 不再背着「唯一还有 markdown 能力的实现」这个职责。剩下的差异只有
 * `onLinkClick`(文件链接在应用内打开)壳内还没接。清理它是一次独立的收尾,
 * 要么把 `onLinkClick` 透给壳内两个渲染组件、要么连这份一起删,别再当作待拍板项挂着。
 */
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
    <div className="thinking-block" data-testid="thinking-block">
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
  const t = useT();
  const variant =
    label === "error" ? "error" : label === "warning" ? "warning" : undefined;
  const displayLabel =
    label === "context_compaction" ? t("assistant.statusCompactingContext") : label;
  return (
    <div
      className={`status-pill${variant ? ` is-${variant}` : ""}`}
      data-testid="status-pill"
      data-status={label}
    >
      <span className="status-label">{displayLabel}</span>
      {detail ? <span className="status-detail" data-testid="status-detail">{renderStatusDetail(detail)}</span> : null}
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

// Presentational in-flight code panel: a boxed header (spinner + shimmer
// title + optional meta) over a monospace body with a typing caret. Plain
// monospace on purpose — shiki highlighting is async and would thrash on
// every streamed delta; the finished, highlighted view is taken over by the
// normal card once the artifact completes. Only the streaming-artifact path
// (ProseBlock) uses it — a still-streaming tool call renders nothing (D3).
function StreamingCodeCard({
  icon,
  titleLabel,
  metaLabel,
  code,
}: {
  icon: IconName;
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
    <div className="op-card op-file live-code-box" data-testid="live-code-box">
      <div className="op-card-head live-code-head">
        <span className="op-status op-status-category op-status-running" aria-hidden>
          <Icon name={icon} size={14} />
        </span>
        <span className="op-title shimmer-text">{titleLabel}</span>
        {metaLabel ? <span className="op-meta">{metaLabel}</span> : null}
      </div>
      {code ? (
        <pre className="live-code-pre" ref={preRef}>
          <code>
            {code}
          </code>
        </pre>
      ) : null}
    </div>
  );
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
/**
 * 没有 `runStatus` 的历史消息:这一轮到底成没成,只能从事件里看。
 *
 * 判据原样来自老的执行记录卡(`TaskActivityCard` 的 `hasError`),搬过来是为了不把
 * 已经在线上的行为弄丢 —— 少了它,那些消息会顶着「已完成」,壳里却摆着一行红的失败调用。
 * 两种情况算失败:**有调用报错**,或者**这一轮连结束时间都没有、还挂着没回来的调用**。
 *
 * 新规格没给这条派生规则编决策号(壳的三态是按 run 状态定的),先按现状保留。
 */
function legacyTurnFailed(events: AgentEvent[], endedAt: number | undefined): boolean {
  const settled = new Set<string>();
  for (const event of events) {
    if (event.kind === "tool_result") settled.add(event.toolUseId);
  }
  return events.some((event) => {
    if (event.kind === "tool_result") return event.isError === true;
    if (event.kind !== "tool_use") return false;
    return endedAt === undefined && !settled.has(event.id);
  });
}

function stripTodoToolGroups(blocks: Block[]): Block[] {
  return blocks.filter(
    (block) =>
      block.kind !== "tool-group" ||
      !block.items.every((item) => isTodoWriteToolName(item.use.name)),
  );
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
        // Bare runtime lifecycle markers are transport telemetry, not
        // assistant content. Detail-bearing rows are product workflow badges
        // and must remain visible (for example plugin share/contribute).
        ((ev.label === "working" ||
          ev.label === "done" ||
          ev.label === "completed") &&
          !ev.detail?.trim()) ||
        ev.label === "requesting" ||
        ev.label === "thinking" ||
        ev.label === "empty_response" ||
        /*
         * `model` —— **AMR(ACP)独有**的一条运行时标记,不是助手内容。
         *
         * `apps/daemon/src/agent-protocol/acp/session.ts` 在 `session/new`、
         * `session/set_model` 完成、以及选型失败回落时各发一次
         * `{ label: 'model', model: <当前模型> }`;`providers/daemon.ts` 把
         * `model` 折进 `detail`。走 stdout 协议的 runtime(claude / codex /
         * opencode …)一条都不发,所以这一行只在 AMR 那一路冒出来。
         *
         * 它无条件戳在**一轮的最下面**,内容是模型 id —— 而模型身份输入区的
         * 模型芯片上已经写着了。用户 2026-08-27:「这个模型的标识可以去掉」。
         *
         * 只是不画:事件照发照存,daemon 的 `run-analytics-observability.ts`
         * 仍按 `label === 'model'` 归因,那一路不受影响。
        */
        ev.label === "model" ||
        // Vela emits OpenCode's compaction lifecycle as internal observability.
        // Older transcripts persisted it as a generic status before the ACP
        // adapter classified it as a diagnostic, so suppress that legacy label
        // during history replay as well as on the live path.
        ev.label === "opencode_compaction" ||
        // Codex versions before the normalized reconnect protocol persisted
        // every `Reconnecting... n/5 (...)` warning as assistant history.
        // New runs use the machine label and are dropped before persistence;
        // suppress both shapes so old conversations remain compatible.
        ev.label === "agent_reconnecting" ||
        /^Reconnecting\.\.\.\s+\d+\/\d+\b/u.test(ev.label) ||
        // Transient ACP tool-call markers (#4618). On the live SSE path the
        // daemon normalizes these to `running` (TRANSIENT_ACP_STATUS_LABELS in
        // providers/daemon.ts), which is already skipped above; the persisted-
        // events path does not normalize, so they arrive here as bare labels
        // with no tool name/input/output/detail and would otherwise render as
        // empty, expandable "tool ran but produced no output" status pills.
        ev.label === "tool_call" ||
        ev.label === "tool_call_update"
      )
        continue;
      const last = out[out.length - 1];
      if (last && last.kind === "status" && last.label === ev.label) {
        // Update detail to the latest value rather than skip. An agent can
        // emit the same label several times in one turn (a workflow badge
        // that re-reports progress, for instance); the badge UI must reflect
        // the most recent detail, not the first one, or a later, truer value
        // is silently replaced by the stale initial one.
        //
        // `label: 'model'` used to be the worked example here — it fires once
        // after `session/new` and again once model selection settles. It no
        // longer reaches this branch: it is skipped above as AMR transport
        // telemetry.
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

/**
 * 反馈原因面板(设计稿第 40 格)。
 *
 * 抽出来的原因:它原来长在 `AssistantFeedback` 里、由 `reasonRating` 这个 React state 驱动 ——
 * 只有**真的点一下**赞或踩才置上,静态渲染的镜像陈列页永远够不着它,
 * 于是那一格只能空着写「这一页够不着」。抽成组件之后它能被单独渲染、单独比对。
 * 行为(什么时候弹、提交去哪)仍然留在 `AssistantFeedback`。
 */
export function AssistantFeedbackReasons({
  rating,
  options,
  selected,
  onToggle,
  customReason,
  onCustomReasonChange,
  canSubmit,
  onSubmit,
  onCancel,
  panelRef,
  t,
}: {
  rating: 'positive' | 'negative';
  options: Array<{ code: string; label: string }>;
  selected: Set<string>;
  onToggle: (code: string) => void;
  customReason: string;
  onCustomReasonChange: (next: string) => void;
  canSubmit: boolean;
  onSubmit: () => void;
  /** 稿子第 40 格右下角那颗「取消」—— 收起面板,不提交 */
  onCancel?: () => void;
  panelRef?: React.Ref<HTMLDivElement>;
  /* `key: never` 是坏的:它的意思是「任何 key 都不能传」,写下的那天起这个 prop 就
     调不动。它没被发现,是因为唯一的外部调用点(镜像陈列页)也把自己的 `t` 断言成了
     `as never` —— 两个错误互相盖住,`tsc` 两边都不报。
     `Record<string, unknown>` 同理:比真实的 `Record<string, string | number>` 宽,
     宽出来的那部分是插不进文案的。
     现在和 `useI18n` / `SettingsDialog` / `DesignBrowserPanel` 用同一个签名。 */
  t: (key: keyof Dict, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div className="assistant-feedback-reasons" ref={panelRef}>
      <div className="assistant-feedback-reason-title">
        {t(
          (rating === "negative"
            ? "assistant.feedbackReasonTitleNegative"
            : "assistant.feedbackReasonTitle") as never,
        )}
      </div>
      <div className="assistant-feedback-reason-options">
        {options.map((option) => (
          /*
           * 稿子这一排是**胶囊**(`.chip.mod-sm`),不是「方框 + 文字」的复选框。
           * 换成 button + `aria-pressed` 而不是留着 `<input type=checkbox>` 藏起来:
           * 原生方框在这一排里是唯一有直角的东西,而且它自带的 12px 方块把每颗
           * 胶囊撑宽一截,整排的节奏和稿子对不上。多选语义由 `aria-pressed` 承担。
           */
          <button
            key={option.code}
            type="button"
            className="assistant-feedback-reason-option"
            aria-pressed={selected.has(option.code)}
            data-selected={selected.has(option.code) ? "true" : "false"}
            onClick={() => onToggle(option.code)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {/*
        补充框**常驻**,不再等「勾了『其他』才出」(稿子第 40 格里它一直在)。
        原来那条门的代价是:面板会在勾选「其他」的瞬间长高一截,把下面的按钮推走;
        而它本来就是可选项,躲起来并不会让人少填,只会让人以为没有这个入口。
      */}
      <textarea
        className="assistant-feedback-custom"
        value={customReason}
        placeholder={t("assistant.feedbackReasonPlaceholder" as never)}
        rows={1}
        onChange={(event) => onCustomReasonChange(event.target.value)}
      />
      <div className="assistant-feedback-actions">
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel" as never)}
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          className="assistant-feedback-submit"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          {t("assistant.feedbackReasonSubmit" as never)}
        </Button>
      </div>
    </div>
  );
}
