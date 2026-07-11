// Feature-local hook for "Share to Open Design" — kicks off the bundled
// `od-share-to-community` scenario in the active conversation by injecting
// the trigger prompt through the standard chat-send path; the agent then
// loads SKILL.md and drives the rest. Keeps a preparing state alive for the
// resulting chat run so the action reads as async packaging instead of
// instant sharing. No transport of its own — sending defers to the
// orchestrator's `handleSend`.
import { useCallback, useEffect, useRef, useState } from 'react';
import { SHARE_TO_COMMUNITY_PROMPT } from '../../../components/share-to-community/shareToCommunityPrompt';
import type { ChatAttachment, ChatCommentAttachment } from '../../../types';

export interface ShareToOpenDesignController {
  shareToOpenDesignBusyMessageId: string | null;
  handleShareToOpenDesign: (assistantMessageId: string) => void;
}

export function useShareToOpenDesign(
  currentConversationActionDisabled: boolean,
  currentConversationBusy: boolean,
  handleSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
  ) => Promise<boolean>,
): ShareToOpenDesignController {
  const [shareToOpenDesignBusyMessageId, setShareToOpenDesignBusyMessageId] = useState<string | null>(null);
  const shareToOpenDesignBusyMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!shareToOpenDesignBusyMessageIdRef.current || currentConversationBusy) return;
    shareToOpenDesignBusyMessageIdRef.current = null;
    setShareToOpenDesignBusyMessageId(null);
  }, [currentConversationBusy]);

  const handleShareToOpenDesign = useCallback((assistantMessageId: string) => {
    if (currentConversationActionDisabled || shareToOpenDesignBusyMessageIdRef.current) return;
    shareToOpenDesignBusyMessageIdRef.current = assistantMessageId;
    setShareToOpenDesignBusyMessageId(assistantMessageId);
    void Promise.resolve(handleSend(SHARE_TO_COMMUNITY_PROMPT, [], []))
      .then((started) => {
        if (started) return;
        shareToOpenDesignBusyMessageIdRef.current = null;
        setShareToOpenDesignBusyMessageId(null);
      })
      .catch(() => {
        shareToOpenDesignBusyMessageIdRef.current = null;
        setShareToOpenDesignBusyMessageId(null);
      });
  }, [currentConversationActionDisabled, handleSend]);

  return { shareToOpenDesignBusyMessageId, handleShareToOpenDesign };
}
