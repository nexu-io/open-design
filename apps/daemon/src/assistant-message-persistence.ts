// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// The moved bodies are untyped JS-in-TS; typing them is a later effort and new
// sibling code must NOT copy this.
/** @module assistant-message-persistence
 * Persisting run/agent state into conversation assistant messages, plus
 * skill-plugin-candidate detection. Three related sub-groups:
 *
 * - Assistant-message run lifecycle: `pinAssistantMessageOnRunCreate` and
 *   `reconcileAssistantMessageOnRunEnd` create/settle the assistant message row
 *   for a run's status.
 * - Skill-plugin-candidate detection: `isPluginAuthoringRun`,
 *   `hasGeneratedPluginArtifacts`, `assistantMessageEmittedQuestionForm`,
 *   `deferredSkillPluginCandidateForRun`, `detectSkillPluginCandidateOnRunSuccess`,
 *   `upsertSkillPluginCandidateAssistantMessage` detect reusable skill material on
 *   a successful run and surface it as an assistant message.
 * - Agent-event mapping: `persistRunEventToAssistantMessage`,
 *   `runSseEventToPersistedAgentEvent`, `daemonAgentPayloadToPersistedAgentEvent`,
 *   `normalizePersistedToolInput` map live SSE/daemon agent payloads to the
 *   persisted agent-event shape appended to the message.
 *
 * All take db/runs/run as arguments and depend only on imported services -- no
 * daemon module-level state. Extracted verbatim from apps/daemon/src/server.ts
 * (strangler-fig slice 3); server.ts imports back the symbols it references and
 * re-exports the public ones.
 */

import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  detectSkillPluginCandidate,
  getSnapshot,
  insertSkillPluginCandidate,
  listSkillPluginCandidates,
} from './plugins/index.js';
import { emittedRenderableQuestionForm } from './question-form-detect.js';
import { appendMessageAgentEvent, upsertMessage } from './db.js';

export function reconcileAssistantMessageOnRunEnd(db, runs, run) {
  if (!run.assistantMessageId) return;
  void runs
    .wait(run)
    .then((finalStatus) => {
      db.prepare(
        `UPDATE messages
            SET run_status = ?, ended_at = COALESCE(ended_at, ?)
          WHERE id = ? AND run_status IN ('queued', 'running')`,
      ).run(finalStatus.status, Date.now(), run.assistantMessageId);
    })
    .catch((err) => {
      console.warn('[runs] message reconciliation failed', err);
    });
}


export function isPluginAuthoringRun(db, run) {
  if (run?.pluginId === 'od-plugin-authoring') return true;
  if (
    typeof run?.appliedPluginSnapshotId === 'string'
    && run.appliedPluginSnapshotId.length > 0
  ) {
    const snapshot = getSnapshot(db, run.appliedPluginSnapshotId);
    return snapshot?.pluginId === 'od-plugin-authoring';
  }
  return false;
}

export async function hasGeneratedPluginArtifacts(projectRoot) {
  if (!projectRoot || typeof projectRoot !== 'string') return false;
  const required = [
    path.join(projectRoot, 'generated-plugin', 'open-design.json'),
    path.join(projectRoot, 'generated-plugin', 'SKILL.md'),
  ];
  try {
    await Promise.all(required.map((file) => fs.promises.access(file, fs.constants.F_OK)));
    return true;
  } catch {
    return false;
  }
}

// Renderable `<question-form>`/`<ask-question>` detection now lives in
// `./question-form-detect.ts` so the missing-artifacts guard, awaiting-input
// status, and run analytics all share ONE renderable-form check. See
// `emittedRenderableQuestionForm` imported above.

function assistantMessageEmittedQuestionForm(db, assistantMessageId) {
  if (!assistantMessageId) return false;
  const row = db.prepare(`SELECT content FROM messages WHERE id = ?`).get(assistantMessageId);
  return emittedRenderableQuestionForm(row?.content);
}

