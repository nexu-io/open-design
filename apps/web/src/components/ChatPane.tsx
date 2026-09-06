import { QuoteBar } from './chat/QuoteBar';
import { shouldShowJumpToLatest } from '../runtime/chat/jump-to-latest';
import {
  distanceFromBottom,
  isAtBottom as isSampleAtBottom,
  nextFollowIntent,
  type FollowIntent,
  type ScrollSample,
} from '../runtime/chat/stick-to-bottom';
import {
  ANCHOR_TOP_PADDING,
  TAIL_SPACER_VISIBLE_BLANK_TRIGGER_PX,
  anchorReleasedByScroll,
  anchorScrollTop,
  anchorSpacerHeight,
  isNewTailUserTurn,
  nextCollapsingTailSpacerHeight,
  shouldStartCollapsingTailSpacer,
} from '../runtime/chat/anchor-to-top';
import { appendQuoteOutcome, type ChatQuote } from '../runtime/chat/quote-selection';
import {
  captureElementScrollAnchor,
  scrollTopForElementScrollAnchor,
} from '../runtime/chat/element-scroll-anchor';
import {
  captureVirtualScrollAnchor,
  scrollTopForVirtualScrollAnchor,
  type VirtualScrollAnchor,
} from '../runtime/chat/virtual-scroll-anchor';
import {
  Fragment,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { hasOdCard, OD_NEXT_STRATEGY_ID, type ProjectMediaTask } from '@open-design/contracts';
import { useAnalytics } from '../analytics/provider';
import { getResolvedDeviceId } from '../analytics/client';
import {
  trackChatPanelClick,
  trackMessageQueueClick,
  trackRunFailedToastSurfaceView,
  trackRunRecoveryActionClick,
  trackRunRecoveryActionSurfaceView,
} from '../analytics/events';
import {
  buildRecoveryTaskAnalytics,
  runAgentProviderId,
} from '../analytics/run-task';
import { amrHandoffDeviceId, attributedAmrUrl, recordAmrEntry } from '../analytics/amr-attribution';
import { useI18n, useT } from '../i18n';
import { startersForProduct, type ProductType } from '../onboarding/recommendation';
import { starterCopyFor } from '../onboarding/starter-copy';
import type { DesignToolboxActionId } from '../runtime/design-toolbox';
import { isRetryableAssistantTerminalFailure } from '../runtime/design-delivery';
import {
  formatAttachmentSize,
  formatMessageClock,
  middleTruncateFileName,
  splitFileName,
} from '../runtime/chat/attachment';
import {
  attachmentNavDelta,
  attachmentNavState,
  type AttachmentNavState,
} from '../runtime/chat/attachment-nav';
import type { Dict } from '../i18n/types';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { useLiquidGlass } from '../hooks/useLiquidGlass';
import { fetchProjectMediaTasks, projectRawUrl } from '../providers/registry';
import { appendResourceQuery } from '../collab/workspace-identity';
import { useProjectCollabContext } from '../collab/collab-context';
import { takeComposerSeedFor } from '../state/libraryHandoff';
import { splitOnQuestionForms } from '../artifacts/question-form';
import { stripArtifact } from '../artifacts/strip';
import type { TodoItem } from '../runtime/todos';
import type {
  AppliedPluginSnapshot,
  ChatSessionMode,
  RunContextSelection,
  WorkspaceContextItem,
} from '@open-design/contracts';
import type {
  TrackingProjectKind,
  TrackingRunRecoveryActionType,
} from '@open-design/contracts/analytics';
import { isDesignSystemWorkspacePrompt } from '../design-system-auto-prompt';
import {
  isTodoWriteToolName,
  previousTodosByAssistantMessageId,
  todosDeclaredByLatestTurn,
} from '../runtime/todos';
import type { AppConfig, ChatAttachment, ChatCommentAttachment, ChatMessage, ChatMessageFeedbackChange, Conversation, DesignSystemSummary, PreviewComment, Project, ProjectFile, ProjectMetadata, SkillSummary } from '../types';
import { agentDisplayName } from '../utils/agentLabels';
import { commentTargetDisplayName, commentsToAttachments, simplePositionLabel } from '../comments';
import { AssistantMessage, type QuestionFormSubmitHandler } from './AssistantMessage';
import { chatSeam } from './chat/ChatRoot';
import { PlanPill } from './chat/PlanPill';
import { planPillState } from '../runtime/chat/plan-pill';
import { Reconnect } from './chat/Reconnect';
import { UserStatusCard } from './chat/UserStatusCard';
import type { ChatReconnectView } from '../runtime/chat/reconnect-state';
import { TodoCard } from './ToolCard';
import type { BrandBrowserAssistConfirm } from './OdCard';
import {
  DESIGN_SYSTEM_NEXT_STEP_ACTIONS,
  type NextStepActionsVariant,
} from './NextStepActions';
import { AmrGuidance } from './AmrGuidance';
import { AmrLoginPill } from './AmrLoginPill';
import {
  AMR_LOGIN_STATUS_EVENT,
  amrLoginStatusEventReason,
  isAmrSessionAuthenticated,
} from './amrLoginPolling';
import {
  amrPlansUrlForProfile,
  amrRechargeUrlForProfile,
  daemonFailureVerdictFrom,
  failureCardHandedToAmrBalanceCard,
  formatModelWindowRetryAt,
  hasSelfContainedRecovery,
  isReconnectOwnedFailure,
  resolveRunFailureUi,
  RUN_FAILURE_FALLBACK_MESSAGE_KEY,
} from '../runtime/amr-guidance';
import {
  fetchVelaLoginStatus,
  type VelaLoginStatus,
} from '../providers/daemon';
import { RESUME_CONTINUE_PROMPT } from '../runtime/resume';
import {
  canConsumeAmrAuthRetryContinuation,
  type AmrAuthRetryContinuation,
  type AmrAuthRetryPersonalAdoptionWitness,
} from '../runtime/amr-auth-retry-continuation';
import {
  ChatComposer,
  type ChatComposerHandle,
  type ChatSendOutcome,
  type ChatSendMeta,
} from './ChatComposer';
import type { PendingUpload } from '../runtime/chat/staged-attachment';
import type { PlaceholderScenario } from './home-hero/placeholderScenarios';
import { listDesignArtifactCandidates } from './design-files/designArtifacts';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { Icon, type IconName } from './Icon';
import { ChatFileIcon, QueueTrashIcon } from './chat/primitives/icons';
import { UserActionCard, type UserActionCardTone } from './UserActionCard';
import {
  RunErrorCard,
  RunErrorCardAction,
  RunErrorCardActionGroup,
} from './chat/RunErrorCard';
import { UpgradeCard } from './chat/UpgradeCard';
import { SupportDialog } from './chat/SupportDialog';
import { Toast } from './Toast';
import { supportChannels } from './chat/support-channels';
import { ExportLogsAction } from './chat/ExportLogsAction';
import { repoConnectCopy } from './design-system-github-evidence';
import { isRenderableSketchJson, SketchPreview } from './SketchPreview';
import type { SettingsSection } from './SettingsDialog';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

// Featured starter prompts shown on the empty chat. Clicking one fills
// the composer (does not auto-send) so users can tweak before sending.
// Each prompt is intentionally dense — it should showcase ambitious
// layout, typographic, and information-design moves rather than a
// generic landing page.
//
// Starter sets are picked per project kind (and per video model) so a
// fresh seedance video, a hyperframes html-in-canvas video, an image
// project and an audio project each see relevant prompts instead of the
// generic starter set. The default (prototype/deck/template/other/
// live-artifact) set stays i18n-translated via existing chat.example*
// keys so the user-facing copy keeps its localizations. The new media
// sets are inline English literals — they are technical agent prompts
// that work well across locales without translation, and going through
// i18n for each of them would balloon every Dict entry by 12+ keys.
type StarterPrompt = {
  icon: string;
  title: string;
  // Empty for path-scoped onboarding starters, which have no category tag.
  tag: string;
  prompt: string;
};

const DEFAULT_STARTER_KEYS: Array<{
  icon: string;
  titleKey: keyof Dict;
  tagKey: keyof Dict;
  promptKey: keyof Dict;
}> = [
  {
    icon: '▤',
    titleKey: 'chat.example1Title',
    tagKey: 'chat.example1Tag',
    promptKey: 'chat.example1Prompt',
  },
  {
    icon: '▦',
    titleKey: 'chat.example2Title',
    tagKey: 'chat.example2Tag',
    promptKey: 'chat.example2Prompt',
  },
  {
    icon: '◈',
    titleKey: 'chat.example3Title',
    tagKey: 'chat.example3Tag',
    promptKey: 'chat.example3Prompt',
  },
  {
    icon: '▶',
    titleKey: 'chat.example4Title',
    tagKey: 'chat.example4Tag',
    promptKey: 'chat.example4Prompt',
  },
];

const IMPORTED_ARTIFACTS_INITIAL_VISIBLE_COUNT = 5;
const IMPORTED_ARTIFACTS_REVEAL_COUNT = 5;
const CHAT_RAIL_MIN_USER_MESSAGES = 2;
// Above this the rail becomes a compact rolling wheel with faded extremes;
// at or below it the full column shows with no mask occlusion.
const CHAT_RAIL_WHEEL_MIN_USER_MESSAGES = 40;
const CHAT_RAIL_HIGHLIGHT_MS = 1200;

// Dock-style proximity effect: every dash rests at the same base length;
// the hovered dash grows to the full module width and only its 4 neighbors
// on each side are pulled along, easing off with distance.
const CHAT_RAIL_DASH_BASE_PX = 8;
const CHAT_RAIL_DASH_HOVER_PX = 16;
const CHAT_RAIL_DASH_NEIGHBOR_SPAN = 4;

function chatRailDashWidth(distance: number): number {
  if (distance > CHAT_RAIL_DASH_NEIGHBOR_SPAN) return CHAT_RAIL_DASH_BASE_PX;
  const falloff = 1 - distance / (CHAT_RAIL_DASH_NEIGHBOR_SPAN + 1);
  return (
    CHAT_RAIL_DASH_BASE_PX +
    (CHAT_RAIL_DASH_HOVER_PX - CHAT_RAIL_DASH_BASE_PX) * falloff * falloff
  );
}

const IMAGE_STARTERS: StarterPrompt[] = [
  {
    icon: '◯',
    title: 'Editorial portrait',
    tag: 'Portrait',
    prompt:
      'A close-up editorial portrait of a young creative director in their late 20s, soft natural light through tall studio windows, warm neutral palette (cream, taupe, soft black), shot at 85mm f/1.8 with shallow depth of field, sharp gaze straight to camera, subtle film grain, no makeup look.',
  },
  {
    icon: '▭',
    title: 'Product hero',
    tag: 'E-commerce',
    prompt:
      'A premium product hero shot of a single matte ceramic coffee mug on a warm cream paper backdrop. Hard rim light from the upper-left, gentle elongated shadow stretching to the lower-right, faint steam rising from the cup. Square crop, centered composition, room above for headline copy, no props or hands in frame.',
  },
  {
    icon: '◐',
    title: 'Flat illustration',
    tag: 'Illustration',
    prompt:
      'A flat vector illustration of a cozy reading nook by a rainy window — geometric shapes, restrained 5-color palette (cream, terracotta, deep teal, burnt sienna, soft black), thin 1.5px line accents, no gradients, no textures, soft drop shadows only on the foreground armchair.',
  },
];

// Pure-video / cinematic-shot starters for seedance, sora, kling, veo,
// grok-imagine and similar text-to-video models. Each prompt is one
// shot, restrained motion, and a clear visual concept the model can
// nail in 5-10 seconds.
const VIDEO_SEEDANCE_STARTERS: StarterPrompt[] = [
  {
    icon: '◉',
    title: 'Product reveal',
    tag: 'Cinematic',
    prompt:
      'A 5-second product reveal: a minimal high-end skincare bottle on a clean cream stone surface, soft side light from camera-left, slow camera push-in, subtle depth-of-field shift from the cap to the label, restrained motion, no text overlays, no people in frame.',
  },
  {
    icon: '▣',
    title: 'Lantern close-up',
    tag: 'Mood',
    prompt:
      'A 6-second cinematic close-up of a young woman holding a glowing paper lantern in a misty pine forest at golden hour. Shallow depth of field on her eyes, gentle dolly-in, ambient particles drifting through the warm shaft of light, no dialogue, ambient forest sound only.',
  },
  {
    icon: '⌘',
    title: 'Neon street drift',
    tag: 'Action',
    prompt:
      'A 5-second street-racing tracking shot at night in a neon-lit cyberpunk Hong Kong alley. Low-angle camera following a matte-black sports car drifting around a tight corner, motion blur on the wheels, lens flares from oncoming neon signs, rain-slick asphalt reflecting the lights, no on-screen text.',
  },
];

// HyperFrames HTML-in-canvas starters — these target the
// hyperframes-html video model where the renderer captures live DOM
// into a WebGL texture and runs shader effects on top. References:
// https://www.remotion.dev/docs/html-in-canvas (concept), the seven
// vfx-* catalog blocks shipped via `npx hyperframes add vfx-*`, and
// skills/hyperframes/references/html-in-canvas.md.
const VIDEO_HYPERFRAMES_STARTERS: StarterPrompt[] = [
  {
    icon: '◉',
    title: 'Magnifying glass reveal',
    tag: 'HTML-in-canvas',
    prompt:
      'Make a 5-second composition with a single line of bold display text on a clean canvas. Animate a round magnifying glass that travels left to right across the line, with subtle glass refraction warping the letters underneath as it passes. Use HyperFrames html-in-canvas — capture the text DOM and run the lens shader on top via a vfx-liquid-glass-style pass. Pure CSS for the text; the glass is a WebGL layer.',
  },
  {
    icon: '▦',
    title: 'CRT terminal scene',
    tag: 'Vintage VFX',
    prompt:
      "Make a CRT-screen composition: dark canvas, monospace terminal text typing `npx hyperframes init my-video`, then `claude` invoked with the prompt 'Add a CRT effect using HTML-in-canvas'. Apply a subtle convex-curvature shader, scanlines, slight chromatic aberration, and a soft phosphor glow on top of the live DOM via html-in-canvas. The terminal text stays as real CSS so it's pixel-sharp before the shader pass.",
  },
  {
    icon: '◈',
    title: 'Glitch breakdown',
    tag: 'Glitch',
    prompt:
      'Build a 6-second composition that displays a hero headline and a one-line subhead on a dark canvas, then breaks into a hard digital glitch — RGB channel split, horizontal displacement bands, brief frame-stutter, and a final clean reset. Capture the live DOM via html-in-canvas and run the glitch pass on top, so the type is real CSS underneath the shader.',
  },
];

// Speech-focused audio starters — the New Project audio panel only
// surfaces the `speech` kind today (see MediaProjectOptions), so we
// match that. If/when the music + sfx tabs come back, broaden this set.
const AUDIO_STARTERS: StarterPrompt[] = [
  {
    icon: '♪',
    title: 'Brand voiceover',
    tag: 'Speech',
    prompt:
      "A 30-second warm-toned narrative voiceover for a product launch video — confident but conversational, mid-tempo, with a beat of pause after the brand name. Script: 'Three years in the making. One simple promise. Meet [product name] — the way work was supposed to feel.' English, neutral North American accent.",
  },
  {
    icon: '♫',
    title: 'Onboarding narration',
    tag: 'Speech',
    prompt:
      "A 20-second friendly onboarding narration for a mobile app's first-launch screen. Reassuring, smiling tone, slow enough to feel attentive without sounding scripted. Script: 'Welcome to Loop. Let's set up your space — three quick questions and you're in. You can change any of this later.'",
  },
  {
    icon: '♬',
    title: 'Story passage read',
    tag: 'Speech',
    prompt:
      "A 45-second cinematic read of an opening passage. Low, measured delivery with breath between sentences, slightly intimate close-mic'd quality. Script: 'The city sleeps in pieces. A neon sign flickers above the ramen counter. Across the avenue, a window glows — the only one still on this side of midnight.'",
  },
];

function pickStarters(
  metadata: ProjectMetadata | undefined,
  t: TranslateFn,
): StarterPrompt[] {
  const kind = metadata?.kind;
  if (kind === 'image') return IMAGE_STARTERS;
  if (kind === 'video') {
    return metadata?.videoModel === 'hyperframes-html'
      ? VIDEO_HYPERFRAMES_STARTERS
      : VIDEO_SEEDANCE_STARTERS;
  }
  if (kind === 'audio') return AUDIO_STARTERS;
  return DEFAULT_STARTER_KEYS.map((entry) => ({
    icon: entry.icon,
    title: t(entry.titleKey),
    tag: t(entry.tagKey),
    prompt: t(entry.promptKey),
  }));
}

function sortArtifactsByModified(files: ProjectFile[]): ProjectFile[] {
  return [...files].sort(
    (a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name),
  );
}

function ImportedFolderArtifacts({
  projectId,
  files,
  onOpenFile,
  t,
}: {
  projectId: string | null;
  files: ProjectFile[];
  onOpenFile?: (name: string) => void;
  t: TranslateFn;
}) {
  const [visibleCount, setVisibleCount] = useState(IMPORTED_ARTIFACTS_INITIAL_VISIBLE_COUNT);

  useEffect(() => {
    setVisibleCount(IMPORTED_ARTIFACTS_INITIAL_VISIBLE_COUNT);
  }, [files]);

  if (files.length === 0) {
    return (
      <div className="chat-design-artifacts-empty" data-testid="chat-design-artifacts-empty">
        {t('designFiles.empty')}
      </div>
    );
  }

  const visibleFiles = files.slice(0, visibleCount);
  const hiddenCount = Math.max(0, files.length - visibleFiles.length);
  const revealCount = Math.min(IMPORTED_ARTIFACTS_REVEAL_COUNT, hiddenCount);
  const revealLabel = t('chat.designArtifactsShowMore', { count: revealCount });

  return (
    <div className="chat-design-artifacts" data-testid="chat-design-artifacts">
      {visibleFiles.map((file, index) => {
        const openable = Boolean(onOpenFile);
        const openLabel = `${t('designFiles.previewOpen')} ${file.name}`;
        const openFile = () => {
          onOpenFile?.(file.name);
        };
        return (
          <div
            key={file.name}
            className="chat-design-artifact"
            data-kind={file.kind}
            data-file-name={file.name}
            data-testid={`chat-design-artifact-${index}`}
            role={openable ? 'button' : 'listitem'}
            tabIndex={openable ? 0 : undefined}
            title={openLabel}
            aria-label={openLabel}
            onDoubleClick={openable ? openFile : undefined}
            onKeyDown={
              openable
                ? (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openFile();
                  }
                : undefined
            }
          >
            <div className="chat-design-artifact-preview" aria-hidden>
              <ChatArtifactPreview projectId={projectId} file={file} />
            </div>
            <div className="chat-design-artifact-meta">
              <span className="chat-design-artifact-name" title={file.name}>
                {file.name}
              </span>
              <span className="chat-design-artifact-kind">
                {chatArtifactKindLabel(file.kind, t)}
              </span>
            </div>
          </div>
        );
      })}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="chat-design-artifact chat-design-artifact-more"
          data-testid="chat-design-artifacts-more"
          aria-label={revealLabel}
          title={revealLabel}
          onClick={() => {
            setVisibleCount((current) =>
              Math.min(files.length, current + IMPORTED_ARTIFACTS_REVEAL_COUNT),
            );
          }}
        >
          <span className="chat-design-artifact-more-icon" aria-hidden>
            +
          </span>
          <span className="chat-design-artifact-more-count">
            {revealLabel}
          </span>
        </button>
      ) : null}
    </div>
  );
}

function ChatArtifactPreview({
  projectId,
  file,
}: {
  projectId: string | null;
  file: ProjectFile;
}) {
  const { workspaceContext } = useProjectCollabContext();
  if (!projectId) {
    return <ChatArtifactFallback kind={file.kind} />;
  }

  const url = appendResourceQuery(
    projectRawUrl(projectId, file.name, workspaceContext),
    `v=${Math.round(file.mtime)}`,
  );
  if (isRenderableSketchJson(file)) {
    return (
      <SketchPreview
        projectId={projectId}
        file={file}
        workspaceContext={workspaceContext}
      />
    );
  }
  if (file.kind === 'image' || file.kind === 'sketch') {
    return <img src={url} alt="" loading="lazy" />;
  }
  if (file.kind === 'html') {
    return (
      <iframe
        title={file.name}
        src={url}
        sandbox="allow-scripts allow-downloads"
        loading="lazy"
      />
    );
  }
  if (file.kind === 'video') {
    return <video src={url} muted playsInline preload="metadata" />;
  }
  return <ChatArtifactFallback kind={file.kind} />;
}

function ChatArtifactFallback({ kind }: { kind: ProjectFile['kind'] }) {
  return (
    <span className="chat-design-artifact-fallback">
      <Icon name={chatArtifactIcon(kind)} size={28} />
      <span>{chatArtifactShortKind(kind)}</span>
    </span>
  );
}

function chatArtifactIcon(kind: ProjectFile['kind']): IconName {
  if (kind === 'html' || kind === 'code') return 'file-code';
  if (kind === 'image' || kind === 'sketch') return 'image';
  if (kind === 'video' || kind === 'audio') return 'play';
  if (kind === 'presentation') return 'present';
  return 'file';
}

function chatArtifactShortKind(kind: ProjectFile['kind']): string {
  if (kind === 'html') return 'HTML';
  if (kind === 'image') return 'IMG';
  if (kind === 'sketch') return 'SKETCH';
  if (kind === 'video') return 'VIDEO';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'presentation') return 'PPT';
  if (kind === 'document') return 'DOC';
  return 'FILE';
}

function chatArtifactKindLabel(kind: ProjectFile['kind'], t: TranslateFn): string {
  if (kind === 'html') return t('designFiles.kindHtml');
  if (kind === 'image') return t('designFiles.kindImage');
  if (kind === 'sketch') return t('designFiles.kindSketch');
  if (kind === 'video') return 'Video';
  if (kind === 'audio') return 'Audio';
  if (kind === 'pdf') return t('designFiles.kindPdf');
  if (kind === 'document') return t('designFiles.kindDocument');
  if (kind === 'presentation') return t('designFiles.kindPresentation');
  if (kind === 'spreadsheet') return t('designFiles.kindSpreadsheet');
  return t('designFiles.kindBinary');
}

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  loading?: boolean;
  error: string | null;
  // Identifies a pane-level error produced by an assistant run. This lets the
  // pane distinguish a stale run error from a later failure with identical
  // canonical text; non-run errors leave the source undefined.
  errorSourceAssistantId?: string | null;
  projectId: string | null;
  sessionMode?: ChatSessionMode;
  onSessionModeChange?: (mode: ChatSessionMode) => void;
  // Analytics-only — forwarded to AssistantMessage so the feedback
  // events know which project surface the rating applies to. Optional
  // (defaults to null/'prototype') so unit tests can mount ChatPane
  // without project context.
  projectKindForTracking?: TrackingProjectKind | null;
  projectFiles: ProjectFile[];
  activeProjectFileName?: string | null;
  hasActiveDesignSystem?: boolean;
  activeDesignSystem?: DesignSystemSummary | null;
  sendDisabled?: boolean;
  // Read-only viewer of a team-shared project. Beyond `sendDisabled` (which only
  // blocks the send action), this also disables the composer input itself and
  // hides the empty-state starter cards, since a member cannot start a
  // conversation on someone else's shared project.
  viewerOnly?: boolean;
  queuedItems?: QueuedSendItem[];
  onRemoveQueuedSend?: (id: string) => void;
  onUpdateQueuedSend?: (id: string, update: QueuedSendUpdate) => void;
  onReorderQueuedSends?: (orderedIds: string[]) => void;
  onSendQueuedNow?: (id: string) => void;
  /**
   * B11 「引导对话」: interrupt the turn that is still running and send this
   * queued item straight away (OPEND-2602). Supplied whenever the host has a
   * live run on this conversation — interrupting works on every agent, so this
   * is NOT gated on the agent's `promptInputFormat`. Absent means there is
   * nothing to interrupt, and the queue row falls back to `onSendQueuedNow`
   * under its own name.
   */
  onSteerQueuedSend?: (id: string) => void;
  /** Why steering is unavailable right now, shown on the fallback button. */
  steerBlockedReason?: string | null;
  // Names that exist in the project folder. Tool cards and chips use this
  // set to decide whether a path can be opened as a tab.
  projectFileNames?: Set<string>;
  // Daemon-resolved on-disk working directory of the current project —
  // positive-proof anchor for chat file-link routing (see AssistantMessage).
  projectResolvedDir?: string | null;
  onEnsureProject: () => Promise<string | null>;
  previewComments?: PreviewComment[];
  attachedComments?: PreviewComment[];
  onAttachComment?: (comment: PreviewComment) => void;
  onDetachComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
    meta?: ChatSendMeta,
  ) => ChatSendOutcome | Promise<ChatSendOutcome>;
  onRetry?: (
    assistantMessage: ChatMessage,
    recoveryActionType?: TrackingRunRecoveryActionType,
  ) => void;
  /** Retry a user message whose daemon run was never created. */
  onResendUserMessage?: (message: ChatMessage) => void;
  amrAuthRetryContinuation?: AmrAuthRetryContinuation | null;
  amrAuthRetryMountId?: string;
  amrAuthRetryWorkspaceIdentityKey?: string;
  amrAuthRetryPersonalAdoptionWitness?: AmrAuthRetryPersonalAdoptionWitness | null;
  onArmAmrAuthRetryContinuation?: (
    continuation: Omit<AmrAuthRetryContinuation, 'accountIdAtArm' | 'createdAtMs'>,
  ) => void;
  onConsumeAmrAuthRetryContinuation?: (
    continuation: AmrAuthRetryContinuation,
  ) => boolean;
  onDiscardAmrAuthRetryContinuation?: (
    continuation: AmrAuthRetryContinuation,
  ) => void;
  onResumeRun?: (assistantMessage: ChatMessage) => void;
  onStop: () => void;
  // Skills available for @-mention assembly. ProjectView filters out the
  // user's disabled set before passing them in here.
  skills?: SkillSummary[];
  // Click-to-open chain: passes a basename up to ProjectView, which sets
  // FileWorkspace's openRequest. Tool cards, attachment chips, and
  // produced-file chips all call this.
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginDetails?: (pluginId: string) => void;
  onRequestDesignSystemDetails?: (system: DesignSystemSummary) => void;
  onRequestPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string; url?: string } | void> | { message?: string; url?: string } | void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  // "Share to OpenDesign" button on each completed assistant message —
  // wired by ProjectView to handleSend with the bundled
  // `od-share-to-community` scenario's trigger prompt.
  onShareToOpenDesign?: (assistantMessageId: string) => void;
  shareToOpenDesignBusyMessageId?: string | null;
  forceStreamingMessageIds?: Set<string>;
  initialDraft?: string;
  // Product path of the Home recommendation that started this project. When
  // set (and concrete), the empty-conversation starter cards show that path's
  // starters — one-click composer replacements — instead of the generic set.
  onboardingStarterPath?: ProductType | null;
  composerPlaceholder?: string;
  onSubmitQuestionForm?: QuestionFormSubmitHandler;
  questionFormSubmitDisabled?: boolean;
  onContinueRemainingTasks?: (
    assistantMessage: ChatMessage,
    todos: TodoItem[],
  ) => boolean | void | Promise<boolean | void>;
  onAssistantFeedback?: (assistantMessage: ChatMessage, change: ChatMessageFeedbackChange) => void;
  // Client-side action for a brand-browser-assist od-card: open/focus the
  // Browser tab. Routed through the stable callbacks ref.
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
  // "Next step" affordance handlers forwarded to the last assistant message.
  // The featured design-toolbox rows are driven directly off the composer ref
  // owned here, so they need no handler from ProjectView (unlike onArtifactShare).
  /** `anchorId` 由产物卡那枚胶囊带上:菜单开在它旁边,而不是预览区右上角。 */
  onArtifactShare?: (fileName: string, anchorId?: string) => void;
  /** `anchorId` 同上。 */
  onArtifactDownload?: (fileName: string, anchorId?: string) => void;
  onForkFromMessage?: (assistantMessage: ChatMessage) => void;
  forkingMessageId?: string | null;
  // Header "+" button — kicks off ProjectView's create-conversation flow.
  onNewConversation?: () => void;
  newConversationDisabled?: boolean;
  // Conversation list that used to live in the topbar. The chat tab now
  // owns the list so users can browse + switch conversations without
  // leaving the pane.
  conversations: Conversation[];
  activeConversationId: string | null;
  // The conversation whose history the live `messages` array currently
  // reflects. Null while a switch is mid-flight (or after a load failure),
  // which is exactly when `messages.length` must NOT be trusted as the active
  // conversation's count — see `conversationMessageCount`. Callers that do not
  // track this (mounts whose loader resets/retags `messages` asynchronously)
  // leave it undefined and fall back to the persisted `conversation.messageCount`
  // for a stable list count.
  messagesConversationId?: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  // Composer settings/CLI button forwards to here. The dialog lives in App
  // (it owns the AppConfig lifecycle) so we just pass the open trigger.
  onOpenSettings?: (section?: SettingsSection) => void;
  /**
   * 〔更换模型〕—— 交付稿要的是「**直接打开模型选择器**,选完自动重跑」
   * (`error-ux-design.md:130`,S08)。宿主接上这个就走内联选择器;
   * 没接的宿主(首页那种没有内联列表的)回落到设置面板,总好过按了没反应。
   */
  onSwitchModel?: (assistantMessage: ChatMessage) => void;
  /**
   * 钱包余额提示(交付稿第 75 / 76 格的升级卡),`null` = 不提示。
   *
   * 单位美元,两档由余额自己决定:`> 0` 是「撑不完下一个任务」的暖橙档,
   * `= 0` 是「现在无法开始新任务」的红档。判定在 `runtime/amr-balance-gate.ts`,
   * 这里只负责**呈现** —— 卡在流水里,不挡发送(D4)。
   */
  amrBalanceCardUsd?: number | null;
  /**
   * **失败之后的那次钱包补查已经落地,而且没读出数字。**
   *
   * 只有跑到一半死在余额上那条路用得着它。那条失败自己**不带余额**,升级卡的
   * 数字要由 `ProjectView` 事后补查一次(`amrInsufficientBalanceFailureMessageId`)。
   * 补查落空时升级卡画不出来,而报错卡又已经把自己交给了升级卡 —— 两边都不画,
   * 用户在一轮「钱不够」之后屏幕上什么都不剩,没有充值入口也没有重试。
   *
   * 所以这一位说的是「接手方接不住」:置 true 时把白色报错卡还回来。
   * 补查**还没落地**时它是 false —— 那一格什么都不画,免得每次都先闪一下白卡
   * 再换成升级卡,把「一张卡」闪成两张。
   */
  amrBalanceCardUnavailable?: boolean;
  /**
   * 升级卡那颗按钮点下去做什么。给了就用它,没给就退回本组件自己的 plans 深链。
   *
   * 之所以由调用方给:**点了跳哪由身份 × 订阅决定**(规格 §6.V 的四组),而那份
   * 判据握在 ProjectView / EntryShell 手里 —— 它们才知道这一次要付钱的是哪个
   * 工作区、这个人有没有账单权限。聊天面板不该自己去猜。
   */
  onAmrBalanceUpgrade?: () => void;
  showByokRecoveryAction?: boolean;
  onSwitchToLocalCli?: () => void;
  onOpenAmrSettings?: () => void;
  onSwitchToAmrAndRetry?: (failedAssistant: ChatMessage) => void;
  // PR #3157: Antigravity's `agy -p` can't complete OAuth on its own,
  // so the auth banner offers a "Sign in via terminal" button that
  // POSTs to /api/agents/antigravity/oauth-launch. Handler resolves
  // after the daemon kicks off `osascript`/`x-terminal-emulator`/
  // `cmd /c start` so the UI can disable the button while in flight.
  onLaunchAntigravityOauth?: () => Promise<void>;
  // Same dialog, but landing on the External MCP tab. Forwarded to the
  // composer's `/mcp` slash and MCP picker button.
  onOpenMcpSettings?: () => void;
  // The composer "+" menu's "add plugin" / "add connector" rows route to the
  // home plugin-registry / connector-integration surfaces.
  onBrowsePlugins?: () => void;
  onOpenConnectors?: () => void;
  // True when this project is a GitHub-backed design system whose repository
  // evidence has not fully landed. Surfaces a "Connect your repo" CTA in the
  // empty chat state alongside the starter examples.
  connectRepoNeeded?: boolean;
  // Live GitHub connector status, used only to pick the connect-repo CTA copy
  // (connect vs re-import). Undefined until the status fetch resolves.
  githubConnected?: boolean;
  // Fires when the connect-repo CTA button is clicked. The parent decides what
  // it does based on connector status (open Connectors, or prefill the composer
  // with the import instruction).
  onConnectRepo?: () => void;
  // True once the deterministic brand extraction actually reached ready. Until
  // then the next-step card must stay on continue/recover actions even if the
  // latest assistant row is terminal.
  brandExtractionComplete?: boolean;
  // True for a programmatically-extracted brand project whose AI enrichment
  // never ran. The next-step card uses this to offer AI Optimize after the
  // extraction completion message.
  brandEnrichmentEligible?: boolean;
  // Runs the optional brand-enrichment turn. The parent sends the project's
  // seeded enrichment prompt with the default per-turn skill bundle.
  onContinueBrandEnrichment?: () => void;
  brandEnrichmentBusy?: boolean;
  // Runs or resumes the selected agent for an incomplete brand extraction
  // scaffold. Distinct from AI Optimize, which assumes a ready system exists.
  onContinueBrandAgentExtraction?: () => void;
  continueBrandAgentExtractionBusy?: boolean;
  // Restarts the deterministic programmatic pass for an incomplete brand
  // extraction without creating a duplicate design-system item.
  onContinueBrandExtraction?: () => void;
  continueBrandExtractionBusy?: boolean;
  // Creates a fresh design project using the current extracted design system.
  onCreateDesignFromActiveDesignSystem?: () => void;
  createDesignFromActiveDesignSystemBusy?: boolean;
  // Duplicates a regular project into a new design-system workspace and starts
  // the design-system generation pass from that copied evidence.
  onCreateDesignSystemFromProject?: () => void;
  createDesignSystemFromProjectBusy?: boolean;
  // Bumped by the parent to push a draft into the composer (used by the
  // "Import repo" CTA). The nonce lets the same text fire more than once.
  composerDraftSignal?: { text: string; nonce: number };
  // Optional pet wiring forwarded straight through to ChatComposer's
  // /pet button. When omitted the composer hides the button entirely.
  petConfig?: AppConfig['pet'];
  onAdoptPet?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  projectMetadata?: ProjectMetadata;
  // Authoritative post-patch project from the daemon — see ChatComposer's
  // prop of the same name for the recency invariant.
  onProjectMetadataChange?: (updated: Project) => void;
  activeWorkspaceContext?: WorkspaceContextItem | null;
  initialWorkspaceContexts?: WorkspaceContextItem[];
  workspaceContexts?: WorkspaceContextItem[];
  currentSkillId?: string | null;
  onProjectSkillChange?: (skillId: string | null) => void;
  researchAvailable?: boolean;
  // Immutable snapshot of the plugin pinned to this project. When set
  // we suppress the in-composer plugin rail (the user already picked a
  // plugin on Home) and render the active plugin as a context chip on
  // each user message — that satisfies §8 "show context inside the run
  // message" without forcing a separate side widget.
  activePluginSnapshot?: AppliedPluginSnapshot | null;
  // SenseAudio BYOK only — wired straight through to ChatComposer for the
  // in-composer image-model picker. Active protocol is read so the picker
  // hides when the user is on any other BYOK tab (azure / openai / …).
  byokApiProtocol?: AppConfig['apiProtocol'];
  byokImageModel?: string;
  onChangeByokImageModel?: (model: string) => void;
  byokVideoModel?: string;
  onChangeByokVideoModel?: (model: string) => void;
  byokSpeechModel?: string;
  onChangeByokSpeechModel?: (model: string) => void;
  byokSpeechVoice?: string;
  onChangeByokSpeechVoice?: (voice: string) => void;
  composerFooterAccessory?: ReactNode;
  // Slot rendered next to the composer's "+" menu (e.g. the working-dir pill).
  composerLeadingAccessory?: ReactNode;
  // Forwarded straight to the chat composer's mid-chat design-system
  // switcher. ProjectView owns the project record so the parent is the
  // natural place to mirror the patched project after a PATCH lands.
  currentDesignSystemId?: string | null;
  onActiveDesignSystemChange?: (project: Project) => void;
  onShowToast?: (message: string) => void;
  // Optional transient UI owned by the project shell. Rendering it inside the
  // scroll-area wrapper keeps it structurally above the variable-height
  // composer instead of guessing a bottom offset from outside ChatPane.
  chatLogTray?: ReactNode;
  /**
   * The Home-picked batch that is still uploading into this project.
   *
   * Pure pass-through to the composer's staged tray: these cards belong to the
   * hand-off, not to the composer, so the composer owns neither their bytes
   * nor their object URLs — it only draws them next to its own.
   */
  homeAttachmentUploads?: readonly PendingUpload[];
  onDismissHomeAttachmentUpload?: (cardId: string) => void;
  /**
   * 组件 22 · 重连(第 82–84 格)· S29。掉线期间流水的**最后一行**,`null` = 没掉线。
   *
   * 状态由 `runtime/chat/reconnect-state.ts` 推,信号来自传输层的 `onReconnect`;
   * 这里只负责把它画在该在的位置。恢复后调用方把这个 prop 置回 `null`,整行消失
   * ——设计稿明说不留「已恢复」。
   */
  reconnect?: ChatReconnectView | null;
  /**
   * 〔重新连接〕按下去做什么(22-3,预算用尽后那颗按钮)。
   *
   * 语义是**接回同一轮的流**(`?after=<lastEventId>` 续上),不是「重试」——
   * 重试会新建一轮,把已经跑出来的东西丢掉。不传就不出那颗按钮。
   */
  onManualReconnect?: () => void;
  // Project header slot. The former standalone chrome header row was removed;
  // its back button, project title (editable) and design-system picker moved
  // into the top of the chat pane. ProjectView owns the project record so it
  // renders these as slots rather than ChatPane re-deriving the data.
  onBack?: () => void;
  /** Collapse the conversation pane into workspace-focused mode (#5517's
   *  panel-left control). Takes precedence over onBack in the header. */
  onCollapse?: () => void;
  /** True when the collapse control renders OUTSIDE this pane (lifted into
   *  the tabs dock row) — suppresses the header's collapse/back slot. */
  collapseControlLifted?: boolean;
  backLabel?: string;
  projectHeader?: ReactNode;
  designSystemPicker?: ReactNode;
  config?: AppConfig;
}

