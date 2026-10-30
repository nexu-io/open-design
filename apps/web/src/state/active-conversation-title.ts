import { useSyncExternalStore } from 'react';

/** The conversation the open chat pane is showing, and its display title
 *  (already falling back to the untitled label). Published by ChatPane, which
 *  owns the live conversation list — auto-titles and renames included — and
 *  read by chrome outside it (the chat dock's header names the conversation,
 *  not its project folder). */
export interface ActiveConversationTitle {
  projectId: string;
  conversationId: string | null;
  title: string;
}

let current: ActiveConversationTitle | null = null;
const listeners = new Set<() => void>();

export function publishActiveConversationTitle(next: ActiveConversationTitle | null): void {
  if (
    current === next
    || (current && next
      && current.projectId === next.projectId
      && current.conversationId === next.conversationId
      && current.title === next.title)
  ) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function snapshot(): ActiveConversationTitle | null {
  return current;
}

export function useActiveConversationTitle(): ActiveConversationTitle | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
