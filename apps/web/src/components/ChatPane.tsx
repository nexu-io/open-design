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
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { hasOdCard } from '@open-design/contracts';
import { useAnalytics } from '../analytics/provider';
import { getResolvedDeviceId } from '../analytics/client';
import { trackChatPanelClick, trackMessageQueueClick, trackRunFailedToastSurfaceView } from '../analytics/events';
import { amrHandoffDeviceId, attributedAmrUrl, recordAmrEntry } from '../analytics/amr-attribution';
import { useT } from '../i18n';
import {
  FEATURED_DESIGN_TOOLBOX_ACTION_IDS,
  findDesignToolboxSkill,
  getDesignToolboxAction,
  type DesignToolboxActionId,
} from '../runtime/design-toolbox';
import type { Dict } from '../i18n/types';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { projectRawUrl } from '../providers/registry';
import { takeComposerSeedFor } from '../state/libraryHandoff';
import { splitOnQuestionForms } from '../artifacts/question-form';
import { stripArtifact } from '../artifacts/strip';
import type { TodoItem } from '../runtime/todos';
import type { AppliedPluginSnapshot, ChatSessionMode, WorkspaceContextItem } from '@open-design/contracts';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import {
  DESIGN_SYSTEM_WORKSPACE_DISPLAY_DESCRIPTION,
  DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE,
  isDesignSystemWorkspacePrompt,
} from '../design-system-auto-prompt';
import { isTodoWriteToolName, latestTodoWriteInputForPinnedCard } from '../runtime/todos';
import type { AppConfig, ChatAttachment, ChatCommentAttachment, ChatMessage, ChatMessageFeedbackChange, Conversation, DesignSystemSummary, PreviewComment, Project, ProjectFile, ProjectMetadata, SkillSummary } from '../types';
import { agentDisplayName } from '../utils/agentLabels';
import { commentTargetDisplayName, commentsToAttachments, simplePositionLabel } from '../comments';
import { AssistantMessage, type QuestionFormOpenRequest } from './AssistantMessage';
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
} from './amrLoginPolling';
import { amrRechargeUrlForProfile, resolveRunFailureUi } from '../runtime/amr-guidance';
import {
  fetchVelaLoginStatus,
  type VelaLoginStatus,
} from '../providers/daemon';
import { RESUME_CONTINUE_PROMPT } from '../runtime/resume';
import {
  ChatComposer,
  type ChatComposerHandle,
  type ChatSendMeta,
} from './ChatComposer';
import type { PlaceholderScenario } from './home-hero/placeholderScenarios';
import { listDesignArtifactCandidates } from './design-files/designArtifacts';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { Icon, type IconName } from './Icon';
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
  if (!projectId) {
    return <ChatArtifactFallback kind={file.kind} />;
  }

  const url = `${projectRawUrl(projectId, file.name)}?v=${Math.round(file.mtime)}`;
  if (isRenderableSketchJson(file)) {
    return <SketchPreview projectId={projectId} file={file} />;
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
  queuedItems?: QueuedSendItem[];
  onRemoveQueuedSend?: (id: string) => void;
  onUpdateQueuedSend?: (id: string, update: QueuedSendUpdate) => void;
  onReorderQueuedSends?: (orderedIds: string[]) => void;
  onSendQueuedNow?: (id: string) => void;
  // Names that exist in the project folder. Tool cards and chips use this
  // set to decide whether a path can be opened as a tab.
  projectFileNames?: Set<string>;
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
  ) => void;
  onRetry?: (assistantMessage: ChatMessage) => void;
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
  // "Share to Open Design" button on each completed assistant message —
  // wired by ProjectView to handleSend with the bundled
  // `od-share-to-community` scenario's trigger prompt.
  onShareToOpenDesign?: (assistantMessageId: string) => void;
  shareToOpenDesignBusyMessageId?: string | null;
  forceStreamingMessageIds?: Set<string>;
  // Live-only streaming tool-input partials keyed by tool-use id. Threaded to
  // AssistantMessage so an in-flight Write/Edit can render its code in real
  // time before the full `tool_use` arrives. Never persisted.
  liveToolInput?: Record<string, { name: string; text: string; seq?: number }>;
  initialDraft?: string;
  composerPlaceholder?: string;
  // Focus the right-hand Questions tab from the chat banner.
  onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
  onContinueRemainingTasks?: (assistantMessage: ChatMessage, todos: TodoItem[]) => void;
  onAssistantFeedback?: (assistantMessage: ChatMessage, change: ChatMessageFeedbackChange) => void;
  // Client-side action for a brand-browser-assist od-card: open/focus the
  // Browser tab. Routed through the stable callbacks ref.
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
  // "Next step" affordance handlers forwarded to the last assistant message.
  // The featured design-toolbox rows are driven directly off the composer ref
  // owned here, so they need no handler from ProjectView (unlike onArtifactShare).
  onArtifactShare?: (fileName: string) => void;
  onArtifactDownload?: (fileName: string) => void;
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
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
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
  // Project header slot. The former standalone chrome header row was removed;
  // its back button, project title (editable) and design-system picker moved
  // into the top of the chat pane. ProjectView owns the project record so it
  // renders these as slots rather than ChatPane re-deriving the data.
  onBack?: () => void;
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

// Gap left above the anchored user message when it is pinned to the top.
const ANCHOR_TOP_PADDING = 12;

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
    case 'conversation_title':
      return false;
  }
}

