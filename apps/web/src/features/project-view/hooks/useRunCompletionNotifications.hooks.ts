// Feature-local hook for run-completion sound/desktop notifications. Fires
// off assistant run-status transitions rather than the local SSE listener
// state, so a run that finished while its conversation was detached still
// produces the one completion notification when the user returns. Reaches
// the tab-visibility gate and window refocus only through the injected
// `ProjectViewTransportPort`, so the hook stays DOM-free (ADR 0002).
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { ChatMessage } from '../../../types';
import { DEFAULT_NOTIFICATIONS } from '../../../state/config';
import { playSound, showCompletionNotification } from '../../../utils/notifications';
import type { useT } from '../../../i18n';
import { isActiveRunStatus } from '../rules';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

export interface RunCompletionNotificationsConfig {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  successSoundId: string;
  failureSoundId: string;
}

export interface RunCompletionNotificationsController {
  /** The set of run/message ids currently tracked as "in flight" for
   *  completion-notification purposes. The chat-send pipeline marks a newly
   *  created assistant message id here optimistically, before this hook's own
   *  effect would otherwise observe it as active via `messages`. */
  activeCompletionNotificationRunsRef: MutableRefObject<Set<string>>;
}

export function useRunCompletionNotifications(
  messages: ChatMessage[],
  notificationsConfig: RunCompletionNotificationsConfig | undefined,
  t: ReturnType<typeof useT>,
  onRunSettled: () => void,
  port: ProjectViewTransportPort,
): RunCompletionNotificationsController {
  const activeCompletionNotificationRunsRef = useRef<Set<string>>(new Set());
  const completedNotificationRunsRef = useRef<Set<string>>(new Set());
  const tRef = useRef(t);
  tRef.current = t;

  const notifyCompletedRun = useCallback(
    (last: ChatMessage) => {
      // Round 7 (mrcfps @ useDesignMdState.ts:131): a chat turn just
      // settled — conversation updatedAt almost certainly moved, so
      // recompute DESIGN.md staleness even when the turn produced no
      // file mutations or live artifacts.
      onRunSettled();

      const status = last.runStatus;
      if (status !== 'succeeded' && status !== 'failed') return;

      const cfg = notificationsConfig ?? DEFAULT_NOTIFICATIONS;
      if (cfg.soundEnabled) {
        playSound(status === 'succeeded' ? cfg.successSoundId : cfg.failureSoundId);
      }

      if (cfg.desktopEnabled) {
        // Successes only interrupt when the user is on another tab/window.
        // Failures alert regardless — losing a long agent run silently is
        // worse than a small interruption when the page is in focus.
        const isHidden = port.isDocumentHidden();
        const isFocused = port.isDocumentFocused();
        if (status === 'failed' || isHidden || !isFocused) {
          const title = status === 'succeeded'
            ? tRef.current('notify.successTitle')
            : tRef.current('notify.failureTitle');
          const fallbackBody = status === 'succeeded'
            ? tRef.current('notify.successBody')
            : tRef.current('notify.failureBody');
          const trimmed = (last.content ?? '').trim();
          const body = trimmed ? trimmed.slice(0, 80) : fallbackBody;
          void showCompletionNotification({
            status,
            title,
            body,
            onClick: () => port.focusWindow(),
          });
        }
      }
    },
    [notificationsConfig, onRunSettled, port],
  );

  useEffect(() => {
    const completedMessages: ChatMessage[] = [];
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      const keys = message.runId ? [message.runId, message.id] : [message.id];
      if (isActiveRunStatus(message.runStatus)) {
        for (const key of keys) activeCompletionNotificationRunsRef.current.add(key);
        continue;
      }
      if (message.runStatus !== 'succeeded' && message.runStatus !== 'failed') continue;
      if (!keys.some((key) => activeCompletionNotificationRunsRef.current.has(key))) continue;
      if (keys.some((key) => completedNotificationRunsRef.current.has(key))) continue;
      for (const key of keys) completedNotificationRunsRef.current.add(key);
      completedMessages.push(message);
    }

    for (const message of completedMessages) notifyCompletedRun(message);
  }, [messages, notifyCompletedRun]);

  return { activeCompletionNotificationRunsRef };
}

export function useWiredRunCompletionNotifications(
  messages: ChatMessage[],
  notificationsConfig: RunCompletionNotificationsConfig | undefined,
  t: ReturnType<typeof useT>,
  onRunSettled: () => void,
): RunCompletionNotificationsController {
  return useRunCompletionNotifications(messages, notificationsConfig, t, onRunSettled, projectViewTransportPort);
}