const AMR_PROFILE_ENV_KEY = 'OPEN_DESIGN_AMR_PROFILE';

type Tab = 'chat' | 'comments';

const CHAT_MESSAGE_VIRTUALIZE_THRESHOLD = 80;
const CHAT_MESSAGE_OVERSCAN_PX = 900;
const CHAT_VIRTUAL_ROW_GAP_PX = 14;
const CHAT_VIRTUAL_MIN_ROW_HEIGHT = 36;
const CHAT_VIRTUAL_DEFAULT_VIEWPORT_PX = 640;
const CHAT_VIRTUAL_INITIAL_TAIL_ROWS = 16;
const CONVERSATION_ROW_HEIGHT_PX = 34;
const CONVERSATION_VIRTUALIZE_THRESHOLD = 36;
const CONVERSATION_OVERSCAN_ROWS = 8;

interface RunErrorDiagnosticInput {
  message: string;
  rawMessage?: string | null;
  errorCode?: string;
  /**
   * What the agent process actually printed before it died — already bounded
   * and secret-redacted by the daemon (`failureCardStderrTail`). This is the
   * "original error" the card's copy promises: for a whole family of failures
   * the daemon's own sentence is generic ("…exited without a terminal result")
   * and the real cause exists nowhere else the user can reach.
   */
  stderrTail?: string | null;
  traceId?: string;
  projectId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string;
  agentId?: string;
}

interface QueuedSendItem {
  id: string;
  prompt: string;
  attachments?: ChatAttachment[];
  commentAttachments?: ChatCommentAttachment[];
  meta?: ChatSendMeta;
}

interface QueuedSendUpdate {
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: ChatSendMeta;
}

/**
 * Fold an OD Next logical task into ONE conversation turn.
 *
 * A Full Plan turn runs as several physical Runs (request -> production). The
 * user asked once, and the daemon-issued continuation carries no prompt of its
 * own, so rendering each Run as its own message shows an answer nobody asked
 * for — with its own author line and its own "finished" affordances mid-turn.
 *
 * The daemon stays the single writer of one message per Run; only the view is
 * folded. Every continuation's content, events and produced files are appended
 * to the turn's first message in Run order, so nothing is dropped and nothing
 * is duplicated.
 */
export function foldStrategyTaskTurns(messages: ChatMessage[]): ChatMessage[] {
  if (!messages.some((message) => (message.strategyTaskRunIndex ?? 0) > 0)) {
    return messages;
  }
  const folded: ChatMessage[] = [];
  const turnHeadIndexByTask = new Map<string, number>();
  for (const message of messages) {
    const taskId = message.strategyTaskExecutionId;
    const runIndex = message.strategyTaskRunIndex ?? 0;
    if (message.role !== 'assistant' || !taskId) {
      folded.push(message);
      continue;
    }
    if (runIndex === 0 || !turnHeadIndexByTask.has(taskId)) {
      turnHeadIndexByTask.set(taskId, folded.length);
      folded.push(message);
      continue;
    }
    const headIndex = turnHeadIndexByTask.get(taskId)!;
    const head = folded[headIndex]!;
    const headContent = head.content ?? '';
    const tailContent = message.content ?? '';
    folded[headIndex] = {
      ...head,
      content: tailContent
        ? `${headContent}${headContent && !headContent.endsWith('\n') ? '\n\n' : ''}${tailContent}`
        : headContent,
      events: [...(head.events ?? []), ...(message.events ?? [])],
      producedFiles: [...(head.producedFiles ?? []), ...(message.producedFiles ?? [])],
      // The turn's status is the latest Run's: the earlier Runs finishing is an
      // internal step, not the turn ending.
      runId: message.runId ?? head.runId,
      runStatus: message.runStatus ?? head.runStatus,
      // Likewise the task verdict: only the final Run of the chain carries it,
      // and the folded turn is what the pinned todo card reads.
      ...(message.strategyTaskDelivered
        ? { strategyTaskDelivered: message.strategyTaskDelivered }
        : {}),
      ...(message.endedAt ? { endedAt: message.endedAt } : {}),
      ...(message.resultDeliveryState
        ? { resultDeliveryState: message.resultDeliveryState }
        : {}),
    };
  }
  return folded;
}

function shouldHideEmptyBrandAssistantMessage(message: ChatMessage, metadata?: ProjectMetadata): boolean {
  if (metadata?.importedFrom !== 'brand-extraction' && metadata?.kind !== 'brand') return false;
  if (message.role !== 'assistant') return false;
  if (brandAssistantTextHasVisibleContent(message.content)) return false;
  if ((message.events ?? []).some(hasVisibleBrandAssistantEvent)) return false;
  if ((message.producedFiles?.length ?? 0) > 0) return false;
  return Boolean(message.runStatus || message.endedAt);
}

function brandAssistantTextHasVisibleContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (hasOdCard(trimmed)) return true;
  const withoutArtifacts = stripArtifact(trimmed).trim();
  if (!withoutArtifacts) return false;
  return splitOnQuestionForms(withoutArtifacts).some((segment) => {
    if (segment.kind === 'form') return true;
    return segment.text.trim().length > 0;
  });
}

const HIDDEN_BRAND_ASSISTANT_STATUS_LABELS = new Set([
  'streaming',
  'starting',
  'running',
  'working',
  'requesting',
  'thinking',
  'empty_response',
  'done',
  'completed',
]);

function hasVisibleBrandAssistantEvent(event: NonNullable<ChatMessage['events']>[number]): boolean {
  switch (event.kind) {
    case 'text':
      return brandAssistantTextHasVisibleContent(event.text);
    case 'thinking':
      return event.text.trim().length > 0;
    case 'tool_use':
    case 'live_artifact':
    case 'live_artifact_refresh':
    case 'plugin_candidate':
      return true;
    case 'tool_result':
      return false;
    case 'raw':
      return false;
    case 'status':
      return !HIDDEN_BRAND_ASSISTANT_STATUS_LABELS.has(event.label);
    case 'usage':
    case 'diagnostic':
    case 'conversation_title':
    // Protocol metadata for this turn's done marker — never user-visible.
    case 'done_key':
    // The follow-up suggestions are an affordance under the answer, not
    // content of the answer — a turn that produced only these is still empty.
    case 'next_steps':
    // Same for the display intent: `<od-focus …/>` says which artifacts to
    // show and which file to open. It is a directive ABOUT the turn's output,
    // never output itself, so a turn carrying only this is still empty.
    case 'artifact_focus':
    // 推理 token 的读数是【那一行右边的一个数字】,不是回合的产出 —— 只带着它的
    // 一轮仍然是空的。和 `usage` 同理:它描述这一轮花了多少,不是这一轮说了什么。
    case 'thinking_tokens':
      return false;
  }
}

function mediaTaskRunKey(
  messages: ChatMessage[],
  includeLatestAssistantRun: boolean,
): string {
  const runIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.runId) continue;
    const hasMediaCall = (message.events ?? []).some((event) => {
      if (event.kind !== 'tool_use' || !event.input || typeof event.input !== 'object') return false;
      const command = (event.input as Record<string, unknown>).command;
      return typeof command === 'string' && /media\s+generate/.test(command) && !/--help\b/.test(command);
    });
    if (hasMediaCall) runIds.add(message.runId);
  }
  /*
   * ACP reports terminal-backed tool_use only after the command exits. While
   * an image call is still running, the run's media task is therefore the
   * first (and only) observable signal. Track the active streaming run even
   * before a media command appears so polling can discover that task.
   */
  if (includeLatestAssistantRun) {
    const latestRunId = latestAssistantRunId(messages);
    if (latestRunId) runIds.add(latestRunId);
  }
  return [...runIds].sort().join(',');
}

function sameMediaTasks(a: ProjectMediaTask[], b: ProjectMediaTask[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((task, index) => {
    const other = b[index];
    return other !== undefined
      && task.taskId === other.taskId
      && task.runId === other.runId
      && task.status === other.status
      && task.startedAt === other.startedAt
      && task.endedAt === other.endedAt
      && task.file?.name === other.file?.name
      && task.error?.code === other.error?.code
      && task.error?.message === other.error?.message;
  });
}

function latestAssistantRunId(messages: ChatMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant') return message.runId;
  }
  return undefined;
}

const TERMINAL_MEDIA_FILE_CONFIRMATION_INTERVAL_MS = 750;
const TERMINAL_MEDIA_FILE_CONFIRMATION_MAX_POLLS = 8;

/**
 * Creation order of a run's media tasks, which is the order their cells sit in.
 *
 * `startedAt` ties on every parallel fan-out, so sorting by it alone leaves the
 * order to whatever the transport happened to produce: a failed cell can drift
 * to a different slot between two polls, taking its retry coordinate with it.
 * `sequence` is the producer's own creation counter and settles those ties;
 * a producer that does not report one falls back to the timestamp.
 */
function byMediaTaskCreationOrder(a: ProjectMediaTask, b: ProjectMediaTask): number {
  if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
  if (typeof a.sequence === 'number' && typeof b.sequence === 'number') {
    return a.sequence - b.sequence;
  }
  return 0;
}

/**
 * 面板头那两枚字形。**路径逐字节取自稿子** `729fa43ce7` 的
 * `docs/design/chat-panel/src/body-scene.html:7-8`,不手抄、不换库。
 *
 * ## 为什么不走共享的 `<Icon name=…>`
 *
 * 稿子这两枚都是**描边**(`fill="none" stroke="currentColor"`,吃
 * `src/components.css:159` 的全局 `stroke-width: 1.75px` + round/round)。
 * 而 `components/Icon.tsx` 里凡是命中 `REMIX_ICON` 映射表的名字一律走**实心**
 * remix 路径 —— `history` / `plus` 两个名字都在表里,拿不到描边形。
 * 把名字从那张表里摘掉是**全站**行为(`arrow-up` 一个名字就有 6 处调用,
 * 其中两处在聊天面板之外),属于要单独拍板的改动;这里只把影响锁在面板头内,
 * 按仓库既有的做法(`ChatPane` 里的 `.msg-att-eye`、`RunErrorCard` 的
 * `AlertIcon`)直接内联稿子的路径。
 *
 * 1.75 是**用户单位**,跟着 viewBox 缩放 —— 与 `chat/primitives/icons.tsx` 的
 * `STROKE_ICON` 同一条约定,那里有完整推导。尺寸维持面板头现有的 16(稿子
 * `src/scene-shell.css:32` 是 15,但盒子也是 26 而不是产品的 28;
 * 那一组尺寸差不在本轮范围内)。
 */