export function ChatPane({
  messages,
  streaming,
  loading = false,
  sendDisabled = false,
  queuedItems = [],
  error,
  projectId,
  sessionMode = 'design',
  onSessionModeChange,
  projectKindForTracking = null,
  projectFiles,
  activeProjectFileName = null,
  hasActiveDesignSystem = false,
  activeDesignSystem = null,
  projectFileNames,
  onEnsureProject,
  previewComments = [],
  attachedComments = [],
  onAttachComment,
  onDetachComment,
  onDeleteComment,
  onSend,
  onRetry,
  onResumeRun,
  onStop,
  onRemoveQueuedSend,
  onUpdateQueuedSend,
  onReorderQueuedSends,
  onSendQueuedNow,
  onRequestOpenFile,
  onRequestPluginDetails,
  onRequestDesignSystemDetails,
  onRequestPluginFolderAgentAction,
  activePluginActionPaths,
  hiddenPluginActionPaths,
  onShareToOpenDesign,
  shareToOpenDesignBusyMessageId,
  forceStreamingMessageIds,
  liveToolInput,
  initialDraft,
  composerPlaceholder,
  onOpenQuestions,
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
  onBack,
  backLabel,
  projectHeader,
  designSystemPicker,
  config,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const displayMessages = useMemo(
    () => messages.filter((message) => !shouldHideEmptyBrandAssistantMessage(message, projectMetadata)),
    [messages, projectMetadata],
  );
  const amrProfile = config?.agentCliEnv?.amr?.[AMR_PROFILE_ENV_KEY] ?? null;
  const [inlineAmrLoginStatus, setInlineAmrLoginStatus] =
    useState<VelaLoginStatus | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  // Guards the inline AMR sign-in card so a successful login auto-retries the
  // failed run exactly once (the pill's onStatusChange fires loggedIn on every
  // poll). Keyed by the failed assistant's id.
  const amrAuthRetriedRef = useRef<string | null>(null);
  // Tracks the last observed AMR login state so we retry only on a real
  // signed-out -> signed-in transition. Without this, a run that keeps failing
  // AMR_AUTH_REQUIRED while /status already reports signed-in would auto-retry
  // forever (each retry is a new assistant id, so the id guard alone never
  // converges).
  const amrAuthPrevLoggedInRef = useRef<boolean | undefined>(undefined);
  const chatLogScrollIdleTimerRef = useRef<number | null>(null);
  const historyWrapRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const composerSlotRef = useRef<HTMLDivElement | null>(null);
  const composerLayerRef = useRef<HTMLDivElement | null>(null);
  const queuedSendStripRef = useRef<HTMLDivElement | null>(null);
  const didInitialScrollRef = useRef(false);
  const runFailedToastSurfaceKeysRef = useRef<Set<string>>(new Set());
  // Tracks whether the user is glued close enough to the bottom that
  // streamed content should auto-follow. Distinct from the jump-button
  // state below, which uses a wider threshold (120px) so the affordance
  // stays visible for short scroll-ups. Auto-follow needs the tighter
  // 80px cutoff: scrolling ~90px up is an intentional pause that
  // shouldn't be yanked back the moment the next chunk streams in.
  const pinnedToBottomRef = useRef(true);
  const scrolledToFormRef = useRef<Set<string>>(new Set());
  const refreshInlineAmrLoginStatus = useCallback(async () => {
    const next = await fetchVelaLoginStatus().catch(() => null);
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

  // "Anchor the just-sent turn to the top" (ChatGPT-style). On send we pin
  // the user's message to the top of the viewport and let the reply stream
  // below it instead of following the bottom. `pending` is armed by the
  // composer's onSend; the messages effect promotes it to `active` once the
  // new user turn actually renders. A dynamic tail spacer reserves just
  // enough real, scrollable blank space below the turn so the message can
  // reach the top even when the reply is short. The spacer is only resized
  // while the message sits at its pinned position — once the user scrolls
  // below it, the reserved blank stays put (no collapse, no jump).
  const anchorPendingRef = useRef(false);
  const anchorActiveRef = useRef(false);
  const tailSpacerRef = useRef<HTMLDivElement | null>(null);
  const prevStreamingRef = useRef(streaming);
  const prevLastUserIdRef = useRef<string | undefined>(undefined);
  // AssistantMessage's interaction callbacks are re-created per render and
  // excluded from its memo comparison (so streaming doesn't re-render every
  // message). Route them through this ref so a memoized message still calls the
  // LATEST handler. See areAssistantMessagePropsEqual in AssistantMessage.tsx.
  const assistantCallbacksRef = useRef<AssistantCallbacks>({
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
  const handlePickSkill = useCallback((skillId: string) => {
    composerRef.current?.applyDesignToolboxSkill(skillId);
  }, []);
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
  // The `@skill` shown in each featured row's hover detail — matched the same
  // way the composer matches it, using the raw skill name (what gets inlined
  // into the draft). Recomputed only when the skill list changes.
  const featuredToolboxSkillNames = useMemo<Partial<Record<DesignToolboxActionId, string | null>>>(() => {
    const map: Partial<Record<DesignToolboxActionId, string | null>> = {};
    for (const id of FEATURED_DESIGN_TOOLBOX_ACTION_IDS) {
      const action = getDesignToolboxAction(id);
      map[id] = action ? (findDesignToolboxSkill(action, skills)?.name ?? null) : null;
    }
    return map;
  }, [skills]);
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
  const [chatLogScrollable, setChatLogScrollable] = useState(false);
  const [chatLogScrolling, setChatLogScrolling] = useState(false);
  const [composerPortalTarget, setComposerPortalTarget] = useState<HTMLElement | null>(null);
  const [composerPortalRect, setComposerPortalRect] = useState<{
    left: number;
    width: number;
    bottom: number;
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
    ? resolveRunFailureUi(failedRunErrorEvent?.code, retryAssistant.agentId)
    : null;
  const hasInlineAmrAuthorizeFailure = Boolean(
    retryAssistant && onRetry && runFailureUi?.primaryAction === 'authorize',
  );
  useEffect(() => {
    if (!hasInlineAmrAuthorizeFailure || !retryAssistant || !onRetry) return;
    let stopped = false;
    const retryIfSignedIn = async () => {
      const next = await refreshInlineAmrLoginStatus();
      if (stopped) return;
      // Retry only on a real signed-out -> signed-in transition. A null/unknown
      // status is NOT treated as signed-out, so it can't fabricate a transition;
      // and once signed-in we never retry again until an explicit signed-out is
      // seen. Otherwise a run that keeps failing auth while /status reports
      // signed-in would retry forever (each retry is a new assistant id).
      if (next?.loggedIn === true) {
        const wasSignedOut = amrAuthPrevLoggedInRef.current === false;
        amrAuthPrevLoggedInRef.current = true;
        if (wasSignedOut && amrAuthRetriedRef.current !== retryAssistant.id) {
          amrAuthRetriedRef.current = retryAssistant.id;
          onRetry(retryAssistant);
        }
      } else if (next && next.loggedIn === false) {
        amrAuthPrevLoggedInRef.current = false;
      }
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
  // Prefer a case-specific message (AMR auth / balance) over the raw upstream
  // string; fall back to the live global error (also covers conversation-load
  // / audio errors) then the persisted run error so a reload still shows it.
  const rawError = error ?? failedRunErrorEvent?.detail ?? null;
  // Friendly agent name for {agent} interpolation in failure copy (e.g. the
  // sign-in messages). Falls back to a neutral word when unreadable, never null.
  const failedAgentLabel =
    agentDisplayName(retryAssistant?.agentId, retryAssistant?.agentName) ??
    t('chat.runError.agentFallback');
  const displayError = runFailureUi?.messageKey
    ? t(runFailureUi.messageKey, { agent: failedAgentLabel })
    : rawError;
  const errorDiagnosticText = displayError
    ? buildRunErrorDiagnosticText({
        message: displayError,
        rawMessage: rawError,
        errorCode: failedRunErrorEvent?.code,
        traceId: retryAssistant?.runId,
        projectId,
        conversationId: activeConversationId,
        assistantMessageId: retryAssistant?.id,
        agentId: retryAssistant?.agentId,
      })
    : null;
  // First non-empty line of the diagnostics — shown as the one-line peek when
  // the error-source area is collapsed.
  const errorSourcePeek =
    errorDiagnosticText?.split('\n').find((line) => line.trim().length > 0)?.trim() ?? null;
  // Status-dot tone for the unified card. Brand (accent) for AMR sign-in/top-up
  // — the commercial recovery path; warn (amber) for the self-healing
  // connection drop; error (red) for everything else. Purely visual.
  const runErrorTone: 'error' | 'warn' | 'brand' =
    runFailureUi?.primaryAction === 'authorize' || runFailureUi?.primaryAction === 'recharge'
      ? 'brand'
      : failedRunErrorEvent?.code === 'AGENT_CONNECTION_DROPPED'
        ? 'warn'
        : 'error';
  const [copiedErrorDiagnostic, setCopiedErrorDiagnostic] = useState(false);
  // Collapsed by default: the error source area shows one line until expanded.
  const [errorSourceOpen, setErrorSourceOpen] = useState(false);
  const errorDiagnosticCopyTimerRef = useRef<number | null>(null);
  const copyErrorDiagnostic = useCallback(async () => {
    if (!errorDiagnosticText) return;
    const ok = await copyToClipboard(errorDiagnosticText);
    if (!ok) return;
    if (errorDiagnosticCopyTimerRef.current != null) {
      window.clearTimeout(errorDiagnosticCopyTimerRef.current);
    }
    setCopiedErrorDiagnostic(true);
    errorDiagnosticCopyTimerRef.current = window.setTimeout(() => {
      errorDiagnosticCopyTimerRef.current = null;
      setCopiedErrorDiagnostic(false);
    }, 1600);
  }, [errorDiagnosticText]);
  useEffect(() => () => {
    if (errorDiagnosticCopyTimerRef.current != null) {
      window.clearTimeout(errorDiagnosticCopyTimerRef.current);
      errorDiagnosticCopyTimerRef.current = null;
    }
  }, []);
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
  const showByokRecoveryCta = showByokRecoveryAction && Boolean(onSwitchToLocalCli);
  const showErrorActions =
    showByokRecoveryCta || Boolean(retryAssistant && onRetry && runFailureUi);
  useEffect(() => {
    if (!displayError || !failedRunErrorEvent?.code || !retryAssistant) return;
    // The hosted-AMR nudge owns this same surface_view when it renders below
    // the error card. For all other failed-run guidance (AMR auth/balance,
    // Antigravity auth/quota, upstream outage, generic retry), the chat error
    // card itself is the visible run_failed_toast surface.
    if (amrSwitchPayload) return;

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
    amrSwitchPayload,
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
  // Only the first user message gets the active-plugin chip — the
  // plugin is project-scoped so re-stamping it on every reply would be
  // noise. Subsequent messages still run under the same snapshot.
  const firstUserMessageId = useMemo(
    () => displayMessages.find((m) => m.role === 'user')?.id,
    [displayMessages],
  );
  const shouldBalanceFinishedTranscript =
    !loading &&
    !streaming &&
    !displayError &&
    !hasActiveRunMessage &&
    displayMessages.length > 0;
  // Map each assistant message id to the user message that follows it (if any)
  // so the chat-side Questions banner can reopen that exact answered form in
  // the right-hand panel later.
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
    anchorPendingRef.current = false;
    anchorActiveRef.current = false;
    prevLastUserIdRef.current = undefined;
    resetTailSpacer();
    // A new conversation should land at the bottom (its own initial
    // scroll), not inherit the previous conversation's saved position —
    // including any anchor-to-top reserve still held by the tail spacer, which
    // would otherwise strand the freshly opened conversation below a dead gap.
    savedChatScrollRef.current = null;
    scrolledToFormRef.current = new Set();
    anchorActiveRef.current = false;
    anchorPendingRef.current = false;
    resetTailSpacer();
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

  const restoreQueuedSendToComposer = (item: QueuedSendItem) => {
    setEditingQueuedSendId(item.id);
    composerRef.current?.restoreDraft({
      text: item.prompt,
      attachments: item.attachments ?? [],
      commentAttachments: item.commentAttachments ?? [],
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
        const assistantEls = el.querySelectorAll('.msg.assistant');
        const lastAssistantEl = assistantEls[assistantEls.length - 1];
        const formEl = lastAssistantEl?.querySelector<HTMLElement>('[data-form-id]');
        if (formEl && !scrolledToFormRef.current.has(formEl.dataset.formId!)) {
          scrolledToFormRef.current.add(formEl.dataset.formId!);
          formEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
          pinnedToBottomRef.current = false;
          setScrolledFromBottom(true);
          return;
        }
        // Already handled by the auto-scroll effect — don't bottom-scroll.
        if (formEl) return;
      }
      // Initial-load bottom-pin must be instant — smooth scrollTo emits
      // intermediate scroll events that flip pinnedToBottomRef to false.
      el.scrollTop = el.scrollHeight;
      setScrolledFromBottom(false);
      pinnedToBottomRef.current = true;
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
    // latest message. We key off the pre-content `pinnedToBottomRef`
    // (a ref so it doesn't itself re-fire this effect on scroll) instead
    // of recomputing distance from the just-grown scrollHeight: a single
    // streamed chunk can add 100+ px in one render, which made the
    // post-content distance check skip auto-scroll even when the user
    // was glued to the bottom. We deliberately use the tighter 80px
    // cutoff tracked by the ref (not the wider 120px jump-button
    // threshold) so a deliberate ~90px scroll-up isn't snapped back the
    // next time content streams in. Issue #983.

    // A brand-new user turn from a local send: switch to "anchor to top"
    // mode and smooth-scroll their message to the top of the viewport.
    const lastUser = [...displayMessages].reverse().find((m) => m.role === 'user');
    const prevUserId = prevLastUserIdRef.current;
    prevLastUserIdRef.current = lastUser?.id;
    if (anchorPendingRef.current && lastUser && lastUser.id !== prevUserId) {
      anchorPendingRef.current = false;
      resetTailSpacer();
      anchorActiveRef.current = true;
      pinnedToBottomRef.current = false;
      setScrolledFromBottom(true);
      requestAnimationFrame(() => {
        sizeAnchorSpacer();
        scrollAnchorToTop();
      });
      return;
    }
    // While anchored, the message stays at the top on its own (nothing above
    // it changes), so we only shrink the spacer as the reply grows — never
    // re-scroll. This is what keeps scrolling down and the final settle smooth.
    if (anchorActiveRef.current) {
      requestAnimationFrame(sizeAnchorSpacer);
      return;
    }

    if (pinnedToBottomRef.current) {
      // If the last assistant message contains a question form, scroll to
      // the form instead of the bottom, so the user lands on the form.
      const lastAssistantMsg = [...displayMessages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistantMsg?.content.includes('<question-form')) {
        const assistantEls = el.querySelectorAll('.msg.assistant');
        const lastAssistantEl = assistantEls[assistantEls.length - 1];
        const formEl = lastAssistantEl?.querySelector<HTMLElement>('[data-form-id]');
        if (formEl && !scrolledToFormRef.current.has(formEl.dataset.formId!)) {
          scrolledToFormRef.current.add(formEl.dataset.formId!);
          formEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
          pinnedToBottomRef.current = false;
          setScrolledFromBottom(true);
          return;
        }
        // Form tag in content but the DOM element isn't ready yet (partial
        // stream) — skip bottom-scroll to avoid a jarring jump that gets
        // undone when the form finishes rendering.
        if (streaming) return;
      }
      // Streaming bottom-pin must be instant — smooth scrollTo emits
      // intermediate scroll events that flip pinnedToBottomRef to false,
      // breaking auto-follow for subsequent chunks.
      el.scrollTop = el.scrollHeight;
    }
  }, [displayMessages, error, streaming]);

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
          target.scrollTop = target.scrollHeight;
        } else {
          target.scrollTop = saved.scrollTop;
        }
        syncScrollable(target);
        // Resync the jump-to-latest affordance with the restored
        // position. Without this, a user who left Chat ~60px from the
        // bottom and returns to find new messages stacked underneath
        // would land hundreds of pixels above the latest turn while
        // scrolledFromBottom remained false until they scrolled.
        const distance =
          target.scrollHeight - target.scrollTop - target.clientHeight;
        setScrolledFromBottom(distance > 120);
        pinnedToBottomRef.current = distance < 80;
      });
    }

    function snapshot(target: HTMLDivElement) {
      const distance =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      savedChatScrollRef.current =
        distance < 50
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
          pinnedTop !== null &&
          Math.abs(target.scrollTop - (pinnedTop - ANCHOR_TOP_PADDING)) > 40
        ) {
          anchorActiveRef.current = false;
        }
      }
      syncScrollable(target);
      markScrolling();
      snapshot(target);
      const distance =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      // Functional updater bails out when the value is unchanged so a flood
      // of scroll events (e.g. programmatic scrollTop + ResizeObserver
      // follow-up during streaming) does not schedule a re-render per tick
      // and trip React's "Maximum update depth exceeded" guard.
      const next = distance > 120;
      setScrolledFromBottom((prev) => (prev === next ? prev : next));
      pinnedToBottomRef.current = distance < 80;
    }
    syncScrollable(el);
    el.addEventListener('scroll', onScroll);
    return () => {
      // Capture final scroll state before unmount; the ref normally
      // tracks via onScroll, but programmatic scrolls or layout shifts
      // right before unmount can leave it stale.
      snapshot(el);
      el.removeEventListener('scroll', onScroll);
      if (chatLogScrollIdleTimerRef.current !== null) {
        window.clearTimeout(chatLogScrollIdleTimerRef.current);
        chatLogScrollIdleTimerRef.current = null;
      }
      setChatLogScrolling(false);
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== 'chat') return;
    const el = logRef.current;
    if (!el) return;

    let followFrame: number | null = null;
    const followLatestIfPinned = () => {
      // While anchored, only shrink the tail spacer as the reply grows
      // (resize-only, never scroll) so the user message stays put without
      // fighting a manual scroll-down.
      if (anchorActiveRef.current) {
        if (followFrame !== null) return;
        followFrame = requestAnimationFrame(() => {
          followFrame = null;
          if (!anchorActiveRef.current) return;
          sizeAnchorSpacer();
        });
        return;
      }
      if (!pinnedToBottomRef.current || followFrame !== null) return;
      followFrame = requestAnimationFrame(() => {
        followFrame = null;
        const target = logRef.current;
        if (!target || !pinnedToBottomRef.current) return;
        target.scrollTop = target.scrollHeight;
        setScrolledFromBottom(false);
      });
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            const target = logRef.current;
            if (target) {
              const next = target.scrollHeight - target.clientHeight > 1;
              setChatLogScrollable((prev) => (prev === next ? prev : next));
              if (!next) setChatLogScrolling(false);
            }
            followLatestIfPinned();
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

    let observedQueuedSendStrip: Element | null = null;
    const syncQueuedSendStrip = () => {
      if (!resizeObserver) return;
      const queuedEl = queuedSendStripRef.current;
      if (queuedEl && observedQueuedSendStrip !== queuedEl) {
        if (observedQueuedSendStrip) {
          resizeObserver.unobserve(observedQueuedSendStrip);
        }
        resizeObserver.observe(queuedEl);
        observedQueuedSendStrip = queuedEl;
      } else if (!queuedEl && observedQueuedSendStrip) {
        resizeObserver.unobserve(observedQueuedSendStrip);
        observedQueuedSendStrip = null;
      }
    };

    syncObservedChildren();
    syncQueuedSendStrip();

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            syncObservedChildren();
            syncQueuedSendStrip();
            followLatestIfPinned();
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
    // QueuedSendStrip lives outside the chat-log subtree (it is a sibling of
    // .chat-log-wrap inside .pane). The MutationObserver above only fires for
    // changes inside el, so it cannot detect that surface mounting or
    // unmounting. Watch the nearest common ancestor (.pane) with childList-only
    // to keep its observer current.
    const paneEl = el.parentElement?.parentElement ?? null;
    if (paneEl && mutationObserver) {
      mutationObserver.observe(paneEl, { childList: true });
    }

    return () => {
      if (followFrame !== null) cancelAnimationFrame(followFrame);
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

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;
  const filteredConversations = useMemo(
    () => filterConversations(conversations, deferredConversationSearch, t),
    [conversations, deferredConversationSearch, t],
  );

  function resetTailSpacer() {
    const s = tailSpacerRef.current;
    if (s) s.style.height = '0px';
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
    const spacerH = spacer.offsetHeight;
    const contentBelow = el.scrollHeight - spacerH - msgTopInContent;
    const needed = Math.max(0, el.clientHeight - contentBelow - ANCHOR_TOP_PADDING);
    spacer.style.height = `${needed}px`;
  }

  // Smooth-scroll the anchored message to the top. Called ONCE per turn (on
  // send). The message then stays at the top on its own as the reply streams
  // below it, so we never re-scroll — re-scrolling each chunk is what caused
  // the scroll-down fight and the settle jitter.
  function scrollAnchorToTop() {
    const el = logRef.current;
    if (!el) return;
    const msgTopInContent = lastUserMsgTopInContent(el);
    if (msgTopInContent === null) return;
    const target = Math.max(0, msgTopInContent - ANCHOR_TOP_PADDING);
    el.scrollTo({ top: target, behavior: 'smooth' });
  }

  function jumpToBottom() {
    const el = logRef.current;
    if (!el) return;
    anchorActiveRef.current = false;
    pinnedToBottomRef.current = true;
    resetTailSpacer();
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
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
      setComposerPortalRect((prev) => {
        const next = {
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          bottom: Math.max(0, Math.round(window.innerHeight - rect.bottom)),
        };
        if (
          prev
          && prev.left === next.left
          && prev.width === next.width
          && prev.bottom === next.bottom
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
    <ChatComposer
      ref={composerRef}
      designSystemPicker={designSystemPicker}
      projectId={projectId}
      projectFiles={projectFiles}
      activeProjectFileName={activeProjectFileName}
      sessionMode={sessionMode}
      onSessionModeChange={onSessionModeChange}
      skills={skills}
      streaming={streaming}
      sendDisabled={sendDisabled}
      initialDraft={initialDraft}
      composerPlaceholder={composerPlaceholder}
      placeholderScenarios={composerPlaceholderScenarios}
      draftStorageKey={composerDraftStorageKey}
      onEnsureProject={onEnsureProject}
      commentAttachments={commentsToAttachments(attachedComments)}
      onRemoveCommentAttachment={onDetachComment}
      onSend={(prompt, attachments, commentAttachments, meta) => {
        pinnedToBottomRef.current = true;
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
        // Arm "anchor to top": the messages effect promotes this once
        // the new user turn renders, pinning it to the top of the view.
        // Clear any stale reserve from the previous turn first so a resend
        // doesn't strand the new turn below a leftover gap (release #3653).
        anchorActiveRef.current = false;
        resetTailSpacer();
        anchorPendingRef.current = true;
        onSend(prompt, attachments, commentAttachments, meta);
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
    <div className="pane">
      <div className="chat-project-header">
        {onBack ? (
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
          <button
            type="button"
            className="chat-session-trigger icon-only"
            data-testid="conversation-history-trigger"
            title={
              activeConversation?.title
                ? `${t('chat.conversationsTitle')} · ${activeConversation.title}`
                : t('chat.conversationsTitle')
            }
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
            <Icon name="comment" size={16} />
          </button>
          {showConvList ? (
            <div className="chat-history-menu" role="menu" data-testid="conversation-history-menu">
              <div className="chat-history-menu-head">
                <span className="chat-history-menu-title">
                  {t('chat.conversationsHeading')}
                </span>
                <span className="chat-history-menu-count">
                  <span data-testid="conversation-history-count">
                  {filteredConversations.length === conversations.length
                    ? compactCount(conversations.length)
                    : `${compactCount(filteredConversations.length)} / ${compactCount(conversations.length)}`}
                  </span>
                </span>
                {onNewConversation ? (
                  <button
                    type="button"
                    className="chat-history-new"
                    data-testid="conversation-history-new"
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
                    <Icon name="plus" size={11} />
                    <span>{t('chat.new')}</span>
                  </button>
                ) : null}
              </div>
              <label className="chat-history-search">
                <Icon name="search" size={12} />
                <input
                  type="search"
                  value={conversationSearch}
                  onChange={(event) => setConversationSearch(event.currentTarget.value)}
                  placeholder="Search conversations"
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
                    No conversations match.
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
      </div>
      {tab === 'chat' ? (
        <>
          <div className="chat-log-wrap">
            <div
              className={[
                'chat-log',
                loading ? 'is-loading' : '',
                chatLogScrollable ? 'is-scrollable' : '',
                chatLogScrolling ? 'is-scrolling' : '',
                shouldBalanceFinishedTranscript ? 'is-balanced-transcript' : '',
              ].filter(Boolean).join(' ')}
              ref={logRef}
              aria-busy={loading}
              onClickCapture={(e) => {
                // Expanding an accordion (tool card / thinking block) should
                // grow downward with the clicked header staying put. While a
                // run is glued to the bottom, the ResizeObserver would re-pin
                // to the bottom on the height change and push the header up,
                // so unpin the moment the user toggles one open.
                const toggle = (e.target as HTMLElement).closest(
                  '.thinking-toggle, .action-card-toggle, button.op-card-head, [aria-expanded]',
                );
                if (toggle && logRef.current?.contains(toggle)) {
                  pinnedToBottomRef.current = false;
                  anchorActiveRef.current = false;
                  setScrolledFromBottom(true);
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
                      <div className="chat-empty">
                        <span className="chat-empty-title">
                          {t('chat.startTitle')}
                        </span>
                      </div>
                      <div className="chat-examples" role="list">
                        {pickStarters(projectMetadata, t).map((ex, i) => (
                          <button
                            key={`${ex.title}-${i}`}
                            type="button"
                            role="listitem"
                            className="chat-example"
                            style={{ animationDelay: `${i * 70}ms` }}
                            onClick={() => {
                              trackChatPanelClick(analytics.track, {
                                page_name: 'chat_panel',
                                area: 'chat_panel',
                                element: 'template_card',
                              });
                              composerRef.current?.setDraft(ex.prompt);
                            }}
                            title={t('chat.fillInputTitle')}
                          >
                            <span className="chat-example-icon" aria-hidden>
                              {ex.icon}
                            </span>
                            <span className="chat-example-body">
                              <span className="chat-example-head">
                                <span className="chat-example-title">{ex.title}</span>
                                <span className="chat-example-tag">{ex.tag}</span>
                              </span>
                              <span className="chat-example-prompt">{ex.prompt}</span>
                            </span>
                            <span className="chat-example-cta" aria-hidden>
                              ↵
                            </span>
                          </button>
                        ))}
                      </div>
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
                messages={displayMessages}
                streaming={streaming}
                liveToolInput={liveToolInput}
                projectId={projectId}
                projectKindForTracking={projectKindForTracking}
                activeConversationId={activeConversationId}
                activeConversationKey={activeConversationId ?? 'no-conversation'}
                projectFiles={projectFiles}
                projectMetadata={projectMetadata}
                projectFileNames={projectFileNames}
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
                firstUserMessageId={firstUserMessageId}
                activePluginSnapshot={activePluginSnapshot}
                activeDesignSystem={activeDesignSystem}
                hasActiveDesignSystem={hasActiveDesignSystem}
                errorCardOwnerId={errorCardOwnerId}
                nextUserContentByAssistantId={nextUserContentByAssistantId}
                assistantCallbacksRef={assistantCallbacksRef}
                onContinueRemainingTasks={onContinueRemainingTasks}
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
                onArtifactDownload={onArtifactDownload}
                nextStepSkills={skills}
                toolboxSkillNames={featuredToolboxSkillNames}
                nextStepVariant={nextStepVariant}
                onForkFromMessage={onForkFromMessage}
                onAssistantFeedback={onAssistantFeedback}
                forkingMessageId={forkingMessageId}
                t={t}
                onOpenQuestions={onOpenQuestions}
                scrollContainerRef={logRef}
              />
              {displayError ? (
                <div className="run-error" data-tone={runErrorTone}>
                  {/* ① type title + ② detail */}
                  <div className="run-error__main">
                    <span className="run-error__icon" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M8 4.5v4M8 11h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </span>
                    <div className="run-error__copy">
                      {runFailureUi ? (
                        <p className="run-error__title">{t(runFailureUi.titleKey)}</p>
                      ) : null}
                      <p className="run-error__desc">{displayError}</p>
                    </div>
                  </div>
                  {/* ④ collapsible error source */}
                  {errorDiagnosticText ? (
                    <div className={`run-error__source${errorSourceOpen ? ' is-open' : ''}`}>
                      <div className="run-error__source-head">
                        <button
                          type="button"
                          className="run-error__source-bar"
                          aria-expanded={errorSourceOpen}
                          aria-label={
                            errorSourceOpen
                              ? t('chat.runError.sourceCollapseAria')
                              : t('chat.runError.sourceExpandAria')
                          }
                          onClick={() => setErrorSourceOpen((open) => !open)}
                        >
                          <svg className="run-error__source-chevron" viewBox="0 0 12 12" fill="none">
                            <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="run-error__source-label">{t('chat.runError.sourceLabel')}</span>
                          {errorSourcePeek ? (
                            <span className="run-error__source-peek">{errorSourcePeek}</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="run-error__source-copy"
                          onClick={() => void copyErrorDiagnostic()}
                          aria-label={copiedErrorDiagnostic ? t('chat.copyDone') : t('chat.copyErrorDiagnostic')}
                          title={copiedErrorDiagnostic ? t('chat.copyDone') : t('chat.copyErrorDiagnostic')}
                        >
                          <Icon name={copiedErrorDiagnostic ? 'check' : 'copy'} size={13} />
                        </button>
                      </div>
                      <div className="run-error__source-full">
                        <pre>{errorDiagnosticText}</pre>
                      </div>
                    </div>
                  ) : null}
                  {/* ③ fix actions */}
                  {showErrorActions || (retryAssistant && onRetry && runFailureUi) ? (
                    <div className="run-error__actions">
                      {showByokRecoveryCta ? (
                        <button
                          type="button"
                          className="chat-error-action"
                          onClick={onSwitchToLocalCli}
                        >
                          {t('avatar.useLocal')}
                        </button>
                      ) : null}
                      {retryAssistant && onRetry && runFailureUi ? (
                        <>
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
                              metricsConsent={config?.telemetry?.metrics === true}
                              installationId={config?.installationId}
                              showActivationDetails
                              hideSignedOutStatus
                              revealPendingCancelAction
                              onStatusChange={(loginStatus) => {
                                // Retry only on a real signed-out -> signed-in
                                // transition (see amrAuthPrevLoggedInRef).
                                if (loginStatus?.loggedIn === true) {
                                  const wasSignedOut =
                                    amrAuthPrevLoggedInRef.current === false;
                                  amrAuthPrevLoggedInRef.current = true;
                                  if (
                                    wasSignedOut &&
                                    amrAuthRetriedRef.current !== retryAssistant.id
                                  ) {
                                    amrAuthRetriedRef.current = retryAssistant.id;
                                    onRetry(retryAssistant);
                                  }
                                } else if (
                                  loginStatus &&
                                  loginStatus.loggedIn === false
                                ) {
                                  amrAuthPrevLoggedInRef.current = false;
                                }
                              }}
                            />
                          ) : runFailureUi.primaryAction === 'launch-terminal-auth' ? (
                            <button
                              type="button"
                              className="chat-error-action"
                              onClick={() => {
                                onLaunchAntigravityOauth?.();
                              }}
                            >
                              {t('chat.antigravityError.launchTerminalCta')}
                            </button>
                          ) : runFailureUi.primaryAction === 'launch-terminal-switch-model' ? (
                            <button
                              type="button"
                              className="chat-error-action"
                              onClick={() => {
                                onLaunchAntigravityOauth?.();
                              }}
                            >
                              {t('chat.antigravityError.launchSwitchModelCta')}
                            </button>
                          ) : runFailureUi.primaryAction === 'recharge' ? (
                            <button
                              type="button"
                              className="chat-error-action"
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
                            </button>
                          ) : null}
                          {canResumeFailedRun ? (
                            // Resumable failure: continue the agent's existing
                            // CLI session instead of restarting from scratch, so
                            // partial work is kept. Replaces the from-scratch
                            // Retry as the single primary recovery action. Use
                            // the wired resume handler when present, otherwise a
                            // plain send of the continue prompt — never the
                            // re-sending Retry path, which would resume + repeat.
                            <button
                              type="button"
                              className="ghost chat-error-retry"
                              onClick={() =>
                                onResumeRun
                                  ? onResumeRun(retryAssistant)
                                  : onSend(RESUME_CONTINUE_PROMPT, [], [])
                              }
                            >
                              {t('chat.resumeRunCta')}
                            </button>
                          ) : runFailureUi.primaryAction === 'retry' || runFailureUi.secondaryRetry ? (
                            <button
                              type="button"
                              className="ghost chat-error-retry"
                              onClick={() => onRetry(retryAssistant)}
                            >
                              {t('promptTemplates.retry')}
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {amrSwitchPayload ? (
                <AmrGuidance
                  {...amrSwitchPayload}
                  sourceDetail="chat_error_switch_retry_card"
                  metricsConsent={config?.telemetry?.metrics === true}
                  onActivate={() => {
                    if (retryAssistant && onSwitchToAmrAndRetry) {
                      onSwitchToAmrAndRetry(retryAssistant);
                    } else {
                      onOpenAmrSettings?.();
                    }
                  }}
                />
              ) : null}
              {/* Dynamic spacer: when a turn is anchored to the top, this
                  grows just enough to let the user message reach the top of
                  the viewport, then shrinks as the reply streams in below. */}
              <div className="chat-log-tail-spacer" ref={tailSpacerRef} aria-hidden />
            </div>
            {/* Always mounted so the CSS transition can play in both
                directions; the `chat-jump-btn-active` class flips the
                slide + opacity, and `aria-hidden` + `tabIndex={-1}`
                keep it out of the a11y tree when it's not visible.
                Also suppressed while the conversation-history dropdown is
                open: the dropdown sits in a separate stacking context, so
                without this the button bleeds through it (#4123). */}
            <button
              type="button"
              className={`chat-jump-btn${scrolledFromBottom && !showConvList ? ' chat-jump-btn-active' : ''}`}
              onClick={jumpToBottom}
              title={t('chat.scrollToLatest')}
              aria-hidden={!scrolledFromBottom || showConvList}
              tabIndex={scrolledFromBottom && !showConvList ? 0 : -1}
            >
              <Icon name="arrow-up" size={12} style={{ transform: 'rotate(180deg)' }} />
              <span>{t('chat.jumpToLatest')}</span>
            </button>
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
                <div
                  className="chat-composer-fixed-layer"
                  ref={composerLayerRef}
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
    </div>
  );
}

interface AssistantCallbacks {
  onContinueRemainingTasks:
    | ((assistantMessage: ChatMessage, todos: TodoItem[]) => void)
    | undefined;
  onAssistantFeedback:
    | ((message: ChatMessage, change: ChatMessageFeedbackChange) => void)
    | undefined;
  onBrandBrowserAssistConfirm: BrandBrowserAssistConfirm | undefined;
  onArtifactShare: ((fileName: string) => void) | undefined;
  onForkFromMessage: ((message: ChatMessage) => void) | undefined;
  onShareToOpenDesign: ((assistantMessageId: string) => void) | undefined;
  onNextStepAiOptimize: (() => void) | undefined;
  onNextStepContinueExtraction: (() => void) | undefined;
  onNextStepContinueAiExtraction: (() => void) | undefined;
  onNextStepCreateDesign: (() => void) | undefined;
  onNextStepCreateDesignSystem: (() => void) | undefined;
}

type ChatRenderItem = {
  kind: 'message';
  key: string;
  message: ChatMessage;
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
  messages,
  streaming,
  liveToolInput,
  projectId,
  projectKindForTracking,
  activeConversationId,
  activeConversationKey,
  projectFiles,
  projectMetadata,
  projectFileNames,
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
  firstUserMessageId,
  activePluginSnapshot,
  activeDesignSystem,
  hasActiveDesignSystem,
  errorCardOwnerId,
  nextUserContentByAssistantId,
  assistantCallbacksRef,
  onContinueRemainingTasks,
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
  onArtifactDownload,
  nextStepSkills,
  toolboxSkillNames,
  nextStepVariant,
  onForkFromMessage,
  onAssistantFeedback,
  forkingMessageId,
  t,
  onOpenQuestions,
  scrollContainerRef,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  liveToolInput?: Record<string, { name: string; text: string; seq?: number }>;
  projectId: string | null;
  projectKindForTracking: TrackingProjectKind | null;
  activeConversationId: string | null;
  activeConversationKey: string;
  projectFiles: ProjectFile[];
  projectMetadata?: ProjectMetadata;
  projectFileNames?: Set<string>;
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
  firstUserMessageId: string | undefined;
  activePluginSnapshot?: AppliedPluginSnapshot | null;
  activeDesignSystem?: DesignSystemSummary | null;
  hasActiveDesignSystem: boolean;
  errorCardOwnerId: string | null;
  nextUserContentByAssistantId: Map<string, string>;
  assistantCallbacksRef: MutableRefObject<AssistantCallbacks>;
  onContinueRemainingTasks?: (assistantMessage: ChatMessage, todos: TodoItem[]) => void;
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
  onArtifactShare?: (fileName: string) => void;
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
  onForkFromMessage?: (message: ChatMessage) => void;
  onAssistantFeedback?: (message: ChatMessage, change: ChatMessageFeedbackChange) => void;
  forkingMessageId?: string | null;
  t: TranslateFn;
  onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const conversationTodoInput = useMemo(
    () => latestTodoWriteInputForPinnedCard(messages),
    [messages],
  );
  const conversationTodoAnchorMessageId = useMemo(
    () => firstTodoWriteAssistantMessageId(messages),
    [messages],
  );
  const items = useMemo(
    () => buildChatRenderItems(messages),
    [messages],
  );
  const virtualized = items.length > CHAT_MESSAGE_VIRTUALIZE_THRESHOLD;
  const virtualWindow = useMeasuredVirtualWindow(items, {
    enabled: virtualized,
    containerRef: scrollContainerRef,
    estimateSize: estimateChatRenderItemHeight,
    overscanPx: CHAT_MESSAGE_OVERSCAN_PX,
    resetKey: activeConversationKey,
    initialTailRows: CHAT_VIRTUAL_INITIAL_TAIL_ROWS,
    alwaysIncludeKey:
      conversationTodoInput != null && conversationTodoAnchorMessageId
        ? `message:${conversationTodoAnchorMessageId}`
        : undefined,
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
          onRequestPluginDetails={onRequestPluginDetails}
          onRequestDesignSystemDetails={onRequestDesignSystemDetails}
          t={t}
          activePluginSnapshot={
            m.id === firstUserMessageId
              ? activePluginSnapshot ?? null
              : null
          }
          activeDesignSystem={
            m.id === firstUserMessageId
              ? activeDesignSystem ?? null
              : null
          }
        />
      );
    }
    return (
      <AssistantMessage
        message={m}
        streaming={messageStreaming}
        // Only the streaming row consumes live tool input. Non-streaming rows
        // get a stable `undefined`, so adding `liveToolInput` to the memo
        // comparator re-renders just this row per `tool_input_delta`, not all N.
        liveToolInput={messageStreaming ? liveToolInput : undefined}
        showConversationTodoCard={m.id === conversationTodoAnchorMessageId}
        conversationTodoInput={conversationTodoInput}
        projectId={projectId}
        projectKind={projectKindForTracking}
        conversationId={activeConversationId}
        projectFiles={projectFiles}
        projectMetadata={projectMetadata}
        projectFileNames={projectFileNames}
        onRequestOpenFile={onRequestOpenFile}
        onRequestPluginFolderAgentAction={onRequestPluginFolderAgentAction}
        activePluginActionPaths={activePluginActionPaths}
        hiddenPluginActionPaths={hiddenPluginActionPaths}
        onShareToOpenDesign={
          onShareToOpenDesign
            ? () => assistantCallbacksRef.current.onShareToOpenDesign?.(m.id)
            : undefined
        }
        shareToOpenDesignBusy={shareToOpenDesignBusyMessageId === m.id}
        isLast={m.id === lastAssistantId}
        errorCardOwnerId={errorCardOwnerId}
        nextUserContent={nextUserContentByAssistantId.get(m.id)}
        suppressDirectionForms={hasActiveDesignSystem}
        hasDesignSystemContext={hasActiveDesignSystem || !!activeDesignSystem}
        onOpenQuestions={onOpenQuestions}
        onBrandBrowserAssistConfirm={
          onBrandBrowserAssistConfirm
            ? (card) => assistantCallbacksRef.current.onBrandBrowserAssistConfirm?.(card)
            : undefined
        }
        onContinueRemainingTasks={
          m.id === lastAssistantId && onContinueRemainingTasks
            ? (todos) => assistantCallbacksRef.current.onContinueRemainingTasks?.(m, todos)
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
            ? (fileName) => assistantCallbacksRef.current.onArtifactShare?.(fileName)
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
        onArtifactDownload={onArtifactDownload}
        nextStepSkills={nextStepSkills}
        toolboxSkillNames={toolboxSkillNames}
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

function buildChatRenderItems(messages: ChatMessage[]): ChatRenderItem[] {
  const items: ChatRenderItem[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]!;
    items.push({
      kind: 'message',
      key: `message:${message.id}`,
      message,
    });
  }
  return items;
}

function firstTodoWriteAssistantMessageId(messages: ChatMessage[]): string | null {
  const message = messages.find(
    (candidate) =>
      candidate.role === 'assistant' &&
      candidate.events?.some(
        (event) => event.kind === 'tool_use' && isTodoWriteToolName(event.name),
      ),
  );
  return message?.id ?? null;
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
  }: {
    enabled: boolean;
    containerRef: MutableRefObject<HTMLDivElement | null>;
    estimateSize: (item: T) => number;
    overscanPx: number;
    resetKey: string;
    initialTailRows: number;
    alwaysIncludeKey?: string;
  },
) {
  const measuredHeightsRef = useRef<Map<string, number>>(new Map());
  const [measureVersion, setMeasureVersion] = useState(0);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  useEffect(() => {
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
    measuredHeightsRef.current.set(key, next);
    setMeasureVersion((version) => version + 1);
  }, []);

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

function QueuedSendStrip({
  containerRef,
  editingId,
  items,
  onEdit,
  onRemove,
  onReorder,
  onSendNow,
}: {
  containerRef?: MutableRefObject<HTMLDivElement | null>;
  editingId?: string | null;
  items: QueuedSendItem[];
  onEdit?: (item: QueuedSendItem) => void;
  onRemove?: (id: string) => void;
  onReorder?: (orderedIds: string[]) => void;
  onSendNow?: (id: string) => void;
}) {
  const t = useT();
  const [dragState, setDragState] = useState<QueuedSendDragState | null>(null);
  if (items.length === 0) return null;
  const canReorder = Boolean(onReorder && items.length > 1);
  const overflowCount = Math.max(0, items.length - QUEUED_SEND_VISIBLE_ROW_COUNT);

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
      <div className="chat-queued-send-header">
        <div className="chat-queued-send-heading">
          <strong>
            {items.length} {t('chat.queuedHeader')}
          </strong>
          <span aria-hidden>↩</span>
          <span>{t('chat.queuedToSend')}</span>
        </div>
      </div>
      <div className={`chat-queued-send-list${overflowCount > 0 ? ' is-scrollable' : ''}`}>
        {items.map((item, index) => {
          const isDragging = dragState?.draggingId === item.id;
          const dropClass = dragState?.overId === item.id
            && dragState.draggingId !== item.id
            && dragState.edge
            ? ` chat-queued-send-row-drop-${dragState.edge}`
            : '';
          return (
            <div
              className={`chat-queued-send-row${index === 0 ? ' chat-queued-send-row-active' : ''}${
                editingId === item.id ? ' chat-queued-send-row-editing' : ''
              }${isDragging ? ' chat-queued-send-row-dragging' : ''}${dropClass}`}
              key={item.id}
              onDragOver={(event) => handleDragOver(event, item.id)}
              onDrop={(event) => handleDrop(event, item.id)}
            >
              <button
                type="button"
                className="chat-queued-send-drag-handle chat-queued-send-tooltip od-tooltip"
                title={t('chat.queuedReorder')}
                data-tooltip={t('chat.queuedReorder')}
                data-tooltip-placement="right"
                aria-label={t('chat.queuedReorder')}
                draggable={canReorder}
                disabled={!canReorder}
                onDragStart={(event) => handleDragStart(event, item)}
                onDragEnd={() => setDragState(null)}
              >
                <Icon name="grip-vertical" size={14} />
              </button>
              <div className="chat-queued-send-main">
                <span className="chat-queued-send-title">{summarizeQueuedPrompt(item, t)}</span>
                <QueuedSendMetaChips item={item} />
              </div>
              <div className="chat-queued-send-actions">
                {onEdit ? (
                  <button
                    type="button"
                    className="chat-queued-send-action chat-queued-send-tooltip od-tooltip"
                    title={t('chat.queuedEdit')}
                    data-tooltip={t('chat.queuedEdit')}
                    data-tooltip-placement="top"
                    aria-label={t('chat.queuedEdit')}
                    onClick={() => onEdit(item)}
                  >
                    <Icon name="pencil" size={13} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="chat-queued-send-action chat-queued-send-tooltip od-tooltip"
                  title={t('chat.send')}
                  data-tooltip={t('chat.send')}
                  data-tooltip-placement="top"
                  aria-label={t('chat.send')}
                  data-testid="chat-queued-send-now"
                  onClick={() => onSendNow?.(item.id)}
                  disabled={!onSendNow}
                >
                  <Icon name="arrow-up" size={13} />
                </button>
                {onRemove ? (
                  <button
                    type="button"
                    className="chat-queued-send-action chat-queued-send-tooltip od-tooltip"
                    onClick={() => onRemove(item.id)}
                    title={t('chat.comments.remove')}
                    data-tooltip={t('chat.comments.remove')}
                    data-tooltip-placement="top"
                    aria-label={t('chat.comments.remove')}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {overflowCount > 0 ? (
        <div className="chat-queued-send-overflow">
          +{overflowCount} {t('chat.queuedMore')}
        </div>
      ) : null}
    </div>
  );
}

const QUEUED_SEND_DRAG_MIME = 'application/x-open-design-queued-send';
const QUEUED_SEND_VISIBLE_ROW_COUNT = 4;

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

function summarizeQueuedPrompt(item: QueuedSendItem, t: TranslateFn): string {
  const normalized = item.prompt.replace(/\s+/g, ' ').trim();
  const text = normalized || t('chat.queuedFollowUpFallback');
  return text.length > 58 ? `${text.slice(0, 57)}...` : text;
}

// Surfaces what a queued turn carries — attachments, visual marks, and the
// staged plugin / skill / MCP / connector context from its meta — as compact
// chips so the user can see (and trust) what will be sent without expanding it.
// Counts use the same plain-English style as the rest of this strip.
function QueuedSendMetaChips({ item }: { item: QueuedSendItem }) {
  const ctx = item.meta?.context;
  const files = item.attachments?.length ?? 0;
  const marks = item.commentAttachments?.length ?? 0;
  const plugins = item.meta?.appliedPluginSnapshot ? 1 : ctx?.pluginIds?.length ?? 0;
  const skills = ctx?.skillIds?.length ?? 0;
  const mcp = ctx?.mcpServerIds?.length ?? 0;
  const connectors = ctx?.connectorIds?.length ?? 0;
  const workspace = ctx?.workspaceItems?.length ?? 0;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const chips: Array<{ key: string; label: string }> = [];
  if (files > 0) chips.push({ key: 'files', label: plural(files, 'file') });
  if (marks > 0) chips.push({ key: 'marks', label: plural(marks, 'mark') });
  if (plugins > 0) chips.push({ key: 'plugins', label: plural(plugins, 'plugin') });
  if (skills > 0) chips.push({ key: 'skills', label: plural(skills, 'skill') });
  if (mcp > 0) chips.push({ key: 'mcp', label: `${mcp} MCP` });
  if (connectors > 0) chips.push({ key: 'connectors', label: plural(connectors, 'connector') });
  if (workspace > 0) chips.push({ key: 'workspace', label: plural(workspace, 'workspace context') });
  if (chips.length === 0) return null;
  return (
    <div className="chat-queued-send-chips">
      {chips.map((chip) => (
        <span key={chip.key} className="chat-queued-send-chip">
          {chip.label}
        </span>
      ))}
    </div>
  );
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
  return last.runStatus === 'failed' ? last : null;
}

export function isAssistantMessageStreaming(
  message: ChatMessage,
  paneStreaming: boolean,
  lastAssistantId: string | null | undefined,
  forceStreamingMessageIds?: Set<string>,
): boolean {
  if (message.role !== 'assistant') return false;
  if (forceStreamingMessageIds?.has(message.id)) return true;
  if (isActiveRunStatus(message.runStatus)) return true;
  if (message.id !== lastAssistantId) return false;
  if (!paneStreaming) return false;
  if (message.endedAt !== undefined) return false;
  if (isTerminalRunStatus(message.runStatus)) return false;
  return true;
}

export function buildRunErrorDiagnosticText(input: RunErrorDiagnosticInput): string {
  const lines: string[] = [];
  const sourceText = input.rawMessage?.trim() || input.message.trim();
  if (sourceText) {
    lines.push(sourceText, '');
  }

  lines.push(
    'Open Design run error diagnostics',
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
    >
      <button
        type="button"
        className="chat-conv-item-name"
        data-testid={`conversation-select-${conversation.id}`}
        style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left' }}
        onClick={onSelect}
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

function UserMessageImpl({
  message,
  projectId,
  projectFileNames,
  onRequestOpenFile,
  onRequestPluginDetails,
  onRequestDesignSystemDetails,
  t,
  activePluginSnapshot,
  activeDesignSystem,
}: {
  message: ChatMessage;
  projectId: string | null;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginDetails?: (pluginId: string) => void;
  onRequestDesignSystemDetails?: (system: DesignSystemSummary) => void;
  t: TranslateFn;
  activePluginSnapshot?: AppliedPluginSnapshot | null;
  activeDesignSystem?: DesignSystemSummary | null;
}) {
  const attachments = sortChatAttachmentsForDisplay(message.attachments ?? []);
  const commentAttachments = message.commentAttachments ?? [];
  const workspaceItems = message.runContext?.workspaceItems ?? [];
  const messagePluginSnapshot = message.appliedPluginSnapshot ?? activePluginSnapshot ?? null;
  const hasRunContext = Boolean(
    message.sessionMode ||
      workspaceItems.length > 0 ||
      messagePluginSnapshot ||
      activeDesignSystem,
  );
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    if (!message.content) return;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    const ok = await copyToClipboard(message.content);
    if (!ok) return;
    setCopied(true);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = undefined;
    }, 2000);
  }

  const isDesignSystemWorkspaceRequest = isDesignSystemWorkspacePrompt(message.content);

  return (
    <div className="msg user">
      <span className="sr-only">{t('chat.you')}</span>
      {hasRunContext ? (
        <div className="msg-run-context-row" data-testid="msg-run-context-row">
          {message.sessionMode ? (
            <MessageSessionModeChip mode={message.sessionMode} t={t} />
          ) : null}
          {workspaceItems.map((item) => (
            <ActiveWorkspaceContextChip
              key={`${item.kind}:${item.id}`}
              item={item}
              onOpen={onRequestOpenFile}
            />
          ))}
          {messagePluginSnapshot ? (
            <ActivePluginChip
              snapshot={messagePluginSnapshot}
              t={t}
              onOpenDetails={onRequestPluginDetails}
            />
          ) : null}
          {activeDesignSystem ? (
            <ActiveDesignSystemChip
              system={activeDesignSystem}
              onOpenDetails={onRequestDesignSystemDetails}
            />
          ) : null}
        </div>
      ) : null}
      {attachments.length > 0 ? (
        <div className="user-attachments">
          {attachments.map((a, index) => {
            const baseName = a.path.split('/').pop() || a.path;
            const openable =
              !!onRequestOpenFile &&
              (projectFileNames ? projectFileNames.has(baseName) : true);
            const handleOpen = openable
              ? () => onRequestOpenFile?.(baseName)
              : undefined;
            return (
              <button
                type="button"
                key={a.path}
                className={`user-attachment staged-${a.kind}${openable ? ' openable' : ''}`}
                onClick={handleOpen}
                disabled={!openable}
                title={openable ? t('chat.openFile', { name: baseName }) : a.path}
              >
                <span className="staged-order" aria-label={`Attachment ${index + 1}`}>
                  {index + 1}
                </span>
                {a.kind === 'image' && projectId ? (
                  <img src={projectRawUrl(projectId, a.path)} alt={a.name} />
                ) : (
                  <Icon name="file" size={14} />
                )}
                <span className="staged-name">{a.name}</span>
              </button>
            );
          })}
        </div>
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
      {message.content && isDesignSystemWorkspaceRequest ? (
        <div className="user-text-wrap user-status-wrap">
          <div className="user-status-card design-system-generation-status">
            <span className="user-status-card__icon">
              <Icon name="blocks" size={15} />
            </span>
            <span className="user-status-card__copy">
              <strong>{DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE}</strong>
              <span>{DESIGN_SYSTEM_WORKSPACE_DISPLAY_DESCRIPTION}</span>
            </span>
          </div>
        </div>
      ) : message.content ? (
        <div className="user-text-wrap">
          <div className="user-text user-bubble">{message.content}</div>
          <div className="user-actions">
            <button
              type="button"
              className="ghost user-copy-btn"
              onClick={handleCopy}
              aria-label={copied ? t('chat.copyDone') : t('chat.copyPrompt')}
              title={copied ? t('chat.copyDone') : t('chat.copyPrompt')}
            >
              <Icon name={copied ? 'check' : 'copy'} size={13} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Context chip rendered above a user message when the project pinned a
// plugin at create time (PluginLoopHome on Home). Replaces the noisy
// in-composer plugin rail so the user is not re-prompted to pick
// something they already chose; instead the active plugin lives inside
// the run message it kicked off.
function ActivePluginChip({
  snapshot,
  t: _t,
  onOpenDetails,
}: {
  snapshot: AppliedPluginSnapshot;
  t: TranslateFn;
  onOpenDetails?: (pluginId: string) => void;
}) {
  const title = snapshot.pluginTitle ?? snapshot.pluginId;
  const version = snapshot.pluginVersion;
  const taskKind = snapshot.taskKind;
  const content = (
    <>
      <span className="msg-plugin-chip__dot" aria-hidden />
      <span className="msg-plugin-chip__label">
        <span className="msg-plugin-chip__kind">Plugin</span>
        <span className="msg-plugin-chip__title">{title}</span>
        {version ? (
          <span className="msg-plugin-chip__version">@{version}</span>
        ) : null}
      </span>
      {taskKind ? (
        <span className="msg-plugin-chip__task">{taskKind}</span>
      ) : null}
    </>
  );
  // One clean chip per message — the plugin's full resolved context still
  // rides the run via the persisted snapshot; we no longer fan it out into
  // per-category (design-system / asset / skill) chips here.
  return (
    <div className="msg-plugin-context" data-testid="msg-plugin-context">
      {onOpenDetails ? (
        <button
          type="button"
          className="msg-plugin-chip msg-plugin-chip--action"
          data-testid="msg-plugin-chip"
          title={title}
          onClick={() => onOpenDetails(snapshot.pluginId)}
        >
          {content}
        </button>
      ) : (
        <div className="msg-plugin-chip" data-testid="msg-plugin-chip">
          {content}
        </div>
      )}
    </div>
  );
}

function MessageSessionModeChip({
  mode,
  t,
}: {
  mode: ChatSessionMode;
  t: TranslateFn;
}) {
  const label = mode === 'chat'
    ? t('chat.mode.chat.label')
    : mode === 'plan'
      ? t('chat.mode.plan.label')
      : t('chat.mode.design.label');
  const icon = mode === 'chat' ? 'comment' : mode === 'plan' ? 'file' : 'sparkles';
  return (
    <div
      className={`msg-mode-chip msg-mode-chip--${mode}`}
      data-testid="msg-session-mode-chip"
      title={label}
    >
      <Icon name={icon} size={12} />
      <span>{label}</span>
    </div>
  );
}

function ActiveDesignSystemChip({
  system,
  onOpenDetails,
}: {
  system: DesignSystemSummary;
  onOpenDetails?: (system: DesignSystemSummary) => void;
}) {
  const content = (
    <>
      <span className="msg-plugin-chip__dot" aria-hidden />
      <span className="msg-plugin-chip__label">
        <span className="msg-plugin-chip__kind">Design System</span>
        <span className="msg-plugin-chip__title">{system.title}</span>
      </span>
      {system.category ? (
        <span className="msg-plugin-chip__task">{system.category}</span>
      ) : null}
    </>
  );
  if (!onOpenDetails) {
    return (
      <div className="msg-plugin-chip msg-plugin-chip--design-system" data-testid="msg-design-system-chip">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="msg-plugin-chip msg-plugin-chip--design-system msg-plugin-chip--action"
      data-testid="msg-design-system-chip"
      title={system.title}
      onClick={() => onOpenDetails(system)}
    >
      {content}
    </button>
  );
}

const WORKSPACE_DESIGN_FILES_TAB = '__design_files__';
const WORKSPACE_DESIGN_SYSTEM_TAB = '__design_system__';

function ActiveWorkspaceContextChip({
  item,
  onOpen,
}: {
  item: WorkspaceContextItem;
  onOpen?: (name: string) => void;
}) {
  const target = workspaceContextOpenTarget(item);
  const content = (
    <>
      <span className="msg-plugin-chip__icon" aria-hidden>
        <Icon name={workspaceContextIcon(item)} size={12} />
      </span>
      <span className="msg-plugin-chip__label">
        <span className="msg-plugin-chip__kind">Current</span>
        <span className="msg-plugin-chip__title">{item.label}</span>
      </span>
    </>
  );
  if (!target || !onOpen) {
    return (
      <div
        className={`msg-plugin-chip msg-plugin-chip--workspace msg-plugin-chip--workspace-${item.kind}`}
        data-testid="msg-workspace-context-chip"
        title={workspaceContextTitle(item)}
      >
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`msg-plugin-chip msg-plugin-chip--workspace msg-plugin-chip--workspace-${item.kind} msg-plugin-chip--action`}
      data-testid="msg-workspace-context-chip"
      title={workspaceContextTitle(item)}
      onClick={() => onOpen(target)}
    >
      {content}
    </button>
  );
}

function workspaceContextOpenTarget(item: WorkspaceContextItem): string | null {
  if (item.tabId) return item.tabId;
  if (item.kind === 'design-files') return WORKSPACE_DESIGN_FILES_TAB;
  if (item.kind === 'design-system') return WORKSPACE_DESIGN_SYSTEM_TAB;
  if (item.kind === 'file' || item.kind === 'live-artifact') {
    return item.path ?? item.label;
  }
  return null;
}

function workspaceContextIcon(item: WorkspaceContextItem): IconName {
  if (item.kind === 'browser') return 'globe';
  if (item.kind === 'folder' || item.kind === 'design-files') return 'folder';
  if (item.kind === 'project') return 'folder';
  if (item.kind === 'local-code') return 'terminal';
  if (item.kind === 'terminal') return 'terminal';
  if (item.kind === 'side-chat') return 'comment';
  if (item.kind === 'design-system') return 'blocks';
  return 'file';
}

function workspaceContextTitle(item: WorkspaceContextItem): string {
  return [
    workspaceContextKindLabel(item.kind),
    item.path ? `path: ${item.path}` : null,
    item.absolutePath ? `absolute: ${item.absolutePath}` : null,
    item.url ? `url: ${item.url}` : null,
    item.title ? `title: ${item.title}` : null,
  ].filter(Boolean).join(' | ');
}

function workspaceContextKindLabel(kind: WorkspaceContextItem['kind']): string {
  switch (kind) {
    case 'browser':
      return 'Browser';
    case 'design-files':
      return 'Design files';
    case 'design-system':
      return 'Design system';
    case 'folder':
      return 'Folder';
    case 'project':
      return 'Project';
    case 'local-code':
      return 'Local code';
    case 'terminal':
      return 'Terminal';
    case 'side-chat':
      return 'Side chat';
    case 'live-artifact':
      return 'Live artifact';
    case 'file':
    default:
      return 'File';
  }
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