function deferredSkillPluginCandidateForRun(db, run) {
  if (!run.projectId || !run.conversationId) return null;
  return listSkillPluginCandidates(db, run.projectId)
    .find((candidate) =>
      candidate.status !== 'dismissed' &&
      !candidate.assistantMessageId &&
      candidate.conversationId === run.conversationId,
    ) ?? null;
}

export function detectSkillPluginCandidateOnRunSuccess(db, runs, run, input, projectRoot) {
  if (!run.projectId || !run.conversationId) return;
  void runs
    .wait(run)
    .then(async (finalStatus) => {
      if (finalStatus.status !== 'succeeded') return;
      const pausedForQuestion = assistantMessageEmittedQuestionForm(db, run.assistantMessageId);
      const detected = await detectSkillPluginCandidate({
        projectId: run.projectId,
        runId: run.id,
        conversationId: run.conversationId,
        assistantMessageId: null,
        message: input?.message ?? input?.currentPrompt,
        attachments: input?.attachments,
        projectRoot,
      });
      const candidate = detected ? insertSkillPluginCandidate(db, detected) : null;
      if (pausedForQuestion) return;
      const candidateToShow = candidate ?? deferredSkillPluginCandidateForRun(db, run);
      if (!candidateToShow || candidateToShow.status === 'dismissed') return;
      upsertSkillPluginCandidateAssistantMessage(db, run, candidateToShow);
    })
    .catch((err) => {
      console.warn('[plugins] skill candidate detection failed', err);
    });
}

export function upsertSkillPluginCandidateAssistantMessage(db, run, candidate) {
  const currentMessagePosition = run.assistantMessageId
    ? (db.prepare(`SELECT position FROM messages WHERE id = ?`).get(run.assistantMessageId)?.position ?? null)
    : null;
  const existingMessagePosition = candidate.assistantMessageId
    ? (db.prepare(`SELECT position FROM messages WHERE id = ?`).get(candidate.assistantMessageId)?.position ?? null)
    : null;
  if (
    typeof currentMessagePosition === 'number' &&
    typeof existingMessagePosition === 'number' &&
    existingMessagePosition > currentMessagePosition
  ) {
    return null;
  }
  const canReuseExistingMessage =
    candidate.assistantMessageId &&
    candidate.assistantMessageId !== run.assistantMessageId &&
    typeof existingMessagePosition === 'number';
  const messageId = canReuseExistingMessage ? candidate.assistantMessageId : randomUUID();
  const shouldMoveReusedMessage =
    canReuseExistingMessage &&
    typeof currentMessagePosition === 'number' &&
    typeof existingMessagePosition === 'number' &&
    existingMessagePosition <= currentMessagePosition;
  if (
    candidate.assistantMessageId &&
    candidate.assistantMessageId !== messageId &&
    candidate.assistantMessageId !== run.assistantMessageId
  ) {
    db.prepare(`DELETE FROM messages WHERE id = ?`).run(candidate.assistantMessageId);
  }
  const now = Date.now();
  upsertMessage(db, run.conversationId, {
    id: messageId,
    role: 'assistant',
    content: `Open Design found reusable skill material that can become a plugin: ${candidate.title}`,
    agentId: run.agentId ?? undefined,
    events: [{
      kind: 'plugin_candidate',
      candidateId: candidate.id,
      title: candidate.title,
      description: candidate.description,
      confidence: candidate.confidence,
      draftPath: candidate.draftPath ?? null,
    }],
    createdAt: now,
    endedAt: now,
  });
  if (shouldMoveReusedMessage) {
    const max = db
      .prepare(`SELECT COALESCE(MAX(position), -1) AS m FROM messages WHERE conversation_id = ?`)
      .get(run.conversationId)?.m ?? -1;
    db.prepare(`UPDATE messages SET position = ? WHERE id = ?`).run(Number(max) + 1, messageId);
  }
  db.prepare(
    `UPDATE skill_plugin_candidates
        SET assistant_message_id = ?, updated_at = ?
      WHERE id = ?`,
  ).run(messageId, now, candidate.id);
  return messageId;
}

