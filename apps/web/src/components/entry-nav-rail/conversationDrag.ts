// Drag a rail conversation onto a project folder to move it there.
//
// `dataTransfer` payloads are unreadable during `dragover` (only their types
// are exposed), but a folder must decide whether to accept the drop while the
// pointer hovers it. The dragged row is therefore also kept here, module-level,
// for the lifetime of the drag.

import type { DragEvent } from 'react';
import type { Project } from '../../types';

export const CONVERSATION_DRAG_MIME = 'application/x-od-conversation';
/** Window event a drop target fires when its move failed, so the 对话 section
 *  (which owns the rail's status line) can say so. */
export const CONVERSATION_MOVE_FAILED_EVENT = 'od:conversation-move-failed';

export interface DraggedConversation {
  projectId: string;
  conversationId: string;
}

let dragged: DraggedConversation | null = null;

export function startConversationDrag(event: DragEvent, item: DraggedConversation) {
  dragged = item;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(CONVERSATION_DRAG_MIME, JSON.stringify(item));
}

export function endConversationDrag() {
  dragged = null;
}

export function draggedConversation(): DraggedConversation | null {
  return dragged;
}

/** Team projects sync through the workspace and do not accept moves yet. */
export function acceptsMovedConversations(project: Project): boolean {
  return project.workspaceVisibility !== 'team';
}

export function reportConversationMoveFailed() {
  window.dispatchEvent(new Event(CONVERSATION_MOVE_FAILED_EVENT));
}
