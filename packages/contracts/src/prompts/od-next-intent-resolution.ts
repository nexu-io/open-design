import { z } from 'zod';

import {
  indexCanonicalXmlChildren,
  parseCanonicalXml,
  requireCanonicalXmlAttribute,
  requireCanonicalXmlElement,
  requireCanonicalXmlText,
  serializeCanonicalXml,
} from './canonical-xml.js';

export const OD_NEXT_INTENT_RESOLUTION_TURN_SCHEMA =
  'open-design.od-next-intent-resolution-turn/v1' as const;

export const OdNextIntentResolutionTurnV1Schema = z.object({
  taskExecutionId: z.string().min(1),
  stage: z.enum(['request', 'clarification']),
  taskRunIndex: z.number().int().positive().safe(),
  sourceRunId: z.string().min(1),
  promptBundleSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceResultSha256: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.string().min(1),
}).strict();

export type OdNextIntentResolutionTurnV1 = z.infer<typeof OdNextIntentResolutionTurnV1Schema>;

/** A host-owned supplemental request; it never changes the logical task stage. */
export function serializeOdNextIntentResolutionTurnV1(value: OdNextIntentResolutionTurnV1): string {
  const input = OdNextIntentResolutionTurnV1Schema.parse(value);
  return serializeCanonicalXml({
    kind: 'element',
    tag: 'open_design_intent_resolution_turn',
    attributes: [
      ['schema', OD_NEXT_INTENT_RESOLUTION_TURN_SCHEMA],
      ['purpose', 'intent_resolution'],
      ['task_execution_id', input.taskExecutionId],
      ['stage', input.stage],
      ['task_run_index', String(input.taskRunIndex)],
      ['source_run_id', input.sourceRunId],
      ['prompt_bundle_sha256', input.promptBundleSha256],
      ['source_result_sha256', input.sourceResultSha256],
    ],
    children: [{ kind: 'text', tag: 'payload', text: input.payload }],
  });
}

export function parseOdNextIntentResolutionTurnV1(source: string): OdNextIntentResolutionTurnV1 {
  const root = requireCanonicalXmlElement(parseCanonicalXml(source), 'intent resolution turn');
  const attribute = (name: string) => requireCanonicalXmlAttribute(root, name, 'intent resolution turn');
  const children = indexCanonicalXmlChildren(root, ['payload'], 'intent resolution turn');
  const input = OdNextIntentResolutionTurnV1Schema.parse({
    taskExecutionId: attribute('task_execution_id'),
    stage: attribute('stage'),
    taskRunIndex: Number(attribute('task_run_index')),
    sourceRunId: attribute('source_run_id'),
    promptBundleSha256: attribute('prompt_bundle_sha256'),
    sourceResultSha256: attribute('source_result_sha256'),
    payload: requireCanonicalXmlText(children.get('payload'), 'payload').text,
  });
  if (serializeOdNextIntentResolutionTurnV1(input) !== source) {
    throw new TypeError('Continuation final text identity does not match its task Run mapping.');
  }
  return input;
}
