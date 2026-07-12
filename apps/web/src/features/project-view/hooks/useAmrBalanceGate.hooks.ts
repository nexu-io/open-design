// Feature-local hook for the Open Design Cloud AMR pre-run balance gate: the
// two dialog states the gate check opens (a hard block for an
// insufficient/signed-out wallet, and a soft low-balance warning that pauses
// a send pending a decision), the in-flight/paused-queue conversation
// tracking sets the check reads to avoid re-popping a dialog on unrelated
// re-runs, and the "Switch to AMR & retry" flow from a failed-run card (mode
// + agent switch, arm a poll-driven auto-retry once AMR is selected AND
// signed in). The gate CHECK itself (`checkAmrBalanceGate`) and its call site
// stay inline in the chat-send pipeline (Cluster 17, not yet extracted) —
// this hook owns only the state that check reads/writes and the
// dialog-resolution flow, per the extraction plan's documented Cluster 12
// coupling note. Reaches the AMR login-status poll only through the injected
// `ProjectViewTransportPort`, so the hook stays fetch-free (ADR 0002).
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import type { AmrLowBalanceDecision } from '../../../components/AmrLowBalanceDialog';
import type { AppConfig, ChatMessage } from '../../../types';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

export interface AmrBalanceGateBlock {
  reason: 'insufficient' | 'signed_out';
  snapshot: AmrWalletSnapshot;
  conversationId: string;
}

export interface AmrLowBalanceWarn {
  snapshot: AmrWalletSnapshot;
  resolve: (decision: AmrLowBalanceDecision) => void;
}

export interface AmrBalanceGateController {
  amrBalanceGateBlock: AmrBalanceGateBlock | null;
  setAmrBalanceGateBlock: Dispatch<SetStateAction<AmrBalanceGateBlock | null>>;
  amrLowBalanceWarn: AmrLowBalanceWarn | null;
  setAmrLowBalanceWarn: Dispatch<SetStateAction<AmrLowBalanceWarn | null>>;
  /** Conversations with a balance-gate check currently in flight. Sends that
   *  arrive during the check queue instead of racing a duplicate run through
   *  the not-yet-busy window the gate's await opens. */
  amrGateInFlightConversationsRef: MutableRefObject<Set<string>>;
  /** Conversations whose queue auto-drain is paused because the balance gate
   *  blocked a send. Without the pause, every unrelated re-run of the drain
   *  effect would re-hit the wallet endpoint and re-pop the dialog. Lifted by
   *  the next send that passes the gate. */
  amrGatePausedQueueConversationsRef: MutableRefObject<Set<string>>;
  pendingAmrRetry: ChatMessage | null;
  setPendingAmrRetry: Dispatch<SetStateAction<ChatMessage | null>>;
  handleSwitchToAmrAndRetry: (failedAssistant: ChatMessage) => void;
}

export function useAmrBalanceGate(
  currentConversationActionDisabled: boolean,
  onModeChange: (mode: AppConfig['mode']) => void,
  onAgentChange: (id: string) => void,
  onOpenAmrSettings: (() => void) | undefined,
  configMode: AppConfig['mode'],
  configAgentId: string | null,
  handleRetry: (assistantMessage: ChatMessage) => void,
  port: ProjectViewTransportPort,
): AmrBalanceGateController {
  const [amrBalanceGateBlock, setAmrBalanceGateBlock] = useState<AmrBalanceGateBlock | null>(null);
  const [amrLowBalanceWarn, setAmrLowBalanceWarn] = useState<AmrLowBalanceWarn | null>(null);
  const amrGateInFlightConversationsRef = useRef<Set<string>>(new Set());
  const amrGatePausedQueueConversationsRef = useRef<Set<string>>(new Set());

  // "Switch to AMR & retry" from the failed-run card: switch the run to AMR,
  // open Settings on the AMR controls so the user can sign in / authorize /
  // top up, and arm an auto-retry that fires once AMR is selected AND signed
  // in (see the poll effect below).
  const [pendingAmrRetry, setPendingAmrRetry] = useState<ChatMessage | null>(null);
  const handleSwitchToAmrAndRetry = useCallback(
    (failedAssistant: ChatMessage) => {
      if (currentConversationActionDisabled) return;
      onModeChange('daemon');
      onAgentChange('amr');
      onOpenAmrSettings?.();
      setPendingAmrRetry(failedAssistant);
    },
    [currentConversationActionDisabled, onModeChange, onAgentChange, onOpenAmrSettings],
  );

  // Poll the AMR login status while a retry is armed, rather than only reacting
  // to the AmrLoginPill's status event — the user may close Settings (which
  // unmounts the pill and stops its polling) before finishing sign-in in the
  // browser. Polling here keeps working regardless of the pill's lifecycle.
  // Fires once AMR is the selected agent AND the account is signed in.
  useEffect(() => {
    if (!pendingAmrRetry) return;
    let cancelled = false;
    const tryRetry = async () => {
      if (cancelled) return;
      if (!(configMode === 'daemon' && configAgentId === 'amr')) return;
      const status = await port.fetchAmrLoginStatus().catch(() => null);
      if (cancelled || status?.loggedIn !== true) return;
      setPendingAmrRetry(null);
      handleRetry(pendingAmrRetry);
    };
    void tryRetry();
    const interval = setInterval(() => void tryRetry(), 2000);
    // Give up after a few minutes so we never poll forever.
    const stop = setTimeout(() => {
      if (!cancelled) setPendingAmrRetry(null);
    }, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [pendingAmrRetry, configMode, configAgentId, handleRetry, port]);

  return {
    amrBalanceGateBlock,
    setAmrBalanceGateBlock,
    amrLowBalanceWarn,
    setAmrLowBalanceWarn,
    amrGateInFlightConversationsRef,
    amrGatePausedQueueConversationsRef,
    pendingAmrRetry,
    setPendingAmrRetry,
    handleSwitchToAmrAndRetry,
  };
}

export function useWiredAmrBalanceGate(
  currentConversationActionDisabled: boolean,
  onModeChange: (mode: AppConfig['mode']) => void,
  onAgentChange: (id: string) => void,
  onOpenAmrSettings: (() => void) | undefined,
  configMode: AppConfig['mode'],
  configAgentId: string | null,
  handleRetry: (assistantMessage: ChatMessage) => void,
): AmrBalanceGateController {
  return useAmrBalanceGate(
    currentConversationActionDisabled,
    onModeChange,
    onAgentChange,
    onOpenAmrSettings,
    configMode,
    configAgentId,
    handleRetry,
    projectViewTransportPort,
  );
}
