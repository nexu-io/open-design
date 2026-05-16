import { Fragment, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { projectRawUrl } from '../providers/registry';
import type { TodoItem } from '../runtime/todos';
import type { AppliedPluginSnapshot } from '@open-design/contracts';
import { latestTodoWriteInputFromMessages } from '../runtime/todos';
import { TodoCard } from './ToolCard';
import type { AppConfig, ChatAttachment, ChatCommentAttachment, ChatMessage, ChatMessageFeedbackChange, Conversation, PreviewComment, ProjectFile, ProjectMetadata, SkillSummary } from '../types';
import { dayKey, dayLabel, exactDateTime, messageTime, relativeTimeLong } from '../utils/chatTime';
import { commentsToAttachments, simplePositionLabel } from '../comments';
import { AssistantMessage } from './AssistantMessage';
import {
  ChatComposer,
  type ChatComposerHandle,
  type ChatSendMeta,
} from './ChatComposer';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import { Icon } from './Icon';

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
// generic prototype trio. The default (prototype/deck/template/other/
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
];

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

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  projectId: string | null;
  projectFiles: ProjectFile[];
  hasActiveDesignSystem?: boolean;
  sendDisabled?: boolean;
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
  onStop: () => void;
  // Skills available for @-mention assembly. ProjectView filters out the
  // user's disabled set before passing them in here.
  skills?: SkillSummary[];
  // Click-to-open chain: passes a basename up to ProjectView, which sets
  // FileWorkspace's openRequest. Tool cards, attachment chips, and
  // produced-file chips all call this.
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<void> | void;
  initialDraft?: string;
  // Question-form submissions become a normal user message; the parent
  // routes that text through onSend (no attachments).
  onSubmitForm?: (text: string) => void;
  onContinueRemainingTasks?: (assistantMessage: ChatMessage, todos: TodoItem[]) => void;
  onAssistantFeedback?: (assistantMessage: ChatMessage, change: ChatMessageFeedbackChange) => void;
  // Header "+" button — kicks off ProjectView's create-conversation flow.
  onNewConversation?: () => void;
  newConversationDisabled?: boolean;
  // Conversation list that used to live in the topbar. The chat tab now
  // owns the list so users can browse + switch conversations without
  // leaving the pane.
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation?: (id: string, title: string) => void;
  // Composer settings/CLI button forwards to here. The dialog lives in App
  // (it owns the AppConfig lifecycle) so we just pass the open trigger.
  onOpenSettings?: () => void;
  // Same dialog, but landing on the External MCP tab. Forwarded to the
  // composer's `/mcp` slash and MCP picker button.
  onOpenMcpSettings?: () => void;
  // Optional pet wiring forwarded straight through to ChatComposer's
  // /pet button. When omitted the composer hides the button entirely.
  petConfig?: AppConfig['pet'];
  onAdoptPet?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  projectMetadata?: ProjectMetadata;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  currentSkillId?: string | null;
  onProjectSkillChange?: (skillId: string | null) => void;
  researchAvailable?: boolean;
  // Immutable snapshot of the plugin pinned to this project. When set
  // we suppress the in-composer plugin rail (the user already picked a
  // plugin on Home) and render the active plugin as a context chip on
  // each user message — that satisfies §8 "show context inside the run
  // message" without forcing a separate side widget.
  activePluginSnapshot?: AppliedPluginSnapshot | null;
  onCollapse?: () => void;
}

type Tab = 'chat' | 'comments';

