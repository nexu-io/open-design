import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  creationHandoffAttachments,
  creationHandoffMessages,
  type AssistantIdentity,
} from '../runtime/chat/creation-handoff';
import { looksLikeImageName } from '../runtime/chat/staged-attachment';
import type { ChatMessage } from '../types';

export interface CreationHandoffInput {
  prompt: string;
  /** The files the user staged on Home. Still local `File` objects here. */
  files?: readonly File[];
}

/** Object URL for an image card, or null where unavailable (e.g. jsdom). */
function createPreviewUrl(file: File): string | null {
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    return URL.createObjectURL(file);
  } catch {
    // Hardened/older contexts: the card falls back to the document shape.
    return null;
  }
}

function revokePreviewUrl(url: string): void {
  try {
    URL.revokeObjectURL?.(url);
  } catch {
    // Already revoked, or unsupported: nothing to clean up.
  }
}

const NO_MESSAGES: ChatMessage[] = [];

/**
 * The optimistic first turn of a Home send, ready for `ChatPane`'s `messages`
 * (see `runtime/chat/creation-handoff`). Owns the one impure part: image
 * previews of files that are not uploaded yet. Creation and revocation are
 * paired inside one `files`-keyed effect, so StrictMode's simulated unmount
 * revokes exactly the URLs its own setup created and the remount gets fresh
 * ones instead of a memoized list of dead blob: links.
 */
export function useCreationHandoffMessages(
  handoff: CreationHandoffInput | null,
  identity: AssistantIdentity,
): ChatMessage[] {
  const files = handoff?.files;
  const [previewUrls, setPreviewUrls] = useState<ReadonlyArray<string | null>>([]);
  // Layout effect: the previews exist before the first paint, so an image card
  // is never drawn as a document card first.
  useLayoutEffect(() => {
    const next = (files ?? []).map((file) =>
      looksLikeImageName(file.name, file.type) ? createPreviewUrl(file) : null,
    );
    setPreviewUrls(next);
    return () => {
      for (const url of next) if (url) revokePreviewUrl(url);
    };
  }, [files]);

  // One timestamp for the life of the hand-off: the turn must not re-key or
  // re-time itself on every render.
  const sentAtRef = useRef<number | null>(null);
  if (handoff && sentAtRef.current === null) sentAtRef.current = Date.now();

  const prompt = handoff?.prompt ?? null;
  return useMemo(() => {
    if (prompt === null) return NO_MESSAGES;
    return creationHandoffMessages({
      prompt,
      attachments: creationHandoffAttachments(files ?? [], previewUrls),
      identity,
      at: sentAtRef.current ?? 0,
    });
  }, [files, identity, previewUrls, prompt]);
}
