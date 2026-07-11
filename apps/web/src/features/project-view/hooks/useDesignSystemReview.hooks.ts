// Feature-local hook for the design-system-project workspace's per-section
// review cluster: persisting an approve/needs-work decision onto
// `project.metadata.designSystemReview`, sending the "needs work" feedback
// prompt through the standard chat-send path, and auto-sending any decision
// that was queued while the conversation couldn't yet accept a send (mirrors
// the auto-drain shape of the queued-chat-sends cluster, but scoped to the
// single queued review task instead of a persisted list).
import { useCallback, useEffect, useRef } from 'react';
import type { ChatAttachment, ChatCommentAttachment, Project, ProjectFile, ProjectMetadata } from '../../../types';
import { designSystemFeedbackAttachments, designSystemNeedsWorkPrompt } from '../formatters';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';
import type {
  DesignSystemReviewAgentTask,
  DesignSystemReviewDetails,
  DesignSystemReviewEntry,
} from '../types';

export interface DesignSystemReviewController {
  sendDesignSystemFeedback: (
    sectionTitle: string,
    feedback: string,
    sectionFiles: string[],
  ) => DesignSystemReviewAgentTask | void;
  persistDesignSystemReviewDecision: (
    sectionTitle: string,
    decision: DesignSystemReviewEntry['decision'],
    details?: DesignSystemReviewDetails,
  ) => void;
}

export function useDesignSystemReview(
  port: ProjectViewTransportPort,
  project: Project,
  projectFiles: ProjectFile[],
  activeConversationId: string | null,
  messagesInitialized: boolean,
  currentConversationActionDisabled: boolean,
  onProjectChange: (next: Project) => void,
  handleSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
  ) => Promise<boolean>,
): DesignSystemReviewController {
  const sentDesignSystemReviewTaskKeysRef = useRef<Set<string>>(new Set());

  const persistDesignSystemReviewEntry = useCallback((
    sectionTitle: string,
    entry: DesignSystemReviewEntry,
  ) => {
    const baseMetadata: ProjectMetadata = {
      kind: project.metadata?.kind ?? 'other',
      ...project.metadata,
    };
    const metadata: ProjectMetadata = {
      ...baseMetadata,
      designSystemReview: {
        ...(baseMetadata.designSystemReview ?? {}),
        [sectionTitle]: entry,
      },
    };
    onProjectChange({ ...project, metadata });
    void port.patchProjectMetadata(project.id, metadata);
  }, [onProjectChange, port, project]);

  const sendDesignSystemFeedback = useCallback((
    sectionTitle: string,
    feedback: string,
    sectionFiles: string[],
  ): DesignSystemReviewAgentTask | void => {
    const cleanFeedback = feedback.trim();
    if (!cleanFeedback) return;
    const prompt = designSystemNeedsWorkPrompt(sectionTitle, cleanFeedback, sectionFiles);
    const queuedAt = new Date().toISOString();
    if (!activeConversationId || !messagesInitialized || currentConversationActionDisabled) {
      return {
        status: 'queued',
        prompt,
        queuedAt,
      };
    }
    const task: DesignSystemReviewAgentTask = {
      status: 'sent',
      prompt,
      queuedAt,
      sentAt: queuedAt,
    };
    sentDesignSystemReviewTaskKeysRef.current.add(`${sectionTitle}:${queuedAt}`);
    void handleSend(prompt, designSystemFeedbackAttachments(projectFiles, sectionFiles), []);
    return task;
  }, [
    activeConversationId,
    currentConversationActionDisabled,
    handleSend,
    messagesInitialized,
    projectFiles,
  ]);

  const persistDesignSystemReviewDecision = useCallback((
    sectionTitle: string,
    decision: DesignSystemReviewEntry['decision'],
    details?: DesignSystemReviewDetails,
  ) => {
    const entry: DesignSystemReviewEntry = {
      decision,
      updatedAt: new Date().toISOString(),
    };
    if (details?.feedback) entry.feedback = details.feedback;
    if (details?.files) entry.files = details.files;
    if (details?.agentTask) entry.agentTask = details.agentTask;
    persistDesignSystemReviewEntry(sectionTitle, entry);
  }, [persistDesignSystemReviewEntry]);

  useEffect(() => {
    if (!activeConversationId || !messagesInitialized || currentConversationActionDisabled) return;
    const queued = Object.entries(project.metadata?.designSystemReview ?? {}).find(
      ([, entry]) =>
        entry.decision === 'needs-work'
        && Boolean(entry.feedback?.trim())
        && entry.agentTask?.status === 'queued',
    );
    if (!queued) return;
    const [sectionTitle, entry] = queued;
    const task = entry.agentTask;
    if (!task) return;
    const taskKey = `${sectionTitle}:${task.queuedAt}`;
    if (sentDesignSystemReviewTaskKeysRef.current.has(taskKey)) return;
    sentDesignSystemReviewTaskKeysRef.current.add(taskKey);
    const sectionFiles = entry.files ?? [];
    const prompt = task.prompt || designSystemNeedsWorkPrompt(
      sectionTitle,
      entry.feedback ?? '',
      sectionFiles,
    );
    const sentAt = new Date().toISOString();
    persistDesignSystemReviewEntry(sectionTitle, {
      ...entry,
      agentTask: {
        ...task,
        status: 'sent',
        prompt,
        sentAt,
      },
    });
    void handleSend(prompt, designSystemFeedbackAttachments(projectFiles, sectionFiles), []);
  }, [
    activeConversationId,
    currentConversationActionDisabled,
    handleSend,
    messagesInitialized,
    persistDesignSystemReviewEntry,
    project.metadata?.designSystemReview,
    projectFiles,
  ]);

  return { sendDesignSystemFeedback, persistDesignSystemReviewDecision };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredDesignSystemReview(
  project: Project,
  projectFiles: ProjectFile[],
  activeConversationId: string | null,
  messagesInitialized: boolean,
  currentConversationActionDisabled: boolean,
  onProjectChange: (next: Project) => void,
  handleSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
  ) => Promise<boolean>,
): DesignSystemReviewController {
  return useDesignSystemReview(
    projectViewTransportPort,
    project,
    projectFiles,
    activeConversationId,
    messagesInitialized,
    currentConversationActionDisabled,
    onProjectChange,
    handleSend,
  );
}
