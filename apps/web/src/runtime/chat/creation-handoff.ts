/**
 * The optimistic first turn of a project created from Home (OPEND-3334).
 *
 * Between the Home send and the moment ProjectView's auto-send puts the real
 * turn on screen there is nothing in the transcript yet, but everything the
 * first frame of that turn will show is already known in this tab: the prompt,
 * the staged files, the agent that will answer. This module turns that into
 * the two messages the real turn starts as — the user message and an assistant
 * placeholder whose run is active and has produced nothing — so the real
 * `ChatPane` can draw them with its own components. The hand-off then swaps
 * like for like: same rows, same execution record ("Working"), same composer.
 *
 * Pure data: no DOM, no fetch. Object URLs for image previews are created and
 * revoked by the caller and handed in.
 */
import type { ChatAttachment } from '@open-design/contracts';

import type { ChatMessage } from '../../types';
import { looksLikeImageName } from './staged-attachment';

export const CREATION_HANDOFF_USER_MESSAGE_ID = 'creation-handoff:user';
export const CREATION_HANDOFF_ASSISTANT_MESSAGE_ID = 'creation-handoff:assistant';

/**
 * An attachment that is still a local `File`: it has no project raw URL yet,
 * so an image card previews it through an object URL instead.
 */
export interface LocalPreviewAttachment extends ChatAttachment {
  previewUrl?: string;
}

export function attachmentLocalPreviewUrl(attachment: ChatAttachment): string | null {
  const url = (attachment as LocalPreviewAttachment).previewUrl;
  return typeof url === 'string' && url ? url : null;
}

export interface AssistantIdentity {
  agentId: string | undefined;
  agentName: string | undefined;
}

/** The staged files as the attachment cards the persisted message will show. */
export function creationHandoffAttachments(
  files: readonly File[],
  previewUrls: ReadonlyArray<string | null> = [],
): LocalPreviewAttachment[] {
  const seen = new Set<string>();
  return files.map((file, index) => {
    // Readable (it is the card's accessible name) and unique per staged file:
    // two same-named files can be picked at once.
    const path = seen.has(file.name) ? `${index}/${file.name}` : file.name;
    seen.add(file.name);
    const kind = looksLikeImageName(file.name, file.type) ? 'image' as const : 'file' as const;
    const previewUrl = kind === 'image' ? previewUrls[index] ?? null : null;
    return {
      path,
      name: file.name,
      // An image with no preview (object URLs unavailable) falls back to the
      // document card rather than an empty plate.
      kind: kind === 'image' && !previewUrl ? 'file' : kind,
      size: file.size,
      order: index,
      ...(previewUrl ? { previewUrl } : {}),
    };
  });
}

export interface CreationHandoffTurnInput {
  prompt: string;
  attachments?: readonly LocalPreviewAttachment[];
  identity: AssistantIdentity;
  /** When the user sent from Home. */
  at: number;
}

/**
 * The turn as `handleSend` first paints it: the user message, then an
 * assistant placeholder that is running and empty. `runStatus: 'running'` is
 * what opens the execution record's running head in `build-turn-blocks`.
 */
export function creationHandoffMessages(input: CreationHandoffTurnInput): ChatMessage[] {
  const attachments = input.attachments ?? [];
  const messages: ChatMessage[] = [];
  if (input.prompt || attachments.length > 0) {
    messages.push({
      id: CREATION_HANDOFF_USER_MESSAGE_ID,
      role: 'user',
      content: input.prompt,
      createdAt: input.at,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    });
  }
  messages.push({
    id: CREATION_HANDOFF_ASSISTANT_MESSAGE_ID,
    role: 'assistant',
    content: '',
    agentId: input.identity.agentId,
    agentName: input.identity.agentName,
    events: [],
    createdAt: input.at,
    runStatus: 'running',
    startedAt: input.at,
  });
  return messages;
}
