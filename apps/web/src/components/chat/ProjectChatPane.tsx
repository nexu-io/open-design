import type { ComponentProps } from 'react';
import { ChatPane as LegacyChatPane } from '../ChatPane';
import { ChatPane as MainChatPane } from './upstream/ChatPane';
import { toHostMessage } from './upstream/types';

type Props = ComponentProps<typeof LegacyChatPane> & { historyPortalTarget?: HTMLElement | null };

/** Latest-main chat UI, adapted to this checkout's existing project controller. */
export function ChatPane(props: Props) {
  return <MainChatPane
    {...props}
    onRetry={props.onRetry ? (message, action) => props.onRetry?.(toHostMessage(message), action) : undefined}
    onResumeRun={props.onResumeRun ? message => props.onResumeRun?.(toHostMessage(message)) : undefined}
    onContinueRemainingTasks={props.onContinueRemainingTasks ? (message, todos) => props.onContinueRemainingTasks?.(toHostMessage(message), todos) : undefined}
    onAssistantFeedback={props.onAssistantFeedback ? (message, change) => props.onAssistantFeedback?.(toHostMessage(message), change) : undefined}
    onForkFromMessage={props.onForkFromMessage ? message => props.onForkFromMessage?.(toHostMessage(message)) : undefined}
    onSwitchToAmrAndRetry={props.onSwitchToAmrAndRetry ? message => props.onSwitchToAmrAndRetry?.(toHostMessage(message)) : undefined}
  />;
}
