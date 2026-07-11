import type { ChatAttachment, ChatCommentAttachment, ChatMessage, ChatMessageFeedbackChange } from '../../types';
import type { BrandBrowserAssistConfirm } from '../../components/OdCard';
import type { ChatSendMeta } from '../../components/ChatComposer';
import type { TodoItem } from '../../runtime/todos';

export interface QueuedSendItem {
  id: string;
  prompt: string;
  attachments?: ChatAttachment[];
  commentAttachments?: ChatCommentAttachment[];
  meta?: ChatSendMeta;
}

export interface QueuedSendUpdate {
  prompt: string;
  attachments: ChatAttachment[];
  commentAttachments: ChatCommentAttachment[];
  meta?: ChatSendMeta;
}

export type ChatRenderItem = {
  kind: 'message';
  key: string;
  message: ChatMessage;
};

// Stable-ref bundle for AssistantMessage's interaction callbacks. The
// orchestrator keeps a ref of this shape so a memoized message row still
// calls the latest handler without busting AssistantMessage's memo
// comparison (which excludes these callbacks — see areAssistantMessagePropsEqual
// in AssistantMessage.tsx).
export interface AssistantCallbacks {
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

export interface RunErrorDiagnosticInput {
  message: string;
  rawMessage?: string | null;
  errorCode?: string;
  traceId?: string;
  projectId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string;
  agentId?: string;
}

// Port result types — defined in-slice (not imported from `providers/daemon`)
// per the same AST-level import-type restriction as `ComposerPortalRect`
// below. Mirror `providers/daemon.ts`'s `VelaLoginStatus`/`VelaUser`/
// `VelaLiveAccount` field-for-field so a value returned by the real
// `fetchVelaLoginStatus()` (bound in `dependencies.ts`) stays structurally
// assignable everywhere this type is threaded (e.g. `AmrLoginPill`'s
// `initialStatus` prop, which imports the real type directly).
export interface VelaUser {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
  plan?: string;
  balanceUsd?: string | null;
}

export interface VelaLiveAccount {
  plan?: string;
  balanceUsd?: string | null;
}

export interface VelaLoginStatus {
  loggedIn: boolean;
  loginInFlight?: boolean;
  profile: string;
  user: VelaUser | null;
  account?: VelaLiveAccount;
  configPath: string;
  activationUrl?: string;
  userCode?: string;
  browserOpenFailed?: boolean;
}

// Port result type — defined in-slice (not imported from `providers/dom`)
// because the guard's no-`providers/`-import-outside-`dependencies.ts` rule
// is AST-level and catches `import type` too.
export interface ComposerPortalRect {
  left: number;
  width: number;
  bottom: number;
}

export type QueuedSendDropEdge = 'before' | 'after';

export interface QueuedSendDragState {
  draggingId: string;
  overId: string | null;
  edge: QueuedSendDropEdge | null;
}

export type StarterPrompt = {
  icon: string;
  title: string;
  // Empty for path-scoped onboarding starters, which have no category tag.
  tag: string;
  prompt: string;
};
