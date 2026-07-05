/** @module ingestion/routine-evolution
 * Bridge from a completed routine run into the ingestion pipeline: when a scheduled
 * routine that used connectors succeeds, synthesize a source packet from its run and
 * feed it to `ingestAutomationSource` (same subdir) so the connector usage can evolve
 * an automation template. Consumes routine run types from core/.
 */

import type { RoutineRunStatus, RoutineRunTrigger } from '../core/index.js';
import { ingestAutomationSource } from './sources.js';

type RoutineLike = {
  id: string;
  name: string;
  prompt: string;
};

type MessageLike = {
  role?: string;
  content?: unknown;
};

/**
 * Extracts the automation template id a routine prompt was generated from, by matching
 * the `Use Automation template "<id>"` marker the prompt builder emits. Returns `null`
 * when the prompt carries no such marker.
 */
export function automationTemplateIdFromRoutinePrompt(prompt: string): string | null {
  const match = /Use Automation template "([^"]+)"/.exec(prompt);
  return match?.[1] ?? null;
}

/** @internal Collapse arbitrary message content to a single trimmed line, capped at 2000 chars. */
function compactMessageContent(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return text.replace(/\s+/g, ' ').trim().slice(0, 2_000);
}

/** @internal Render a routine run (prompt, summary, last few messages) into source markdown. */
function routineConnectorSourceMarkdown(input: {
  routine: RoutineLike;
  runId: string;
  trigger: RoutineRunTrigger;
  projectId: string;
  conversationId: string;
  agentRunId: string;
  summary: string;
  connectorIds: string[];
  messages: MessageLike[];
}): string {
  const transcript = input.messages
    .map((message) => {
      const content = compactMessageContent(message.content);
      if (!content) return '';
      return `- ${message.role ?? 'message'}: ${content}`;
    })
    .filter(Boolean)
    .slice(-8);

  return [
    `# ${input.routine.name} connector evolution`,
    '',
    `Routine id: ${input.routine.id}`,
    `Routine run: ${input.runId}`,
    `Trigger: ${input.trigger}`,
    `Project id: ${input.projectId}`,
    `Conversation id: ${input.conversationId}`,
    `Agent run id: ${input.agentRunId}`,
    `Connectors: ${input.connectorIds.join(', ')}`,
    '',
    '## Automation Prompt',
    '',
    input.routine.prompt,
    '',
    '## Run Summary',
    '',
    input.summary,
    '',
    '## Conversation Evidence',
    '',
    transcript.length > 0 ? transcript.join('\n') : 'No conversation transcript was available.',
  ].join('\n');
}

/**
 * Turn a finished routine run into an ingested automation source. No-ops (returns
 * `null`) unless the run `succeeded` and used at least one connector. Resolves the
 * template id from the routine prompt (falling back to the connector-digest default),
 * builds source markdown from the run, and delegates to `ingestAutomationSource`.
 */
export async function ingestRoutineConnectorEvolution(
  dataDir: string,
  input: {
    routine: RoutineLike;
    runId: string;
    trigger: RoutineRunTrigger;
    status: RoutineRunStatus;
    projectId: string;
    conversationId: string;
    agentRunId: string;
    summary: string;
    connectorIds: string[];
    messages: MessageLike[];
  },
) {
  const connectorIds = input.connectorIds
    .map((id) => id.trim())
    .filter((id, index, all) => id && all.indexOf(id) === index);
  if (input.status !== 'succeeded' || connectorIds.length === 0) return null;

  const templateId =
    automationTemplateIdFromRoutinePrompt(input.routine.prompt) ??
    'connector-digest-design-context';
  return ingestAutomationSource(dataDir, {
    templateId,
    sourceKind: 'connector',
    sourceRef: `routine-run:${input.runId}`,
    title: `${input.routine.name} connector run`,
    bodyMarkdown: routineConnectorSourceMarkdown({
      ...input,
      connectorIds,
    }),
    projectId: input.projectId,
    conversationId: input.conversationId,
    connectorId: connectorIds[0]!,
    accountLabel: connectorIds.join(', '),
    tokenCompression: 'balanced',
    metadata: {
      routineId: input.routine.id,
      routineRunId: input.runId,
      agentRunId: input.agentRunId,
      trigger: input.trigger,
      connectorIds,
      templateId,
    },
  });
}