const HEAD_GLYPH = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** 描边时钟 + 回退箭头(`src/body-scene.html:7`)—— 不是实心对话气泡 */
function ChatHistoryGlyph(): ReactElement {
  return (
    <svg {...HEAD_GLYPH}>
      <path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** 描边十字(`src/body-scene.html:8`)—— 一条 path 走两笔,和稿子同形 */
function NewSessionGlyph(): ReactElement {
  return (
    <svg {...HEAD_GLYPH}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ChatPane({
  messages,
  streaming,
  loading = false,
  sendDisabled = false,
  viewerOnly = false,
  queuedItems = [],
  error,
  errorSourceAssistantId,
  projectId,
  sessionMode = 'design',
  onSessionModeChange,
  projectKindForTracking = null,
  projectFiles,
  activeProjectFileName = null,
  hasActiveDesignSystem = false,
  activeDesignSystem = null,
  projectFileNames,
  projectResolvedDir,
  onEnsureProject,
  previewComments = [],
  attachedComments = [],
  onAttachComment,
  onDetachComment,
  onDeleteComment,
  onSend,
  onRetry,
  onResendUserMessage,
  amrAuthRetryContinuation = null,
  amrAuthRetryMountId,
  amrAuthRetryWorkspaceIdentityKey,
  amrAuthRetryPersonalAdoptionWitness = null,
  onArmAmrAuthRetryContinuation,
  onConsumeAmrAuthRetryContinuation,
  onDiscardAmrAuthRetryContinuation,
  onResumeRun,
  onStop,
  onRemoveQueuedSend,
  onUpdateQueuedSend,
  onReorderQueuedSends,
  onSendQueuedNow,
  onSteerQueuedSend,
  steerBlockedReason,
  onRequestOpenFile,
  onRequestPluginDetails,
  onRequestDesignSystemDetails,
  onRequestPluginFolderAgentAction,
  activePluginActionPaths,
  hiddenPluginActionPaths,
  onShareToOpenDesign,
  shareToOpenDesignBusyMessageId,
  forceStreamingMessageIds,
  initialDraft,
  onboardingStarterPath = null,
  composerPlaceholder,
  onSubmitQuestionForm,
  questionFormSubmitDisabled = false,
  onContinueRemainingTasks,
  onAssistantFeedback,
  onBrandBrowserAssistConfirm,
  onArtifactShare,
  onArtifactDownload,
  onForkFromMessage,
  forkingMessageId = null,
  onNewConversation,
  newConversationDisabled = false,
  conversations,
  activeConversationId,
  messagesConversationId = null,
  onSelectConversation,
  onDeleteConversation,
  onOpenSettings,
  onSwitchModel,
  amrBalanceCardUsd = null,
  amrBalanceCardUnavailable = false,
  onAmrBalanceUpgrade,
  showByokRecoveryAction = false,
  onSwitchToLocalCli,
  onOpenAmrSettings,
  onSwitchToAmrAndRetry,
  onLaunchAntigravityOauth,
  onOpenMcpSettings,
  onBrowsePlugins,
  onOpenConnectors,
  connectRepoNeeded,
  githubConnected,
  onConnectRepo,
  brandExtractionComplete = false,
  brandEnrichmentEligible,
  onContinueBrandEnrichment,
  brandEnrichmentBusy,
  onContinueBrandAgentExtraction,
  continueBrandAgentExtractionBusy,
  onContinueBrandExtraction,
  continueBrandExtractionBusy,
  onCreateDesignFromActiveDesignSystem,
  createDesignFromActiveDesignSystemBusy,
  onCreateDesignSystemFromProject,
  createDesignSystemFromProjectBusy,
  composerDraftSignal,
  petConfig,
  onAdoptPet,
  onTogglePet,
  onOpenPetSettings,
  projectMetadata,
  onProjectMetadataChange,
  activeWorkspaceContext,
  initialWorkspaceContexts = [],
  workspaceContexts = [],
  currentSkillId = null,
  onProjectSkillChange,
  researchAvailable,
  activePluginSnapshot,
  skills = [],
  byokApiProtocol,
  byokImageModel,
  onChangeByokImageModel,
  byokVideoModel,
  onChangeByokVideoModel,
  byokSpeechModel,
  onChangeByokSpeechModel,
  byokSpeechVoice,
  onChangeByokSpeechVoice,
  composerLeadingAccessory,
  composerFooterAccessory,
  currentDesignSystemId,
  onActiveDesignSystemChange,
  onShowToast,
  chatLogTray,
  homeAttachmentUploads,
  onDismissHomeAttachmentUpload,
  reconnect = null,
  onManualReconnect,
  onBack,
  onCollapse,
  collapseControlLifted,
  backLabel,
  projectHeader,
  designSystemPicker,
  config,
}: Props) {
  const { workspaceContext } = useProjectCollabContext();
  const { t, locale } = useI18n();
  const analytics = useAnalytics();
  const displayMessages = useMemo(
    () => foldStrategyTaskTurns(
      messages.filter((message) => !shouldHideEmptyBrandAssistantMessage(message, projectMetadata)),
    ),
    [messages, projectMetadata],
  );
  /**
   * 转录**画得出来**的那一份 —— 正文、右侧导轨、钉顶三处共用这一个数组。
   *
   * 算一次往下发,而不是各自调一次 `buildChatRenderItems`:后者仍然是三份实现,
   * 只是此刻长得一样。见 `buildChatRenderItems` 的注释。
   */
  const chatRenderItems = useMemo(() => buildChatRenderItems(displayMessages), [displayMessages]);
  const trackedMediaRunKey = useMemo(
    () => mediaTaskRunKey(displayMessages, streaming),
    [displayMessages, streaming],
  );
  const liveMediaRun = useMemo(() => {
    if (!streaming || !trackedMediaRunKey) return false;
    const runId = latestAssistantRunId(displayMessages);
    return Boolean(runId && trackedMediaRunKey.split(',').includes(runId));
  }, [displayMessages, streaming, trackedMediaRunKey]);
  const [projectMediaTasks, setProjectMediaTasks] = useState<ProjectMediaTask[]>([]);
  /*
   * Runs whose media work this pane actually watched happen. Only those have a
   * settling window worth re-reading: a run replayed from history stopped
   * writing files long ago, and re-polling it would spend a burst of requests
   * on every conversation open to prove something that cannot have changed.
   */
  const watchedLiveMediaRunsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!projectId || !trackedMediaRunKey) {
      setProjectMediaTasks([]);
      return;
    }
    const trackedRunIds = new Set(trackedMediaRunKey.split(','));
    let canceled = false;
    let timer: number | undefined;
    let terminalConfirmationPolls = 0;
    const refresh = async (): Promise<void> => {
      try {
        const response = await fetchProjectMediaTasks(projectId, workspaceContext);
        if (canceled) return;
        const relevant = response.tasks
          .filter((task) => task.surface === 'image' && task.runId && trackedRunIds.has(task.runId))
          .sort(byMediaTaskCreationOrder);
        setProjectMediaTasks((current) => sameMediaTasks(current, relevant) ? current : relevant);
        let hasActiveTask = false;
        for (const task of relevant) {
          if (task.status !== 'queued' && task.status !== 'running') continue;
          hasActiveTask = true;
          if (task.runId) watchedLiveMediaRunsRef.current.add(task.runId);
        }
        /*
         * A completed image's registered path stays provisional for a moment
         * after its run reports terminal: the agent's last normalize/move is an
         * ordinary file write the run status does not wait for. So for a run we
         * watched generate, keep asking the daemon to re-resolve its finished
         * images for a bounded window even after it answered with a path — that
         * first answer can be the pre-rename one, and the card would then
         * request a 404 forever.
         *
         * This reconciles a task's *path* only. Which version of a same-named
         * file a historical card shows is a separate design
         * (specs/current/chat-artifact-versioning-design.md), so a task whose
         * name is unchanged reconciles to itself and nothing re-renders.
         */
        const needsTerminalFileConfirmation = relevant.some((task) => (
          task.status === 'done'
          && (
            !task.file?.name?.trim()
            || (!!task.runId && watchedLiveMediaRunsRef.current.has(task.runId))
          )
        ));
        if (liveMediaRun || hasActiveTask) {
          timer = window.setTimeout(() => void refresh(), 750);
        } else if (
          needsTerminalFileConfirmation
          && terminalConfirmationPolls < TERMINAL_MEDIA_FILE_CONFIRMATION_MAX_POLLS
        ) {
          terminalConfirmationPolls += 1;
          timer = window.setTimeout(
            () => void refresh(),
            TERMINAL_MEDIA_FILE_CONFIRMATION_INTERVAL_MS,
          );
        }
      } catch {
        if (canceled) return;
        if (liveMediaRun) {
          timer = window.setTimeout(() => void refresh(), 1500);
        } else if (terminalConfirmationPolls < TERMINAL_MEDIA_FILE_CONFIRMATION_MAX_POLLS) {
          terminalConfirmationPolls += 1;
          timer = window.setTimeout(
            () => void refresh(),
            TERMINAL_MEDIA_FILE_CONFIRMATION_INTERVAL_MS,
          );
        }
      }
    };
    void refresh();
    return () => {
      canceled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [liveMediaRun, projectId, trackedMediaRunKey, workspaceContext]);
  const mediaTasksByRunId = useMemo(() => {
    const grouped = new Map<string, ProjectMediaTask[]>();
    for (const task of projectMediaTasks) {
      if (!task.runId) continue;
      const tasks = grouped.get(task.runId) ?? [];
      tasks.push(task);
      grouped.set(task.runId, tasks);
    }
    return grouped;
  }, [projectMediaTasks]);
  const amrProfile = config?.agentCliEnv?.amr?.[AMR_PROFILE_ENV_KEY] ?? null;
  const [inlineAmrLoginStatus, setInlineAmrLoginStatus] =
    useState<VelaLoginStatus | null>(null);
  const amrAuthRetrySignedOutWitnessRef =
    useRef<AmrAuthRetryContinuation | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const chatLogScrollIdleTimerRef = useRef<number | null>(null);
  const historyWrapRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const composerSlotRef = useRef<HTMLDivElement | null>(null);
  const composerLayerRef = useRef<HTMLDivElement | null>(null);
  const queuedSendStripRef = useRef<HTMLDivElement | null>(null);
  const didInitialScrollRef = useRef(false);
  const runFailedToastSurfaceKeysRef = useRef<Set<string>>(new Set());
  const runRecoverySurfaceKeysRef = useRef<Set<string>>(new Set());
  /*
   * 「还跟着最新输出吗」的**意图**,以及上一次已知的滚动几何(判方向要用)。
   * 规则全在 `runtime/chat/stick-to-bottom.ts`,那里也写了为什么不能像以前那样
   * 从 `distance < 80` 反推 —— 反推会在流式输出下锁死,用户就滚不上去了。
   *
   * 这两个都是 ref:它们每帧都可能被读写,进 state 会把整个面板重渲一遍
   * (`use-stick-to-bottom` 抱怨最多的 issue #14 就是这个)。给屏幕看的那一个
   * 布尔量(浮标显不显示)才是 state。
   */
  const followIntentRef = useRef<FollowIntent>({ following: true, escaped: false });
  // A live DOM selection is a transient pause layered over the user's durable
  // follow intent. Keeping these separate lets clearing the selection resume a
  // previously-following stream without overriding a genuine manual scroll.
  const selectionFollowPausedRef = useRef(false);
  const lastScrollSampleRef = useRef<ScrollSample>({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
  });
  const scrolledToFormRef = useRef<Set<string>>(new Set());
  const refreshInlineAmrLoginStatus = useCallback(async (options: { refresh?: boolean } = {}) => {
    const next = await fetchVelaLoginStatus(options).catch(() => null);
    if (next) setInlineAmrLoginStatus(next);
    return next;
  }, []);

  useEffect(() => {
    void refreshInlineAmrLoginStatus();
    const onAmrLoginStatusChange = (event: Event) => {
      const reason = amrLoginStatusEventReason(event);
      if (reason === 'login-canceled') return;
      void refreshInlineAmrLoginStatus();
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onAmrLoginStatusChange);
    return () => {
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onAmrLoginStatusChange);
    };
  }, [refreshInlineAmrLoginStatus]);

  useEffect(() => {
    const refreshAfterExternalAmrReturn = () => {
      if (document.visibilityState === 'hidden') return;
      void refreshInlineAmrLoginStatus({ refresh: true });
    };
    window.addEventListener('focus', refreshAfterExternalAmrReturn);
    document.addEventListener('visibilitychange', refreshAfterExternalAmrReturn);
    return () => {
      window.removeEventListener('focus', refreshAfterExternalAmrReturn);
      document.removeEventListener('visibilitychange', refreshAfterExternalAmrReturn);
    };
  }, [refreshInlineAmrLoginStatus]);

  /*
   * "Anchor the just-sent turn to the top" (ChatGPT-style):新发出的那条用户消息
   * 钉到视口顶端,回复在它下面长,而不是跟着底部跑。尾部占位块撑出刚好够用的
   * 真实可滚空白,让短回复(甚至还没有回复)时这条消息物理上也够得着顶端;
   * 占位块只在消息还钉在原位时收缩,用户一旦自己滚开,预留的空白就原地不动。
   *
   * **该不该钉,只看「尾条用户消息换人了没有」**(`isNewTailUserTurn`)。
   * 老写法要每个发送入口自己举手(一个 `pending` 标志),而举手的只有输入框 ——
   * question-form 交答案、首页发起、批注、队列排到、失败后的「继续」、生图重试
   * 全都不走输入框,于是它们发出来的那一轮一条都钉不了顶。少一份状态,也就少一处
   * 「新入口忘了接」。
   *
   * `undefined` = 这条会话还没落定过(初次装载 / 刚切会话),那一拍不钉:
   * 整篇转录一次性到齐不是新发了一轮。
   */
  const settledTailUserIdRef = useRef<string | null | undefined>(undefined);
  const anchorActiveRef = useRef(false);
  const tailSpacerRef = useRef<HTMLDivElement | null>(null);
  /*
   * 松手之后那块预留空白正在收 —— 见 `stepTailSpacerCollapse`。
   *
   * 这是方案 B 换来的那一份额外状态,而它换回来的是**边界不抖**:
   * 「够不够收」这个问题一块空白只问一次,问过之后就闩上一路收到位。
   * 每帧重问的话,门槛附近手抖一下,答案就跟着手来回翻。
   */
  const tailSpacerCollapsingRef = useRef(false);
  /*
   * 「几何变了,去重算一次」的入口。它归下面那个 Resize/Mutation observer 的
   * effect 所有(帧的取消也写在那条 effect 的清理里),而 scroll 监听在**另一条**
   * effect 上,拿不到那个闭包。用 ref 转一手,而不是把两条 effect 并成一条 ——
   * 它们的依赖和生命周期本来就不一样。effect 不在时这里是空操作。
   */
  const scheduleFollowSyncRef = useRef<() => void>(() => {});
  const chatRailHighlightTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [chatRailHighlightedMessageId, setChatRailHighlightedMessageId] =
    useState<string | null>(null);
  const prevStreamingRef = useRef(streaming);
  // AssistantMessage's interaction callbacks are re-created per render and
  // excluded from its memo comparison (so streaming doesn't re-render every
  // message). Route them through this ref so a memoized message still calls the
  // LATEST handler. See areAssistantMessagePropsEqual in AssistantMessage.tsx.
  const assistantCallbacksRef = useRef<AssistantCallbacks>({
    onSubmitQuestionForm,
    onContinueRemainingTasks,
    onAssistantFeedback,
    onBrandBrowserAssistConfirm,
    onArtifactShare,
    onForkFromMessage,
    onShareToOpenDesign,
    onNextStepAiOptimize: onContinueBrandEnrichment,
    onNextStepContinueExtraction: onContinueBrandExtraction,
    onNextStepContinueAiExtraction: onContinueBrandAgentExtraction,
    onNextStepCreateDesign: onCreateDesignFromActiveDesignSystem,
    onNextStepCreateDesignSystem: onCreateDesignSystemFromProject,
  });
  assistantCallbacksRef.current = {
    onSubmitQuestionForm,
    onContinueRemainingTasks,
    onAssistantFeedback,
    onBrandBrowserAssistConfirm,
    onArtifactShare,
    onForkFromMessage,
    onShareToOpenDesign,
    onNextStepAiOptimize: onContinueBrandEnrichment,
    onNextStepContinueExtraction: onContinueBrandExtraction,
    onNextStepContinueAiExtraction: onContinueBrandAgentExtraction,
    onNextStepCreateDesign: onCreateDesignFromActiveDesignSystem,
    onNextStepCreateDesignSystem: onCreateDesignSystemFromProject,
  };
  // Featured design-toolbox follow-up rows on the assistant "next step" card.
  // The toolbox left the "+" menu, so these route straight into the composer
  // we own here: seeding an action's prompt+skill, or opening the full panel.
  // Both stay stable (composer ref + no deps) so AssistantMessage stays memoized.
  const handleToolboxAction = useCallback((id: DesignToolboxActionId) => {
    composerRef.current?.applyDesignToolboxAction(id);
  }, []);
  const handleNextStepPromptAction = useCallback((
    prompt: string,
    options?: { sessionMode?: ChatSessionMode },
  ) => {
    if (options?.sessionMode && options.sessionMode !== sessionMode) {
      onSessionModeChange?.(options.sessionMode);
    }
    composerRef.current?.setDraft(prompt, {
      entryFrom: 'next_step',
      sessionMode: options?.sessionMode,
    });
  }, [onSessionModeChange, sessionMode]);

  /**
   * 下一步建议只是可编辑的起草入口。它与其他 next-step prompt
   * 共用 Composer 的 `setDraft` 路径,保留 `entryFrom` 归因;只有用户
   * 显式点击发送才会调用 `onSend`、持久化消息并创建 run。
   */
  const handleNextStepSuggestion = useCallback(
    (text: string) => {
      const prompt = text.trim();
      if (!prompt) return;
      composerRef.current?.setDraft(prompt, { entryFrom: 'next_step' });
    },
    [],
  );

  const handleChatRailNavigate = useCallback(
    (message: ChatMessage, messageIndex: number) => {
      const log = logRef.current;
      if (!log) return;
      releaseFollow();
      anchorActiveRef.current = false;
      scrollChatLogToMessage(log, displayMessages, message.id, messageIndex);
      // 浮标由几何说了算,不在这里硬点亮:这次跳转可能落在一条**已经在底部**的
      // 消息上(短会话里点最后一条),那时底下没有可回的东西。
      syncFollowState();
      setChatRailHighlightedMessageId(message.id);
      if (chatRailHighlightTimerRef.current) {
        clearTimeout(chatRailHighlightTimerRef.current);
      }
      chatRailHighlightTimerRef.current = setTimeout(() => {
        setChatRailHighlightedMessageId((current) =>
          current === message.id ? null : current,
        );
        chatRailHighlightTimerRef.current = undefined;
      }, CHAT_RAIL_HIGHLIGHT_MS);
    },
    [displayMessages],
  );

  useEffect(() => {
    return () => {
      if (chatRailHighlightTimerRef.current) {
        clearTimeout(chatRailHighlightTimerRef.current);
      }
    };
  }, []);
  const handlePickSkill = useCallback((skillId: string) => {
    composerRef.current?.applyDesignToolboxSkill(skillId);
  }, []);
  /**
   * 生图失败格的「重试」(设计稿组件 12 · 第 11 格)。
   *
   * 事件流里既没有「重发第 N 张」这条动作,也没有「哪一张砸了」的顺序信息 ——
   * 拿得到的只有「这一行一共几张、成了几张、砸了几张」。所以重试走**正常的发送路径**:
   * 组一句人话交给 agent(它知道刚才在生成什么),而不是伪造一条工具调用。
   * 这是今天能真正接上的做法;等 daemon 补了逐张重发的动作再换成直连(规格 D59)。
   */
  /**
   * 正文取词(设计稿组件 23)。在助手正文里选中一段话 → 浮条 →「添加到对话」→
   * 输入框上方多一枚芯片。发送时把这几段话作为**引文前缀**带给 agent。
   */
  const [quotes, setQuotes] = useState<ChatQuote[]>([]);
  /**
   * quote 列表的**同步镜像**。
   *
   * 去重的判定要在**同一拍**里拿到结果(重复了就得当场弹提示),而 `setQuotes` 的
   * updater 拿不到这个结果 —— 它是渲染期跑的纯函数,StrictMode 下会跑两遍,
   * 把提示写进去等于一次点击弹两次。所以判定在事件处理里对着这份镜像做,
   * updater 那一步只负责把算好的列表放进 state。
   *
   * 镜像在每次渲染时对齐一次:`onRestoreQuotes`(取回队列里那条的引用)也走
   * `setQuotes`,不在这里对齐的话镜像会漏掉那一路。
   */
  const quotesRef = useRef<ChatQuote[]>(quotes);
  quotesRef.current = quotes;
  /**
   * 重复取词的轻提示(OPEND-2546)。
   *
   * `key` 是**单调计数**而不是时间戳:同一毫秒里连点两次时时间戳会撞上,
   * React 认得是同一个 Toast 就不重挂,提示的存活窗口还挂在第一次那一条计时器上
   * —— 用户看到的是「刚弹出来就没了」。计数不依赖时钟,连点多少次都各算各的。
   */
  const quoteNoticeSeqRef = useRef(0);
  const [quoteNotice, setQuoteNotice] = useState<{ key: number; message: string } | null>(null);
  const handleQuote = useCallback((text: string, messageId: string | null) => {
    const current = quotesRef.current;
    const outcome = appendQuoteOutcome(current, {
      id: `${Date.now()}-${current.length}`,
      text,
      messageId: messageId ?? '',
    });
    quotesRef.current = outcome.quotes;
    setQuotes(outcome.quotes);
    if (outcome.status === 'duplicate') {
      quoteNoticeSeqRef.current += 1;
      setQuoteNotice({ key: quoteNoticeSeqRef.current, message: t('chat.quote.duplicate') });
    } else {
      // 新的一段确实进去了,上一句「已添加过」就不该再挂着 —— 它说的是上一下的事。
      setQuoteNotice(null);
    }
    // 收掉选区,浮条跟着消失 —— 不然它会一直浮在那儿
    window.getSelection()?.removeAllRanges();
  }, [t]);
  const clearQuotes = useCallback(() => {
    quotesRef.current = [];
    setQuotes([]);
  }, []);

  const handleRetryImage = useCallback((row: { total: number; done: number; failed: number }, index: number) => {
    // The media-task row now preserves actual task order. Keep the localized
    // retry sentence, and append the universal slot coordinate so the agent
    // retries only the clicked output when more than one cell failed.
    const prompt = `${t('chat.record.retryImage', { count: 1 })} (${index + 1}/${row.total})`;
    void onSend(prompt, [], []);
  }, [onSend, t]);
  const latestAssistantForBrandState = useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i -= 1) {
      const message = displayMessages[i]!;
      if (message.role === 'assistant') return message;
    }
    return null;
  }, [displayMessages]);
  const nextStepVariant: NextStepActionsVariant = sessionMode === 'plan'
    ? 'plan'
    : isDesignSystemNextStepProject(projectMetadata)
      ? isBrandExtractionNextStepProject(projectMetadata)
        ? brandExtractionComplete
          ? 'brand-extraction'
          : !latestAssistantForBrandState || isProgrammaticBrandAssistantMessage(latestAssistantForBrandState)
            ? 'brand-programmatic-incomplete'
            : 'brand-ai-incomplete'
        : 'design-system'
      : 'default';
  const blankProjectComposerScenarios = useMemo<PlaceholderScenario[]>(
    () => pickStarters(projectMetadata, t).map((starter, index) => ({
      id: `blank-${projectMetadata?.kind ?? 'prototype'}-${index}`,
      text: starter.prompt,
      chipId: 'project',
    })),
    [projectMetadata, t],
  );
  const followUpComposerScenarios = useMemo<PlaceholderScenario[]>(() => {
    if (nextStepVariant === 'design-system') {
      return DESIGN_SYSTEM_NEXT_STEP_ACTIONS.map((action) => ({
        id: action.id,
        text: action.prompt,
        chipId: 'design-system',
      }));
    }
    if (nextStepVariant === 'plan') {
      return [
        {
          id: 'plan-generate-from-doc',
          text: t('nextStep.planGeneratePrompt'),
          chipId: 'plan',
          sessionMode: 'design',
        },
        {
          id: 'plan-improve-doc',
          text: t('nextStep.planImprovePrompt'),
          chipId: 'plan',
          sessionMode: 'plan',
        },
      ];
    }
    const promptPairs: Array<[string, string]> = [
      ['auto-match', t('chat.designToolbox.prompt.autoMatchIntro')],
      ['visual-polish', t('chat.designToolbox.prompt.visualPolish')],
      ['asset-search', t('chat.designToolbox.prompt.assetSearch')],
      ['icon-workflow', t('chat.designToolbox.prompt.iconWorkflow')],
      ['anti-ai-polish', t('chat.designToolbox.prompt.antiAiPolish')],
      ['motion-polish', t('chat.designToolbox.prompt.motionPolish')],
      ['chart-gen', t('chat.designToolbox.prompt.chartGen')],
    ];
    return promptPairs.map(([id, text]) => ({
      id: `follow-up-${id}`,
      text,
      chipId: 'design-toolbox',
    }));
  }, [nextStepVariant, t]);
  const composerPlaceholderScenarios = useMemo<PlaceholderScenario[]>(() => {
    if (loading || initialDraft?.trim()) return [];
    if (displayMessages.length === 0 && queuedItems.length === 0) return blankProjectComposerScenarios;
    if (displayMessages.length > 0) return followUpComposerScenarios;
    return [];
  }, [
    blankProjectComposerScenarios,
    displayMessages.length,
    followUpComposerScenarios,
    initialDraft,
    loading,
    queuedItems.length,
  ]);
  const [tab, setTab] = useState<Tab>('chat');
  const [showConvList, setShowConvList] = useState(false);
  const [conversationSearch, setConversationSearch] = useState('');
  const deferredConversationSearch = useDeferredValue(conversationSearch);
  const [scrolledFromBottom, setScrolledFromBottom] = useState(false);
  // SDF liquid-glass refraction on the jump pill (frosted fallback via CSS).
  const jumpBtnGlassRef = useLiquidGlass<HTMLButtonElement>({ strength: 0.2 });
  const [chatLogScrollable, setChatLogScrollable] = useState(false);
  const [chatLogScrolling, setChatLogScrolling] = useState(false);
  const [composerPortalTarget, setComposerPortalTarget] = useState<HTMLElement | null>(null);
  const [composerPortalRect, setComposerPortalRect] = useState<{
    left: number;
    width: number;
    bottom: number;
    top: number;
  } | null>(null);
  const [composerSlotHeight, setComposerSlotHeight] = useState(0);
  const [editingQueuedSendId, setEditingQueuedSendId] = useState<string | null>(null);
  // Reverse scan (no array copy) + memo so this and the maps below don't
  // recompute on every non-`messages` render (scroll, hover, toggles).
  const lastAssistantId = useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      if (displayMessages[i]!.role === 'assistant') return displayMessages[i]!.id;
    }
    return undefined;
  }, [displayMessages]);
  const hasActiveRunMessage = displayMessages.some(
    (m) => m.role === 'assistant' && isActiveRunStatus(m.runStatus),
  );
  /*
   * 输入框上方那枚「第 N / M 步」药丸的两个输入。
   *
   * 药丸说的是「**这一轮**跑到第几步」,所以它要的是 agent 这一轮自己重发的那份清单
   * (`todosDeclaredByLatestTurn`)—— 和流水里那张卡同一个判据、同一个 primitive。
   * agent 这一轮没重发,它就没有话要说:决定接着做 / 重新规划 / 撂下,是 agent 的事,
   * 不是客户端替它认领上一轮的清单。
   *
   * 曾经这里用的是**会话级**的 `latestTodoWriteInputFromMessages`(整个会话里倒着找
   * 最新一份)。那是钉顶卡时代的取数,比跨轮召回早两个月;召回落地时改的是卡那条路,
   * 药丸留在了原地。表现出来就是:用户插一句无关的问题,那一轮 agent 一个字的清单都
   * 没发,输入框上却还挂着上一轮的「第 3 / 4 步」。
   *
   * 「还在跑吗」照抄 `shouldBalanceFinishedTranscript` 的那对判据:`streaming` 是本地
   * 流式旗标,`hasActiveRunMessage` 兜住刷新后 run 仍在跑的那一路(此时没有本地流)。
   */
  const planPillTodos = useMemo(
    () => todosDeclaredByLatestTurn(displayMessages),
    [displayMessages],
  );
  const planPillRunning = streaming || hasActiveRunMessage;
  /**
   * 这一轮**有没有**计划可展示 —— 和「此刻挂不挂得出来」是两件事,别并成一个。
   *
   * 底部那块预留空白(`has-plan-pill-reserve`)钉在这一条上,而不是钉在可见性上:
   * 预留是 `.chat-log` 的 padding-bottom,也就是真实可滚内容的一部分。跟着可见性
   * 开关,上滚的那一刻 52px 会从内容里抽走,`scrollHeight` 当场缩水、「离底多远」
   * 跟着变小,有机会被判回「贴底」→ 药丸回来 → 预留回来 —— 一个自己喂自己的抖动环。
   */
  const planPillEligible = planPillState(planPillTodos, planPillRunning) !== null;
  /**
   * 底部只有一个浮层位,归谁由**滚动位置**说了算。
   *
   * 原来这里写的是 `scrolledFromBottom && !planPillVisible` —— Plan 无条件赢。
   * 而 Plan 在整个有计划的 run 期间都成立,于是「回到最新」在跑任务时**永远出不来**:
   * 往上滚一屏,唯一的回底入口就被遮死一整轮,只能一路手动滚回去。
   * (互斥是 #6142 带进来的:那一版只解决了「同一个位置塞不下两个」,
   * 没有回答「被挤掉的那个正是唯一的出路怎么办」。)
   *
   * 按位置分工才对:人在上面时他要的是回到最新 —— 那一刻「跑到第几步了」既不紧急、
   * 也不是他伸手要够的东西;人贴着底时他已经在最新上,回底按钮无事可做,
   * 位置该让给进度。两者因此天然不同时出现,不需要谁给谁让一档。
   */
  const showJumpToLatest = scrolledFromBottom;
  const planPillVisible = planPillEligible && !scrolledFromBottom;
  const retryAssistant = retryableAssistantMessage(displayMessages, lastAssistantId, streaming);
  // The failed run's error event lives on the (persisted) assistant message, so
  // the error card + AMR card survive a reload — unlike the ephemeral global
  // `error` state. Drive both off this event.
  const failedRunErrorEvent = (() => {
    const evs = retryAssistant?.events ?? [];
    for (let i = evs.length - 1; i >= 0; i--) {
      const ev = evs[i];
      if (ev?.kind === 'status' && ev.label === 'error') return ev;
    }
    return null;
  })();
  // Per-case failure UI (button + copy + whether to promote AMR). Only
  // meaningful for a failed run (retryAssistant present).
  const runFailureUi = retryAssistant
    ? resolveRunFailureUi(
        failedRunErrorEvent?.code,
        failedRunErrorEvent?.failureDetail,
        retryAssistant.agentId,
        // The raw upstream sentence, so a failure whose copy names something the
        // gateway reported (the instant a model window reopens) can read it back
        // out. Same string the card renders under 「查看详情」.
        failedRunErrorEvent?.detail,
        // The daemon's own retryable / user_action verdict, when the failure
        // event carries it. It does not yet — `RunFailureDaemonVerdict` names
        // the three files that have to carry it — so this reads as undefined
        // today and the fallback keeps its Retry. Wired now rather than later
        // because the alternative is web re-deriving retryability from the
        // detail name, which is the exact drift this is meant to end.
        daemonFailureVerdictFrom(failedRunErrorEvent),
      )
    : null;
  const hasInlineAmrAuthorizeFailure = Boolean(
    retryAssistant && onRetry && runFailureUi?.primaryAction === 'authorize',
  );
  useEffect(() => {
    if (
      !amrAuthRetryContinuation
      || !onDiscardAmrAuthRetryContinuation
      || loading
      || !projectId
      || !activeConversationId
      || messagesConversationId !== activeConversationId
    ) {
      return;
    }
    const personalAdoptionAuthorityTransition =
      amrAuthRetryContinuation.workspaceIdentityKey === 'none'
      && amrAuthRetryContinuation.originMountId === amrAuthRetryMountId
      && amrAuthRetryPersonalAdoptionWitness?.workspaceIdentityKey
        === amrAuthRetryWorkspaceIdentityKey;
    const mismatched =
      amrAuthRetryContinuation.projectId !== projectId
      || amrAuthRetryContinuation.conversationId !== activeConversationId
      || amrAuthRetryContinuation.assistantId !== retryAssistant?.id
      || (
        amrAuthRetryWorkspaceIdentityKey !== undefined
        && amrAuthRetryContinuation.workspaceIdentityKey
          !== amrAuthRetryWorkspaceIdentityKey
        && !personalAdoptionAuthorityTransition
      );
    if (mismatched) {
      onDiscardAmrAuthRetryContinuation(amrAuthRetryContinuation);
    }
  }, [
    activeConversationId,
    amrAuthRetryContinuation,
    amrAuthRetryMountId,
    amrAuthRetryPersonalAdoptionWitness,
    amrAuthRetryWorkspaceIdentityKey,
    loading,
    messagesConversationId,
    onDiscardAmrAuthRetryContinuation,
    projectId,
    retryAssistant?.id,
  ]);
  const consumeAmrAuthRetryIfAuthorized = useCallback((status: VelaLoginStatus | null) => {
    if (!isAmrSessionAuthenticated(status)) {
      if (
        status?.loginInFlight === true
        && amrAuthRetryContinuation
        && amrAuthRetryContinuation.workspaceIdentityKey === 'none'
        && amrAuthRetryContinuation.originMountId === amrAuthRetryMountId
      ) {
        amrAuthRetrySignedOutWitnessRef.current = amrAuthRetryContinuation;
      }
      return;
    }
    if (
      !isAmrSessionAuthenticated(status)
      || !amrAuthRetryContinuation
      || !amrAuthRetryMountId
      || !amrAuthRetryWorkspaceIdentityKey
      || !projectId
      || !activeConversationId
      || !retryAssistant
      || !onRetry
      || !onConsumeAmrAuthRetryContinuation
    ) {
      return;
    }
    const originMountObservedSignedOut =
      amrAuthRetrySignedOutWitnessRef.current === amrAuthRetryContinuation;
    // Every continuation is consumed against the account identity returned by
    // this exact status observation. An ambient shell snapshot can belong to a
    // prior account during sign-out/sign-in transitions.
    const loggedInAccountId = status?.user?.id ?? null;
    if (!canConsumeAmrAuthRetryContinuation(amrAuthRetryContinuation, {
      projectId,
      conversationId: activeConversationId,
      assistantId: retryAssistant.id,
      workspaceIdentityKey: amrAuthRetryWorkspaceIdentityKey,
      mountId: amrAuthRetryMountId,
      loggedInAccountId,
      nowMs: Date.now(),
      originMountObservedSignedOut,
      personalAdoptionWitness: amrAuthRetryPersonalAdoptionWitness,
    })) {
      return;
    }
    if (onConsumeAmrAuthRetryContinuation(amrAuthRetryContinuation)) {
      amrAuthRetrySignedOutWitnessRef.current = null;
      onRetry(
        retryAssistant,
        retryAssistant.agentId === 'amr'
          ? 'authorize_and_retry'
          : 'switch_runtime_retry',
      );
    }
  }, [
    activeConversationId,
    amrAuthRetryContinuation,
    amrAuthRetryMountId,
    amrAuthRetryPersonalAdoptionWitness,
    amrAuthRetryWorkspaceIdentityKey,
    onConsumeAmrAuthRetryContinuation,
    onRetry,
    projectId,
    retryAssistant,
  ]);
  useEffect(() => {
    if (!amrAuthRetryContinuation || !isAmrSessionAuthenticated(inlineAmrLoginStatus)) return;
    // A Settings handoff remounts the whole project surface, so there is no
    // inline AmrLoginPill callback to drive consumption. The fresh pane's own
    // status read may request the one-shot retry; the common guard above still
    // requires the exact project, conversation, failed assistant, account,
    // fresh mount and Workspace authority.
    consumeAmrAuthRetryIfAuthorized(inlineAmrLoginStatus);
  }, [
    amrAuthRetryContinuation,
    consumeAmrAuthRetryIfAuthorized,
    inlineAmrLoginStatus,
  ]);
  useEffect(() => {
    if (
      amrAuthRetrySignedOutWitnessRef.current
      && amrAuthRetrySignedOutWitnessRef.current !== amrAuthRetryContinuation
    ) {
      amrAuthRetrySignedOutWitnessRef.current = null;
    }
  }, [amrAuthRetryContinuation]);
  useEffect(() => {
    if (!hasInlineAmrAuthorizeFailure || !retryAssistant || !onRetry) return;
    let stopped = false;
    const retryIfSignedIn = async () => {
      const next = await refreshInlineAmrLoginStatus();
      if (stopped) return;
      consumeAmrAuthRetryIfAuthorized(next);
    };
    void retryIfSignedIn();
    const interval = window.setInterval(() => {
      void retryIfSignedIn();
    }, 500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [
    consumeAmrAuthRetryIfAuthorized,
    hasInlineAmrAuthorizeFailure,
    onRetry,
    refreshInlineAmrLoginStatus,
    retryAssistant,
  ]);
  // Offer Continue (resume) when the failed run is resumable AND the active
  // agent still matches the agent that produced it. The daemon stores a
  // resumable session per (conversation, agent); after an agent switch the new
  // agent has no id for that session, so a resume would silently start fresh —
  // fall back to the from-scratch Retry instead. We do NOT require `onResumeRun`
  // here: because the daemon persists the resumable session, the plain Retry
  // path (which re-sends the original prompt) would itself silently resume that
  // session and double the work. So every ChatPane surface must offer Continue
  // for a resumable failure — `onResumeRun` when wired (primary chat, carries
  // the resume_continue analytics), otherwise a plain `onSend` of the canonical
  // continue prompt (resumes the session without re-sending the original turn).
  const canResumeFailedRun =
    !!retryAssistant?.resumable &&
    !!retryAssistant?.agentId &&
    retryAssistant.agentId === config?.agentId;
  // `error` is a shared escape hatch for both run failures and unrelated pane
  // errors. A run error also lives durably on its assistant message. Suppress
  // it only when its exact source assistant owns the persisted diagnostic and
  // a later assistant has succeeded; canonical error text alone cannot prove
  // ownership because a new run can fail with the same detail.
  const historicalRunError = useMemo(
    () =>
      !retryAssistant &&
      isRecoveredAssistantRunError(
        displayMessages,
        error,
        errorSourceAssistantId,
      ),
    [displayMessages, error, errorSourceAssistantId, retryAssistant],
  );
  const currentGlobalError = historicalRunError ? null : error;
  // Prefer a case-specific message (AMR auth / balance) over the raw upstream
  // string; otherwise keep a current pane-level error ahead of the persisted
  // failed-run detail. Historical run errors were already removed above.
  const rawError = currentGlobalError ?? failedRunErrorEvent?.detail ?? null;
  // Friendly agent name for {agent} interpolation in failure copy (e.g. the
  // sign-in messages). Falls back to a neutral word when unreadable, never null.
  const failedAgentLabel =
    agentDisplayName(retryAssistant?.agentId, retryAssistant?.agentName) ??
    t('chat.runError.agentFallback');
  // Values the failure copy names, localized before interpolation: the gateway
  // reports a UTC instant, the reader waits on their own clock.
  //
  // `{cause}` (S30) arrives as a KEY, not a string: the five client-environment
  // causes are themselves translated, and `amr-guidance` has no `t`. Resolved
  // here, next to `{agent}`, so the mapping table stays free of copy.
  const runFailureMessageVars = (() => {
    const base = runFailureUi?.messageVars?.retryAt
      ? {
          ...runFailureUi.messageVars,
          retryAt: formatModelWindowRetryAt(runFailureUi.messageVars.retryAt, locale),
        }
      : runFailureUi?.messageVars;
    if (!runFailureUi?.messageCauseKey) return base;
    return { ...(base ?? {}), cause: t(runFailureUi.messageCauseKey) };
  })();
  // 卡面上只放人话。命中映射表的用它自己的文案;没命中的用兜底那一句 ——
  // **不再把上游原文摊在卡上**(设计原则五)。卡上也不再收着它:曾经那个
  // 「错误详情」折叠已经整块下线(用户 2026-08-27),要原始日志走〔导出日志〕。
  //
  // 兜底只接手**这一轮自己的原始报错**。两个条件缺一不可:
  //  · `runFailureUi` —— 这条助手消息确实是终态失败,不然凭空多出一张卡;
  //  · 面板级那条错误不是**这一轮自己填的** —— 面板错误(会话加载失败之类)本来就是
  //    我们自己写的人话,而且优先级更高(见上面 `rawError` 的取值顺序)。少了这一条,
  //    「一边是面板错误、一边有条失败的旧运行」时,那句人话会被兜底句顶掉。
  //
  //    判据不能是「面板里有没有错误」:面板那个槽是**共用**的,运行失败自己也会
  //    往里填(`setRunError(err.message, assistantId)`,ProjectView 三处)。按
  //    「有没有」判,这一轮自己的上游原文就正好绕过兜底,从最后那条 `: rawError`
  //    漏到卡面上 —— 用户 2026-08-27 看到的那串 JSON-RPC 走的就是这条路。
  //
  //    真正的判据是**谁填的**:`setRunError` 带 `sourceAssistantId`,`setError`
  //    一律置 null。所以「来源就是这条失败的助手消息」= 那段字是这一轮的上游原文,
  //    该由兜底句接手;来源为空或指向别的助手,那句话跟这一轮无关,原样留着。
  //
  // R9:断线是唯一一条**整张卡都不出**的 —— 流水最后一行的重连行(第 84 格 ·
  // S29)已经在说同一件事,而且给的是对的那颗按钮〔重新连接〕。两块 UI 说一件事、
  // 还是两种说法,正是设计稿要避免的。判据两条线索都看:结构化的 code,和这条码
  // 引入之前落库的原文 —— 跟 `ProjectView.hasGenericDisconnectFailureEvent` 同一对。
  // 面板级的那条错误(还没落到消息上)也要过这一道,否则重连行在场时它照样冒出来。
  //
  // `suppressCard` 是**交接**,不是删除:它说的是「别人已经在说这件事了」。
  // 断线那一档的接手方(重连行)一定在场;余额那一档的接手方是升级卡,而升级卡
  // 只有在钱包补查读出确定数字时才画得出来 —— 接不住的时候没有任何人在说话,
  // 这时还按下白卡,用户在一轮「钱不够」的失败之后屏幕上什么都不剩,没有充值
  // 入口也没有重试。所以交接只在接手方真的在场时成立。
  const balanceCardCannotTakeTheHandoff =
    failureCardHandedToAmrBalanceCard(runFailureUi) && amrBalanceCardUnavailable;
  const anotherSurfaceOwnsFailure =
    (runFailureUi?.suppressCard === true && !balanceCardCannotTakeTheHandoff)
    || isReconnectOwnedFailure(failedRunErrorEvent?.code, rawError);
  // 面板里那段字是不是**这一轮自己**的上游原文。见上面兜底那两条件的说明。
  const globalErrorIsThisRunsRawText =
    !!currentGlobalError
    && errorSourceAssistantId != null
    && errorSourceAssistantId === retryAssistant?.id;
  const displayError = anotherSurfaceOwnsFailure
    ? null
    : runFailureUi?.messageKey
      ? t(runFailureUi.messageKey, { agent: failedAgentLabel, ...runFailureMessageVars })
      : runFailureUi && (!currentGlobalError || globalErrorIsThisRunsRawText) && rawError
        ? t(RUN_FAILURE_FALLBACK_MESSAGE_KEY)
        : rawError;
  // Brand (accent) for AMR sign-in/top-up, warning for a self-healing
  // connection drop, danger for everything else. The shared action card only
  // tints its icon; the surface itself stays neutral.
  const runErrorTone: UserActionCardTone =
    runFailureUi?.primaryAction === 'authorize' ||
    runFailureUi?.primaryAction === 'recharge' ||
    runFailureUi?.primaryAction === 'upgrade'
      ? 'brand'
      : failedRunErrorEvent?.code === 'AGENT_CONNECTION_DROPPED'
        ? 'warning'
        : 'danger';
  // 阶梯第 4 档的唯一外显:常驻次级的〔联系支持〕升格成主按钮。
  const contactSupportIsPrimary = runFailureUi?.primaryAction === 'contact-support';
  // The failed run whose error this top-level card represents. AssistantMessage
  // suppresses only THIS message's per-message error pill (to avoid the
  // duplicate); other failed turns — older history, or once a follow-up makes
  // this no longer the last assistant — keep their pill so the error survives.
  const errorCardOwnerId =
    retryAssistant && failedRunErrorEvent ? retryAssistant.id : null;
  // AMR promotion card payload (only the non-AMR model/auth/quota case).
  const amrSwitchPayload =
    runFailureUi?.showSwitchCard
    && failedRunErrorEvent?.code !== 'UPSTREAM_UNAVAILABLE'
    && retryAssistant
    && failedRunErrorEvent?.code
      ? {
          errorCode: failedRunErrorEvent.code,
          projectId: projectId ?? '',
          projectKind: projectKindForTracking,
          conversationId: activeConversationId,
          assistantMessageId: retryAssistant.id,
          runId: retryAssistant.runId ?? null,
        }
      : null;
  // 阶梯第 3 / 4 档的卡自己画不出「能把这次失败推进下去」的按钮:第 3 档那颗
  // 在下面那张切换卡上,第 4 档给的是〔联系支持〕(开对话,不是恢复)。判据抽成
  // `hasSelfContainedRecovery`,免得这里跟着阶梯的档位一档档手写。
  const runFailureHasAction = Boolean(
    retryAssistant &&
      onRetry &&
      runFailureUi &&
      (hasSelfContainedRecovery(runFailureUi) || canResumeFailedRun),
  );
  // The generic local-CLI escape hatch is only used when the failure card has
  // no direct recovery action. AMR guidance remains visible whenever the
  // classifier asks for it, alongside a case-specific retry when applicable.
  const showByokRecoveryCta =
    showByokRecoveryAction && Boolean(onSwitchToLocalCli) && !runFailureHasAction;
  const showErrorActions = showByokRecoveryCta || runFailureHasAction;
  const showAmrGuidance = Boolean(amrSwitchPayload);
  /**
   * 报错卡上那两颗**常驻**次级(交付稿第 78 格的前两颗)。
   *
   * 它们和 `showErrorActions` 无关 —— 那个旗标问的是「这一档有没有可用的恢复动作」,
   * 而「联系支持」「导出日志」在任何一档都成立:恰恰是**没有恢复动作**的那几档
   * (CPU 不支持、运行时定义非法)最需要它们,今天那些卡上一颗按钮都没有。
   */
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  /**
   * 升级卡与报错卡上的「升级套餐」共用一条出站链路:同一个 plans URL、同一份归因、
   * 同样的 device id 传递规则(仅在同意指标上报时带)。入口来源分开记,
   * 这样漏斗能读出「卡」和「弹窗」各自带来多少升级。
   */
  const openAmrPlans = useCallback((entrySource: 'chat_error_upgrade' | 'chat_upgrade_card') => {
    const attribution = recordAmrEntry(analytics.track, entrySource, new Date(), {
      metricsConsent: config?.telemetry?.metrics === true,
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent: config?.telemetry?.metrics === true,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId: config?.installationId,
    });
    window.open(
      attributedAmrUrl(amrPlansUrlForProfile(amrProfile), attribution, deviceId),
      '_blank',
      'noopener,noreferrer',
    );
  }, [amrProfile, analytics.track, config?.installationId, config?.telemetry?.metrics]);
  const visibleRecoveryActionTypes = useMemo(() => {
    const actions: TrackingRunRecoveryActionType[] = [];
    if (!retryAssistant || !onRetry || !runFailureUi) return actions;
    if (runFailureUi.primaryAction === 'authorize') actions.push('authorize_and_retry');
    if (runFailureUi.primaryAction === 'switch-model') actions.push('switch_model_retry');
    if (canResumeFailedRun) actions.push('resume_run');
    else if (runFailureUi.primaryAction === 'retry' || runFailureUi.secondaryRetry) {
      actions.push('manual_retry');
    }
    if (showAmrGuidance && onSwitchToAmrAndRetry) actions.push('switch_runtime_retry');
    return actions;
  }, [
    canResumeFailedRun,
    onRetry,
    onSwitchToAmrAndRetry,
    retryAssistant,
    runFailureUi,
    showAmrGuidance,
  ]);
  const recoveryAnalyticsProps = useCallback((
    assistantMessage: ChatMessage,
    actionType: TrackingRunRecoveryActionType,
  ) => {
    const task = buildRecoveryTaskAnalytics(displayMessages, assistantMessage, actionType);
    return {
      task_execution_id: task.taskExecutionId,
      recovery_action_instance_id: task.recoveryActionInstanceId!,
      recovery_action_type: actionType,
      ...(task.sourceRunId ? { source_run_id: task.sourceRunId } : {}),
      ...(assistantMessage.agentId
        ? { source_agent_provider_id: runAgentProviderId(assistantMessage.agentId) }
        : {}),
      ...(failedRunErrorEvent?.failureCategory
        ? { failure_category: failedRunErrorEvent.failureCategory }
        : {}),
      ...(failedRunErrorEvent?.failureDetail
        ? { failure_reason: failedRunErrorEvent.failureDetail }
        : {}),
    };
  }, [displayMessages, failedRunErrorEvent]);
  useEffect(() => {
    if (!retryAssistant) return;
    for (const actionType of visibleRecoveryActionTypes) {
      const props = recoveryAnalyticsProps(retryAssistant, actionType);
      const key = `${props.recovery_action_instance_id}:surface`;
      if (runRecoverySurfaceKeysRef.current.has(key)) continue;
      runRecoverySurfaceKeysRef.current.add(key);
      trackRunRecoveryActionSurfaceView(analytics.track, {
        page_name: 'chat_panel',
        area: 'chat_panel',
        element: 'run_recovery_action',
        ...props,
      });
    }
  }, [analytics.track, recoveryAnalyticsProps, retryAssistant, visibleRecoveryActionTypes]);
  const trackRecoveryClick = useCallback((
    assistantMessage: ChatMessage,
    actionType: TrackingRunRecoveryActionType,
    target?: { agentProviderId?: string; modelId?: string },
  ) => {
    trackRunRecoveryActionClick(analytics.track, {
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'run_recovery_action',
      ...recoveryAnalyticsProps(assistantMessage, actionType),
      ...(target?.agentProviderId
        ? { target_agent_provider_id: target.agentProviderId }
        : {}),
      ...(target?.modelId ? { target_model_id: target.modelId } : {}),
    });
  }, [analytics.track, recoveryAnalyticsProps]);
  useEffect(() => {
    if (!displayError || !failedRunErrorEvent?.code || !retryAssistant) return;
    // The hosted-AMR nudge owns this same surface_view when it renders below
    // the error card. For all other failed-run guidance (AMR auth/balance,
    // Antigravity auth/quota, upstream outage, generic retry), the chat error
    // card itself is the visible run_failed_toast surface.
    if (showAmrGuidance) return;

    const key = [
      projectId ?? '',
      activeConversationId ?? '',
      retryAssistant.id,
      retryAssistant.runId ?? '',
      failedRunErrorEvent.code,
    ].join(':');
    if (runFailedToastSurfaceKeysRef.current.has(key)) return;
    runFailedToastSurfaceKeysRef.current.add(key);

    trackRunFailedToastSurfaceView(analytics.track, {
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'run_failed_toast',
      error_code: failedRunErrorEvent.code,
      project_id: projectId ?? '',
      project_kind: projectKindForTracking,
      conversation_id: activeConversationId,
      assistant_message_id: retryAssistant.id,
      run_id: retryAssistant.runId ?? null,
    });
  }, [
    activeConversationId,
    analytics.track,
    showAmrGuidance,
    displayError,
    failedRunErrorEvent?.code,
    projectId,
    projectKindForTracking,
    retryAssistant,
  ]);
  const importedFolderArtifacts = useMemo(
    () =>
      projectMetadata?.importedFrom === 'folder'
        ? sortArtifactsByModified(
            listDesignArtifactCandidates(projectFiles, projectMetadata.entryFile),
          )
        : [],
    [projectFiles, projectMetadata?.entryFile, projectMetadata?.importedFrom],
  );
  const showImportedFolderArtifacts = projectMetadata?.importedFrom === 'folder';
  const composerDraftStorageKey = projectId && activeConversationId
    ? `od:chat-composer:draft:${projectId}:${activeConversationId}`
    : undefined;
  const shouldBalanceFinishedTranscript =
    !loading &&
    !streaming &&
    !displayError &&
    !hasActiveRunMessage &&
    displayMessages.length > 0;
  // Map each assistant message id to the user message that follows it (if any)
  // so structured form replies collapse into a readable summary on the
  // assistant message that asked them.
  const nextUserContentByAssistantId = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < displayMessages.length - 1; i++) {
      const m = displayMessages[i]!;
      const next = displayMessages[i + 1]!;
      if (m.role === 'assistant' && next.role === 'user') {
        map.set(m.id, next.content);
      }
    }
    return map;
  }, [displayMessages]);

  useEffect(() => {
    didInitialScrollRef.current = false;
    anchorActiveRef.current = false;
    settledTailUserIdRef.current = undefined;
    resetTailSpacer();
    // A new conversation should land at the bottom (its own initial
    // scroll), not inherit the previous conversation's saved position —
    // including any anchor-to-top reserve still held by the tail spacer, which
    // would otherwise strand the freshly opened conversation below a dead gap.
    savedChatScrollRef.current = null;
    scrolledToFormRef.current = new Set();
    anchorActiveRef.current = false;
    settledTailUserIdRef.current = undefined;
    resetTailSpacer();
    /*
     * 跟随意图也归位。它是**上一条会话**的阅读状态:在长会话里滚上去挣脱过,
     * 切到另一条会话时那份「已挣脱」不该跟着走 —— 老写法里它跟着走了,于是浮标
     * 挂在一条一屏都装得下的新会话上。
     */
    armFollow();
    lastScrollSampleRef.current = { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
  }, [activeConversationId]);

  // ChatComposer's internal `seededRef` latches after the first
  // non-empty `initialDraft`, so a parent setting `initialDraft` back
  // to `undefined` will not flow into the composer's draft state. When
  // the parent does that transition (because the seed is now stale —
  // e.g. ProjectView discovered the conversation already has a sent
  // user message after a reload), reach into the composer and clear
  // the textarea so the user does not see the prompt they already
  // submitted.
  const lastSeenInitialDraftRef = useRef<string | undefined>(initialDraft);
  useEffect(() => {
    const previous = lastSeenInitialDraftRef.current;
    lastSeenInitialDraftRef.current = initialDraft;
    if (previous && initialDraft === undefined) {
      composerRef.current?.setDraft('');
    }
  }, [initialDraft]);

  // Parent-driven composer prefill (the "Import repo" CTA). Reuse the same
  // imperative setDraft the starter cards use; the nonce guards against
  // re-applying the same signal on unrelated re-renders.
  const lastDraftSignalNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!composerDraftSignal) return;
    if (lastDraftSignalNonceRef.current === composerDraftSignal.nonce) return;
    lastDraftSignalNonceRef.current = composerDraftSignal.nonce;
    composerRef.current?.setDraft(composerDraftSignal.text);
  }, [composerDraftSignal]);

  // Library "optimize design system" hand-off: when the user pushed selected
  // assets into this project's design system from the Library, pre-fill the
  // composer with the query + those assets (as attachment chips) so they only
  // need to review and Send. Fires once, after the composer mounts for the
  // routed conversation; re-checks on conversation change so an async-loaded
  // composer still gets seeded. The seed is consumed (cleared) on apply.
  const seededComposerSeedRef = useRef(false);
  useEffect(() => {
    if (seededComposerSeedRef.current) return;
    if (!projectId || !composerRef.current) return;
    const seed = takeComposerSeedFor(projectId);
    if (!seed) return;
    seededComposerSeedRef.current = true;
    composerRef.current.restoreDraft({ text: seed.text, attachments: seed.attachments });
  }, [projectId, activeConversationId]);

  useEffect(() => {
    if (!editingQueuedSendId) return;
    if (queuedItems.some((item) => item.id === editingQueuedSendId)) return;
    setEditingQueuedSendId(null);
  }, [editingQueuedSendId, queuedItems]);

  /*
   * QueuedSendStrip 在 chat-log 外面,但 mount / unmount / 编辑态会立刻改变
   * chat-log 的 clientHeight。ResizeObserver 要到下一帧才回调;用户如果在这两拍
   * 之间立刻上滚,onScroll 仍会拿 queue 出现前的 clientHeight 当 previous sample,
   * 把真实手势误判成布局修正,然后 following 把位置写回底部(OPEND-2532)。
   *
   * layout effect 在新 DOM 对用户可见前先刷新**几何基线**。这里只记 sample,
   * 不碰跟随意图也不写 scrollTop:仍然跟随的人由既有 ResizeObserver 在下一帧
   * 贴到新底;已经/正在手动滚的人则不会被这次 queue 布局变化抢回去。
   */
  useLayoutEffect(() => {
    const el = logRef.current;
    if (!el) return;
    rememberScrollSample(el);
  }, [queuedItems, editingQueuedSendId]);

  /**
   * "Edit" on a queued row means TAKE THE TURN OUT of the queue and put it
   * back into the composer with its whole payload — text, attachments, marks,
   * and the staged plugin / skill / MCP / connector / context bindings in its
   * meta. Leaving the row behind showed the same turn in two places at once,
   * which reads as "sending now will send it twice".
   *
   * Product ruling (2026-08, provisional): when the composer already holds an
   * unsent draft it is OVERWRITTEN. Not merged, not guarded by a confirm
   * dialog, not refused. Do not "helpfully" turn this back into a merge.
   *
   * Dequeuing needs a host that owns the queue. When there is no
   * `onRemoveQueuedSend` we keep the older in-place edit instead (the row
   * stays, marked as editing, and Send updates it) — pulling the turn into the
   * composer with no way to put it back would lose it outright.
   */
  const restoreQueuedSendToComposer = (item: QueuedSendItem) => {
    setEditingQueuedSendId(onRemoveQueuedSend ? null : item.id);
    onRemoveQueuedSend?.(item.id);
    composerRef.current?.restoreDraft({
      text: item.prompt,
      attachments: item.attachments ?? [],
      commentAttachments: item.commentAttachments ?? [],
      // 排队时折进正文的那段引文,靠这份结构数据拆回芯片。老队列里没有这个
      // 字段(它是后加的),那就退回「整段都是正文」——不报错,只是没有芯片。
      quotes: item.meta?.quotes ?? [],
      meta: item.meta,
    });
  };

  useEffect(() => {
    const el = logRef.current;
    if (!el || didInitialScrollRef.current || displayMessages.length === 0) return;
    didInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      // If the last assistant message contains a question form, scroll to
      // the form instead of the bottom, so the user sees the form first.
      const lastAssistantMsg = [...displayMessages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistantMsg?.content.includes('<question-form')) {
        const formEl = lastAssistantQuestionFormEl(el);
        if (formEl && questionFormNeedsPositioning(formEl)) {
          scrollQuestionFormToTop(el, formEl);
          return;
        }
        // Already handled by the auto-scroll effect — don't bottom-scroll.
        if (formEl) return;
      }
      // Initial-load bottom-pin must be instant — smooth scrollTo emits
      // intermediate scroll events that read as a user scroll and break follow.
      armFollow();
      writeLogScrollTop(el, el.scrollHeight);
      syncFollowState();
    });
    // `tab` is in the deps so that switching conversations while
    // Comments is open doesn't strand the new conversation at scrollTop:
    // 0. The activeConversationId-reset effect above clears
    // didInitialScrollRef while the chat-log is unmounted; this effect
    // then re-runs when the user returns to Chat and the element is
    // available, scrolling the new conversation to its initial bottom.
  }, [activeConversationId, displayMessages, tab]);

  // When a turn finishes streaming, release the anchor-to-top reserve. The
  // tail spacer only exists to give a streaming reply room to grow while the
  // user message stays pinned at the top; once the reply is final it must not
  // linger, or a short turn (typical of a fresh fork) is left with a large
  // dead gap below it. Collapsing the spacer lets the bottom-anchored layout
  // settle the finished transcript against the composer.
  useEffect(() => {
    const was = prevStreamingRef.current;
    prevStreamingRef.current = streaming;
    // The tail spacer only ever holds the anchor-to-top reserve for an actively
    // streaming reply, so once the turn ends it must collapse unconditionally —
    // even if a mid-turn scroll already cleared `anchorActiveRef` (which leaves
    // the spacer sized). Collapsing it lets the bottom-anchored layout settle a
    // finished short turn against the composer instead of below a dead gap.
    if (was && !streaming) {
      anchorActiveRef.current = false;
      resetTailSpacer();
    }
  }, [streaming]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    // Auto-scroll only when the user was already pinned near the bottom,
    // so a scrollback session reading earlier output isn't yanked to the
    // latest message. We key off the pre-content follow intent
    // (a ref so it doesn't itself re-fire this effect on scroll) instead
    // of recomputing distance from the just-grown scrollHeight: a single
    // streamed chunk can add 100+ px in one render, which made the
    // post-content distance check skip auto-scroll even when the user
    // was glued to the bottom. We deliberately use the tighter 80px
    // cutoff tracked by the ref (not the wider 120px jump-button
    // threshold) so a deliberate ~90px scroll-up isn't snapped back the
    // next time content streams in. Issue #983.

    /*
     * 屏幕上多了一轮新的用户消息 —— 切到「钉顶」模式,把它送到视口顶端。
     *
     * 判据只认结构(尾条用户消息的 id 换了),不认它是从哪个入口发出来的:
     * 输入框、question-form 交答案、首页发起、批注、队列排到、失败后的「继续」、
     * 生图重试,全都走这一条。见 `isNewTailUserTurn` 的注释。
     *
     * ## 【不变量】表决和几何必须问同一批消息
     *
     * 数的是**渲染项**里的尾条用户消息,不是 `displayMessages` 里的。
     * 落点由 `lastUserMsgTopInContent` 查 `.msg.user` 量出来,而 DOM 里只有渲染项;
     * 两边不同源时,一条不画的用户消息(意图澄清表单的答案,`^[form answers`)
     * 会让表决说「钉」、几何却找不到它,于是拿**上一轮**的气泡顶上去 ——
     * 用户这一轮根本没发过那条消息,画面却被拽走了。
     *
     * 表单答案那一轮因此不钉顶,退回贴底跟随(也就是这条改动之前的行为)。
     * 那一轮屏幕上新增的是助手那一侧的内容,而钉顶这套机制的预留空白、落点、
     * 松手容差全都是按「被钉住的那条**用户消息**」定义的 —— 没有那条消息,
     * 不是「换个目标钉」,是这套机制的前提不成立。
     */
    const lastUser = tailRenderedUserMessage(chatRenderItems);
    const tailUserId = lastUser?.id ?? null;
    const settledTailUserId = settledTailUserIdRef.current;
    settledTailUserIdRef.current = tailUserId;
    if (isNewTailUserTurn(settledTailUserId, tailUserId)) {
      resetTailSpacer();
      anchorActiveRef.current = true;
      /*
       * anchor-to-top 接管 = 用户这一轮的阅读位置在**顶端**,不是底部。松开跟随,
       * 这样回合结束、占位块收掉之后,一段长回复不会突然被拽到最底下。
       * (短回合会在 `syncFollowState` 里因为「本来就贴着底」自动重新挂上。)
       */
      releaseFollow();
      /*
       * 浮标**不在这里点亮**。老写法在这里无条件 `setScrolledFromBottom(true)`,
       * 而这一刻底下压根没有东西可回:占位块马上会把空白撑到「这条用户消息刚好顶到
       * 视口顶端」,也就是**正正好在底部**。用户截图里那颗压在输入框上的浮标就是这么来的。
       * 现在交给 `syncFollowState` 按几何算 —— 预留空白已经被扣掉了。
       */
      requestAnimationFrame(() => {
        sizeAnchorSpacer();
        scrollAnchorToTop();
        /*
         * 占位块刚定完尺寸、视图刚落到 anchor 位置 —— 几何整个换了,必须重算一次。
         *
         * 上一拍(React effect 里)量到的是**旧**几何:占位块还是 0、视图还停在
         * 旧内容的底部。一轮的用户消息 + 「进行中」头如果一次撑出大半屏,那一拍
         * 就会算出「底下还有一大截」并把浮标点亮 —— 而这一帧过后底下只剩十几个像素。
         *
         * 子树变动那条路(`scheduleFollowSync`)也会重算,但两条都排 rAF、谁后跑
         * 没有保证;只有这一帧是确定跑在 `scrollAnchorToTop()` **之后**的。
         */
        syncFollowState();
      });
      return;
    }
    // While anchored, the message stays at the top on its own (nothing above
    // it changes), so we only shrink the spacer as the reply grows — never
    // re-scroll. This is what keeps scrolling down and the final settle smooth.
    if (anchorActiveRef.current) {
      requestAnimationFrame(() => {
        sizeAnchorSpacer();
        syncFollowState();
      });
      return;
    }

    if (isFollowingTail()) {
      // If the last assistant message contains a question form, scroll to
      // the form instead of the bottom, so the user lands on the form.
      const lastAssistantMsg = [...displayMessages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistantMsg?.content.includes('<question-form')) {
        const formEl = lastAssistantQuestionFormEl(el);
        if (formEl && questionFormNeedsPositioning(formEl)) {
          // 和初次加载**同一个**入口。原来这里是自己写的一份拷贝,而且用的是
          // `behavior:'smooth'` —— 见 `scrollQuestionFormToTop` 的不变量。
          scrollQuestionFormToTop(el, formEl);
          return;
        }
        // Form tag in content but the DOM element isn't ready yet (partial
        // stream) — skip bottom-scroll to avoid a jarring jump that gets
        // undone when the form finishes rendering.
        if (streaming) return;
      }
      // Streaming bottom-pin must be instant — smooth scrollTo emits
      // intermediate scroll events that read as a user scroll and break
      // auto-follow for subsequent chunks.
      writeLogScrollTop(el, el.scrollHeight);
    }
    syncFollowState();
  }, [chatRenderItems, displayMessages, error, streaming]);

  // Saved chat-log scroll state, preserved across tab switches. The
  // chat-log <div> is conditionally rendered so it unmounts when the
  // user switches to Comments. On remount it would default to
  // scrollTop: 0 and the initial-bottom-scroll effect skips because
  // didInitialScrollRef is already true. We capture either the absolute
  // scrollTop or a "pinned to bottom" flag while Chat is visible, so
  // bottom-followers stay pinned even when new messages stream in
  // off-tab. Issue #790.
  const savedChatScrollRef = useRef<
    { pinnedToBottom: true } | { pinnedToBottom: false; scrollTop: number } | null
  >(null);
  useEffect(() => {
    if (tab !== 'chat') return;
    const el = logRef.current;
    if (!el) return;

    function syncScrollable(target: HTMLDivElement) {
      const next = target.scrollHeight - target.clientHeight > 1;
      setChatLogScrollable((prev) => (prev === next ? prev : next));
      if (!next) setChatLogScrolling(false);
    }

    function markScrolling() {
      setChatLogScrolling(true);
      if (chatLogScrollIdleTimerRef.current !== null) {
        window.clearTimeout(chatLogScrollIdleTimerRef.current);
      }
      chatLogScrollIdleTimerRef.current = window.setTimeout(() => {
        chatLogScrollIdleTimerRef.current = null;
        setChatLogScrolling(false);
      }, 650);
    }

    // Restore previously-saved position on remount. Defer to the next
    // frame so the conditional <> contents finish layout before the
    // scrollTop write lands.
    const saved = savedChatScrollRef.current;
    if (saved !== null) {
      requestAnimationFrame(() => {
        const target = logRef.current;
        if (!target) return;
        if (saved.pinnedToBottom) {
          armFollow();
          writeLogScrollTop(target, target.scrollHeight);
        } else {
          releaseFollow();
          writeLogScrollTop(target, saved.scrollTop);
        }
        syncScrollable(target);
        // Resync the jump-to-latest affordance with the restored position.
        // Without this, a user who left Chat ~60px from the bottom and returns
        // to find new messages stacked underneath would land hundreds of pixels
        // above the latest turn while the pill stayed hidden until they scrolled.
        syncFollowState();
      });
    }

    function snapshot(target: HTMLDivElement) {
      // 存**意图**而不是「离底部够近吗」:用户离开 Chat 时如果正在跟随,回来就该
      // 还在跟随;如果他停在某个位置读东西,回来就该还在那个位置。
      savedChatScrollRef.current = followIntentRef.current.following
        ? { pinnedToBottom: true }
        : { pinnedToBottom: false, scrollTop: target.scrollTop };
    }

    function onScroll() {
      const target = logRef.current;
      if (!target) return;
      // A genuine user scroll (one that moves away from where the anchored
      // message currently sits) releases the auto-resize behavior. We do NOT
      // collapse the tail spacer: the reserved blank below stays as real,
      // scrollable space so scrolling down feels natural instead of snapping.
      if (anchorActiveRef.current) {
        const pinnedTop = lastUserMsgTopInContent(target);
        if (
          pinnedTop !== null
          && anchorReleasedByScroll({
            scrollTop: target.scrollTop,
            messageTopInContent: pinnedTop,
          })
        ) {
          anchorActiveRef.current = false;
        }
      }
      syncScrollable(target);
      markScrolling();
      /*
       * 意图**只在这里**跟着用户的手改。方向 + 「`scrollHeight` 没变」两条一起,
       * 把我们自己写的 `scrollTop`、浏览器夹取、原生 scroll anchoring 的修正
       * 全都排除在「用户滚动」之外(见 `stick-to-bottom.ts`)。
       */
      // 真实几何,不扣预留空白 —— 见 `readViewportSample` 的注释。
      const sample = readViewportSample(target);
      followIntentRef.current = nextFollowIntent(
        followIntentRef.current,
        lastScrollSampleRef.current,
        sample,
      );
      lastScrollSampleRef.current = sample;
      snapshot(target);
      // `syncFollowState` 里的函数式更新在值没变时原地返回,所以流式期间那一串
      // scroll 事件不会每一跳都排一次重渲,也就不会撞上 React 的
      // "Maximum update depth exceeded"。
      syncFollowState();
      /*
       * 用户的手停在贴近底部的位置时,那块冻住的预留空白要开始收。
       *
       * 这一格是**回合卡住时唯一的驱动源**:收缩平时挂在内容变化的
       * Resize/Mutation 观察者上,而 agent 长时间不吐字的那几十秒里一个都不来 ——
       * 偏偏那正是用户盯着一屏空白的时候。这里只排一帧(rAF 内部自会合并),
       * 判据仍在 `stepTailSpacerCollapse` 里,不在这儿抢答。
       *
       * ⚠️ 门槛写在这里是**故意**的,不是提前抢答:比门槛还矮的空白**永远**起不了手
       * (`shouldStartCollapsingTailSpacer` 的第一条),给它排帧只会在流式期间每来
       * 一个 scroll 事件就多跑一趟空转 —— 那种空转正是「自喂环」的柴火。已经在收的
       * 那一块要放行,否则收到一半、内容又不长了,就卡在半路。
       */
      if (
        !anchorActiveRef.current
        && (tailSpacerCollapsingRef.current
          || reservedTailHeight() > TAIL_SPACER_VISIBLE_BLANK_TRIGGER_PX)
      ) {
        scheduleFollowSyncRef.current();
      }
    }

    /*
     * 滚轮往上 = 立刻松手,不等 scroll 事件。
     *
     * 这一条是给**快速流式**准备的:同一帧里我们如果写了 `scrollTop`,浏览器会把
     * 这一次滚轮滚动**直接取消掉**,于是那一格滚动连 scroll 事件都不会发 —— 用户的手
     * 在物理上被吃掉了。`use-stick-to-bottom` 也是为此单独挂了 wheel 监听。
     */
    function onWheel(event: WheelEvent) {
      const target = logRef.current;
      if (!target) return;
      if (event.deltaY >= 0) return;
      if (target.scrollHeight <= target.clientHeight) return;
      const { following, escaped } = followIntentRef.current;
      if (!following && escaped) return; // 已经松开了,不用每一格滚轮都重算一次
      releaseFollow();
      syncFollowState();
    }

    /*
     * 触屏同理:**手指往下拖**(内容跟着往下走 = 去看更早的东西)就松手。
     * `use-stick-to-bottom` 压根没挂 touch —— 它的 issue #9「Bad on iOS」就是这个:
     * 惯性滚动会把纯位移判据带偏,而移动端又没有 wheel 事件可依。
     */
    let touchStartY: number | null = null;
    function onTouchStart(event: TouchEvent) {
      touchStartY = event.touches[0]?.clientY ?? null;
    }
    function onTouchMove(event: TouchEvent) {
      const target = logRef.current;
      if (!target || touchStartY === null) return;
      const y = event.touches[0]?.clientY;
      if (y === undefined) return;
      // 手指往下拖 = 内容往下走 = 看更早的内容。
      if (y - touchStartY > 8 && target.scrollHeight > target.clientHeight) {
        releaseFollow();
        syncFollowState();
        touchStartY = null;
      }
    }

    syncScrollable(el);
    rememberScrollSample(el);
    el.addEventListener('scroll', onScroll);
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      // Capture final scroll state before unmount; the ref normally
      // tracks via onScroll, but programmatic scrolls or layout shifts
      // right before unmount can leave it stale.
      snapshot(el);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      if (chatLogScrollIdleTimerRef.current !== null) {
        window.clearTimeout(chatLogScrollIdleTimerRef.current);
        chatLogScrollIdleTimerRef.current = null;
      }
      setChatLogScrolling(false);
    };
  }, [tab]);

  /**
   * 切标签 / 换会话 / 开始收尾一个 run 之后重算一次。
   *
   * 这几件事都可能在**没有任何 scroll 事件**的情况下改变几何(短会话根本滚不动,
   * 一个事件都不会发)。日常的高度变化由下面那组 Resize/Mutation 观察者兜住;
   * 这条只补那几个「观察者还没来得及重挂」的切换时刻。
   */
  useEffect(() => {
    syncFollowState();
  }, [tab, activeConversationId, displayMessages.length, streaming]);

  useEffect(() => {
    if (tab !== 'chat') return;
    const el = logRef.current;
    if (!el) return;

    let followFrame: number | null = null;
    /*
     * 几何变了(内容长高/变矮、面板改尺寸)之后归拢到一帧里处理一次。
     *
     * **这里不碰跟随意图**,只把意图落到屏幕上:该贴底就贴底,浮标该收就收。
     * 老写法在这里只在「正跟随」时做事,于是**用户停住时的高度变化压根没人管** ——
     * 浮标就那么挂在一屏已经滚不动的对话上。
     */
    const scheduleFollowSync = () => {
      if (followFrame !== null) return;
      followFrame = requestAnimationFrame(() => {
        followFrame = null;
        // While anchored, only shrink the tail spacer as the reply grows
        // (resize-only, never scroll) so the user message stays put without
        // fighting a manual scroll-down.
        // 松手之后走另一条:那块冻住的空白只在戳进视口时才收,而且一帧一格。
        // 两条互斥 —— 上面那条是等量置换,这条是净减,混用会晃掉锚点。
        let collapsing = false;
        if (anchorActiveRef.current) sizeAnchorSpacer();
        else collapsing = stepTailSpacerCollapse();
        syncFollowState();
        // A layout-only resize changes the geometry that the next scroll
        // event is compared against. Refresh the baseline after the resize
        // has settled; otherwise the user's next real scroll still carries
        // the old scrollHeight and is mistaken for another layout correction.
        const target = logRef.current;
        if (target) rememberScrollSample(target);
        // 还没收完就再要一帧。挂在这个 rAF 上而不是自己另起一条:`followFrame`
        // 的取消已经写在这个 effect 的清理里,收缩跟着一起停,不会漏一条飞着的帧。
        if (collapsing) scheduleFollowSync();
      });
    };
    // scroll 监听在另一条 effect 上,拿不到这个闭包 —— 见 `scheduleFollowSyncRef`。
    scheduleFollowSyncRef.current = scheduleFollowSync;

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            const target = logRef.current;
            if (target) {
              const next = target.scrollHeight - target.clientHeight > 1;
              setChatLogScrollable((prev) => (prev === next ? prev : next));
              if (!next) setChatLogScrolling(false);
            }
            scheduleFollowSync();
          })
        : null;
    const observedChildren = new Set<Element>();
    const syncObservedChildren = () => {
      if (!resizeObserver) return;
      const currentChildren = new Set(Array.from(el.children));
      // The tail spacer's height is driven by the anchor logic; observing it
      // would feed its own resize back into followLatestIfPinned.
      if (tailSpacerRef.current) currentChildren.delete(tailSpacerRef.current);
      for (const child of currentChildren) {
        if (observedChildren.has(child)) continue;
        resizeObserver.observe(child);
        observedChildren.add(child);
      }
      for (const child of observedChildren) {
        if (currentChildren.has(child)) continue;
        resizeObserver.unobserve(child);
        observedChildren.delete(child);
      }
    };

    /* chat-log 之外、但会改变可用高度的发送队列随数据出没,
       所以要跟一份“当前观察的是谁”。PlanPill 已改为滚动区内的绝对定位浮层,
       不再改变可用高度,因此不得加入这个 observer 契约。 */
    const outsideLog = (ref: MutableRefObject<HTMLDivElement | null>) => {
      let observed: Element | null = null;
      return () => {
        if (!resizeObserver) return;
        const el2 = ref.current;
        if (el2 && observed !== el2) {
          if (observed) resizeObserver.unobserve(observed);
          resizeObserver.observe(el2);
          observed = el2;
        } else if (!el2 && observed) {
          resizeObserver.unobserve(observed);
          observed = null;
        }
      };
    };
    const syncQueuedSendStrip = outsideLog(queuedSendStripRef);

    /*
     * 滚动容器**自己**也要观察:输入框长高、软键盘弹出、旁边的 flex 兄弟变大,
     * 都只改可视高度、不改内容高度 —— 只盯内容就会静默失准
     * (`use-stick-to-bottom` 至今没修的 issue #40 就是这个)。
     */
    resizeObserver?.observe(el);
    syncObservedChildren();
    syncQueuedSendStrip();

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            syncObservedChildren();
            syncQueuedSendStrip();
            scheduleFollowSync();
          })
        : null;
    // childList + subtree only — NOT characterData. Auto-follow during
    // streaming is driven by the ResizeObserver on each message child (text
    // growth changes height), so observing per-character text mutations would
    // re-run the full sync sweep on every streamed frame for no extra benefit.
    mutationObserver?.observe(el, {
      childList: true,
      subtree: true,
    });
    // QueuedSendStrip lives outside the chat-log subtree. Watch its nearest
    // common ancestor so resize observation follows it when it mounts/unmounts.
    const paneEl = el.closest('.pane');
    if (paneEl && mutationObserver) {
      mutationObserver.observe(paneEl, { childList: true });
    }

    return () => {
      if (followFrame !== null) cancelAnimationFrame(followFrame);
      scheduleFollowSyncRef.current = () => {};
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [tab]);

  // Close the conversation history dropdown on outside click / Escape.
  useEffect(() => {
    if (!showConvList) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (historyWrapRef.current?.contains(target)) return;
      setShowConvList(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowConvList(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showConvList]);

  useEffect(() => {
    if (showConvList) return;
    setConversationSearch('');
  }, [showConvList]);

  /* `activeConversation` 这个绑定随着面板头「历史」摘掉原生 `title` 一起没了消费者
     —— 它当时唯一的用处是把当前会话标题拼进那句 `对话历史 · {title}`。稿子
     `729fa43ce7 · src/body-scene.html:7` 的 tip 是常量,所以那半句先不渲染;
     真要找地方安置(产品待拍),`conversations.find(c => c.id === activeConversationId)`
     一行就能拿回来,不必留一个没人读的变量在这里。 */
  const filteredConversations = useMemo(
    () => filterConversations(conversations, deferredConversationSearch, t),
    [conversations, deferredConversationSearch, t],
  );

  function resetTailSpacer() {
    const s = tailSpacerRef.current;
    if (s) s.style.height = '0px';
    // 闩是「这一块空白正在收」的状态,和这块空白同生共死。新一轮、回合结束、
    // 点「回到最新」、切会话都会走到这里,闩必须跟着一起清掉,否则下一轮的
    // 预留空白会带着上一轮的闩出生 —— 一撑出来就被当成「收到一半」接着收。
    tailSpacerCollapsingRef.current = false;
  }

  /*
   * 尾部占位块此刻占了多少 —— **读内联样式,不读 `offsetHeight`**。
   * 这块高度是本组件自己写上去的(anchor-to-top 的预留空白),内联样式就是权威,
   * 而且省掉一次强制重排。
   */
  function reservedTailHeight(): number {
    const spacer = tailSpacerRef.current;
    if (!spacer) return 0;
    const parsed = Number.parseFloat(spacer.style.height);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /*
   * ── 同一块几何,两个问题,两个答案 ────────────────────────────────────
   *
   * anchor-to-top 会在回复下面撑一块空白(尾部占位块),好让刚发出的那条用户消息
   * 能顶到视口顶端。那块空白**既是真实可滚动的区域,又不是内容** —— 两句话都对,
   * 所以它必须按问题分开算:
   *
   *   ┌ 问题 ───────────────────────┬ 预留空白算不算 ┬ 用哪个 reader ─────┐
   *   │ 要不要亮「回到最新」浮标      │ 不算(是空)   │ readContentSample │
   *   │ 用户是不是自己滑走了、停不停手 │ 算(是滚动条) │ readViewportSample│
   *   └─────────────────────────────┴───────────────┴───────────────────┘
   *
   * 把扣过的数字喂给第二个问题,就是用户 2026-08-27 那条 bug:
   * 「运行期间,稍微向上滑动一点就突然自动滑成这样了」。真机量到的那一屏是
   * scrollTop 1357 / scrollHeight 1950 / clientHeight 440 / 占位块 250 —— 他离真实
   * 底部 153px,可扣掉空白之后算出来是 (1950−250)−1357−440 = −97 → 夹到 0,
   * 判成「贴着底」,跟随不松手,下一次写 `scrollTop` 就把他拽回去。
   * **只要他往上滑的距离不超过那块空白,程序就完全看不见他的手。**
   */

  /**
   * 用户手底下那根**真实滚动条**的几何 —— 一个像素都不减。
   *
   * 「用户是不是自己滑走了」只能拿这个判:他对着真实滚动条滑了 153px 就是滑了
   * 153px,预留空白正是那根滚动条的一部分。`nextFollowIntent` 的另外两条判据也
   * 依赖真实值 —— 「`scrollHeight` 没变 = 不是内容引起的」说的是**浏览器**看到的
   * 那个 `scrollHeight`(夹取和原生 scroll anchoring 都按它走),不是我们减完的数。
   */
  function readViewportSample(el: HTMLDivElement): ScrollSample {
    const clientHeight = el.clientHeight;
    return {
      scrollTop: el.scrollTop,
      scrollHeight: Math.max(clientHeight, el.scrollHeight),
      clientHeight,
    };
  }

  /**
   * 把预留空白扣掉之后的几何 —— **只回答「底下还有没有内容可看」**。
   *
   * 这是「回到最新」误报的另一半病根:那块空白是**预留的空**,不是内容 —— 可
   * 「离底部还有多远」照单全收,于是浮标被一屏空白点亮,而屏幕上明明就是最新的东西
   * (用户 2026-08-27 的截图:一条用户消息 + 一个「进行中」头,下面大半空着,浮标在)。
   */
  function readContentSample(el: HTMLDivElement): ScrollSample {
    const clientHeight = el.clientHeight;
    return {
      scrollTop: el.scrollTop,
      scrollHeight: Math.max(clientHeight, el.scrollHeight - reservedTailHeight()),
      clientHeight,
    };
  }

  /**
   * 把当前几何记成基线。**我们自己写完 `scrollTop` 之后必须叫一次**,否则下一次用户滚动的方向会算反。
   *
   * 记的是**真实**几何:下一次 scroll 事件也是拿真实几何来跟它相减的,两边单位必须一致。
   */
  function rememberScrollSample(el: HTMLDivElement) {
    lastScrollSampleRef.current = readViewportSample(el);
  }

  /** 唯一的 `scrollTop` 写入口:写完就记基线。 */
  function writeLogScrollTop(el: HTMLDivElement, top: number) {
    el.scrollTop = top;
    rememberScrollSample(el);
  }

  /** 此刻是不是真的在跟着最新输出跑。anchor-to-top 期间不是:那时用户消息钉在顶端,回复在下面长。 */
  function isFollowingTail(): boolean {
    return (
      followIntentRef.current.following &&
      !anchorActiveRef.current &&
      !selectionFollowPausedRef.current
    );
  }

  /**
   * 把跟随意图落到屏幕上:该贴底就贴底,该给入口就给入口。
   *
   * **任何会改变几何的事情之后都要叫它一次** —— 滚动、内容长高/变矮、切标签、切会话、
   * 面板改尺寸、折叠块展开收起、占位块重新定尺寸。这条是「浮标该不该在」的另一半:
   * 判据本身管「算的时候别算错」,这里管「变了要去算」。老写法只在 scroll 事件和
   * 「消息条数变了」时重算,于是内容在没有滚动事件的情况下变矮之后,浮标就那么挂着。
   *
   * 它**不改意图**。意图只由用户的动作改(见 `stick-to-bottom.ts`)。
   */
  function syncFollowState() {
    const el = logRef.current;
    if (!el) return;
    if (isFollowingTail()) {
      // 瞬时贴底,不用平滑滚动:平滑滚动会吐出一串中间 scroll 事件,
      // 那些事件看起来就像用户在滚,会把跟随打断(这也是当初写死 instant 的原因)。
      if (el.scrollTop !== el.scrollHeight) writeLogScrollTop(el, el.scrollHeight);
    }
    // 浮标问的是「底下还有没有**内容**」,所以这里用扣掉预留空白的那份。
    const sample = readContentSample(el);
    /*
     * 这里**一个字都不改跟随意图**。
     *
     * 试过在这里补一条「已经贴着底了就重新挂上跟随」—— 当场就把滚轮那条逃逸路径
     * 废掉了:快速流式时浏览器会把那一格滚轮滚动整个吃掉,位置纹丝不动,于是
     * 「贴着底」永远成立,刚松开的手立刻又被按回去。同理,在一屏装得下的对话里
     * 展开折叠块也会被判回跟随,接着折叠块一长高就把刚点的那一行顶走。
     *
     * 意图只由用户的动作改。「滚不动的对话上不该有浮标」由判据里那条不变量兜着
     * (`shouldShowJumpToLatest` 的 `scrollHeight <= clientHeight + 1`),不需要在这里
     * 反过来改意图。
     */
    setScrolledFromBottom((prev) => {
      const next = shouldShowJumpToLatest({
        distance: Math.max(0, sample.scrollHeight - sample.scrollTop - sample.clientHeight),
        clientHeight: sample.clientHeight,
        scrollHeight: sample.scrollHeight,
        shown: prev,
        following: isFollowingTail(),
      });
      return prev === next ? prev : next;
    });
  }

  function handleQuoteSelectionActivityChange(active: boolean) {
    if (active) {
      // Only pause an intent that was actually following. A selection made
      // after the user scrolled away must not turn into an implicit resume.
      if (followIntentRef.current.following && !anchorActiveRef.current) {
        selectionFollowPausedRef.current = true;
      }
      return;
    }
    if (!selectionFollowPausedRef.current) return;
    selectionFollowPausedRef.current = false;
    syncFollowState();
  }

  /** 显式动作(点「回到最新」、发消息、切会话)重新挂上跟随。 */
  function armFollow() {
    followIntentRef.current = { following: true, escaped: false };
    selectionFollowPausedRef.current = false;
  }

  /**
   * 表单/消息滚到位之后,按**预测的**落点定跟随意图和浮标。
   *
   * 为什么用预测而不是等真实滚动落地:`scrollIntoView` 可能因为目标
   * 本来就在底部而**根本不产生滚动** —— 那种情况永远等不到 scroll 事件来纠正,
   * 浮标就会挂着没东西可回(recvqajMdAnfmd)。
   */
  function settleFollowAfterPredictedScroll(el: HTMLDivElement, distance: number) {
    const clientHeight = el.clientHeight;
    /*
     * 跟随意图和基线按**真实**几何定 —— `distance` 本来就是拿真实几何预测出来的
     * (`distanceFromBottomAfterAligningTop` 读的是 `el.scrollHeight`),而基线要跟
     * 下一次 scroll 事件的读数同单位,否则下一跳的方向会算反。
     */
    const viewport: ScrollSample = {
      scrollTop: Math.max(0, el.scrollHeight - clientHeight - distance),
      scrollHeight: Math.max(clientHeight, el.scrollHeight),
      clientHeight,
    };
    lastScrollSampleRef.current = viewport;
    followIntentRef.current = isSampleAtBottom(viewport)
      ? { following: true, escaped: false }
      : { following: false, escaped: true };
    // 浮标仍然按「底下还有没有内容」算 —— 预留空白不是内容。
    setScrolledFromBottom((prev) =>
      shouldShowJumpToLatest({
        distance,
        clientHeight,
        scrollHeight: Math.max(clientHeight, el.scrollHeight - reservedTailHeight()),
        shown: prev,
        following: isFollowingTail(),
      }),
    );
  }

  /** 显式动作(展开折叠块、anchor-to-top 接管)松开跟随。 */
  function releaseFollow() {
    followIntentRef.current = { following: false, escaped: true };
  }

  // Content offset (distance from the top of the scroll content) of the most
  // recent user message. Invariant to the current scrollTop, so it's safe to
  // call regardless of where the user has scrolled.
  function lastUserMsgTopInContent(el: HTMLDivElement): number | null {
    const userEls = el.querySelectorAll<HTMLElement>('.msg.user');
    const msgEl = userEls[userEls.length - 1];
    if (!msgEl) return null;
    const elRect = el.getBoundingClientRect();
    const msgRect = msgEl.getBoundingClientRect();
    return el.scrollTop + (msgRect.top - elRect.top);
  }

  // Predicts the post-settle "distance from bottom" (same metric `onScroll`
  // computes) after aligning `target`'s top edge with `el`'s top edge, the
  // way `target.scrollIntoView({ block: 'start' })` does. Reads current
  // geometry synchronously instead of waiting on the (possibly smooth,
  // possibly no-op) actual scroll to land: a short `target` — e.g. a
  // question form that is also the last thing in the log — clamps to the
  // real bottom, which never fires a native `scroll` event to correct a
  // hardcoded "still scrolled away" guess. That stale guess is what left the
  // jump-to-latest button stuck visible with nothing left to jump to
  // (recvqajMdAnfmd).
  function distanceFromBottomAfterAligningTop(el: HTMLDivElement, target: HTMLElement): number {
    const elRect = el.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTopInContent = el.scrollTop + (targetRect.top - elRect.top);
    const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    const predictedScrollTop = Math.min(Math.max(0, targetTopInContent), maxScrollTop);
    return Math.max(0, maxScrollTop - predictedScrollTop);
  }

  /**
   * 最后一条助手消息里那张表单;DOM 还没渲染出来时是 null(流式到一半)。
   *
   * 初次加载和流式两条路问的是同一个问题,原来各写了一遍 —— 而「两份几乎逐字相同的
   * 拷贝」正是下面那条不变量被破坏的方式,所以问法收成一处。
   * 找的是**最后一条**助手消息:更早的回合里的旧表单不算。
   */
  function lastAssistantQuestionFormEl(el: HTMLDivElement): HTMLElement | null {
    const assistantEls = el.querySelectorAll('.msg.assistant');
    const lastAssistantEl = assistantEls[assistantEls.length - 1];
    return lastAssistantEl?.querySelector<HTMLElement>('[data-form-id]') ?? null;
  }

  /** 这张表单还没被定位过 —— 每张只顶一次,之后用户爱滚哪儿滚哪儿。 */
  function questionFormNeedsPositioning(formEl: HTMLElement): boolean {
    return !scrolledToFormRef.current.has(formEl.dataset.formId!);
  }

  /**
   * 把 question-form 的上沿顶到视口上沿,并把跟随意图和基线一起落定。
   *
   * ## 【不变量】我们自己发起的滚动一律**瞬时**
   *
   * 「是不是用户在滚」的判据是「方向 + `scrollHeight` 没变」(`stick-to-bottom.ts`)。
   * 它成立的前提是:我们自己写位置时,**记下的基线和落点在同一拍里一致**。
   * `behavior:'smooth'` 破坏的正是这一点 —— 我们按预测记完基线,浏览器才开始动,
   * 随后吐出来的一串中间位置全在基线的另一侧,判据眼里就是一次用户滚动。
   *
   * 单看一次动画常常看不出问题:终点如果正好是底部,最后一帧会把跟随顺手救回来。
   * 但流式期间**内容一直在长**,而浏览器的落点是调用那一刻算死的、不跟着内容走。
   * 于是动画落在一个早就不是底部的位置上:中途那一帧上滚把跟随打掉,最后一帧
   * 不再贴底、也就没有那次搭救。跟随就此留在松开状态,用户一根手指都没碰过。
   *
   * 这三步的**顺序**也是不变量的一部分:先按当前几何算预测(`distanceFrom...` 读的是
   * 还没动的 `scrollTop`),再滚,最后落定基线。三步收在这一个函数里,是为了让
   * 「预测」和「移动」不可能再各写一份然后跑偏 —— 上一次就是两份拷贝只修了一份。
   */
  function scrollQuestionFormToTop(el: HTMLDivElement, formEl: HTMLElement): void {
    scrolledToFormRef.current.add(formEl.dataset.formId!);
    const distance = distanceFromBottomAfterAligningTop(el, formEl);
    formEl.scrollIntoView({ block: 'start', behavior: 'auto' });
    settleFollowAfterPredictedScroll(el, distance);
  }

  // Resize the tail spacer so the anchored message can sit at the top with
  // just enough room below it — no more. This is a resize ONLY (never a
  // scroll): shrinking empty space below the fold can't shift what's visible
  // while the user is pinned near the top, so it never causes jitter. As the
  // reply streams in, `needed` shrinks monotonically toward 0.
  function sizeAnchorSpacer() {
    const el = logRef.current;
    const spacer = tailSpacerRef.current;
    if (!el || !spacer) return;
    const msgTopInContent = lastUserMsgTopInContent(el);
    if (msgTopInContent === null) return;
    spacer.style.height = `${anchorSpacerHeight({
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      spacerHeight: spacer.offsetHeight,
      messageTopInContent: msgTopInContent,
    })}px`;
  }

  /**
   * 松手之后,把那块预留空白往回收一帧。返回 `true` = 还没收完,请再给一帧。
   *
   * ## 为什么松手之后还要收
   *
   * 钉顶松手时占位块是**冻住**的(见 `onScroll` 那段注释:留着当真实可滚区域,
   * 往下滚才不会突然到底)。代价是它整轮不动:实测一轮开始撑到 215px,32 秒后
   * 还是 215px,而这期间回复长了 522px。用户滚回底部看到的就是「内容一小块,
   * 下面一大片空白,浮动药丸孤零零挂在最底」。
   *
   * ## 什么时候收 —— 不是「离底 N 像素」,是「这块空白戳没戳进视口」
   *
   * 判据全在 `anchor-to-top.ts` 的 `shouldStartCollapsingTailSpacer` 里,那边有
   * 完整推导。这里只说结论:露出来超过 52px 才起手,起手之后闩上一路收到位,
   * 一帧最多让画面挪动 24px。三条合起来就是三个不变量 ——
   *
   *   · 用户在中间读东西时(空白整块在折线以下)一个像素都不动;
   *   · 门槛两侧反复微滚不会抖:起手只问一次,收缩只减不增;
   *   · 往下滚不会「跳」:单帧位移上限比一格触控板滚动还小。
   *
   * ## 【不变量】钉顶还活着的时候不许走这条路
   *
   * 那条路是 `sizeAnchorSpacer`,它是**等量置换**(内容长多少、空白收多少,总高
   * 恒定),所以钉住的消息一动不动。这里是**净减**,会把 `scrollTop` 夹回来。
   * 两条混用就会在流式期间把锚点晃掉,所以调用点只在 `anchorActiveRef` 为假时进。
   */
  function stepTailSpacerCollapse(): boolean {
    const el = logRef.current;
    const spacer = tailSpacerRef.current;
    if (!el || !spacer) return false;
    const spacerHeight = reservedTailHeight();
    if (spacerHeight <= 0) {
      tailSpacerCollapsingRef.current = false;
      return false;
    }
    const messageTopInContent = lastUserMsgTopInContent(el);
    if (messageTopInContent === null) return false;
    // 真实几何,不扣预留空白 —— 会不会被浏览器夹取看的就是这一份。
    const viewport = readViewportSample(el);
    const geometry = {
      spacerHeight,
      targetHeight: anchorSpacerHeight({
        clientHeight: viewport.clientHeight,
        scrollHeight: viewport.scrollHeight,
        spacerHeight,
        messageTopInContent,
      }),
      distanceFromBottom: distanceFromBottom(viewport),
    };
    if (!tailSpacerCollapsingRef.current) {
      if (!shouldStartCollapsingTailSpacer(geometry)) return false;
      tailSpacerCollapsingRef.current = true;
    }
    const next = nextCollapsingTailSpacerHeight(geometry);
    if (next === spacerHeight) return false;
    spacer.style.height = `${next}px`;
    return next > geometry.targetHeight;
  }

  /**
   * 把钉住的那条消息送到视口顶端。**每轮只叫一次**(新一轮渲染出来的那一帧)——
   * 之后它靠自己待在顶上,回复在下面长,所以我们再也不重滚;每来一块内容就重滚
   * 一次正是当初「往下滚打架 + 落定抖动」的来源。
   *
   * ## 【不变量】这一跳必须**瞬时**,而且走 `writeLogScrollTop`
   *
   * 平台不提供「这次滚动是谁发起的」,所以「用户是不是自己滚开了」只能看位置
   * (下面 `onScroll` 里的 `anchorReleasedByScroll`,以及 `stick-to-bottom.ts` 的
   * 方向判据)。`behavior:'smooth'` 于是会让这套机制**自己把自己判掉**:
   *
   *   · 动画中间的每一帧离落点都远超容差 → 第一帧就把钉住状态清掉,占位块从此
   *     不再收缩,回复下面留一块死空白;
   *   · 而落点恰好就是底部(占位块就是照着「落点 == 底部」撑的),所以回复还没
   *     开始吐字时,动画最后一帧是一次「向下滚动 + 落到底部」—— 贴底跟随被重新
   *     挂上,接着把用户一路拽到底。回复来得快慢决定落在哪一边,这就是用户说的
   *     「有时候有有时候没有」。
   *
   * 瞬时写入没有这个窗口:位置和基线在同一拍里落定(`writeLogScrollTop` 写完就
   * 记基线),随后浏览器补发的那个 scroll 事件读到的位置就是落点本身,既不构成
   * 方向,也不越过容差。同一条不变量在 `stick-to-bottom.ts` 和 question-form
   * 定位(`scrollQuestionFormToTop`)里都写过,这里是最后一处补齐。
   */
  function scrollAnchorToTop() {
    const el = logRef.current;
    if (!el) return;
    const msgTopInContent = lastUserMsgTopInContent(el);
    if (msgTopInContent === null) return;
    writeLogScrollTop(el, anchorScrollTop(msgTopInContent));
  }

  function jumpToBottom() {
    const el = logRef.current;
    if (!el) return;
    anchorActiveRef.current = false;
    armFollow();
    window.getSelection()?.removeAllRanges();
    resetTailSpacer();
    // 这一下用平滑滚动是刻意的:它是用户点出来的一次大跳,平滑更好读。
    // 中间那串 scroll 事件方向都是**向下**,按 `stick-to-bottom.ts` 的判据
    // 不会被误当成挣脱,所以不需要额外的「这是程序滚的」标记。
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    syncFollowState();
  }

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setComposerPortalTarget(document.body);
  }, []);

  useLayoutEffect(() => {
    if (tab !== 'chat') {
      setComposerPortalRect(null);
      return;
    }
    const slot = composerSlotRef.current;
    if (!slot || typeof window === 'undefined') return;

    let frame: number | null = null;
    const updateRect = () => {
      frame = null;
      const rect = slot.getBoundingClientRect();
      const paneTop = slot.closest<HTMLElement>('.pane')?.getBoundingClientRect().top ?? 0;
      setComposerPortalRect((prev) => {
        const next = {
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          bottom: Math.max(0, Math.round(window.innerHeight - rect.bottom)),
          top: Math.max(0, Math.round(paneTop)),
        };
        if (
          prev
          && prev.left === next.left
          && prev.width === next.width
          && prev.bottom === next.bottom
          && prev.top === next.top
        ) {
          return prev;
        }
        return next;
      });
    };
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateRect);
    };

    updateRect();
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleUpdate)
        : null;
    resizeObserver?.observe(slot);
    const pane = slot.closest('.pane');
    if (pane) resizeObserver?.observe(pane);
    window.addEventListener('resize', scheduleUpdate);
    window.visualViewport?.addEventListener('resize', scheduleUpdate);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.visualViewport?.removeEventListener('resize', scheduleUpdate);
    };
  }, [tab]);

  useLayoutEffect(() => {
    if (tab !== 'chat' || !composerPortalTarget || !composerPortalRect) return;
    const layer = composerLayerRef.current;
    if (!layer || typeof window === 'undefined') return;

    let frame: number | null = null;
    const updateHeight = () => {
      frame = null;
      const nextHeight = Math.ceil(layer.getBoundingClientRect().height);
      setComposerSlotHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateHeight);
    };

    updateHeight();
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleUpdate)
        : null;
    resizeObserver?.observe(layer);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [composerPortalRect, composerPortalTarget, tab]);

  const composerNode = (
    <>
      {/* 插件 / 设计百宝箱 live inside the composer's "+" menu (below 工作目录,
          hover to expand); they no longer sit as quick pills above the input. */}
    <ChatComposer
      ref={composerRef}
      quotes={quotes}
      onClearQuotes={clearQuotes}
      onRestoreQuotes={setQuotes}
      designSystemPicker={designSystemPicker}
      projectId={projectId}
      projectFiles={projectFiles}
      activeProjectFileName={activeProjectFileName}
      sessionMode={sessionMode}
      skills={skills}
      streaming={streaming}
      sendDisabled={sendDisabled}
      inputDisabled={viewerOnly}
      initialDraft={initialDraft}
      externalPendingUploads={homeAttachmentUploads}
      onRemoveExternalPendingUpload={onDismissHomeAttachmentUpload}
      composerPlaceholder={composerPlaceholder}
      placeholderScenarios={composerPlaceholderScenarios}
      draftStorageKey={composerDraftStorageKey}
      onEnsureProject={onEnsureProject}
      commentAttachments={commentsToAttachments(attachedComments)}
      onRemoveCommentAttachment={onDetachComment}
      onSend={(prompt, attachments, commentAttachments, meta) => {
        scrolledToFormRef.current = new Set();
        if (editingQueuedSendId && onUpdateQueuedSend) {
          const original = queuedItems.find((item) => item.id === editingQueuedSendId);
          const update: QueuedSendUpdate = {
            prompt,
            attachments,
            commentAttachments,
          };
          const nextMeta = meta ?? original?.meta;
          if (nextMeta !== undefined) update.meta = nextMeta;
          onUpdateQueuedSend(editingQueuedSendId, update);
          setEditingQueuedSendId(null);
          return;
        }
        armFollow();
        // Clear any stale reserve from the previous turn before the new one
        // renders, so a resend doesn't flash the new turn below a leftover gap
        // (release #3653). 「要不要钉顶」不在这里表态 —— 那是消息流水的结构
        // 说了算(见 `isNewTailUserTurn`),不然每加一个发送入口就要在这里补一行,
        // 而实际上从来没人补过。
        anchorActiveRef.current = false;
        resetTailSpacer();
        return onSend(prompt, attachments, commentAttachments, meta);
      }}
      onStop={onStop}
      onOpenSettings={onOpenSettings}
      onOpenMcpSettings={onOpenMcpSettings}
      onBrowsePlugins={onBrowsePlugins}
      onOpenConnectors={onOpenConnectors}
      petConfig={petConfig}
      onAdoptPet={onAdoptPet}
      onTogglePet={onTogglePet}
      onOpenPetSettings={onOpenPetSettings}
      researchAvailable={researchAvailable}
      projectMetadata={projectMetadata}
      onProjectMetadataChange={onProjectMetadataChange}
      activeWorkspaceContext={activeWorkspaceContext}
      initialWorkspaceContexts={initialWorkspaceContexts}
      workspaceContexts={workspaceContexts}
      byokApiProtocol={byokApiProtocol}
      byokImageModel={byokImageModel}
      onChangeByokImageModel={onChangeByokImageModel}
      byokVideoModel={byokVideoModel}
      onChangeByokVideoModel={onChangeByokVideoModel}
      byokSpeechModel={byokSpeechModel}
      onChangeByokSpeechModel={onChangeByokSpeechModel}
      byokSpeechVoice={byokSpeechVoice}
      onChangeByokSpeechVoice={onChangeByokSpeechVoice}
      currentSkillId={currentSkillId}
      onProjectSkillChange={onProjectSkillChange}
      pinnedPluginId={activePluginSnapshot?.pluginId ?? null}
      footerAccessory={composerFooterAccessory}
      leadingAccessory={composerLeadingAccessory}
      currentDesignSystemId={currentDesignSystemId}
      onActiveDesignSystemChange={onActiveDesignSystemChange}
      onShowToast={onShowToast}
    />
    </>
  );
  const shouldPortalComposer =
    tab === 'chat'
    && composerPortalTarget !== null
    && composerPortalRect !== null
    && composerPortalRect.width > 0;
  const composerSlotStyle: CSSProperties | undefined = shouldPortalComposer
    ? { minHeight: composerSlotHeight > 0 ? composerSlotHeight : undefined }
    : undefined;

  return (
    /* `chatSeam` 是 --chat-* 的唯一定义处。少了它,聊天树里所有 var(--chat-…) 静默落空 ——
       比如壳头「进行中」那句用 background-clip: text 上色,渐变一失效字就成透明的,
       页面上像是没渲染,而单测一条都不会红。
       抹在 .pane 自己身上、**不另外包一层**:包一层会打断 `.split-chat-slot > .pane`
       这类子选择器(全仓 11 条),聊天卡的圆角 / 白底 / backdrop-filter 会集体失效。 */
    <div {...chatSeam('pane')}>
        <div className="chat-project-header">
          {collapseControlLifted ? null : onCollapse ? (
            <button
              type="button"
              className="chat-project-back od-tooltip"
              onClick={onCollapse}
              title={t('chat.collapsePane')}
              aria-label={t('chat.collapsePane')}
              data-tooltip={t('chat.collapsePane')}
              data-tooltip-placement="bottom"
              data-testid="chat-collapse-toggle"
            >
              <Icon name="panel-left" size={16} />
            </button>
          ) : onBack ? (
            <button
              type="button"
              className="chat-project-back"
              onClick={onBack}
              title={backLabel}
              aria-label={backLabel}
            >
              <Icon name="arrow-left" size={16} />
            </button>
          ) : null}
          {projectHeader ? (
            <span className="chat-project-header-title">{projectHeader}</span>
          ) : null}
          <div
            className={`chat-history-wrap chat-session-switcher${showConvList ? ' open' : ''}`}
            ref={historyWrapRef}
          >
            {/*
              * 面板头第一颗图标键。稿子 `729fa43ce7`:
              * `docs/design/chat-panel/src/body-scene.html:7`
              *   `<button class="mod-tip-b" aria-label="历史会话" data-tip="历史会话">`
              *
              * **不再用原生 `title`** —— 稿子 `src/components.css:2684-2686` 点名反对:
              * 「原生 tip 要等半秒到两秒(各家浏览器不一,不可控),等到时手已经点下去了,
              * 起不到『先告诉你再点』的作用;而且原生样式跟不上这套配色。」
              * 换成产品统一的 `od-tooltip` + `data-tooltip`(`TooltipLayer`)。
              *
              * `mod-tip-b` = 气泡翻到按钮**下方**(`src/components.css:2720-2721`:
              * 面板头贴着面板顶边,朝上的气泡会顶出去),对应 `data-tooltip-placement="bottom"`。
              *
              * ⚠️ 原来的 `title` 还把当前会话标题拼在后面(`… · {activeConversation.title}`)。
              * 稿子的 tip 是**常量**,所以这里跟稿子走;那半句要不要找地方安置,待产品拍。
              */}
            <button
              type="button"
              className="chat-session-trigger icon-only od-tooltip"
              data-testid="conversation-history-trigger"
              data-tooltip={t('chat.conversationsTitle')}
              data-tooltip-placement="bottom"
              aria-label={t('chat.conversationsAria')}
              aria-haspopup="menu"
              aria-expanded={showConvList}
              onClick={() => {
                setShowConvList((v) => {
                  const next = !v;
                  if (next) {
                    trackChatPanelClick(analytics.track, {
                      page_name: 'chat_panel',
                      area: 'chat_panel',
                      element: 'history',
                    });
                  }
                  return next;
                });
              }}
            >
              <ChatHistoryGlyph />
            </button>
            {showConvList ? (
              <div className="chat-history-menu" role="menu" data-testid="conversation-history-menu">
                <div className="chat-history-menu-head">
                  <span className="chat-history-menu-title">
                    {t('chat.conversationsHeading')}
                    <span className="chat-history-menu-count">
                      <span data-testid="conversation-history-count">
                      {filteredConversations.length === conversations.length
                        ? compactCount(conversations.length)
                        : `${compactCount(filteredConversations.length)} / ${compactCount(conversations.length)}`}
                      </span>
                    </span>
                  </span>
                  {/*
                    * 这里原来还有一颗「新建」。**产品裁决 2026-09-03:新建入口只留
                    * 面板头那枚图标键**(`data-testid="chat-new-conversation"`,
                    * 稿子 `729fa43ce7:docs/design/chat-panel/src/body-scene.html:8`)——
                    * 同一个动作不该有两个口子。
                    *
                    * 删掉不影响可达性:两颗本来就同一个 `onNewConversation` 门槛
                    * (`onNewConversation ? … : null`)、同一个 `newConversationDisabled`,
                    * 面板头那枚在侧边聊天(`workspace/SideChatTab.tsx`)与只读项目下
                    * 一样渲染。这一行只剩标题 + 计数,`.chat-history-menu-head` 本来就
                    * 不画分隔线,不会留下空分区。 */}
                </div>
                <label className="chat-history-search">
                  <Icon name="search" size={12} />
                  <input
                    type="search"
                    value={conversationSearch}
                    onChange={(event) => setConversationSearch(event.currentTarget.value)}
                    placeholder={t('chat.conversationsSearchPlaceholder')}
                    data-testid="conversation-history-search"
                  />
                  {conversationSearch ? (
                    <button
                      type="button"
                      className="chat-history-search-clear"
                      onClick={() => setConversationSearch('')}
                      aria-label={t('chat.comments.clear')}
                    >
                      <Icon name="close" size={10} />
                    </button>
                  ) : null}
                </label>
                <div className="chat-history-list" data-testid="conversation-list">
                  {conversations.length === 0 ? (
                    <div className="chat-history-empty">
                      {t('chat.emptyConversations')}
                    </div>
                  ) : filteredConversations.length === 0 ? (
                    <div className="chat-history-empty">
                      {t('chat.conversationsNoMatches')}
                    </div>
                  ) : (
                    filteredConversations.map((c) => (
                      <ConversationRow
                        key={c.id}
                        conversation={c}
                        active={c.id === activeConversationId}
                        messageCount={conversationMessageCount(c, activeConversationId, messagesConversationId, messages.length)}
                        onSelect={() => {
                          onSelectConversation(c.id);
                          setShowConvList(false);
                        }}
                        onDelete={() => onDeleteConversation(c.id)}
                        t={t}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
          {/*
            * 面板头第二颗图标键「新会话」。稿子 `729fa43ce7`:
            * `docs/design/chat-panel/src/body-scene.html:8`
            *   `<button class="mod-tip-b" aria-label="新会话" data-tip="新会话">
            *      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            *        <path d="M12 5v14M5 12h14"/></svg></button>`
            * —— 紧挨着「历史会话」,同样 `mod-tip-b` ⇒ 气泡朝下。
            *
            * 行为**不新开一条**:走的就是既有的 `onNewConversation`,连
            * `newConversationDisabled` 一起沿用。
            *
            * **产品裁决 2026-09-03:这是新建会话的唯一入口** —— 历史下拉里那颗
            * 「新建」(`conversation-history-new`)已经删了,理由见上面那段注释。
            * e2e 的定位器一并改到这颗:`e2e/ui/app.test.ts`、
            * `e2e/ui/app-restoration.test.ts`、`e2e/ui/project-management-flows.test.ts`。
            */}
          {onNewConversation ? (
            <button
              type="button"
              className="chat-session-trigger chat-new-conversation od-tooltip"
              data-testid="chat-new-conversation"
              data-tooltip={t('chat.newSession')}
              data-tooltip-placement="bottom"
              aria-label={t('chat.newSession')}
              disabled={newConversationDisabled}
              onClick={() => {
                if (newConversationDisabled) return;
                trackChatPanelClick(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'chat_panel',
                  element: 'new_chat',
                });
                onNewConversation();
                setShowConvList(false);
              }}
            >
              <NewSessionGlyph />
            </button>
          ) : null}
        </div>
        {tab === 'chat' ? (
          <>
            <div className={`chat-log-wrap${chatLogTray ? ' has-chat-log-tray' : ''}`}>
              <div className="chat-log-viewport">
                <ChatMessageRail
                  items={chatRenderItems}
                  loading={loading}
                  logRef={logRef}
                  activeConversationKey={activeConversationId ?? 'no-conversation'}
                  onNavigate={handleChatRailNavigate}
                  t={t}
                />
                <div
                className={[
                  'chat-log',
                  loading ? 'is-loading' : '',
                  chatLogScrollable ? 'is-scrollable' : '',
                  chatLogScrolling ? 'is-scrolling' : '',
                  shouldBalanceFinishedTranscript ? 'is-balanced-transcript' : '',
                  /* 预留跟着**这一轮有没有计划**走,不跟着药丸此刻挂没挂。
                     理由见上面 `planPillEligible` 的注释:跟着可见性会抖。 */
                  planPillEligible ? 'has-plan-pill-reserve' : '',
                ].filter(Boolean).join(' ')}
                ref={logRef}
                data-testid="chat-log"
                /* 配平态原本只体现在类名上。类名是样式的私事(迁 CSS Module 就变哈希),
                   状态得有自己的出口 —— 测试断言这个属性,不去嗅类名。 */
                data-balanced={shouldBalanceFinishedTranscript ? 'true' : 'false'}
                aria-busy={loading}
                onClickCapture={(e) => {
                  const target = e.target as HTMLElement;
                  const log = logRef.current;
                  const scrollAnchor = log
                    ? captureElementScrollAnchor(log, target)
                    : null;
                  if (scrollAnchor && log) {
                    // QuestionForm swaps the active step / custom-answer row
                    // after this capture phase. Stop tail following before
                    // that layout change, then put the same visible control
                    // back at its previous viewport coordinate after commit.
                    releaseFollow();
                    anchorActiveRef.current = false;
                    requestAnimationFrame(() => {
                      const currentLog = logRef.current;
                      if (!currentLog) return;
                      const nextTop = scrollTopForElementScrollAnchor(currentLog, scrollAnchor);
                      if (nextTop !== null && Math.abs(nextTop - currentLog.scrollTop) >= 0.5) {
                        writeLogScrollTop(currentLog, nextTop);
                      } else {
                        rememberScrollSample(currentLog);
                      }
                      syncFollowState();
                    });
                  }
                  // Expanding an accordion (tool card / thinking block) should
                  // grow downward with the clicked header staying put. While a
                  // run is glued to the bottom, the ResizeObserver would re-pin
                  // to the bottom on the height change and push the header up,
                  // so unpin the moment the user toggles one open.
                  // `summary` covers the execution record and everything folded
                  // inside it — those disclosures are <details>, not buttons.
                  const toggle = target.closest(
                    'summary, .thinking-toggle, .action-card-toggle, button.op-card-head, [aria-expanded]',
                  );
                  if (toggle && log?.contains(toggle) && !scrollAnchor) {
                    releaseFollow();
                    anchorActiveRef.current = false;
                    // 浮标交给几何判 —— 老写法在这里无条件点亮它,于是在一屏装得下、
                    // 根本滚不动的对话里展开一个折叠块,也会冒出一颗「回到最新」。
                    syncFollowState();
                  }
                }}
              >
                {loading ? <ChatConversationLoading t={t} /> : null}
                {displayMessages.length === 0 && !loading ? (
                  <div className="chat-empty-wrap">
                    {showImportedFolderArtifacts ? (
                      <ImportedFolderArtifacts
                        projectId={projectId}
                        files={importedFolderArtifacts}
                        onOpenFile={onRequestOpenFile}
                        t={t}
                      />
                    ) : (
                      <>
                        {/* #5517 leaves the empty conversation pane clean — no
                            "start a conversation" title or starter template
                            cards; only the connect-repo note below survives. */}
                        {connectRepoNeeded ? (
                          <div className="chat-connect-repo" role="note">
                            <span className="chat-connect-repo-icon" aria-hidden>
                              <Icon name="github" size={18} />
                            </span>
                            <span className="chat-connect-repo-body">
                              <span className="chat-connect-repo-title">
                                {repoConnectCopy(t, githubConnected).cardTitle}
                              </span>
                              <span className="chat-connect-repo-text">
                                {repoConnectCopy(t, githubConnected).cardBody}
                              </span>
                            </span>
                            <button
                              type="button"
                              className="primary-ghost"
                              disabled={githubConnected === undefined}
                              onClick={() => onConnectRepo?.()}
                            >
                              <Icon name="github" size={13} />
                              {repoConnectCopy(t, githubConnected).buttonLabel}
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
                <ChatRows
                  items={chatRenderItems}
                  messages={displayMessages}
                  streaming={streaming}
                  onResendUserMessage={onResendUserMessage}
                  onRetryImage={handleRetryImage}
                  projectId={projectId}
                  projectKindForTracking={projectKindForTracking}
                  activeConversationId={activeConversationId}
                  activeConversationKey={activeConversationId ?? 'no-conversation'}
                  projectFiles={projectFiles}
                  projectMetadata={projectMetadata}
                  projectFileNames={projectFileNames}
                  projectResolvedDir={projectResolvedDir}
                  mediaTasksByRunId={mediaTasksByRunId}
                  onRequestOpenFile={onRequestOpenFile}
                  onRequestPluginDetails={onRequestPluginDetails}
                  onRequestDesignSystemDetails={onRequestDesignSystemDetails}
                  onRequestPluginFolderAgentAction={onRequestPluginFolderAgentAction}
                  activePluginActionPaths={activePluginActionPaths}
                  hiddenPluginActionPaths={hiddenPluginActionPaths}
                  onShareToOpenDesign={onShareToOpenDesign}
                  shareToOpenDesignBusyMessageId={shareToOpenDesignBusyMessageId}
                  forceStreamingMessageIds={forceStreamingMessageIds}
                  lastAssistantId={lastAssistantId}
                  activePluginSnapshot={activePluginSnapshot}
                  activeDesignSystem={activeDesignSystem}
                  hasActiveDesignSystem={hasActiveDesignSystem}
                  errorCardOwnerId={errorCardOwnerId}
                  nextUserContentByAssistantId={nextUserContentByAssistantId}
                  assistantCallbacksRef={assistantCallbacksRef}
                  onBrandBrowserAssistConfirm={onBrandBrowserAssistConfirm}
                  onArtifactShare={onArtifactShare}
                  onToolboxAction={handleToolboxAction}
                  onNextStepPromptAction={handleNextStepPromptAction}
                  onNextStepAiOptimize={onContinueBrandEnrichment}
                  nextStepAiOptimizeBusy={brandEnrichmentBusy}
                  onNextStepContinueExtraction={onContinueBrandExtraction}
                  nextStepContinueExtractionBusy={continueBrandExtractionBusy}
                  onNextStepContinueAiExtraction={onContinueBrandAgentExtraction}
                  nextStepContinueAiExtractionBusy={continueBrandAgentExtractionBusy}
                  onNextStepCreateDesign={onCreateDesignFromActiveDesignSystem}
                  nextStepCreateDesignBusy={createDesignFromActiveDesignSystemBusy}
                  onNextStepCreateDesignSystem={onCreateDesignSystemFromProject}
                  nextStepCreateDesignSystemBusy={createDesignSystemFromProjectBusy}
                  onPickSkill={handlePickSkill}
                  onNextStepSuggestion={handleNextStepSuggestion}
                  onArtifactDownload={onArtifactDownload}
                  nextStepSkills={skills}
                  nextStepVariant={nextStepVariant}
                  onForkFromMessage={viewerOnly ? undefined : onForkFromMessage}
                  // 只读访客发不出这一轮,自然也接不了上一轮的活 —— 和 Fork 同一条门
                  onContinueRemainingTasks={viewerOnly ? undefined : onContinueRemainingTasks}
                  onAssistantFeedback={onAssistantFeedback}
                  forkingMessageId={forkingMessageId}
                  t={t}
                  onSubmitQuestionForm={onSubmitQuestionForm}
                  questionFormSubmitDisabled={questionFormSubmitDisabled}
                  scrollContainerRef={logRef}
                  onVirtualScrollTopWrite={(element, top) => {
                    writeLogScrollTop(element, top);
                    syncFollowState();
                  }}
                  highlightedUserMessageId={chatRailHighlightedMessageId}
                />
                {displayError ? (
                  /*
                   * 报错卡(稿子组件 19)。终于接回产品 —— 之前 `RunErrorCard` 抽出来了
                   * 却只有验收陈列页在用,产品这一格仍是 `UserActionCard`:
                   * 说明被藏在折叠里,而稿子的 `errb` 是**一句话直接可见**。
                   *
                   * 卡上再没有第二层:标题 + 一句人话 + 一排动作,到此为止。
                   * 曾经挂在这里的「错误详情」折叠(诊断原文)已经整块下线
                   * (用户 2026-08-27);要原始日志走那一排里的〔导出日志〕。
                   */
                  <RunErrorCard
                    dataKind="run-recovery"
                    title={
                      runFailureUi
                        ? t(runFailureUi.titleKey)
                        : t('chat.runError.title.generic')
                    }
                    description={displayError}
                    actions={(
                      <>
                        {/*
                          * 稿子第 78 格那一排是〔联系支持〕〔导出日志〕〔从失败处重试〕——
                          * 前两颗次级、第三颗主。前两颗**不挑失败类型**(产品原话
                          * 「好多都应该得有导出日志这个按钮」),所以它们排在
                          * `showErrorActions` 之外:一张一颗按钮都没有的卡
                          * (CPU 不支持、运行时定义非法)照样有这两条出路。
                          */}
                        {/*
                          * 第 4 档(§6.Z):重试无效、我们也没别的出路时,这颗
                          * **从次级提为主** —— 不是新增一颗按钮,是同一颗换个分量。
                          * 位置不动:那一排在 274px 窄面板里的排布是量过的,
                          * 重排会把 e2e 的溢出判据一起动掉。
                          */}
                        {/*
                          * 可见提示按稿子 `729fa43ce7` 的 `src/body-scene.html:302`
                          * (`data-tip="联系支持"`)补上。
                          *
                          * ⚠️ 稿子这一颗**自相矛盾**:场景页是纯图标 + tip,组件全集页
                          * (`src/body-components.html:1452`)是图标 + 可见文字「联系」、
                          * 一个 tip 都没有。这里只补 tip、**不动形态**(产品今天是
                          * 图标 + 「联系支持」文字)——「要不要退回纯图标」是产品要拍的,
                          * 不能顺手做掉。
                          */}
                        <RunErrorCardAction
                          type="button"
                          className="od-tooltip"
                          variant={contactSupportIsPrimary ? 'primary' : 'secondary'}
                          data-testid="chat-error-contact-support"
                          data-tooltip={t('chat.runError.contactSupportCta')}
                          {...(contactSupportIsPrimary ? { 'data-primary': 'true' } : {})}
                          onClick={() => setSupportDialogOpen(true)}
                        >
                          <Icon name="headset" size={11} />
                          {t('chat.runError.contactSupportCta')}
                        </RunErrorCardAction>
                        <ExportLogsAction />
                        {showByokRecoveryCta ? (
                          <RunErrorCardAction
                            type="button"
                            variant="primary"
                            onClick={onSwitchToLocalCli}
                          >
                            {t('avatar.useLocal')}
                          </RunErrorCardAction>
                        ) : null}
                        {retryAssistant && onRetry && runFailureUi ? (
                          <RunErrorCardActionGroup>
                            {runFailureUi.primaryAction === 'authorize' ? (
                              // Sign in to AMR inline — the pill drives vela login,
                              // surfaces the activation URL/code when the browser
                              // doesn't auto-open, and on success we retry the run
                              // without bouncing the user out to Settings.
                              <AmrLoginPill
                                className="chat-error-amr-login"
                                signInLabel={t('chat.amrError.authorizeCta')}
                                amrEntrySourceDetail="chat_error_authorize_retry"
                                initialStatus={inlineAmrLoginStatus}
                                skipInitialRefresh
                                metricsConsent={config?.telemetry?.metrics === true}
                                installationId={config?.installationId}
                                showActivationDetails
                                hideSignedOutStatus
                                revealPendingCancelAction
                                onSignInStarted={() => {
                                  trackRecoveryClick(
                                    retryAssistant,
                                    'authorize_and_retry',
                                  );
                                  if (
                                    projectId
                                    && activeConversationId
                                    && amrAuthRetryMountId
                                    && amrAuthRetryWorkspaceIdentityKey
                                    && onArmAmrAuthRetryContinuation
                                  ) {
                                    onArmAmrAuthRetryContinuation({
                                      projectId,
                                      conversationId: activeConversationId,
                                      assistantId: retryAssistant.id,
                                      workspaceIdentityKey: amrAuthRetryWorkspaceIdentityKey,
                                      originMountId: amrAuthRetryMountId,
                                    });
                                  }
                                }}
                                onStatusChange={(loginStatus) => {
                                  consumeAmrAuthRetryIfAuthorized(loginStatus);
                                }}
                              />
                            ) : runFailureUi.primaryAction === 'launch-terminal-auth' ? (
                              <RunErrorCardAction
                                type="button"
                                variant="primary"
                                onClick={() => {
                                  onLaunchAntigravityOauth?.();
                                }}
                              >
                                {t('chat.antigravityError.launchTerminalCta')}
                              </RunErrorCardAction>
                            ) : runFailureUi.primaryAction === 'launch-terminal-switch-model' ? (
                              <RunErrorCardAction
                                type="button"
                                variant="primary"
                                onClick={() => {
                                  onLaunchAntigravityOauth?.();
                                }}
                              >
                                {t('chat.antigravityError.launchSwitchModelCta')}
                              </RunErrorCardAction>
                            ) : runFailureUi.primaryAction === 'switch-model' ? (
                              /*
                               * 模型下线 / 不在套餐里 —— 重试必然同样结果,所以这一档
                               * 不给重试(设计原则四)。
                               *
                               * 落点按交付稿:「更换模型**直接打开模型选择器**,选完自动
                               * 重跑」(`error-ux-design.md:130`)。宿主接了 `onSwitchModel`
                               * 就开 composer 那颗触发器背后的内联列表;没接的回落设置面板。
                               */
                              <RunErrorCardAction
                                type="button"
                                variant="primary"
                                data-testid="chat-error-switch-model"
                                onClick={() => {
                                  trackRecoveryClick(retryAssistant, 'switch_model_retry');
                                  if (onSwitchModel && retryAssistant) onSwitchModel(retryAssistant);
                                  else onOpenSettings?.('execution');
                                }}
                              >
                                {t('chat.runError.switchModelCta')}
                              </RunErrorCardAction>
                            ) : runFailureUi.primaryAction === 'open-settings' ? (
                              /*
                               * S30 环境类。落点是现成的那一条:设置 → 本地 CLI →
                               * 「高级:代理与自定义路径」,也就是 `execution` 这一节 ——
                               * 那个折叠块就渲染在 `activeSection === 'execution'` 里
                               * (`SettingsDialog.tsx` 的 `agent-cli-env`),而它填的
                               * `configuredEnv` 在 `runtimes/env.ts` 里优先级最高。
                               *
                               * 不新造入口,也不新增一档 recovery 埋点:这颗不起新 run,
                               * 和〔联系支持〕〔切到 Cloud〕同类。这张卡的重试仍按
                               * `secondaryRetry` 走 `manual_retry`。
                               */
                              <RunErrorCardAction
                                type="button"
                                variant="primary"
                                data-testid="chat-error-open-settings"
                                onClick={() => {
                                  onOpenSettings?.('execution');
                                }}
                              >
                                {t('chat.runError.openSettingsCta')}
                              </RunErrorCardAction>
                            ) : runFailureUi.primaryAction === 'recharge' ? (
                              <RunErrorCardAction
                                type="button"
                                variant="primary"
                                onClick={() => {
                                  const attribution = recordAmrEntry(
                                    analytics.track,
                                    'chat_error_recharge',
                                    new Date(),
                                    {
                                      metricsConsent:
                                        config?.telemetry?.metrics === true,
                                    },
                                  );
                                  // Forward the canonical telemetry device id to
                                  // AMR only on metrics opt-in (see
                                  // amrHandoffDeviceId). Sourced from the current
                                  // config.installationId / resolved device id,
                                  // not the mount-time bootstrap UUID, so the join
                                  // key matches the telemetry identity even across
                                  // a Delete-my-data rotation.
                                  const deviceId = amrHandoffDeviceId({
                                    metricsConsent:
                                      config?.telemetry?.metrics === true,
                                    resolvedDeviceId: getResolvedDeviceId(),
                                    installationId: config?.installationId,
                                  });
                                  window.open(
                                    attributedAmrUrl(
                                      amrRechargeUrlForProfile(amrProfile),
                                      attribution,
                                      deviceId,
                                    ),
                                    '_blank',
                                    'noopener,noreferrer',
                                  );
                                }}
                              >
                                {t('chat.amrError.rechargeCta')}
                              </RunErrorCardAction>
                            ) : runFailureUi.primaryAction === 'upgrade' ? (
                              <RunErrorCardAction
                                type="button"
                                variant="primary"
                                onClick={() => {
                                  const attribution = recordAmrEntry(
                                    analytics.track,
                                    'chat_error_upgrade',
                                    new Date(),
                                    {
                                      metricsConsent:
                                        config?.telemetry?.metrics === true,
                                    },
                                  );
                                  const deviceId = amrHandoffDeviceId({
                                    metricsConsent:
                                      config?.telemetry?.metrics === true,
                                    resolvedDeviceId: getResolvedDeviceId(),
                                    installationId: config?.installationId,
                                  });
                                  window.open(
                                    attributedAmrUrl(
                                      amrPlansUrlForProfile(amrProfile),
                                      attribution,
                                      deviceId,
                                    ),
                                    '_blank',
                                    'noopener,noreferrer',
                                  );
                                }}
                              >
                                {t('chat.amrBalanceGate.plansCta')}
                              </RunErrorCardAction>
                            ) : null}
                            {canResumeFailedRun ? (
                              // Resumable failure: continue the agent's existing
                              // CLI session instead of restarting from scratch, so
                              // partial work is kept. Replaces the from-scratch
                              // Retry as the single primary recovery action. Use
                              // the wired resume handler when present, otherwise a
                              // plain send of the continue prompt — never the
                              // re-sending Retry path, which would resume + repeat.
                              <RunErrorCardAction
                                type="button"
                                variant="primary"
                                onClick={() =>
                                  {
                                    trackRecoveryClick(retryAssistant, 'resume_run');
                                    if (onResumeRun) onResumeRun(retryAssistant);
                                    else onSend(RESUME_CONTINUE_PROMPT, [], []);
                                  }
                                }
                              >
                                {t('chat.resumeRunCta')}
                              </RunErrorCardAction>
                            ) : runFailureUi.primaryAction === 'retry' ||
                              runFailureUi.secondaryRetry ? (
                              /*
                               * 和旁边两颗**同一副壳**:稿子 3360-3377 那一排三颗都是
                               * `.btn`,差别只在 primary / secondary。原来这颗是裸
                               * `<button class="chat-error-action">`,自带 4px 圆角和
                               * 6px 14px 内距,而旁边两颗走共享 Button 的 sm(999px /
                               * 4px 11px)—— 排在一起圆角明显对不上(用户 2026-08-27)。
                               * 图标也照稿子补上:那一排三颗都带图标。
                               */
                              <RunErrorCardAction
                                type="button"
                                variant="primary"
                                data-testid="chat-error-retry"
                                onClick={() => {
                                  trackRecoveryClick(retryAssistant, 'manual_retry');
                                  onRetry(retryAssistant, 'manual_retry');
                                }}
                              >
                                <Icon name="refresh" size={11} />
                                {t('promptTemplates.retry')}
                              </RunErrorCardAction>
                            ) : null}
                          </RunErrorCardActionGroup>
                        ) : null}
                      </>
                    )}
                  />
                ) : null}
                {showAmrGuidance && amrSwitchPayload ? (
                  <AmrGuidance
                    {...amrSwitchPayload}
                    sourceDetail="chat_error_switch_retry_card"
                    metricsConsent={config?.telemetry?.metrics === true}
                    onActivate={() => {
                      if (retryAssistant && onSwitchToAmrAndRetry) {
                        trackRecoveryClick(retryAssistant, 'switch_runtime_retry', {
                          agentProviderId: 'amr',
                          modelId: config?.agentModels?.amr?.model?.trim() || 'default',
                        });
                        onSwitchToAmrAndRetry(retryAssistant);
                      } else {
                        onOpenAmrSettings?.();
                      }
                    }}
                  />
                ) : null}
                {/*
                  * 升级卡(交付稿第 75 / 76 格)。**流水里的一张卡,不是弹窗** ——
                  * 产品 2026-08-26 裁决「告警可继续的不弹窗,只有卡片;余额不足再弹窗」。
                  * 它落在最后一轮之后、输入框之前,不挡发送(D4)。
                  * 和 `PlanPill` 不同:那枚是钉在 composer 上方的,这张在流水里随内容滚。
                  */}
                {amrBalanceCardUsd != null ? (
                  <UpgradeCard
                    balanceUsd={amrBalanceCardUsd}
                    onUpgrade={
                      onAmrBalanceUpgrade ?? (() => openAmrPlans('chat_upgrade_card'))
                    }
                  />
                ) : null}
                {/*
                 * 组件 22(重连,第 82–84 格 · S29):产品裁决用设计稿现有的设计,
                 * 位置在**会话中最后一行**。`reconnect` 为空就整行不在 ——
                 * 「恢复后自动消失」是这样成立的,不是靠再画一句「已恢复」。
                 *
                 * run 被用户手动终止时不在这里再画一条暂停状态。它已经由对应
                 * AssistantMessage 的回合 footer 显示「已手动停止」;live 消息与
                 * 历史回放都走同一份 `displayMessages` 渲染路径,尾部重复一行会让
                 * 同一个 terminal status 出现两次。真正的暂停任务形态仍由组件 20
                 * 自己保留,不能拿 run 的 `canceled/user_stop` 冒充。
                 */}
                {reconnect ? (
                  <Reconnect
                    attempt={reconnect.attempt}
                    max={reconnect.max}
                    exhausted={reconnect.exhausted}
                    reason={reconnect.reason}
                    /* 〔重新连接〕只属于传输层那一行:线断了才有东西可重连。
                       daemon 重跑一轮时连接是通的,给一颗「重新连接」既没有对应的
                       动作,也会让用户以为是自己网络的问题。 */
                    onReconnect={reconnect.reason === 'transport' ? onManualReconnect : undefined}
                  />
                ) : null}
                {/* Dynamic spacer: when a turn is anchored to the top, this
                    grows just enough to let the user message reach the top of
                    the viewport, then shrinks as the reply streams in below. */}
                <div className="chat-log-tail-spacer" ref={tailSpacerRef} aria-hidden />
                {/* 正文取词的浮条:只认 chat-log 里的选区(输入框、侧栏的选中不该弹它) */}
                <QuoteBar
                  scopeRef={logRef}
                  onQuote={handleQuote}
                  onSelectionActivityChange={handleQuoteSelectionActivityChange}
                />
                </div>
                {/* 底部只有这一个浮层位:宿主统一负责水平中线与 bottom,两个胶囊
                    只负责自己的外观。谁占着由**滚动位置**定(见上面 `planPillVisible`),
                    所以这里永远只挂一个 —— 二选一是真的二选一,没有「同时出现时谁上移
                    一档」这种情况可讲。

                    占位的那个直接不挂另一个,而不是只摘 active class:两个胶囊叠在
                    同一个 flex 位上时,收着的那个仍占宽度,会把占着的那个推离中线。

                    Plan 让开时 Jump 是「已经点亮着挂上来」的,没有入场动画 —— 这是
                    有意的:它跟着用户的滚动走,立刻出现比补一段 200ms 淡入更跟手。
                    没有 Plan 那一路 Jump 仍旧常驻,进 / 退场 transition 完整播放。
                    会话历史打开时也不删它(OPEND-2420),遮挡仍由堆叠层负责。 */}
                <div
                  className={`chat-bottom-float-slot${planPillVisible ? ' has-plan-pill' : ''}`}
                  data-testid="chat-bottom-float-slot"
                >
                  {planPillVisible ? (
                    <PlanPill
                      todos={planPillTodos}
                      running={planPillRunning}
                    />
                  ) : (
                    <button
                      type="button"
                      ref={jumpBtnGlassRef}
                      className={`chat-jump-btn od-glass-refract${showJumpToLatest ? ' chat-jump-btn-active' : ''}`}
                      data-testid="chat-jump-btn"
                      onClick={jumpToBottom}
                      title={t('chat.scrollToLatest')}
                      aria-hidden={!showJumpToLatest}
                      tabIndex={showJumpToLatest ? 0 : -1}
                    >
                      <Icon name="arrow-up" size={14} style={{ transform: 'rotate(180deg)' }} />
                      <span>{t('chat.jumpToLatest')}</span>
                    </button>
                  )}
                </div>
              </div>
              {chatLogTray}
            </div>
            <QueuedSendStrip
              containerRef={queuedSendStripRef}
              items={queuedItems}
              editingId={editingQueuedSendId}
              onEdit={(item) => {
                trackMessageQueueClick(analytics.track, {
                  page_name: 'chat_panel',
                  area: 'message_queue',
                  element: 'edit',
                  project_id: projectId ?? '',
                  queue_length: queuedItems.length,
                });
                restoreQueuedSendToComposer(item);
              }}
              onRemove={onRemoveQueuedSend
                ? (id) => {
                    trackMessageQueueClick(analytics.track, {
                      page_name: 'chat_panel',
                      area: 'message_queue',
                      element: 'delete',
                      project_id: projectId ?? '',
                      queue_length: queuedItems.length,
                    });
                    onRemoveQueuedSend(id);
                  }
                : undefined}
              onReorder={onReorderQueuedSends}
              onSendNow={onSendQueuedNow
                ? (id) => {
                    trackMessageQueueClick(analytics.track, {
                      page_name: 'chat_panel',
                      area: 'message_queue',
                      element: 'send_now',
                      project_id: projectId ?? '',
                      queue_length: queuedItems.length,
                    });
                    onSendQueuedNow(id);
                  }
                : undefined}
              onSteer={onSteerQueuedSend
                ? (item) => {
                    trackMessageQueueClick(analytics.track, {
                      page_name: 'chat_panel',
                      area: 'message_queue',
                      element: 'steer',
                      project_id: projectId ?? '',
                      queue_length: queuedItems.length,
                    });
                    onSteerQueuedSend(item.id);
                  }
                : undefined}
              steerBlockedReason={steerBlockedReason ?? null}
            />
            <div
              className="chat-composer-slot"
              ref={composerSlotRef}
              style={composerSlotStyle}
              aria-hidden={shouldPortalComposer ? true : undefined}
            >
              {shouldPortalComposer ? null : composerNode}
            </div>
            {shouldPortalComposer && composerPortalTarget && composerPortalRect
              ? createPortal(
                  /*
                   * portal 出去的那一层要**自带 `--chat-*` 接缝**。
                   *
                   * 自定义属性按 DOM 树继承,而这一层挂在 `<body>` 下 —— 落在页面
                   * 那个接缝之外,输入框里每一个消费 `--chat-*` 的组件同时失效,
                   * 而且**不报错**:真机上注释芯片的边框、底色、关闭键的圆圈全没了,
                   * 只有 `border-radius: 50%` 活着(它是字面量,不走变量)。
                   * `ChatRoot.tsx` 的注释预言过这条;今天这是第三次
                   * (联系支持弹窗、产物卡浮层、输入框)。
                   */
                  <div
                    {...chatSeam('chat-composer-fixed-layer')}
                    ref={composerLayerRef}
                    data-chat-panel-top={composerPortalRect.top}
                    style={{
                      left: composerPortalRect.left,
                      bottom: composerPortalRect.bottom,
                      width: composerPortalRect.width,
                    }}
                  >
                    {composerNode}
                  </div>,
                  composerPortalTarget,
                )
              : null}
          </>
        ) : null}
      {/*
        * 联系支持弹窗(交付稿第 80 格)。**压在整个应用上**,不是报错卡里的一块 ——
        * 组件自己走 portal 到 body,所以挂在这里不受聊天区滚动 / 层叠上下文影响。
        * 渠道由调用方给,单一出处在 `chat/support-channels.tsx`。
        */}
      {supportDialogOpen ? (
        <SupportDialog
          channels={supportChannels(t)}
          onClose={() => setSupportDialogOpen(false)}
        />
      ) : null}
      {/*
        * 重复取词的轻提示(OPEND-2546)。挂在 quote 列表的拥有者这一层,
        * 不能挂在浮条上:`handleQuote` 最后一步就是清选区,浮条当场卸载。
        *
        * `key` 必须跟着每一次重复走,否则第二次重复只是换了个同名的 message,
        * Toast 的计时器不重新起跑,提示会按第一次的点消失。
        */}
      {quoteNotice ? (
        <Toast
          key={quoteNotice.key}
          message={quoteNotice.message}
          onDismiss={() => setQuoteNotice(null)}
        />
      ) : null}
    </div>
  );
}

interface AssistantCallbacks {
  onSubmitQuestionForm: QuestionFormSubmitHandler | undefined;
  onContinueRemainingTasks:
    | ((assistantMessage: ChatMessage, todos: TodoItem[]) => void)
    | undefined;
  onAssistantFeedback:
    | ((message: ChatMessage, change: ChatMessageFeedbackChange) => void)
    | undefined;
  onBrandBrowserAssistConfirm: BrandBrowserAssistConfirm | undefined;
  onArtifactShare: ((fileName: string, anchorId?: string) => void) | undefined;
  onForkFromMessage: ((message: ChatMessage) => void) | undefined;
  onShareToOpenDesign: ((assistantMessageId: string) => void) | undefined;
  onNextStepAiOptimize: (() => void) | undefined;
  onNextStepContinueExtraction: (() => void) | undefined;
  onNextStepContinueAiExtraction: (() => void) | undefined;
  onNextStepCreateDesign: (() => void) | undefined;
  onNextStepCreateDesignSystem: (() => void) | undefined;
}

type ChatRailMessage = {
  message: ChatMessage;
  messageIndex: number;
  userIndex: number;
};

/**
 * 右侧的用户消息导轨。
 *
 * **入参是渲染项,不是原始流水**:导轨上的每一个点都必须在正文里点得到一条真消息,
 * 而「正文画哪些」只有 `buildChatRenderItems` 说了算。导轨从前自己按
 * `role === 'user'` 数一遍,于是把表单答案那条(正文按 #5496 收走了)也数了进去 ——
 * 导轨 2 个点、正文 1 个气泡,点那多出来的点跳向一条没渲染的消息。
 * 两边吃同一个数组,这种漂移就不可能再发生。
 */
function ChatMessageRail({
  items,
  loading,
  logRef,
  activeConversationKey,
  onNavigate,
  t,
}: {
  items: ChatRenderItem[];
  loading: boolean;
  logRef: MutableRefObject<HTMLDivElement | null>;
  activeConversationKey: string;
  onNavigate: (message: ChatMessage, messageIndex: number) => void;
  t: TranslateFn;
}) {
  const railMessages = useMemo<ChatRailMessage[]>(
    () =>
      items.reduce<ChatRailMessage[]>((railItems, item) => {
        if (item.message.role !== 'user') return railItems;
        railItems.push({
          message: item.message,
          messageIndex: item.messageIndex,
          userIndex: railItems.length,
        });
        return railItems;
      }, []),
    [items],
  );
  /**
   * 导轨的输入认**内容**,不认数组引用。
   *
   * **不变量:用户消息没有变化时,`userMessages` 必须保持同一个引用。**
   *
   * `messages` 在流式期间每帧都是新数组 —— `updateMessageById` 的
   * `setMessages((curr) => curr.map(...))` 无条件返回新数组,而缓冲文本按
   * `requestAnimationFrame` 提交(见 `ProjectView.tsx` 的 `createBufferedTextUpdates`)。
   * 长在助手那条消息上的正文,和导轨没有半点关系。
   *
   * 直接 `useMemo(..., [messages])` 会把那份每帧换引用的数组喂给下面三条 effect:
   * 「会话复位」那条每帧把活动点写回**第一条**,滚动侦听那条每帧重挂、rAF 里又写成
   * **离滚动位置最近**的那条 —— 两个值不同,`Object.is` 短路不了,活动点每帧来回跳两次。
   * 每一次 passive flush 都排一次新更新,React 的 `nestedPassiveUpdateCount` 因此
   * 永不归零,约 51 帧后报 `Maximum update depth exceeded`(真机 2026-08-28)。
   * 「滚轮」那条还会每帧重发一次 `scrollTo({behavior:'smooth'})`,平滑滚动永远到不了终点。
   *
   * 签名带上 id、正文和它在整条消息流里的下标 —— 导轨读的就是这三样
   * (`onNavigate` 只用 `message.id` 与 `messageIndex`),所以按签名复用旧对象
   * 不会读到过期的东西。
   */
  const railSignature = railMessages
    .map((item) => [item.messageIndex, item.message.id, item.message.content].join('\u0001'))
    .join('\u0002');
  const userMessages = useMemo<ChatRailMessage[]>(
    () => railMessages,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 见上:刻意只认签名
    [railSignature],
  );
  const [preview, setPreview] = useState<{ id: string; y: number } | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  // Picking a message retracts the module until the pointer leaves it, so the
  // jump lands without the rail lingering over the destination.
  const [retracted, setRetracted] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  /*
   * 换会话就把上一段的选择忘掉 —— 判据只有会话本身。
   *
   * `userMessages` 曾经也在依赖里,那是这条 effect 和下面滚动侦听那条抢同一个
   * `activeMessageId` 的原因:新会话的第一条 vs 当前滚动位置最近的一条,
   * 两个值不同,于是每次消息列表换引用就来回改一次。会话没换的时候,
   * 这条 effect 本来就没有事可做。
   */
  useEffect(() => {
    setPreview(null);
    setRetracted(false);
    setActiveMessageId(null);
  }, [activeConversationKey]);

  // Roll the wheel: keep the active dot at the vertical middle of the track
  // viewport, so the dot column scrolls under the top/bottom fade masks as
  // the chat scrolls. The browser clamps the target at both extremes.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !activeMessageId) return;
    // While the pointer is on the rail the user may be wheel-scrolling it
    // manually; auto-follow would yank their position, so it yields until
    // the pointer leaves.
    if (navRef.current?.matches(':hover')) return;
    const index = userMessages.findIndex(
      (item) => item.message.id === activeMessageId,
    );
    if (index < 0) return;
    // Marker pitch is 11px (8px marker + 3px gap); +4 targets the dot center.
    const top = index * 11 + 4 - track.clientHeight / 2;
    if (typeof track.scrollTo === 'function') {
      track.scrollTo({ top, behavior: 'smooth' });
    } else {
      track.scrollTop = top;
    }
  }, [activeMessageId, userMessages]);

  // The track scrolls, so the preview anchor is measured from the marker's
  // on-screen position at hover time instead of derived from its index.
  const showPreview = (id: string, marker: HTMLElement) => {
    if (retracted) return;
    const nav = navRef.current;
    const y = nav
      ? marker.getBoundingClientRect().top - nav.getBoundingClientRect().top + 4
      : 0;
    setPreview({ id, y });
  };

  useEffect(() => {
    const log = logRef.current;
    if (!log || userMessages.length < CHAT_RAIL_MIN_USER_MESSAGES) return;
    let frame = 0;
    const updateActiveMessage = () => {
      frame = 0;
      const visible = userMessages
        .map((item) => {
          const node = findChatMessageElement(log, item.message.id);
          if (!node) return null;
          return {
            id: item.message.id,
            distance: Math.abs(node.offsetTop - log.scrollTop),
          };
        })
        .filter((item): item is { id: string; distance: number } => item != null)
        .sort((a, b) => a.distance - b.distance)[0];

      if (visible) {
        // 值没变就原地返回:同一个滚动位置在流式期间会被反复重新测量,
        // 每次都排一次重渲会把 React 的嵌套更新计数顶到上限。同 `syncFollowState`。
        setActiveMessageId((prev) => (prev === visible.id ? prev : visible.id));
        return;
      }

      const maxScrollTop = Math.max(1, log.scrollHeight - log.clientHeight);
      const index = Math.round(
        (log.scrollTop / maxScrollTop) * (userMessages.length - 1),
      );
      const boundedIndex = Math.min(
        userMessages.length - 1,
        Math.max(0, index),
      );
      const fallbackId = userMessages[boundedIndex]?.message.id ?? null;
      setActiveMessageId((prev) => (prev === fallbackId ? prev : fallbackId));
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveMessage);
    };
    scheduleUpdate();
    log.addEventListener('scroll', scheduleUpdate, { passive: true });
    return () => {
      log.removeEventListener('scroll', scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [logRef, userMessages]);

  if (loading || userMessages.length < CHAT_RAIL_MIN_USER_MESSAGES) {
    return null;
  }

  const previewItem =
    userMessages.find((item) => item.message.id === preview?.id) ?? null;
  const hoverIndex =
    !retracted && preview
      ? userMessages.findIndex((item) => item.message.id === preview.id)
      : -1;

  return (
    <nav
      ref={navRef}
      className={`chat-message-rail${retracted ? ' is-retracted' : ''}`}
      aria-label={t('chat.messageRail.aria')}
      onMouseLeave={() => {
        setPreview(null);
        setRetracted(false);
      }}
      onWheel={(ev) => {
        // The nav is a full-height hit zone; wheeling over its empty parts
        // (outside the track, which scrolls natively) still rolls the wheel.
        const track = trackRef.current;
        if (!track || track.contains(ev.target as Node)) return;
        track.scrollTop += ev.deltaY;
      }}
      data-wheel={userMessages.length > CHAT_RAIL_WHEEL_MIN_USER_MESSAGES ? 'true' : 'false'}
      data-testid="chat-message-rail"
    >
      <div className="chat-message-rail__track" ref={trackRef}>
        {userMessages.map((item) => {
          const active = item.message.id === activeMessageId;
          const previewing = item.message.id === preview?.id;
          return (
            <button
              key={item.message.id}
              type="button"
              className={[
                'chat-message-rail__marker',
                active ? 'is-active' : '',
                previewing ? 'is-previewing' : '',
              ].filter(Boolean).join(' ')}
              aria-label={t('chat.messageRail.jumpAria', {
                index: item.userIndex + 1,
              })}
              style={{
                '--chat-rail-dash': `${
                  hoverIndex < 0
                    ? CHAT_RAIL_DASH_BASE_PX
                    : chatRailDashWidth(Math.abs(item.userIndex - hoverIndex))
                }px`,
              } as CSSProperties}
              onMouseEnter={(ev) => showPreview(item.message.id, ev.currentTarget)}
              onFocus={(ev) => showPreview(item.message.id, ev.currentTarget)}
              onBlur={() => setPreview(null)}
              onClick={() => {
                setPreview(null);
                setRetracted(true);
                onNavigate(item.message, item.messageIndex);
              }}
            >
              <span aria-hidden />
            </button>
          );
        })}
      </div>
      {/* Sibling of the track, not a child: the track fades its extremes with
          a mask, which must not wash out the hover preview card. */}
      {previewItem && preview ? (
        <div
          className="chat-message-rail__preview"
          style={{
            '--chat-message-rail-y': `${preview.y}px`,
          } as CSSProperties}
          role="tooltip"
        >
          <p>
            {previewItem.message.content.trim() || t('chat.messageRail.empty')}
          </p>
        </div>
      ) : null}
    </nav>
  );
}

function findChatMessageElement(
  log: HTMLElement,
  messageId: string,
): HTMLElement | null {
  const nodes = log.querySelectorAll<HTMLElement>('[data-chat-message-id]');
  for (const node of nodes) {
    if (node.dataset.chatMessageId === messageId) return node;
  }
  return null;
}

function scrollChatLogToMessage(
  log: HTMLElement,
  messages: ChatMessage[],
  messageId: string,
  messageIndex: number,
) {
  const target = findChatMessageElement(log, messageId);
  if (target) {
    target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    return;
  }

  const maxScrollTop = Math.max(0, log.scrollHeight - log.clientHeight);
  const ratio =
    messages.length <= 1
      ? 0
      : Math.min(1, Math.max(0, messageIndex / (messages.length - 1)));
  log.scrollTo({ top: maxScrollTop * ratio, behavior: 'smooth' });
  window.requestAnimationFrame(() => {
    findChatMessageElement(log, messageId)?.scrollIntoView?.({
      block: 'center',
      behavior: 'smooth',
    });
  });
}

type ChatRenderItem = {
  kind: 'message';
  key: string;
  message: ChatMessage;
  /**
   * 这条消息在**未过滤**的 `displayMessages` 里的下标。
   *
   * 导轨跳转的降级路径按「第几条 / 一共几条」估一个滚动比例
   * (`scrollChatLogToMessage`),量的是整条流水,不是画出来的那一部分。
   * 记在这里,是为了让导轨不必再拿着原数组自己数一遍 —— 它现在只认渲染项。
   */
  messageIndex: number;
};

function ChatConversationLoading({ t }: { t: TranslateFn }) {
  return (
    <div className="chat-loading-state" role="status" aria-live="polite">
      <span className="chat-loading-mark" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span className="chat-loading-copy">{t('common.loading')}</span>
      <span className="chat-loading-lines" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

function ChatRows({
  items,
  messages,
  streaming,
  onResendUserMessage,
  onRetryImage,
  projectId,
  projectKindForTracking,
  activeConversationId,
  activeConversationKey,
  projectFiles,
  projectMetadata,
  projectFileNames,
  projectResolvedDir,
  mediaTasksByRunId,
  onRequestOpenFile,
  onRequestPluginDetails,
  onRequestDesignSystemDetails,
  onRequestPluginFolderAgentAction,
  activePluginActionPaths,
  hiddenPluginActionPaths,
  onShareToOpenDesign,
  shareToOpenDesignBusyMessageId,
  forceStreamingMessageIds,
  lastAssistantId,
  activePluginSnapshot,
  activeDesignSystem,
  hasActiveDesignSystem,
  errorCardOwnerId,
  nextUserContentByAssistantId,
  assistantCallbacksRef,
  onBrandBrowserAssistConfirm,
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
  nextStepVariant,
  onForkFromMessage,
  onContinueRemainingTasks,
  onAssistantFeedback,
  forkingMessageId,
  t,
  onSubmitQuestionForm,
  questionFormSubmitDisabled,
  scrollContainerRef,
  onVirtualScrollTopWrite,
  highlightedUserMessageId,
}: {
  /**
   * 要画的那些行 —— 由 `ChatPane` 算好递进来(`buildChatRenderItems`)。
   *
   * 不在这里自己算,是为了让正文、导轨、钉顶读到的是**同一个数组**,
   * 而不是同一段逻辑的三份拷贝。见 `buildChatRenderItems` 的注释。
   */
  items: ChatRenderItem[];
  /**
   * **未过滤**的整条流水。跨轮推导要用到被 `items` 收走的那些消息:
   * 「上一轮宣布过哪些待办」和「助手换没换人」数的是真实回合,不是画出来的行。
   */
  messages: ChatMessage[];
  onResendUserMessage?: (message: ChatMessage) => void;
  /** 生图失败格的「重试」—— 见 ChatPane 的 handleRetryImage(D59) */
  onRetryImage?: (row: { total: number; done: number; failed: number }, index: number) => void;
  streaming: boolean;
  projectId: string | null;
  projectKindForTracking: TrackingProjectKind | null;
  activeConversationId: string | null;
  activeConversationKey: string;
  projectFiles: ProjectFile[];
  projectMetadata?: ProjectMetadata;
  projectFileNames?: Set<string>;
  // Daemon-resolved on-disk working directory of the current project —
  // positive-proof anchor for chat file-link routing (see AssistantMessage).
  projectResolvedDir?: string | null;
  mediaTasksByRunId: Map<string, ProjectMediaTask[]>;
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginDetails?: (pluginId: string) => void;
  onRequestDesignSystemDetails?: (system: DesignSystemSummary) => void;
  onRequestPluginFolderAgentAction?: (relativePath: string, action: PluginFolderAgentAction) => void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  onShareToOpenDesign?: (assistantMessageId: string) => void;
  shareToOpenDesignBusyMessageId?: string | null;
  forceStreamingMessageIds?: Set<string>;
  lastAssistantId: string | undefined;
  activePluginSnapshot?: AppliedPluginSnapshot | null;
  activeDesignSystem?: DesignSystemSummary | null;
  hasActiveDesignSystem: boolean;
  errorCardOwnerId: string | null;
  nextUserContentByAssistantId: Map<string, string>;
  assistantCallbacksRef: MutableRefObject<AssistantCallbacks>;
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
  /** `anchorId` 由产物卡那枚胶囊带上:菜单开在它旁边,而不是预览区右上角。 */
  onArtifactShare?: (fileName: string, anchorId?: string) => void;
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
  /** 把一条「下一步引导」填入 Composer,等用户确认后发送 */
  onNextStepSuggestion?: (text: string) => void;
  /** `anchorId` 同上。 */
  onArtifactDownload?: (fileName: string, anchorId?: string) => void;
  nextStepSkills?: SkillSummary[];
  nextStepVariant?: NextStepActionsVariant;
  onForkFromMessage?: (message: ChatMessage) => void;
  onContinueRemainingTasks?: (
    assistantMessage: ChatMessage,
    todos: TodoItem[],
  ) => boolean | void | Promise<boolean | void>;
  onAssistantFeedback?: (message: ChatMessage, change: ChatMessageFeedbackChange) => void;
  forkingMessageId?: string | null;
  t: TranslateFn;
  onSubmitQuestionForm?: QuestionFormSubmitHandler;
  questionFormSubmitDisabled: boolean;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  onVirtualScrollTopWrite: (element: HTMLDivElement, top: number) => void;
  highlightedUserMessageId?: string | null;
}) {
  /**
   * 每条助手消息「在它之前这场对话已经宣布过的那份清单」。
   *
   * 只有这一层拿得到别的轮次 —— `AssistantMessage` 只认识自己那一条消息,所以
   * 跨轮召回的判定材料必须在这里算好递下去。它**不控制显示**:本轮清单里没有同名条目
   * 时它一次都不会被查到(`build-turn-blocks` 的 `previous.has`),agent 不重发
   * 就天然什么都不出。
   */
  const previousTodosByMessageId = useMemo(
    () => previousTodosByAssistantMessageId(messages),
    [messages],
  );
  const assistantRoleByMessageId = useMemo(() => {
    const byMessageId = new Map<string, boolean>();
    let previousAssistantIdentity: string | null = null;

    for (const message of messages) {
      if (message.role !== 'assistant') {
        previousAssistantIdentity = null;
        continue;
      }
      const identity = message.agentId ?? message.agentName ?? 'assistant';
      byMessageId.set(message.id, identity !== previousAssistantIdentity);
      previousAssistantIdentity = identity;
    }
    return byMessageId;
  }, [messages]);
  const virtualized = items.length > CHAT_MESSAGE_VIRTUALIZE_THRESHOLD;
  const virtualWindow = useMeasuredVirtualWindow(items, {
    enabled: virtualized,
    containerRef: scrollContainerRef,
    estimateSize: estimateChatRenderItemHeight,
    overscanPx: CHAT_MESSAGE_OVERSCAN_PX,
    resetKey: activeConversationKey,
    initialTailRows: CHAT_VIRTUAL_INITIAL_TAIL_ROWS,
    onScrollTopWrite: onVirtualScrollTopWrite,
  });

  const renderItem = (item: ChatRenderItem) => {
    const m = item.message;
    const messageStreaming = isAssistantMessageStreaming(
      m,
      streaming,
      lastAssistantId,
      forceStreamingMessageIds,
    );
    if (m.role === 'user') {
      return (
        <UserMessage
          message={m}
          projectId={projectId}
          projectFileNames={projectFileNames}
          onRequestOpenFile={onRequestOpenFile}
          t={t}
          highlighted={highlightedUserMessageId === m.id}
          onResend={onResendUserMessage}
        />
      );
    }
    return (
      <AssistantMessage
        message={m}
        streaming={messageStreaming}
        projectId={projectId}
        projectKind={projectKindForTracking}
        conversationId={activeConversationId}
        projectFiles={projectFiles}
        projectMetadata={projectMetadata}
        projectFileNames={projectFileNames}
        projectResolvedDir={projectResolvedDir}
        mediaTasks={m.runId ? mediaTasksByRunId.get(m.runId) : undefined}
        onRequestOpenFile={onRequestOpenFile}
        onRetryImage={onRetryImage}
        onRequestPluginFolderAgentAction={onRequestPluginFolderAgentAction}
        activePluginActionPaths={activePluginActionPaths}
        hiddenPluginActionPaths={hiddenPluginActionPaths}
        onShareToOpenDesign={
          onShareToOpenDesign
            ? () => assistantCallbacksRef.current.onShareToOpenDesign?.(m.id)
            : undefined
        }
        shareToOpenDesignBusy={shareToOpenDesignBusyMessageId === m.id}
        showRole={assistantRoleByMessageId.get(m.id) ?? true}
        isLast={m.id === lastAssistantId}
        errorCardOwnerId={errorCardOwnerId}
        nextUserContent={nextUserContentByAssistantId.get(m.id)}
        previousTodos={previousTodosByMessageId.get(m.id)}
        onContinueRemainingTasks={
          onContinueRemainingTasks
            ? (todos) => assistantCallbacksRef.current.onContinueRemainingTasks?.(m, todos)
            : undefined
        }
        suppressDirectionForms={hasActiveDesignSystem}
        hasDesignSystemContext={hasActiveDesignSystem || !!activeDesignSystem}
        onSubmitQuestionForm={
          onSubmitQuestionForm
            ? (text, attachments, context, _sourceAssistantMessageId, formId) =>
                assistantCallbacksRef.current.onSubmitQuestionForm?.(
                  text,
                  attachments,
                  context,
                  m.id,
                  formId,
                )
            : undefined
        }
        questionFormSubmitDisabled={questionFormSubmitDisabled}
        onBrandBrowserAssistConfirm={
          onBrandBrowserAssistConfirm
            ? (card) => assistantCallbacksRef.current.onBrandBrowserAssistConfirm?.(card)
            : undefined
        }
        onForkFromMessage={
          onForkFromMessage
            ? () => assistantCallbacksRef.current.onForkFromMessage?.(m)
            : undefined
        }
        forking={forkingMessageId === m.id}
        onFeedback={
          onAssistantFeedback
            ? (rating) => assistantCallbacksRef.current.onAssistantFeedback?.(m, rating)
            : undefined
        }
        onArtifactShare={
          onArtifactShare
            ? (fileName, anchorId) => assistantCallbacksRef.current.onArtifactShare?.(fileName, anchorId)
            : undefined
        }
        onToolboxAction={onToolboxAction}
        onNextStepPromptAction={onNextStepPromptAction}
        onNextStepAiOptimize={
          onNextStepAiOptimize
            ? () => assistantCallbacksRef.current.onNextStepAiOptimize?.()
            : undefined
        }
        nextStepAiOptimizeBusy={nextStepAiOptimizeBusy}
        onNextStepContinueExtraction={
          onNextStepContinueExtraction
            ? () => assistantCallbacksRef.current.onNextStepContinueExtraction?.()
            : undefined
        }
        nextStepContinueExtractionBusy={nextStepContinueExtractionBusy}
        onNextStepContinueAiExtraction={
          onNextStepContinueAiExtraction
            ? () => assistantCallbacksRef.current.onNextStepContinueAiExtraction?.()
            : undefined
        }
        nextStepContinueAiExtractionBusy={nextStepContinueAiExtractionBusy}
        onNextStepCreateDesign={
          onNextStepCreateDesign
            ? () => assistantCallbacksRef.current.onNextStepCreateDesign?.()
            : undefined
        }
        nextStepCreateDesignBusy={nextStepCreateDesignBusy}
        onNextStepCreateDesignSystem={
          onNextStepCreateDesignSystem
            ? () => assistantCallbacksRef.current.onNextStepCreateDesignSystem?.()
            : undefined
        }
        nextStepCreateDesignSystemBusy={nextStepCreateDesignSystemBusy}
        onPickSkill={onPickSkill}
        onNextStepSuggestion={onNextStepSuggestion}
        onArtifactDownload={onArtifactDownload}
        nextStepSkills={nextStepSkills}
        nextStepVariant={nextStepVariant}
      />
    );
  };

  if (items.length === 0) return null;

  if (!virtualized) {
    return (
      <>
        {items.map((item) => (
          <Fragment key={item.key}>{renderItem(item)}</Fragment>
        ))}
      </>
    );
  }

  return (
    <div
      className="chat-virtual-spacer"
      data-testid="chat-virtual-spacer"
      style={{ height: virtualWindow.totalHeight }}
    >
      {virtualWindow.rows.map((row) => (
        <VirtualChatRow
          key={row.item.key}
          itemKey={row.item.key}
          top={row.top}
          onMeasure={virtualWindow.onMeasure}
        >
          {renderItem(row.item)}
        </VirtualChatRow>
      ))}
    </div>
  );
}

function VirtualChatRow({
  itemKey,
  top,
  onMeasure,
  children,
}: {
  itemKey: string;
  top: number;
  onMeasure: (key: string, height: number) => void;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = rowRef.current;
    if (!node) return;
    const measure = () => {
      const height = node.getBoundingClientRect().height;
      onMeasure(itemKey, height);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [itemKey, onMeasure]);

  return (
    <div
      ref={rowRef}
      className="chat-virtual-row"
      style={{ transform: `translateY(${top}px)` }}
    >
      {children}
    </div>
  );
}

/**
 * 转录里**画得出来**的那些消息 —— 这是「哪些消息算数」的**唯一出处**。
 *
 * ## 为什么必须只有一处
 *
 * 这份流水有三个消费者:正文(`ChatRows`)、右侧导轨(`ChatMessageRail`)、
 * 以及「新一轮钉顶」(`isNewTailUserTurn` + `lastUserMsgTopInContent`)。
 * 它们从前各自拿着 `displayMessages` 自己判,于是口径必然漂:
 *
 *  · 导轨只看 `role === 'user'`,把表单答案那条也数了进去 —— 导轨 2 个点、
 *    正文 1 个气泡,点那多出来的点跳向一条没渲染的消息(死链)。
 *  · 钉顶按「尾条用户消息换了身份」表决,却拿 `.msg.user` 去量位置 ——
 *    表决认的那条不在 DOM 里,量到的是**上一轮**的气泡,于是把上一轮拽到顶端。
 *
 * 所以这里返回的是一个**数组**,由 `ChatPane` 算一次、往下发,而不是导出一个
 * 让每个消费者各调一次的谓词:谓词还是三份实现,只是长得一样,谁改都会漂。
 *
 * ## 谁被收走
 *
 * 意图澄清表单的答案(`^[form answers`)。答案已经以摘要形式长在上一条助手消息
 * 上;再画一个用户气泡等于把同一个决定说两遍,还会把 `[form answers — <id>]`
 * 这种机器载荷摆到用户脸上(#5496)。这是产品取向,不是权宜之计。
 */
function buildChatRenderItems(messages: ChatMessage[]): ChatRenderItem[] {
  const items: ChatRenderItem[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]!;
    if (message.role === 'user' && /^\[form answers\b/i.test(message.content.trim())) {
      continue;
    }
    items.push({
      kind: 'message',
      key: `message:${message.id}`,
      message,
      messageIndex: i,
    });
  }
  return items;
}

/**
 * 转录里画得出来的**最后一条用户消息**。
 *
 * 钉顶的两半必须问同一个人:「该不该钉」(尾条用户消息换没换身份)和
 * 「钉到哪」(`lastUserMsgTopInContent` 查 `.msg.user`)。DOM 里只有渲染项,
 * 所以表决也只能在渲染项里做 —— 否则就会出现「表决说钉、几何找不到人,
 * 于是拿上一轮的气泡顶上」这种结果。
 */
function tailRenderedUserMessage(items: ChatRenderItem[]): ChatMessage | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const message = items[i]!.message;
    if (message.role === 'user') return message;
  }
  return null;
}

function estimateChatRenderItemHeight(item: ChatRenderItem): number {
  const message = item.message;
  const contentLength = message.content?.length ?? 0;
  const attachmentCount = (message.attachments?.length ?? 0) + (message.commentAttachments?.length ?? 0);
  const eventCount = message.events?.length ?? 0;
  const fileCount = message.producedFiles?.length ?? 0;
  const base = message.role === 'user' ? 82 : 118;
  const contentRows = Math.min(18, Math.ceil(contentLength / 120));
  return (
    base
    + contentRows * 18
    + attachmentCount * 34
    + eventCount * 28
    + fileCount * 32
    + CHAT_VIRTUAL_ROW_GAP_PX
  );
}

function useMeasuredVirtualWindow<T extends { key: string }>(
  items: T[],
  {
    enabled,
    containerRef,
    estimateSize,
    overscanPx,
    resetKey,
    initialTailRows,
    alwaysIncludeKey,
    onScrollTopWrite,
  }: {
    enabled: boolean;
    containerRef: MutableRefObject<HTMLDivElement | null>;
    estimateSize: (item: T) => number;
    overscanPx: number;
    resetKey: string;
    initialTailRows: number;
    alwaysIncludeKey?: string;
    onScrollTopWrite?: (element: HTMLDivElement, top: number) => void;
  },
) {
  const measuredHeightsRef = useRef<Map<string, number>>(new Map());
  const pendingAnchorRef = useRef<{ anchor: VirtualScrollAnchor; resetKey: string } | null>(null);
  const resetKeyRef = useRef(resetKey);
  const scrollTopWriterRef = useRef(onScrollTopWrite);
  resetKeyRef.current = resetKey;
  scrollTopWriterRef.current = onScrollTopWrite;
  const [measureVersion, setMeasureVersion] = useState(0);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  useEffect(() => {
    pendingAnchorRef.current = null;
    measuredHeightsRef.current.clear();
    setMeasureVersion((version) => version + 1);
    setViewport({ scrollTop: 0, height: 0 });
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    const el = containerRef.current;
    if (!el) return undefined;
    let frame: number | null = null;
    const readViewport = () => {
      frame = null;
      setViewport((current) => {
        const next = {
          scrollTop: el.scrollTop,
          height: el.clientHeight || CHAT_VIRTUAL_DEFAULT_VIEWPORT_PX,
        };
        return current.scrollTop === next.scrollTop && current.height === next.height
          ? current
          : next;
      });
    };
    const scheduleRead = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(readViewport);
    };
    scheduleRead();
    el.addEventListener('scroll', scheduleRead, { passive: true });
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleRead)
        : null;
    observer?.observe(el);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      el.removeEventListener('scroll', scheduleRead);
      observer?.disconnect();
    };
  }, [containerRef, enabled]);

  const layout = useMemo(() => {
    const offsets: number[] = [];
    const sizes: number[] = [];
    let cursor = 0;
    for (const item of items) {
      offsets.push(cursor);
      const measured = measuredHeightsRef.current.get(item.key);
      const size = Math.max(
        CHAT_VIRTUAL_MIN_ROW_HEIGHT,
        measured ?? estimateSize(item),
      );
      sizes.push(size);
      cursor += size;
    }
    return { offsets, sizes, totalHeight: cursor };
  }, [estimateSize, items, measureVersion]);

  const virtualLayoutRef = useRef({ items, offsets: layout.offsets, sizes: layout.sizes });
  virtualLayoutRef.current = { items, offsets: layout.offsets, sizes: layout.sizes };

  useLayoutEffect(() => {
    const pending = pendingAnchorRef.current;
    if (!pending) return;
    pendingAnchorRef.current = null;
    if (!enabled || pending.resetKey !== resetKey) return;
    const element = containerRef.current;
    if (!element) return;
    const nextTop = scrollTopForVirtualScrollAnchor(
      pending.anchor,
      items,
      layout.offsets,
      Math.max(0, element.scrollHeight - element.clientHeight),
    );
    if (nextTop === null || Math.abs(nextTop - element.scrollTop) < 0.5) return;
    const writer = scrollTopWriterRef.current;
    if (writer) writer(element, nextTop);
    else element.scrollTop = nextTop;
    const actualScrollTop = element.scrollTop;
    setViewport((current) => current.scrollTop === actualScrollTop
      ? current
      : { ...current, scrollTop: actualScrollTop });
  }, [containerRef, enabled, items, layout.offsets, resetKey]);

  const rows = useMemo(() => {
    if (!enabled || items.length === 0) return [];
    const height = viewport.height || CHAT_VIRTUAL_DEFAULT_VIEWPORT_PX;
    if (viewport.scrollTop === 0 && viewport.height === 0) {
      const start = Math.max(0, items.length - initialTailRows);
      const rows = items.slice(start).map((item, offset) => {
        const index = start + offset;
        return { item, index, top: layout.offsets[index] ?? 0 };
      });
      return includeVirtualRowByKey(rows, items, layout.offsets, alwaysIncludeKey);
    }
    const startTarget = Math.max(0, viewport.scrollTop - overscanPx);
    const endTarget = viewport.scrollTop + height + overscanPx;
    let start = 0;
    while (
      start < items.length - 1
      && (layout.offsets[start] ?? 0) + (layout.sizes[start] ?? 0) < startTarget
    ) {
      start += 1;
    }
    let end = start;
    while (end < items.length && (layout.offsets[end] ?? 0) <= endTarget) {
      end += 1;
    }
    const rows = items.slice(start, end).map((item, offset) => {
      const index = start + offset;
      return { item, index, top: layout.offsets[index] ?? 0 };
    });
    return includeVirtualRowByKey(rows, items, layout.offsets, alwaysIncludeKey);
  }, [
    alwaysIncludeKey,
    enabled,
    initialTailRows,
    items,
    layout.offsets,
    layout.sizes,
    overscanPx,
    viewport.height,
    viewport.scrollTop,
  ]);

  const onMeasure = useCallback((key: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    const next = Math.max(CHAT_VIRTUAL_MIN_ROW_HEIGHT, Math.ceil(height));
    const previous = measuredHeightsRef.current.get(key);
    if (previous !== undefined && Math.abs(previous - next) < 2) return;
    const element = containerRef.current;
    if (element && !pendingAnchorRef.current) {
      const currentLayout = virtualLayoutRef.current;
      const anchor = captureVirtualScrollAnchor(
        currentLayout.items,
        currentLayout.offsets,
        currentLayout.sizes,
        element.scrollTop,
      );
      if (anchor) pendingAnchorRef.current = { anchor, resetKey: resetKeyRef.current };
    }
    measuredHeightsRef.current.set(key, next);
    setMeasureVersion((version) => version + 1);
  }, [containerRef]);

  return {
    rows,
    totalHeight: layout.totalHeight,
    onMeasure,
  };
}

function includeVirtualRowByKey<T extends { key: string }>(
  rows: Array<{ item: T; index: number; top: number }>,
  items: T[],
  offsets: number[],
  key: string | undefined,
): Array<{ item: T; index: number; top: number }> {
  if (!key || rows.some((row) => row.item.key === key)) return rows;
  const index = items.findIndex((item) => item.key === key);
  if (index === -1) return rows;
  return [
    ...rows,
    {
      item: items[index]!,
      index,
      top: offsets[index] ?? 0,
    },
  ].sort((a, b) => a.index - b.index);
}

// NOTE(sync/main): origin/main's `PinnedTodoSlot` is deliberately NOT carried over.
// This branch retired the pinned-todo slot; the plan pill (`planPillTodos` above,
// rendered by `chat/PlanPill`) took its place. The pill is NOT the pinned slot in
// a new shape: the slot spoke for the conversation and pinned the newest snapshot
// anywhere in it, while the pill speaks for the turn in progress and reads only
// what that turn declared (`todosDeclaredByLatestTurn`).
// main's fix inside that component (`continuableUnfinishedTodos`, so a settled
// strategy verdict outranks a stale snapshot) still lands via AssistantMessage.tsx.
  function readContinuedTodoSnapshotKey(storageKey: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeContinuedTodoSnapshotKey(storageKey: string, snapshotKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey, snapshotKey);
  } catch {
    // sessionStorage may be unavailable in sandboxed or privacy-restricted contexts.
  }
}

/**
 * 队列行里那颗提示气泡朝哪边弹。
 *
 * 稿子 `361b78253e:docs/design/chat-panel/src/components.css:2693`
 *   `[data-tip].mod-tip-b::after,
 *    .queue .q:first-child [data-tip]::after { bottom: auto; top: calc(100% + 6px); }`
 * 选择器落在首行的**每一个** `[data-tip]` 上,拖拽手柄也在内。
 * 上一行注释(:2692)把理由写死了:「队列第一行:卡头去掉之后它上面已经没有东西,
 * 朝上的气泡会顶出限高容器。」
 *
 * 我们这边的气泡不是伪元素,是 body 上的 `TooltipLayer` portal,不会被队列的
 * `max-height` 裁掉;但方向照稿 —— 队列贴在输入框上方,首行朝上的气泡正好盖住
 * 流水里最后一条消息,朝下弹落在队列自己身上。
 */
function queuedTipPlacement(
  index: number,
  fallback: 'top' | 'right',
): 'top' | 'right' | 'bottom' {
  return index === 0 ? 'bottom' : fallback;
}

  /** 导出只为验收:镜像陈列页(`tests/components/chat/mirror-gallery.test.tsx`)要单挂
   *  这一条队列去对第 72–74 格。产品里仍旧只有 `ChatPane` 一个消费方。 */
  export function QueuedSendStrip({
  containerRef,
  editingId,
  items,
  onEdit,
  onRemove,
  onReorder,
  onSendNow,
  onSteer,
  steerBlockedReason,
}: {
  containerRef?: MutableRefObject<HTMLDivElement | null>;
  editingId?: string | null;
  items: QueuedSendItem[];
  onEdit?: (item: QueuedSendItem) => void;
  onRemove?: (id: string) => void;
  onReorder?: (orderedIds: string[]) => void;
  onSendNow?: (id: string) => void;
  /**
   * B11 「引导对话」. Present ONLY when there is a live run on this conversation
   * to interrupt. The parent owns that judgement — the strip must never infer
   * it, or the button ends up promising an interruption that never happens.
   */
  onSteer?: (item: QueuedSendItem) => void;
  /**
   * Why steering is unavailable right now (e.g. 「当前 agent 不支持中途插话」).
   *
   * NOT rendered. It used to be the fallback button's `title` / `data-tooltip`,
   * which is that button's only visible name — so the one string on screen was
   * answering "why is this not 引导对话" while the button's actual job (stop the
   * running turn, send this row as its own turn) went unnamed. The name slot is
   * back to naming the button; where this explanation belongs is a UI-placement
   * decision that has not been made, so it stays threaded rather than deleted.
   */
  steerBlockedReason?: string | null;
}) {
  const t = useT();
  const [dragState, setDragState] = useState<QueuedSendDragState | null>(null);
  if (items.length === 0) return null;
  const canReorder = Boolean(onReorder && items.length > 1);

  const handleDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
    item: QueuedSendItem,
  ) => {
    if (!canReorder) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(QUEUED_SEND_DRAG_MIME, item.id);
    event.dataTransfer.setData('text/plain', item.id);
    setDragState({ draggingId: item.id, overId: item.id, edge: null });
  };

  const handleDragOver = (
    event: ReactDragEvent<HTMLDivElement>,
    targetId: string,
  ) => {
    if (!canReorder) return;
    const draggingId = dragState?.draggingId || event.dataTransfer.getData(QUEUED_SEND_DRAG_MIME);
    if (!draggingId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (draggingId === targetId) {
      if (dragState?.overId !== targetId || dragState.edge !== null) {
        setDragState({ draggingId, overId: targetId, edge: null });
      }
      return;
    }
    const edge = queuedDropEdgeForEvent(event);
    if (
      dragState?.draggingId !== draggingId
      || dragState.overId !== targetId
      || dragState.edge !== edge
    ) {
      setDragState({ draggingId, overId: targetId, edge });
    }
  };

  const handleDrop = (
    event: ReactDragEvent<HTMLDivElement>,
    targetId: string,
  ) => {
    if (!canReorder) return;
    event.preventDefault();
    const draggingId =
      dragState?.draggingId
      || event.dataTransfer.getData(QUEUED_SEND_DRAG_MIME)
      || event.dataTransfer.getData('text/plain');
    if (!draggingId || draggingId === targetId) {
      setDragState(null);
      return;
    }
    const edge = dragState?.overId === targetId && dragState.edge
      ? dragState.edge
      : queuedDropEdgeForEvent(event);
    const nextIds = reorderQueuedSendIds(items, draggingId, targetId, edge);
    if (nextIds.join('\0') !== items.map((item) => item.id).join('\0')) {
      onReorder?.(nextIds);
    }
    setDragState(null);
  };

  return (
    <div
      ref={containerRef}
      className="chat-queued-send-strip"
      data-testid="chat-queued-send-strip"
      onDragLeave={(event) => {
        const related = event.relatedTarget;
        if (related instanceof Node && event.currentTarget.contains(related)) return;
        setDragState(null);
      }}
    >
      {/* 稿子没有卡头:队列就贴在输入框底下,是什么一目了然,不用再单起一行说「排队中 · N 条」 */}
      <div className="chat-queued-send-list">
        {items.map((item, index) => {
          const isDragging = dragState?.draggingId === item.id;
          const dropClass = dragState?.overId === item.id
            && dragState.draggingId !== item.id
            && dragState.edge
            ? ` chat-queued-send-row-drop-${dragState.edge}`
            : '';
          return (
            <div
              /* 首行**不换任何样式**:稿子 `.queue .q:first-child`
                 (`361b78253e:docs/design/chat-panel/src/components.css:2898`)
                 唯一的处理是 `border-top: none`,没有首行底色。
                 原来这里按 `index === 0` 挂过一枚 `-active`,规则已删、类名也跟着走 ——
                 留着就是一个没有任何规则消费、却在 diff 里长得像「首行有特殊态」的钩子。 */
              className={`chat-queued-send-row${
                editingId === item.id ? ' chat-queued-send-row-editing' : ''
              }${isDragging ? ' chat-queued-send-row-dragging' : ''}${dropClass}`}
              data-testid="chat-queued-send-row"
              key={item.id}
              onDragOver={(event) => handleDragOver(event, item.id)}
              onDrop={(event) => handleDrop(event, item.id)}
            >
              {/* 稿子这一行是 `grip → ix → tx → qops`:**拖动手柄在最左**,序号跟在它右边。
                  原来这两个是反的(序号在最左),整行的起手就和稿子对不上。 */}
              <button
                type="button"
                className="chat-queued-send-drag-handle chat-queued-send-tooltip od-tooltip"
                title={t('chat.queuedReorder')}
                data-tooltip={t('chat.queuedReorder')}
                data-tooltip-placement={queuedTipPlacement(index, 'right')}
                aria-label={t('chat.queuedReorder')}
                draggable={canReorder}
                disabled={!canReorder}
                onDragStart={(event) => handleDragStart(event, item)}
                onDragEnd={() => setDragState(null)}
              >
                <Icon name="grip-vertical" size={14} />
              </button>
              {/* 序号:出队后重排是数组下标的自然结果,不用另外维护 */}
              <span className="chat-queued-send-index" data-testid="chat-queued-send-index" aria-hidden>{index + 1}</span>
              <div className="chat-queued-send-main">
                <span className="chat-queued-send-title">{summarizeQueuedPrompt(item, t)}</span>
              </div>
              {/* 稿子这一组是 `编辑 → 移除 → 第三颗`,而且「编辑」用的是**魔杖**不是铅笔。
                  原来我们排的是 编辑 → 立即发送 → 移除,三枚图形和顺序全和稿子对不上。 */}
              <div className="chat-queued-send-actions">
                {onEdit ? (
                  <button
                    type="button"
                    className="chat-queued-send-action chat-queued-send-tooltip od-tooltip"
                    title={t('chat.queuedEdit')}
                    data-tooltip={t('chat.queuedEdit')}
                    data-tooltip-placement={queuedTipPlacement(index, 'top')}
                    aria-label={t('chat.queuedEdit')}
                    onClick={() => onEdit(item)}
                  >
                    <Icon name="magic" size={13} />
                  </button>
                ) : null}
                {onRemove ? (
                  <button
                    type="button"
                    className="chat-queued-send-action chat-queued-send-tooltip od-tooltip"
                    onClick={() => onRemove(item.id)}
                    title={t('chat.comments.remove')}
                    data-tooltip={t('chat.comments.remove')}
                    data-tooltip-placement={queuedTipPlacement(index, 'top')}
                    aria-label={t('chat.comments.remove')}
                  >
                    <QueueTrashIcon size={13} />
                  </button>
                ) : null}
                {/* 第三颗 —— 稿子标的是「引导对话」(B11)。产品裁决(OPEND-2602,
                    2026-09-03)之后它干的事是:**中断正在跑的那一轮,然后立刻把这条
                    发出去**。原来那条「不打断、把消息写进 agent 子进程还开着的 stdin」
                    的路已经作废 —— 27 个 runtime 里只有两个的 CLI 中途还读 stdin,
                    而实测连真 claude 也不处理轮次中途写进去的 user 帧。

                    所以这颗只由「此刻有没有一轮可中断」决定:
                      · `onSteer` 有值 = 当前会话有一轮在跑 → 「引导对话」。
                      · 没有 → 退回普通的「立即发送」,**连名字一起退回去**。
                    这里不再看 agent 能不能中途插话:中断对所有 agent 都成立。
                    也不再看这一行带不带附件:中断 + 重发走的是完整的发送路径,
                    附件和批注原样跟着走。

                    引导态**带文字标签**(稿子 `.qops button.mod-steer` 的 `<svg/><span>`)。
                    这不是装饰:两副面孔永远不同时出现(下面是二选一的三元式),
                    所以用户没有「和旁边那颗比一比」的机会 —— 图标一样时他无从知道
                    按下去是「排在后面」还是「掐掉这一轮重来」。让这一行自己把名字说出来,
                    是唯一在屏幕上分得开两条路的办法。退回态仍旧只有图标:
                    它就是普通的「发送」,和编辑 / 移除同级。

                    引导态的 hover 三处说的是它按下去干的事里**最要紧**的那一半 ——
                    会中断当前运行。它按名字开头(`chat.queuedSteerInterrupts` 各语言
                    都以可见标签起手),所以无障碍名仍旧含着屏幕上那行字。
                    退回态没有可见文字,tooltip 就是它唯一的名字,那一格只写「发送」。 */}
                {onSteer ? (
                  <button
                    type="button"
                    className="chat-queued-send-action chat-queued-send-action-steer chat-queued-send-tooltip od-tooltip"
                    title={t('chat.queuedSteerInterrupts')}
                    data-tooltip={t('chat.queuedSteerInterrupts')}
                    data-tooltip-placement={queuedTipPlacement(index, 'top')}
                    aria-label={t('chat.queuedSteerInterrupts')}
                    data-testid="chat-queued-send-steer"
                    onClick={() => onSteer(item)}
                  >
                    <Icon name="arrow-up" size={13} />
                    <span className="chat-queued-send-action-label">{t('chat.queuedSteer')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="chat-queued-send-action chat-queued-send-tooltip od-tooltip"
                    title={t('chat.send')}
                    data-tooltip={t('chat.send')}
                    data-tooltip-placement={queuedTipPlacement(index, 'top')}
                    aria-label={t('chat.send')}
                    data-testid="chat-queued-send-now"
                    onClick={() => onSendNow?.(item.id)}
                    disabled={!onSendNow}
                  >
                    <Icon name="arrow-up" size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

  const QUEUED_SEND_DRAG_MIME = 'application/x-open-design-queued-send';

type QueuedSendDropEdge = 'before' | 'after';

interface QueuedSendDragState {
  draggingId: string;
  overId: string | null;
  edge: QueuedSendDropEdge | null;
}

function queuedDropEdgeForEvent(event: ReactDragEvent<HTMLElement>): QueuedSendDropEdge {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function reorderQueuedSendIds(
  items: QueuedSendItem[],
  draggingId: string,
  targetId: string,
  edge: QueuedSendDropEdge,
): string[] {
  const ids = items.map((item) => item.id);
  const from = ids.indexOf(draggingId);
  if (from < 0) return ids;
  const [draggedId] = ids.splice(from, 1);
  const targetIndex = ids.indexOf(targetId);
  if (targetIndex < 0 || !draggedId) return items.map((item) => item.id);
  ids.splice(edge === 'after' ? targetIndex + 1 : targetIndex, 0, draggedId);
  return ids;
}

  /**
   * 队列里每条显示的文字。**不在这里截断** —— 截成一行会把话切在半截,
   * 人就认不出要取消 / 调序的是哪一条(稿子给了两行,用 CSS 的 line-clamp 收)。
   */
  function summarizeQueuedPrompt(item: QueuedSendItem, t: TranslateFn): string {
  return item.prompt.replace(/\s+/g, ' ').trim() || t('chat.queuedFollowUpFallback');
  }

function CommentsPanel({
  comments,
  attachedComments,
  onAttach,
  onDetach,
  onDelete,
  t,
}: {
  comments: PreviewComment[];
  attachedComments: PreviewComment[];
  onAttach?: (comment: PreviewComment) => void;
  onDetach?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
  t: TranslateFn;
}) {
  const attachedIds = new Set(attachedComments.map((comment) => comment.id));
  const saved = comments.filter((comment) => !attachedIds.has(comment.id));
  return (
    <div className="comments-panel" data-testid="comments-panel">
      <CommentSection
        title={t('chat.comments.attached')}
        empty={t('chat.comments.emptyAttached')}
        comments={attachedComments}
        actionLabel={t('chat.comments.remove')}
        onAction={(comment) => onDetach?.(comment.id)}
        attached
      />
      <CommentSection
        title={t('chat.comments.saved')}
        empty={t('chat.comments.emptySaved')}
        comments={saved}
        actionLabel={t('chat.comments.add')}
        onAction={(comment) => onAttach?.(comment)}
        secondaryActionLabel={t('chat.comments.remove')}
        onSecondaryAction={(comment) => onDelete?.(comment.id)}
      />
      {saved.length > 0 ? (
        <div className="comments-footer">
          <button
            type="button"
            className="primary"
            onClick={() => saved.forEach((comment) => onAttach?.(comment))}
          >
            {t('chat.comments.addAll')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CommentSection({
  title,
  empty,
  comments,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  attached,
}: {
  title: string;
  empty: string;
  comments: PreviewComment[];
  actionLabel: string;
  onAction: (comment: PreviewComment) => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: (comment: PreviewComment) => void;
  attached?: boolean;
}) {
  return (
    <section className="comments-section">
      <h3>{title}</h3>
      {comments.length === 0 ? (
        <p className="comments-empty">{empty}</p>
      ) : (
        comments.map((comment) => (
          <article
            key={comment.id}
            className={`comment-card${attached ? ' attached' : ''}`}
            data-testid={`comment-card-${comment.elementId}`}
          >
            <div className="comment-card-top">
              <strong>{commentTargetDisplayName(comment)}</strong>
              <div className="comment-card-actions">
                {secondaryActionLabel && onSecondaryAction ? (
                  <button
                    type="button"
                    className="comment-card-action danger"
                    onClick={() => onSecondaryAction(comment)}
                  >
                    {secondaryActionLabel}
                  </button>
                ) : null}
                <button type="button" className="comment-card-action" onClick={() => onAction(comment)}>
                  {actionLabel}
                </button>
              </div>
            </div>
            <p>{comment.note}</p>
            <div className="comment-card-meta">
              <span>{comment.id}</span>
              <span>{comment.filePath}</span>
              <span>{commentTargetDisplayName(comment)}</span>
              <span>{simplePositionLabel(comment.position)}</span>
            </div>
          </article>
        ))
      )}
    </section>
  );
}

function isActiveRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'queued' || status === 'running';
}

function isTerminalRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

export function retryableAssistantMessage(
  messages: ChatMessage[],
  lastAssistantId: string | null | undefined,
  paneStreaming: boolean,
): ChatMessage | null {
  if (paneStreaming) return null;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;
  if (last.id !== lastAssistantId) return null;
  return isRetryableAssistantTerminalFailure(last) ? last : null;
}

function isRecoveredAssistantRunError(
  messages: ChatMessage[],
  error: string | null,
  sourceAssistantId: string | null | undefined,
): boolean {
  const target = error?.trim();
  if (!target || !sourceAssistantId) return false;
  const sourceIndex = messages.findIndex(
    (message) =>
      message.role === 'assistant' && message.id === sourceAssistantId,
  );
  if (sourceIndex < 0) return false;
  const source = messages[sourceIndex]!;
  const ownsPersistedError = (source.events ?? []).some(
    (event) =>
      event.kind === 'status' &&
      event.label === 'error' &&
      event.detail?.trim() === target,
  );
  if (!ownsPersistedError) return false;
  // 这一轮**自己**跑通了 —— 那么它中途报的那句就不是终态,是被自愈掉的一次尝试。
  //
  // daemon 对可自愈的失败会**在同一个 runId 里**重开一次子进程
  // (`run-retry-policy.ts` 的 `same_run_transient`:AMR 建会话超时就在这个集合里)。
  // 第一次尝试的 error 帧照样发出来,SSE 也可能就断在那一帧上;客户端那时还不知道
  // 后面会重试成功,于是把原文落到了面板级的 `error`。等重试跑完,消息被改回
  // `succeeded`,可那条 `error` 从来没人撤 —— 一张「任务失败」的卡就挂在一次
  // 成功的运行下面,卡面上还摊着本机端口和项目路径。
  //
  // `runStatus === 'succeeded'` 是 daemon 对这一个 run 的终态裁定(SSE `end` 或
  // `/api/runs/:id` 显式声明的那个),所以它一票否决同一轮里更早的那句报错。
  if (source.runStatus === 'succeeded') return true;
  return messages.slice(sourceIndex + 1).some(
    (message) => message.role === 'assistant' && message.runStatus === 'succeeded',
  );
}

export function isAssistantMessageStreaming(
  message: ChatMessage,
  paneStreaming: boolean,
  lastAssistantId: string | null | undefined,
  forceStreamingMessageIds?: Set<string>,
): boolean {
  if (message.role !== 'assistant') return false;
  if (isTerminalRunStatus(message.runStatus)) return false;
  if (forceStreamingMessageIds?.has(message.id)) return true;
  if (isActiveRunStatus(message.runStatus)) return true;
  if (message.id !== lastAssistantId) return false;
  if (!paneStreaming) return false;
  if (message.endedAt !== undefined) return false;
  return true;
}

export function buildRunErrorDiagnosticText(input: RunErrorDiagnosticInput): string {
  const lines: string[] = [];
  const sourceText = input.rawMessage?.trim() || input.message.trim();
  if (sourceText) {
    lines.push(sourceText, '');
  }

  // The captured agent output goes above the id block: it is the answer to
  // "why did this fail", the ids are only what a support thread needs to look
  // the run up. Omitted entirely when the run wrote nothing — an empty
  // labelled section reads as "there is no more information here", which is a
  // different (and wrong) claim than saying nothing at all.
  const stderrTail = input.stderrTail?.trim();
  if (stderrTail) {
    lines.push('agent_stderr_tail:', stderrTail, '');
  }

  lines.push(
    'OpenDesign run error diagnostics',
    `trace_id: ${input.traceId ?? 'n/a'}`,
    `run_id: ${input.traceId ?? 'n/a'}`,
    `error_code: ${input.errorCode ?? 'n/a'}`,
    `project_id: ${input.projectId ?? 'n/a'}`,
    `conversation_id: ${input.conversationId ?? 'n/a'}`,
    `assistant_message_id: ${input.assistantMessageId ?? 'n/a'}`,
    `agent_id: ${input.agentId ?? 'n/a'}`,
  );

  return lines.join('\n');
}

function filterConversations(
  conversations: Conversation[],
  query: string,
  t: TranslateFn,
): Conversation[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return conversations;
  return conversations.filter((conversation) => {
    const title = conversation.title || t('chat.untitledConversation');
    const meta = conversationMetaLabel(conversation, t);
    return `${title} ${conversation.id} ${meta}`.toLocaleLowerCase().includes(normalized);
  });
}

function conversationMessageCount(
  conversation: Conversation,
  activeConversationId: string | null,
  messagesConversationId: string | null,
  activeMessageCount: number,
): number | null {
  // The live `messages` array is authoritative for the active conversation —
  // it stays fresh as a run streams new turns in — but ONLY once it has
  // actually loaded for that conversation. While a switch is mid-flight (or a
  // load failed) `messages` is reset to [] and `messagesConversationId` no
  // longer matches the active id; trusting `messages.length` there renders a
  // phantom "0 msg". Fall back to the persisted server count until the live
  // array catches up.
  if (
    conversation.id === activeConversationId &&
    messagesConversationId === activeConversationId
  ) {
    return activeMessageCount;
  }
  return typeof conversation.messageCount === 'number' ? conversation.messageCount : null;
}

function compactCount(value: number): string {
  if (value < 1000) return String(value);
  const compact = Math.floor(value / 100) / 10;
  return `${compact}k`;
}

function ConversationRow({
  conversation,
  active,
  messageCount,
  onSelect,
  onDelete,
  t,
}: {
  conversation: Conversation;
  active: boolean;
  messageCount: number | null;
  onSelect: () => void;
  onDelete: () => void;
  t: TranslateFn;
}) {
  const displayTitle =
    conversation.title || t('chat.untitledConversation');

  return (
    <div
      className={`chat-conv-item${active ? ' active' : ''}`}
      data-testid={`conversation-item-${conversation.id}`}
      onClick={onSelect}
    >
      <button
        type="button"
        className="chat-conv-item-name"
        data-testid={`conversation-select-${conversation.id}`}
        style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left' }}
      >
        {displayTitle}
      </button>
      <span
        className="chat-conv-item-meta"
        data-testid={`conversation-meta-${conversation.id}`}
      >
        {messageCount !== null ? `${compactCount(messageCount)} msg · ` : ''}
        {conversationMetaLabel(conversation, t)}
      </span>
      <button
        type="button"
        className="chat-conv-item-del"
        data-testid={`conversation-delete-${conversation.id}`}
        title={t('chat.deleteConversation')}
        onClick={(e) => {
          e.stopPropagation();
          if (
            confirm(t('chat.deleteConversationConfirm', { title: displayTitle }))
          ) {
            onDelete();
          }
        }}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

// Memoized (hoisted impl referenced below): a static user message has stable
// props, so it skips re-render while a later turn streams.
const UserMessage = memo(UserMessageImpl);

  /**
   * 导出只为**验收**:镜像陈列页要能单独挂它,和设计稿逐格并排比
   * (`apps/web/tests/components/chat/mirror-gallery.test.tsx`)。
   * 产品侧仍然只由本文件内部使用,不要在别处引它。
   */
  export function UserMessageImpl({
  message,
  projectId,
  projectFileNames,
  onRequestOpenFile,
  t,
  highlighted,
  onResend,
}: {
  message: ChatMessage;
  projectId: string | null;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
  /** 发送失败时那颗常驻的「重试」(稿子第 49 / 50 格) */
  onResend?: (message: ChatMessage) => void;
  /** Legacy mirror-fixture inputs are accepted but intentionally not rendered. */
  onRequestPluginDetails?: (pluginId: string) => void;
  onRequestDesignSystemDetails?: (system: DesignSystemSummary) => void;
  appliedContextItems?: ReadonlyArray<unknown>;
  t: TranslateFn;
  highlighted?: boolean;
}) {
  const { workspaceContext } = useProjectCollabContext();
  const attachments = sortChatAttachmentsForDisplay(message.attachments ?? []);
  const commentAttachments = message.commentAttachments ?? [];
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isDesignSystemWorkspaceRequest = isDesignSystemWorkspacePrompt(message.content);
  /* 设计系统交接会把一整段给 agent 的实现 prompt 写进对话。用户这一侧要看到的
     不是那段 prompt,而是稿子第「设计系统工作区 · 自动创建」格的那张状态卡
     (`729fa43ce7:docs/design/chat-panel/src/body-components.html:45-53`)——
     标题 + 一句说明,仍坐在用户消息那一列里。

     ⚠️ 这张卡曾被主动删掉过一次(那一版改走「类型化语言字典 + 标准用户气泡」),
     **2026-09-02 用户裁决**要求按稿子 1:1 实现,于是加回来。来龙去脉见
     `components/chat/UserStatusCard.tsx` 与
     `tests/components/ChatPane.streaming.test.tsx` 里那条翻转过的断言。

     `displayContent` 仍留着:它是「复制」按钮真正会写进剪贴板的那一段,
     用户复制到的应该是卡面上看得见的标题,不是内部 prompt。 */
  const displayContent = isDesignSystemWorkspaceRequest
    ? t('chat.designSystemStatus.title')
    : message.content;

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    if (!displayContent) return;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    const ok = await copyToClipboard(displayContent);
    if (!ok) return;
    setCopied(true);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = undefined;
    }, 2000);
  }

  // 发送时间一直都在(`ChatMessage.createdAt`),只是从来没渲染过 —— hover 才浮出。
  const clock = formatMessageClock(message.createdAt);

  return (
    <div
      className={`msg user${highlighted ? ' is-chat-rail-highlighted' : ''}`}
      data-testid="user-message"
      data-chat-message-id={message.id}
    >
      <span className="sr-only">{t('chat.you')}</span>
      {/* CURRENT workspace targets and applied plugin/scenario snapshots still
          travel with the message and `/api/runs`; product currently suppresses
          their historical chips in the transcript UI only. */}
      {/* 附件在上、文字在下,右边界对齐:附件行锁 412、气泡锁 380,两条上限
          各管各的(#53)。壳子刻意不设 width:100% —— 那样两个孩子会各自按
          自己的百分比算宽度,右边界反而对不上。 */}
      <div className="msg-stack">
        {attachments.length > 0 ? (
          <UserAttachmentRow
            attachments={attachments}
            projectId={projectId}
            projectFileNames={projectFileNames}
            onRequestOpenFile={onRequestOpenFile}
            workspaceContext={workspaceContext}
            t={t}
          />
        ) : null}
        {commentAttachments.some((attachment) => attachment.selectionKind !== 'visual') ? (
          <div className="user-attachments comment-history-attachments">
            {commentAttachments.filter((attachment) => attachment.selectionKind !== 'visual').map((a) => (
              <span key={a.id} className="user-attachment staged-comment">
                <span className="staged-name" title={a.comment ? `${commentTargetDisplayName(a)}: ${a.comment}` : commentTargetDisplayName(a)}>
                  <strong>{commentTargetDisplayName(a)}</strong>
                  {a.comment ? <span>{a.comment}</span> : null}
                </span>
              </span>
            ))}
          </div>
        ) : null}
        {message.content ? (
          <div className="user-text-wrap">
            {isDesignSystemWorkspaceRequest ? (
              <UserStatusCard
                title={t('chat.designSystemStatus.title')}
                description={t('chat.designSystemStatus.description')}
              />
            ) : (
              <UserBubble content={displayContent} t={t} />
            )}
            <div className="user-actions">
              {/* 稿子**渲染出来**是「时间 → 复制 → 重试」(它的说明文字写的是「时间在最右」,
                  和自己的 DOM 打架;用户 2026-08-26 指认以渲染为准)。
                  时间不是动作,所以不给按钮那套 30px 命中框。 */}
              {clock ? <span className="user-actions-time">{clock}</span> : null}
              <button
                type="button"
                className="ghost user-copy-btn"
                onClick={handleCopy}
                aria-label={copied ? t('chat.copyDone') : t('chat.copyPrompt')}
                title={copied ? t('chat.copyDone') : t('chat.copyPrompt')}
              >
                <Icon name={copied ? 'check' : 'copy'} size={16} />
              </button>
              {/* 发送失败那颗「重试」(稿子第 49 / 50 格的 `.msg-act .keep`):
                  和时间 / 复制**同一行**,但不跟着 hover 出没 —— 第 50 格的状态名
                  写的就是「时间与复制浮出,重试常驻」。 */}
              {message.sendFailed ? (
                <button
                  type="button"
                  className="user-keep-btn"
                  data-testid="user-send-failed"
                  aria-label={t('chat.sendFailedRetryAria')}
                  onClick={() => onResend?.(message)}
                >
                  {/* 稿子这一枚是**循环箭头**(`refresh`),不是感叹号 ——
                      感叹号说的是「出事了」,这颗按钮说的是「再来一次」。 */}
                  <Icon name="refresh" size={13} />
                  <span>{t('chat.record.retry')}</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
  }

  /* ── 气泡正文:超长折到 6 行(#46 / #47)──────────────────────────────
   *
   * 折的是【里面那层 .user-text-txt】,不是气泡本身:`-webkit-line-clamp` 的裁切
   * 边界是 padding box,直接折在气泡上的话第 7 行会从那 9px 下内边距里露半条字。
   *
   * 展开入口按 DOM / CSS / 规格 W7 走「气泡内的『查看全部』一行」,不是 hover
   * 浮出箭头 —— 稿子的说明文字那一句已经过时(盘点 §5 第 2 条)。
   * #47 相对 #46 在样式表里没有任何匹配规则,所以两格当同一态做。
   */
  function UserBubble({ content, t }: { content: string; t: TranslateFn }) {
  const txtRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const cut = useIsTextClamped(txtRef, content, expanded);

  return (
    <div className={`user-text user-bubble${expanded ? ' is-expanded' : ''}${cut ? ' is-cut' : ''}`}>
      <span className="user-text-clip">
        <span className="user-text-txt" ref={txtRef}>{content}</span>
        {cut && !expanded ? (
          <button
            type="button"
            className="user-text-more"
            data-testid="user-text-more"
            aria-label={t('chat.input.expandFull')}
            onClick={() => setExpanded(true)}
          >
            …
          </button>
        ) : null}
      </span>
      {cut ? (
        <div className="msg-more">
          <button
            type="button"
            data-testid="user-text-view-all"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? t('chat.input.collapse') : t('chat.input.viewAll')}
            <Icon name="chevron-down" size={12} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

  /**
   * 「这段话真的被截断了吗」。
   *
   * 只在【真的被截断】时才出那枚「…」:同一段话在宽一点的面板里可能六行就说完了,
   * 那时候还挂一枚「…」是在说一句不存在的下文。CSS 判断不了,只能量 ——
   * `scrollHeight` 比 `clientHeight` 高就是有东西被压住了。
   *
   * 面板宽度会变(拖动分栏、窗口缩放),字体加载完行高也会变,所以 `resize`、
   * `ResizeObserver`、`document.fonts.ready` 三路都要重量。
   * 展开之后不再重量:那时候 clamp 已经摘掉,量出来必然是「没截断」,
   * 会把「收起」的入口一起弄没。
   */
  function useIsTextClamped(
  ref: MutableRefObject<HTMLSpanElement | null>,
  content: string,
  expanded: boolean,
  ): boolean {
  const [cut, setCut] = useState(false);
  useEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const measure = () => {
      const node = ref.current;
      if (!alive || !node) return;
      setCut(node.scrollHeight - node.clientHeight > 1);
    };
    measure();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    window.addEventListener('resize', measure);
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(measure).catch(() => {});
    return () => {
      alive = false;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, content, expanded]);
  return cut;
  }

  /* ── 附件行(#52 / #53 / #56 / #57 / #58 / #59)────────────────────────
   *
   * 永远单行,超出横向滚动:多少个附件都只占一行,消息在流水里的高度因此是常量。
   * 图卡 57px 见方、不挂文件名(缩略图本身就是它的名字);文档卡 180px 宽,
   * 它没有画面,名字是它唯一的身份,所以反过来【必须】挂名字。
   *
   * 点击语义仍是产品现有的「在编辑器里打开这个文件」,不是稿子说的「弹层看大图」——
   * 换语义要产品拍板(盘点 §5 第 8 条)。
   */
  function UserAttachmentRow({
  attachments,
  projectId,
  projectFileNames,
  onRequestOpenFile,
  workspaceContext,
  t,
  }: {
  attachments: ChatAttachment[];
  projectId: string | null;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
  workspaceContext: ReturnType<typeof useProjectCollabContext>['workspaceContext'];
  t: TranslateFn;
  }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const { prev, next, page } = useAttachmentRowNav(rowRef, attachments.length);
  return (
    /* 壳子只为箭头存在:箭头要绝对定位压在这一行的两端,而滚动容器自己
       不能 `position: relative` —— 那样绝对定位的孩子会跟着内容一起滚走。 */
    <div className={`msg-att-wrap${prev ? ' is-prev' : ''}${next ? ' is-next' : ''}`}>
      <div className="user-attachments msg-att" data-testid="user-attachment-row" ref={rowRef}>
        {attachments.map((a) => {
          const baseName = a.path.split('/').pop() || a.path;
          const openName = projectFileNames
            ? [a.path, a.name, baseName].find(
                (candidate): candidate is string =>
                  typeof candidate === 'string' && projectFileNames.has(candidate),
              ) ?? baseName
            : baseName;
          // User-message attachments are uploaded into the project before the
          // message is persisted. The project file list can still be one
          // refresh behind, especially during the Home -> Project handoff, so
          // it is not a valid reason to disable the user's explicit open.
          const openable = !!onRequestOpenFile;
          const handleOpen = openable ? () => onRequestOpenFile?.(openName) : undefined;
          const label = openable ? t('chat.openFile', { name: baseName }) : a.path;
          return a.kind === 'image' && projectId ? (
            <button
              type="button"
              key={a.path}
              className="msg-att-img"
              onClick={handleOpen}
              disabled={!openable}
              aria-label={label}
              title={label}
            >
              <span className="msg-att-ph">
                <img
                  className="msg-att-mini"
                  src={projectRawUrl(projectId, a.path, workspaceContext)}
                  alt=""
                />
              </span>
              {/* 稿子第 55 格:hover 时卡右上角浮出一枚眼睛角标(`.att-ov .act`)。
                  它是**这张卡的悬停提示**,不是第二颗按钮 —— 卡本身的点击语义
                  仍然是「在编辑器里打开」,换成「弹层看大图」要产品拍板(已记)。 */}
              <span className="msg-att-eye" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </span>
            </button>
          ) : (
            <UserAttachmentDocCard
              key={a.path}
              attachment={a}
              label={label}
              openable={openable}
              onOpen={handleOpen}
            />
          );
        })}
      </div>
      {/* 一枚朝下的箭头转 ±90 度当左右用 —— 稿子里只此一支箭头,不另画两枚。
          出不出由 JS 量,**两颗常驻**、靠壳上的 `is-prev` / `is-next` 开关 `display`,
          和稿子 `.att-wrap.is-prev > .att-nav.mod-prev` 一致。
          (原来这里是条件不渲染。改成常驻还顺带合上了本仓的约定:
           条件显示的元素保持挂载,React 卸载会把退场过渡整个跳过。) */}
      <button
        type="button"
        className="msg-att-nav mod-prev"
        data-testid="msg-att-nav-prev"
        aria-label={t('chat.attachments.scrollPrev')}
        onClick={() => page('prev')}
      >
        <i>
          <Icon name="chevron-down" size={14} />
        </i>
      </button>
      <button
        type="button"
        className="msg-att-nav mod-next"
        data-testid="msg-att-nav-next"
        aria-label={t('chat.attachments.scrollNext')}
        onClick={() => page('next')}
      >
        <i>
          <Icon name="chevron-down" size={14} />
        </i>
      </button>
    </div>
  );
  }

  /**
   * 附件行的翻页箭头(#58)。
   *
   * 滚动条按稿子藏起来了,所以「还能往哪边走」必须由别的东西说。原来指望
   * 【卡被切在腰上】这一个信号 —— 它说得了「后面还有」,说不了「往回也还有」,
   * 更给不了鼠标一个能点的地方(触控板能横扫,鼠标只有按住 shift 滚轮)。
   *
   * 【只在真的被遮住时才出】。是否遮住由这里量,判据是纯函数
   * (`runtime/chat/attachment-nav.ts`)。四路重算,少一路就会看见错的箭头:
   *   · `scroll` —— 滚动过程中两端的结论一直在翻;
   *   · `ResizeObserver` —— 面板宽度变了(拖分栏),放得下 / 放不下会翻过来;
   *   · `resize` —— 窗口缩放不一定触发容器自身的 resize(容器是定宽 412 时);
   *   · `document.fonts.ready` —— 文档卡里的文字宽度要等字体到位才定下来。
   */
  function useAttachmentRowNav(
  ref: MutableRefObject<HTMLDivElement | null>,
  count: number,
  ): AttachmentNavState & { page: (direction: 'prev' | 'next') => void } {
  const [state, setState] = useState<AttachmentNavState>({ prev: false, next: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const sync = () => {
      const node = ref.current;
      if (!alive || !node) return;
      const measured = attachmentNavState(node);
      // 同一个结论就别 setState —— `scroll` 每帧都在响,原样回写会把整条消息
      // 重渲染一遍(附件行住在 memo 过的 UserMessage 里,白跑得很显眼)。
      setState((current) =>
        current.prev === measured.prev && current.next === measured.next ? current : measured,
      );
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(sync);
      observer.observe(el);
    }
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(sync).catch(() => {});
    return () => {
      alive = false;
      el.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      observer?.disconnect();
    };
  }, [ref, count]);

  const page = useCallback(
    (direction: 'prev' | 'next') => {
      const node = ref.current;
      if (!node) return;
      const rtl =
        typeof window !== 'undefined' &&
        window.getComputedStyle(node).direction === 'rtl';
      const left = attachmentNavDelta(direction, node.clientWidth, rtl);
      if (typeof node.scrollBy === 'function') node.scrollBy({ left, behavior: 'smooth' });
      else node.scrollLeft += left;
    },
    [ref],
  );

  return { ...state, page };
  }

  function UserAttachmentDocCard({
  attachment,
  label,
  openable,
  onOpen,
  }: {
  attachment: ChatAttachment;
  label: string;
  openable: boolean;
  onOpen?: () => void;
  }) {
  const { base, ext } = splitFileName(attachment.name);
  const nameRef = useRef<HTMLSpanElement>(null);
  const displayBase = useMiddleTruncatedName(nameRef, base, ext);
  const size = formatAttachmentSize(attachment.size);
  return (
    <button
      type="button"
      className="msg-att-doc"
      onClick={onOpen}
      disabled={!openable}
      aria-label={label}
      title={label}
    >
      <ChatFileIcon size={15} className="msg-att-fi" />
      <span className="msg-att-tx">
        <span className="msg-att-nm" ref={nameRef}>
          <span className="msg-att-base">{displayBase}</span>
          {ext ? <span className="msg-att-ext">{ext}</span> : null}
        </span>
        {/* 拿不到体积就空着这一行,不写 `0 B` —— 但位置留着,
            否则同一行里有体积和没体积的卡会差一行高(AGENTS §3)。 */}
        <span className="msg-att-meta">{size ?? ''}</span>
      </span>
    </button>
  );
  }

  /** 量文字宽度用的离屏 canvas。一份就够,反复建会在长会话里堆出几百个。 */
  let nameMeasureCtx: CanvasRenderingContext2D | null | undefined;

  function textMeasurerFor(el: HTMLElement | null): ((text: string) => number) | null {
  if (!el || typeof document === 'undefined') return null;
  if (nameMeasureCtx === undefined) {
    try {
      nameMeasureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      // jsdom / 没有 canvas 的运行环境:量不到就不截,由 CSS overflow 兜底。
      nameMeasureCtx = null;
    }
  }
  const ctx = nameMeasureCtx;
  if (!ctx) return null;
  const cs = window.getComputedStyle(el);
  if (!cs.fontSize) return null;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return (text: string) => ctx.measureText(text).width;
  }

  /**
   * 文件名中间省略(#59)。
   *
   * 量的是 `.msg-att-nm` 自己的可用宽度,而它在一张【定宽 180px】的卡里、且被
   * `.msg-att-tx { flex: 1 }` 钉住 —— 所以这个宽度是常量,不随名字长短变。
   * 这是绕开稿子里那个「越截越短」棘轮的关键:**不能拿截过的名字再去量**。
   *
   * 量不到(SSR / jsdom / 没有 canvas)就原样返回,由 CSS 的 `overflow:hidden`
   * 兜底 —— 宁可不截,不要截错。
   */
  function useMiddleTruncatedName(
  ref: MutableRefObject<HTMLSpanElement | null>,
  base: string,
  ext: string,
  ): string {
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const measure = () => {
      const node = ref.current;
      if (!alive || !node) return;
      // 还没布局(SSR 之后的第一帧 / jsdom)就别去碰 canvas —— 量不到就不截。
      if (!node.clientWidth) {
        setAvail(0);
        return;
      }
      const measurer = textMeasurerFor(node);
      const extWidth = measurer && ext ? measurer(ext) : 0;
      setAvail(node.clientWidth - extWidth);
    };
    measure();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(measure).catch(() => {});
    return () => {
      alive = false;
      observer?.disconnect();
    };
  }, [ref, ext]);
  return useMemo(
    () => (avail > 0 ? middleTruncateFileName(base, avail, textMeasurerFor(ref.current)) : base),
    [ref, base, avail],
  );
  }

function sortChatAttachmentsForDisplay(attachments: ChatAttachment[]): ChatAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = typeof a.attachment.order === 'number' && Number.isFinite(a.attachment.order)
        ? a.attachment.order
        : a.index;
      const bOrder = typeof b.attachment.order === 'number' && Number.isFinite(b.attachment.order)
        ? b.attachment.order
        : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

function isDesignSystemNextStepProject(metadata: ProjectMetadata | undefined): boolean {
  if (!metadata) return false;
  return (
    metadata.kind === 'brand' ||
    metadata.importedFrom === 'design-system' ||
    metadata.importedFrom === 'brand-extraction' ||
    Boolean(metadata.brandDesignSystemId)
  );
}

function isBrandExtractionNextStepProject(metadata: ProjectMetadata | undefined): boolean {
  if (!metadata) return false;
  return (
    metadata.kind === 'brand' ||
    metadata.importedFrom === 'brand-extraction' ||
    Boolean(metadata.brandId) ||
    Boolean(metadata.brandDesignSystemId)
  );
}

function isProgrammaticBrandAssistantMessage(message: ChatMessage | null | undefined): boolean {
  if (!message || message.role !== 'assistant') return false;
  const content = message.content || '';
  return (
    content.includes('<od-card type="brand-browser-assist"') ||
    /programmatic (design-system )?extraction|automatic pass needs a hand|extraction stopped/i.test(content) ||
    /程序化.*抽取|程式化.*抽取|抽取已停止/.test(content)
  );
}

function relTime(ts: number, t: TranslateFn): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.now');
  if (diff < hr) return t('common.minutesShort', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursShort', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysShort', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString();
}

export function conversationMetaLabel(
  conversation: Conversation,
  t: TranslateFn,
): string {
  const latestRun = conversation.latestRun;
  if (
    latestRun &&
    (latestRun.status === 'succeeded' ||
      latestRun.status === 'failed' ||
      latestRun.status === 'canceled') &&
    typeof conversation.totalDurationMs === 'number' &&
    Number.isFinite(conversation.totalDurationMs)
  ) {
    return formatDurationShort(conversation.totalDurationMs);
  }
  if (
    latestRun &&
    (latestRun.status === 'succeeded' ||
      latestRun.status === 'failed' ||
      latestRun.status === 'canceled') &&
    typeof latestRun.durationMs === 'number' &&
    Number.isFinite(latestRun.durationMs)
  ) {
    return formatDurationShort(latestRun.durationMs);
  }
  return relTime(conversation.updatedAt, t);
}

function formatDurationShort(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s - m * 60);
  return `${m}m ${rem.toString().padStart(2, '0')}s`;
}