export function persistRunEventToAssistantMessage(db, run, event, data) {
  if (!run.assistantMessageId) return;
  const persisted = runSseEventToPersistedAgentEvent(event, data);
  if (!persisted) return;
  try {
    appendMessageAgentEvent(db, run.assistantMessageId, persisted);
  } catch (err) {
    console.warn('[runs] message event persistence failed', err);
  }
}

function runSseEventToPersistedAgentEvent(event, data) {
  if (event === 'start') {
    return {
      kind: 'status',
      label: 'starting',
      ...(typeof data?.bin === 'string' ? { detail: data.bin } : {}),
    };
  }
  if (event === 'stdout') {
    const chunk = typeof data?.chunk === 'string' ? data.chunk : '';
    return chunk ? { kind: 'text', text: chunk } : null;
  }
  if (event === 'error') {
    const message = typeof data?.error?.message === 'string'
      ? data.error.message
      : typeof data?.message === 'string'
        ? data.message
        : '';
    return {
      kind: 'status',
      label: 'error',
      ...(message ? { detail: message } : {}),
    };
  }
  if (event !== 'agent') return null;
  return daemonAgentPayloadToPersistedAgentEvent(data);
}

export function daemonAgentPayloadToPersistedAgentEvent(data) {
  const type = data?.type;
  if (type === 'status' && typeof data.label === 'string') {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : typeof data.model === 'string'
          ? data.model
          : typeof data.ttftMs === 'number'
            ? `first token in ${Math.round(data.ttftMs / 100) / 10}s`
            : undefined;
    return { kind: 'status', label: data.label, ...(detail ? { detail } : {}) };
  }
  if (type === 'text_delta' && typeof data.delta === 'string') {
    return { kind: 'text', text: data.delta };
  }
  if (type === 'conversation_title' && typeof data.title === 'string') {
    return { kind: 'conversation_title', title: data.title };
  }
  if (type === 'thinking_delta' && typeof data.delta === 'string') {
    return { kind: 'thinking', text: data.delta };
  }
  if (type === 'thinking_start') return { kind: 'status', label: 'thinking' };
  if (type === 'live_artifact') {
    return {
      kind: 'live_artifact',
      action: data.action,
      projectId: data.projectId,
      artifactId: data.artifactId,
      title: data.title,
      ...(data.refreshStatus ? { refreshStatus: data.refreshStatus } : {}),
    };
  }
  if (type === 'live_artifact_refresh') {
    return {
      kind: 'live_artifact_refresh',
      phase: data.phase,
      projectId: data.projectId,
      artifactId: data.artifactId,
      ...(data.refreshId ? { refreshId: data.refreshId } : {}),
      ...(data.title ? { title: data.title } : {}),
      ...(typeof data.refreshedSourceCount === 'number'
        ? { refreshedSourceCount: data.refreshedSourceCount }
        : {}),
      ...(data.error ? { error: data.error } : {}),
    };
  }
  if (type === 'tool_use' && typeof data.id === 'string' && typeof data.name === 'string') {
    return { kind: 'tool_use', id: data.id, name: data.name, input: normalizePersistedToolInput(data.input) };
  }
  // Live-only incremental tool-input fragments are for real-time display only.
  // Returning null skips persistence so history replay isn't polluted with
  // mid-token JSON shards; the full `tool_use` above is the persisted record.
  if (type === 'tool_input_delta') return null;
  if (type === 'tool_result' && typeof data.toolUseId === 'string') {
    return {
      kind: 'tool_result',
      toolUseId: data.toolUseId,
      content: String(data.content ?? ''),
      isError: Boolean(data.isError),
    };
  }
  if (type === 'usage') {
    const usage = data.usage && typeof data.usage === 'object' ? data.usage : {};
    return {
      kind: 'usage',
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      ...(typeof data.costUsd === 'number' ? { costUsd: data.costUsd } : {}),
      ...(typeof data.durationMs === 'number' ? { durationMs: data.durationMs } : {}),
    };
  }
  if (type === 'diagnostic' && typeof data.name === 'string') {
    return {
      kind: 'diagnostic',
      name: data.name,
      ...(typeof data.source === 'string' ? { source: data.source } : {}),
      ...(typeof data.elapsedMs === 'number' ? { elapsedMs: data.elapsedMs } : {}),
      ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
      ...(typeof data.suppressedChars === 'number' ? { suppressedChars: data.suppressedChars } : {}),
      ...(typeof data.suppressedChunks === 'number' ? { suppressedChunks: data.suppressedChunks } : {}),
      ...(typeof data.openedBlocks === 'number' ? { openedBlocks: data.openedBlocks } : {}),
      ...(typeof data.closedBlocks === 'number' ? { closedBlocks: data.closedBlocks } : {}),
      ...(typeof data.fileCount === 'number' ? { fileCount: data.fileCount } : {}),
      ...(Array.isArray(data.files) ? { files: data.files.filter((file) => typeof file === 'string').slice(0, 8) } : {}),
      ...(typeof data.pendingCandidateChars === 'number'
        ? { pendingCandidateChars: data.pendingCandidateChars }
        : {}),
      ...(typeof data.suppressing === 'boolean' ? { suppressing: data.suppressing } : {}),
      ...(data.shape && typeof data.shape === 'object' ? { shape: data.shape } : {}),
    };
  }
  if (type === 'fabricated_role_marker' && typeof data.marker === 'string') {
    return {
      kind: 'status',
      label: 'warning',
      detail: `Model emitted fabricated role marker ("${data.marker}"). Response was truncated at this point to prevent unauthorized instruction injection. See issue #3247.`,
    };
  }
  // Persist tool-loop warnings/halts so the signal survives a reload or history
  // replay. Without this the event is transient-only, and in
  // OD_TOOL_LOOP_GUARD=warn (no terminal TOOL_LOOP_DETECTED error) the user
  // would lose the only record that a loop was detected. Mirrors the live
  // mapping in apps/web/src/providers/daemon.ts so replayed and live views match.
  if (type === 'tool_loop' && typeof data.toolName === 'string') {
    const toolName = data.toolName;
    const count = typeof data.count === 'number' ? data.count : 0;
    const detail =
      data.action === 'halt'
        ? `Run stopped: the agent repeated a failing ${toolName} call ${count}× without progress. Re-check the actual target before retrying.`
        : `Heads up — the agent has repeated a failing ${toolName} call ${count}× and may be stuck.`;
    return { kind: 'status', label: 'warning', detail };
  }
  if (type === 'raw' && typeof data.line === 'string') return { kind: 'raw', line: data.line };
  return null;
}

function normalizePersistedToolInput(input) {
  if (!input || typeof input !== 'object') return input;
  if ('filePath' in input && typeof input.filePath === 'string') {
    return { ...input, file_path: input.filePath };
  }
  return input;
}

export function pinAssistantMessageOnRunCreate(db, run) {
  if (!run.conversationId || !run.assistantMessageId) return;
  const existing = db
    .prepare(`SELECT id FROM messages WHERE id = ?`)
    .get(run.assistantMessageId);
  if (existing) {
    db.prepare(
      `UPDATE messages
          SET run_id = ?,
              run_status = CASE
                WHEN run_status IN ('succeeded', 'failed', 'canceled') THEN run_status
                ELSE ?
              END,
              started_at = COALESCE(started_at, ?)
        WHERE id = ?`,
    ).run(run.id, run.status, run.createdAt, run.assistantMessageId);
    return;
  }
  upsertMessage(db, run.conversationId, {
    id: run.assistantMessageId,
    role: 'assistant',
    content: '',
    agentId: run.agentId ?? undefined,
    events: [],
    runId: run.id,
    runStatus: run.status,
    startedAt: run.createdAt,
  });
}
