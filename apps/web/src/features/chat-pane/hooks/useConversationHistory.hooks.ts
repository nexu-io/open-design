import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { trackChatPanelClick } from '../../../analytics/events';
import type { Dict } from '../../../i18n/types';
import type { Conversation } from '../../../types';
import { chatPaneDomPort } from '../dependencies';
import type { ChatPaneDomPort } from '../ports';
import { filterConversations } from '../rules';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;
type Track = (
  event: string,
  properties: Record<string, unknown>,
  options?: { requestId?: string; insertId?: string },
) => void;

export function useConversationHistory(
  conversations: Conversation[],
  activeConversationId: string | null,
  t: TranslateFn,
  {
    analyticsTrack,
    onNewConversation,
    newConversationDisabled,
    onSelectConversation,
  }: {
    analyticsTrack: Track;
    onNewConversation: (() => void) | undefined;
    newConversationDisabled: boolean;
    onSelectConversation: (id: string) => void;
  },
  port: ChatPaneDomPort = chatPaneDomPort,
) {
  const historyWrapRef = useRef<HTMLDivElement | null>(null);
  const [showConvList, setShowConvList] = useState(false);
  const [conversationSearch, setConversationSearch] = useState('');
  const deferredConversationSearch = useDeferredValue(conversationSearch);

  // Close the conversation history dropdown on outside click / Escape.
  useEffect(() => {
    if (!showConvList) return;
    return port.subscribeOutsideClickOrEscape(historyWrapRef, () => setShowConvList(false));
  }, [port, showConvList]);

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

  const handleToggleHistoryList = useCallback(() => {
    setShowConvList((v) => {
      const next = !v;
      if (next) {
        trackChatPanelClick(analyticsTrack, {
          page_name: 'chat_panel',
          area: 'chat_panel',
          element: 'history',
        });
      }
      return next;
    });
  }, [analyticsTrack]);

  const handleStartNewConversation = useCallback(() => {
    if (newConversationDisabled || !onNewConversation) return;
    trackChatPanelClick(analyticsTrack, {
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'new_chat',
    });
    onNewConversation();
    setShowConvList(false);
  }, [analyticsTrack, newConversationDisabled, onNewConversation]);

  const handleSelectConversation = useCallback((id: string) => {
    onSelectConversation(id);
    setShowConvList(false);
  }, [onSelectConversation]);

  return {
    historyWrapRef,
    showConvList,
    setShowConvList,
    conversationSearch,
    setConversationSearch,
    activeConversation,
    filteredConversations,
    handleToggleHistoryList,
    handleStartNewConversation,
    handleSelectConversation,
  };
}
