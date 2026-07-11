import { useEffect, useRef, type MutableRefObject } from 'react';
import type { ChatComposerHandle } from '../../../components/ChatComposer';
import { takeComposerSeedFor } from '../../../state/libraryHandoff';

export function useComposerDraftSync(
  composerRef: MutableRefObject<ChatComposerHandle | null>,
  {
    initialDraft,
    composerDraftSignal,
    projectId,
    activeConversationId,
  }: {
    initialDraft: string | undefined;
    composerDraftSignal: { text: string; nonce: number } | undefined;
    projectId: string | null;
    activeConversationId: string | null;
  },
) {
  const composerDraftStorageKey = projectId && activeConversationId
    ? `od:chat-composer:draft:${projectId}:${activeConversationId}`
    : undefined;

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
  }, [composerRef, initialDraft]);

  // Parent-driven composer prefill (the "Import repo" CTA). Reuse the same
  // imperative setDraft the starter cards use; the nonce guards against
  // re-applying the same signal on unrelated re-renders.
  const lastDraftSignalNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!composerDraftSignal) return;
    if (lastDraftSignalNonceRef.current === composerDraftSignal.nonce) return;
    lastDraftSignalNonceRef.current = composerDraftSignal.nonce;
    composerRef.current?.setDraft(composerDraftSignal.text);
  }, [composerDraftSignal, composerRef]);

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
  }, [activeConversationId, composerRef, projectId]);

  return { composerDraftStorageKey };
}