export function ChatPane({
  messages,
  streaming,
  sendDisabled = false,
  error,
  projectId,
  projectFiles,
  hasActiveDesignSystem = false,
  projectFileNames,
  onEnsureProject,
  previewComments = [],
  attachedComments = [],
  onAttachComment,
  onDetachComment,
  onDeleteComment,
  onSend,
  onStop,
  onRequestOpenFile,
  onRequestPluginFolderAgentAction,
  initialDraft,
  onSubmitForm,
  onContinueRemainingTasks,
  onAssistantFeedback,
  onNewConversation,
  newConversationDisabled = false,
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onOpenSettings,
  onOpenMcpSettings,
  petConfig,
  onAdoptPet,
  onTogglePet,
  onOpenPetSettings,
  projectMetadata,
  onProjectMetadataChange,
  currentSkillId = null,
  onProjectSkillChange,
  researchAvailable,
  activePluginSnapshot,
  skills = [],
  onCollapse,
}: Props) {
  const t = useT();
  const logRef = useRef<HTMLDivElement | null>(null);
  const historyWrapRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const didInitialScrollRef = useRef(false);
  // Tracks whether the user is glued close enough to the bottom that
  // streamed content should auto-follow. Distinct from the jump-button
  // state below, which uses a wider threshold (120px) so the affordance
  // stays visible for short scroll-ups. Auto-follow needs the tighter
  // 80px cutoff: scrolling ~90px up is an intentional pause that
  // shouldn't be yanked back the moment the next chunk streams in.
  const pinnedToBottomRef = useRef(true);
  const scrolledToFormRef = useRef<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>('chat');
  const [showConvList, setShowConvList] = useState(false);
  const [scrolledFromBottom, setScrolledFromBottom] = useState(false);
  // The user can dismiss the pinned task list once everything is complete.
  // We key the dismissal on the snapshot (serialized TodoWrite input) so
  // the next time the agent emits a different snapshot the card returns,
  // but the same snapshot stays hidden across renders / streaming ticks.
  const [dismissedPinnedTodoKey, setDismissedPinnedTodoKey] = useState<string | null>(null);
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const hasActiveRunMessage = messages.some(
    (m) => m.role === 'assistant' && isActiveRunStatus(m.runStatus),
  );
  // Only the first user message gets the active-plugin chip — the
  // plugin is project-scoped so re-stamping it on every reply would be
  // noise. Subsequent messages still run under the same snapshot.
  const firstUserMessageId = messages.find((m) => m.role === 'user')?.id;
  // Map each assistant message id to the user message that follows it
  // (if any) so QuestionFormView can render its locked "answered" state
  // with the user's picks.
  const nextUserContentByAssistantId = (() => {
    const map = new Map<string, string>();
    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i]!;
      const next = messages[i + 1]!;
      if (m.role === 'assistant' && next.role === 'user') {
        map.set(m.id, next.content);
      }
    }
    return map;
  })();

  useEffect(() => {
    didInitialScrollRef.current = false;
    // A new conversation should land at the bottom (its own initial
    // scroll), not inherit the previous conversation's saved position.
    savedChatScrollRef.current = null;
    scrolledToFormRef.current = new Set();
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

  useEffect(() => {
    const el = logRef.current;
    if (!el || didInitialScrollRef.current || messages.length === 0) return;
    didInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      // If the last assistant message contains a question form, scroll to
      // the form instead of the bottom, so the user sees the form first.
      const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
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
  }, [activeConversationId, messages.length, tab]);

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
    if (pinnedToBottomRef.current) {
      // If the last assistant message contains a question form, scroll to
      // the form instead of the bottom, so the user lands on the form.
      const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
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
  }, [messages, error, streaming]);

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
      snapshot(target);
      const distance =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      setScrolledFromBottom(distance > 120);
      pinnedToBottomRef.current = distance < 80;
    }
    el.addEventListener('scroll', onScroll);
    return () => {
      // Capture final scroll state before unmount; the ref normally
      // tracks via onScroll, but programmatic scrolls or layout shifts
      // right before unmount can leave it stale.
      snapshot(el);
      el.removeEventListener('scroll', onScroll);
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== 'chat') return;
    const el = logRef.current;
    if (!el) return;

    let followFrame: number | null = null;
    const followLatestIfPinned = () => {
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
        ? new ResizeObserver(followLatestIfPinned)
        : null;
    const observedChildren = new Set<Element>();
    const syncObservedChildren = () => {
      if (!resizeObserver) return;
      const currentChildren = new Set(Array.from(el.children));
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

    syncObservedChildren();

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            syncObservedChildren();
            followLatestIfPinned();
          })
        : null;
    mutationObserver?.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });

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

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;

  function jumpToBottom() {
    const el = logRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  return (
    <div className="pane">
      <div className="chat-header">
        <div className="chat-header-actions">
          <div
            className={`chat-history-wrap${showConvList ? ' open' : ''}`}
            ref={historyWrapRef}
          >
            <button
              type="button"
              className="icon-only"
              data-testid="conversation-history-trigger"
              title={
                activeConversation?.title
                  ? `${t('chat.conversationsTitle')} · ${activeConversation.title}`
                  : t('chat.conversationsTitle')
              }
              aria-label={t('chat.conversationsAria')}
              aria-haspopup="menu"
              aria-expanded={showConvList}
              onClick={() => setShowConvList((v) => !v)}
            >
              <Icon name="history" size={15} />
            </button>
            {showConvList ? (
              <div className="chat-history-menu" role="menu" data-testid="conversation-history-menu">
                <div className="chat-history-menu-head">
                  <span className="chat-history-menu-title">
                    {t('chat.conversationsHeading')}
                  </span>
                  {onNewConversation ? (
                    <button
                      type="button"
                      className="chat-history-new"
                      data-testid="conversation-history-new"
                      disabled={newConversationDisabled}
                      onClick={() => {
                        if (newConversationDisabled) return;
                        onNewConversation();
                        setShowConvList(false);
                      }}
                    >
                      <Icon name="plus" size={11} />
                      <span>{t('chat.new')}</span>
                    </button>
                  ) : null}
                </div>
                <div className="chat-history-list" data-testid="conversation-list">
                  {conversations.length === 0 ? (
                    <div className="chat-history-empty">
                      {t('chat.emptyConversations')}
                    </div>
                  ) : (
                    conversations.map((c) => (
                      <ConversationRow
                        key={c.id}
                        conversation={c}
                        active={c.id === activeConversationId}
                        onSelect={() => {
                          onSelectConversation(c.id);
                          setShowConvList(false);
                        }}
                        onDelete={() => onDeleteConversation(c.id)}
                        onRename={onRenameConversation}
                        t={t}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-only"
            data-testid="new-conversation"
            title={t('chat.newConversationsTitle')}
            aria-label={t('chat.newConversation')}
            onClick={onNewConversation}
            disabled={!onNewConversation || newConversationDisabled}
          >
            <Icon name="plus" size={16} />
          </button>
          {onCollapse ? (
            <button
              type="button"
              className="icon-only"
              data-testid="chat-collapse"
              title={t('workspace.focusMode')}
              aria-label={t('workspace.focusMode')}
              onClick={onCollapse}
            >
              <Icon name="chevron-left" size={15} />
            </button>
          ) : null}
        </div>
      </div>
      {tab === 'chat' ? (
        <>
          <div className="chat-log-wrap">
            <div className="chat-log" ref={logRef}>
              {messages.length === 0 ? (
                <div className="chat-empty-wrap">
                  <div className="chat-empty">
                    <span className="chat-empty-title">
                      {t('chat.startTitle')}
                    </span>
                    <span className="chat-empty-hint">
                      {t('chat.startHint')}
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
                        onClick={() => composerRef.current?.setDraft(ex.prompt)}
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
                </div>
              ) : null}
              {messages.map((m, i) => {
                const showDaySeparator = shouldShowDaySeparator(messages[i - 1], m);
                const messageStreaming = isAssistantMessageStreaming(
                  m,
                  streaming,
                  lastAssistantId,
                );
                return (
                  <Fragment key={m.id}>
                    {showDaySeparator ? <DaySeparator ts={messageTime(m)} /> : null}
                    {m.role === 'user' ? (
                      <UserMessage
                        message={m}
                        projectId={projectId}
                        projectFileNames={projectFileNames}
                        onRequestOpenFile={onRequestOpenFile}
                        t={t}
                        activePluginSnapshot={
                          m.id === firstUserMessageId
                            ? activePluginSnapshot ?? null
                            : null
                        }
                      />
                    ) : (
                      <AssistantMessage
                        message={m}
                        streaming={messageStreaming}
                        projectId={projectId}
                        projectFiles={projectFiles}
                        projectFileNames={projectFileNames}
                        onRequestOpenFile={onRequestOpenFile}
                        onRequestPluginFolderAgentAction={onRequestPluginFolderAgentAction}
                        isLast={m.id === lastAssistantId}
                        nextUserContent={nextUserContentByAssistantId.get(m.id)}
                        suppressDirectionForms={hasActiveDesignSystem}
                        onSubmitForm={(text) => {
                          pinnedToBottomRef.current = true;
                          scrolledToFormRef.current = new Set();
                          onSubmitForm?.(text);
                        }}
                        onContinueRemainingTasks={
                          m.id === lastAssistantId && onContinueRemainingTasks
                            ? (todos) => onContinueRemainingTasks(m, todos)
                            : undefined
                        }
                        onFeedback={
                          onAssistantFeedback
                            ? (rating) => onAssistantFeedback(m, rating)
                            : undefined
                        }
                      />
                    )}
                  </Fragment>
                );
              })}
              {error ? <div className="msg error">{error}</div> : null}
            </div>
            {/* Always mounted so the CSS transition can play in both
                directions; the `chat-jump-btn-active` class flips the
                slide + opacity, and `aria-hidden` + `tabIndex={-1}`
                keep it out of the a11y tree when it's not visible. */}
            <button
              type="button"
              className={`chat-jump-btn${scrolledFromBottom ? ' chat-jump-btn-active' : ''}`}
              onClick={jumpToBottom}
              title={t('chat.scrollToLatest')}
              aria-hidden={!scrolledFromBottom}
              tabIndex={scrolledFromBottom ? 0 : -1}
            >
              <Icon name="arrow-up" size={12} style={{ transform: 'rotate(180deg)' }} />
              <span>{t('chat.jumpToLatest')}</span>
            </button>
          </div>
          <PinnedTodoSlot
            messages={messages}
            streaming={streaming}
            dismissedKey={dismissedPinnedTodoKey}
            onDismiss={setDismissedPinnedTodoKey}
          />
          <ChatComposer
            ref={composerRef}
            projectId={projectId}
            projectFiles={projectFiles}
            skills={skills}
            streaming={streaming}
            sendDisabled={sendDisabled}
            initialDraft={initialDraft}
            onEnsureProject={onEnsureProject}
            commentAttachments={commentsToAttachments(attachedComments)}
            onRemoveCommentAttachment={onDetachComment}
            onSend={(prompt, attachments, commentAttachments, meta) => {
              pinnedToBottomRef.current = true;
              scrolledToFormRef.current = new Set();
              onSend(prompt, attachments, commentAttachments, meta);
            }}
            onStop={onStop}
            onOpenSettings={onOpenSettings}
            onOpenMcpSettings={onOpenMcpSettings}
            petConfig={petConfig}
            onAdoptPet={onAdoptPet}
            onTogglePet={onTogglePet}
            onOpenPetSettings={onOpenPetSettings}
            researchAvailable={researchAvailable}
            projectMetadata={projectMetadata}
            onProjectMetadataChange={onProjectMetadataChange}
            currentSkillId={currentSkillId}
            onProjectSkillChange={onProjectSkillChange}
            pinnedPluginId={activePluginSnapshot?.pluginId ?? null}
          />
        </>
      ) : null}
    </div>
  );
}

// Pinned task list above the chat composer. The latest TodoWrite snapshot
// across the entire conversation is the canonical state; AssistantMessage
// no longer renders these inline so there is exactly one TodoCard on
// screen. When every task is complete the user can dismiss the card; the
// dismissal sticks to the current snapshot only, so a fresh TodoWrite
// from the agent re-shows it.
function PinnedTodoSlot({
  messages,
  streaming,
  dismissedKey,
  onDismiss,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  dismissedKey: string | null;
  onDismiss: (key: string | null) => void;
}) {
  // `exiting` lets the dismiss click play a slide-down transition before
  // the slot tears down. Without it React would unmount immediately and
  // the card would pop out without animation.
  const [exiting, setExiting] = useState(false);
  const input = latestTodoWriteInputFromMessages(messages);
  if (input == null) return null;
  let snapshotKey: string;
  try {
    snapshotKey = JSON.stringify(input);
  } catch {
    snapshotKey = String(input);
  }
  if (snapshotKey === dismissedKey) return null;
  return (
    <div className={`chat-pinned-todo${exiting ? ' chat-pinned-todo-exit' : ''}`}>
      <TodoCard
        input={input}
        runStreaming={streaming}
        runSucceeded={!streaming}
        onDismiss={() => {
          if (exiting) return;
          setExiting(true);
          // Match the slide-out duration in CSS (220ms) — once the
          // transition completes the snapshot key is recorded as
          // dismissed and the slot is unmounted by the early return.
          window.setTimeout(() => onDismiss(snapshotKey), 220);
        }}
      />
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
              <strong>{comment.elementId}</strong>
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
              <span>{comment.label}</span>
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

export function isAssistantMessageStreaming(
  message: ChatMessage,
  paneStreaming: boolean,
  lastAssistantId: string | null | undefined,
): boolean {
  if (message.role !== 'assistant') return false;
  if (isActiveRunStatus(message.runStatus)) return true;
  if (message.id !== lastAssistantId) return false;
  if (!paneStreaming) return false;
  if (message.endedAt !== undefined) return false;
  if (isTerminalRunStatus(message.runStatus)) return false;
  return true;
}

function ConversationRow({
  conversation,
  active,
  onSelect,
  onDelete,
  onRename,
  t,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename?: (id: string, title: string) => void;
  t: TranslateFn;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title ?? '');
  const displayTitle =
    conversation.title || t('chat.untitledConversation');
  return (
    <div
      className={`chat-conv-item${active ? ' active' : ''}`}
      data-testid={`conversation-item-${conversation.id}`}
    >
      {editing && onRename ? (
        <input
          autoFocus
          className="chat-conv-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onRename(conversation.id, draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onRename(conversation.id, draft);
              setEditing(false);
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
          style={{ flex: 1, padding: '2px 6px', fontSize: 12 }}
        />
      ) : (
        <button
          type="button"
          className="chat-conv-item-name"
          data-testid={`conversation-select-${conversation.id}`}
          style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left' }}
          onClick={onSelect}
          onDoubleClick={() => {
            if (!onRename) return;
            setDraft(conversation.title ?? '');
            setEditing(true);
          }}
        >
          {displayTitle}
        </button>
      )}
      <span className="chat-conv-item-meta">{conversationMetaLabel(conversation, t)}</span>
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

function UserMessage({
  message,
  projectId,
  projectFileNames,
  onRequestOpenFile,
  t,
  activePluginSnapshot,
}: {
  message: ChatMessage;
  projectId: string | null;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
  t: TranslateFn;
  activePluginSnapshot?: AppliedPluginSnapshot | null;
}) {
  const attachments = message.attachments ?? [];
  const commentAttachments = message.commentAttachments ?? [];
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

  return (
    <div className="msg user">
      <div className="role">
        <span>{t('chat.you')}</span>
        <MessageTimestamp message={message} t={t} />
      </div>
      {activePluginSnapshot ? (
        <ActivePluginChip snapshot={activePluginSnapshot} t={t} />
      ) : null}
      {attachments.length > 0 ? (
        <div className="user-attachments">
          {attachments.map((a) => {
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
              <span className="staged-name" title={`${a.elementId}: ${a.comment}`}>
                <strong>{a.selectionKind === 'visual' ? 'Visual mark' : a.elementId}</strong>
                <span>{a.comment}</span>
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {message.content ? (
        <div className="user-text-wrap">
          <div className="user-text user-bubble">{message.content}</div>
          <button
            type="button"
            className="ghost user-copy-btn"
            onClick={handleCopy}
            aria-label={copied ? t('chat.copyDone') : t('chat.copyPrompt')}
            title={copied ? t('chat.copyDone') : t('chat.copyPrompt')}
          >
            <Icon name={copied ? 'check' : 'copy'} size={12} />
          </button>
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
}: {
  snapshot: AppliedPluginSnapshot;
  t: TranslateFn;
}) {
  const title = snapshot.pluginTitle ?? snapshot.pluginId;
  const version = snapshot.pluginVersion;
  const taskKind = snapshot.taskKind;
  return (
    <div className="msg-plugin-chip" data-testid="msg-plugin-chip">
      <span className="msg-plugin-chip__dot" aria-hidden />
      <span className="msg-plugin-chip__label">
        <span className="msg-plugin-chip__kind">Plugin</span>
        <span className="msg-plugin-chip__title">{title}</span>
        <span className="msg-plugin-chip__version">@{version}</span>
      </span>
      {taskKind ? (
        <span className="msg-plugin-chip__task">{taskKind}</span>
      ) : null}
    </div>
  );
}

function DaySeparator({ ts }: { ts: number | undefined }) {
  if (!ts) return null;
  return (
    <div className="chat-day-separator" role="separator">
      <time dateTime={new Date(ts).toISOString()}>{dayLabel(ts)}</time>
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

function shouldShowDaySeparator(prev: ChatMessage | undefined, curr: ChatMessage): boolean {
  const currTime = messageTime(curr);
  if (!currTime) return false;
  const prevTime = prev ? messageTime(prev) : undefined;
  if (!prevTime) return true;
  return dayKey(prevTime) !== dayKey(currTime);
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
