import { z } from 'zod';

import { OpenDesignPlanContractV2Schema, StrategyRuntimeStateV2Schema } from '../plugins/strategy-v2.js';

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

/** Resolve an omitted field without authorizing tools or rewriting the preceding answer. */
export function composeOdNextIntentResolutionTurnV1(input: Omit<OdNextIntentResolutionTurnV1, 'payload'> & {
  originalRequest: string;
  executionMode: 'simple' | 'complex' | null;
}): string {
  const { originalRequest, executionMode, ...identity } = input;
  return serializeOdNextIntentResolutionTurnV1({
    ...identity,
    payload: [
      '# OD Next execution intent resolution',
      'Continue the locked native session. The preceding response omitted executionIntent. Resolve only that field from the frozen original user request below and the existing task context. Do not use tools, create or modify files, ask another question, rewrite the plan, or repeat the visible answer.',
      'Use plan_only when the original request limits the task to a visible planning answer, including an explicit no-write request. Use produce for requested file work, including an editable Plan document or an explicit small Chat edit. Clarification answers do not remove an original no-write constraint.',
      `Emit exactly one open-design-runtime-state block and no other text or Plan Contract. Its schema is open-design.strategy-state/v2, route full_plan, inputStage ${input.stage}, executionMode ${JSON.stringify(executionMode)}, executionIntent produce or plan_only, reasonCodes [], and outcome completed for plan_only or plan_ready for produce. Do not change any other task decision.`,
      '## Frozen original user request',
      originalRequest,
    ].join('\n\n'),
  });
}

/** Durable source/reply envelope for the one host-owned intent supplement. */
const ProtocolResultSchema = z.object({
  visibleText: z.string(),
  planContract: OpenDesignPlanContractV2Schema.optional(),
  runtimeState: StrategyRuntimeStateV2Schema.optional(),
  repairPlanContract: OpenDesignPlanContractV2Schema.optional(),
  repairRuntimeState: StrategyRuntimeStateV2Schema.optional(),
  normalizations: z.array(z.string()),
  issues: z.array(z.object({
    code: z.enum([
      'od_next_protocol_machine_block_malformed', 'od_next_protocol_machine_block_too_large',
      'od_next_protocol_plan_contract_duplicate', 'od_next_protocol_plan_contract_invalid_json',
      'od_next_protocol_plan_contract_invalid_schema', 'od_next_protocol_runtime_state_duplicate',
      'od_next_protocol_runtime_state_invalid_json', 'od_next_protocol_runtime_state_invalid_schema',
      'od_next_protocol_runtime_state_missing',
    ]),
    detail: z.string(),
  }).strict()),
}).strict();

const CompletionEvidenceSchema = z.object({
  physicalStatus: z.enum(['succeeded', 'failed', 'canceled']),
  deliverableValid: z.boolean(),
  filesWritten: z.number().int().nonnegative().optional(),
  filesWrittenUnknown: z.boolean().optional(),
  filesWrittenSource: z.enum(['filesystem', 'tool_stream', 'unknown']).optional(),
}).strict();

export const OdNextIntentResolutionResultSchema = z.object({
  runId: z.string().min(1),
  parsed: ProtocolResultSchema,
  toolUseCount: z.number().int().nonnegative(),
  completionEvidence: CompletionEvidenceSchema.optional(),
}).strict();
