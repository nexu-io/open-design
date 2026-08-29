import type { ChatSessionMode } from '../api/chat.js';
import type { MediaExecutionMode, MediaSurface } from '../api/media.js';
import type { StrategyTaskTypeV2 } from '../plugins/strategy-v2.js';
import type {
  StrategyExecutionModeV2,
  StrategyRouteV2,
} from '../plugins/strategy-v2.js';

export const OD_NEXT_TASK_CONFIGURATION_SCHEMA_V1 =
  'open-design.od-next-task-configuration/v1' as const;
export const OD_NEXT_REQUEST_INPUT_FACTS_SCHEMA_V1 =
  'open-design.od-next-request-input-facts/v1' as const;

export type OdNextProductionTaskTypeV1 = Exclude<StrategyTaskTypeV2, 'generic'>;

export interface OdNextTaskConfigurationV1 {
  schema: typeof OD_NEXT_TASK_CONFIGURATION_SCHEMA_V1;
  taskType: OdNextProductionTaskTypeV1;
  locale: string;
  selectedAgentId: string;
  route: StrategyRouteV2;
  mode: StrategyExecutionModeV2 | 'unresolved';
  configuration: {
    sessionMode: ChatSessionMode;
    model?: string;
    reasoning?: string;
    serviceTier?: string;
    mediaExecution: {
      mode: MediaExecutionMode;
      allowedSurfaces?: MediaSurface[];
      allowedModels?: string[];
    };
  };
}

export interface OdNextAttachmentFactV1 {
  id: string;
  order: number;
  kind: 'file' | 'image';
  reference: string;
  mediaType: string;
  bytes: number;
  sha256: string;
}

export interface OdNextRequestInputFactsV1 {
  schema: typeof OD_NEXT_REQUEST_INPUT_FACTS_SCHEMA_V1;
  attachmentTransport: {
    scheme: 'task-input';
    rootEnvironmentVariable: 'OD_TASK_INPUT_DIR';
    access: 'out_of_band';
  };
  attachments: OdNextAttachmentFactV1[];
  comments: { count: number };
  workspace: {
    project: { reference: 'workspace:project'; access: 'out_of_band' } | null;
    linkedDirectories: Array<{
      reference: string;
      access: 'out_of_band';
    }>;
  };
  mcp: {
    serverCount: number;
    registration: 'out_of_band';
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    )).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('OD Next canonical facts contain an unsupported value.');
  return encoded;
}

export function serializeOdNextTaskConfigurationV1(
  value: OdNextTaskConfigurationV1,
): string {
  return canonicalJson(value);
}

export function serializeOdNextRequestInputFactsV1(
  value: OdNextRequestInputFactsV1,
): string {
  return canonicalJson(value);
}

/**
 * Attachment identities only, for the Bundle's `task_metadata/attachments` slot.
 *
 * Returns '' when there is no attachment, so the slot is omitted rather than
 * emitted empty. Carries reference, media type, byte count and digest — never
 * attachment bodies and never an absolute path.
 */
export function serializeOdNextAttachmentFactsV1(
  value: OdNextRequestInputFactsV1,
): string {
  if (value.attachments.length === 0) return '';
  return canonicalJson({
    schema: value.schema,
    attachmentTransport: value.attachmentTransport,
    attachments: value.attachments,
  });
}

/**
 * True when the request carried no attachment, no comment, no MCP server, and
 * no linked directory — an all-empty state whose serialization is pure noise in
 * the prompt.
 *
 * The remaining fields are constants (`schema`, the transport descriptor, the
 * `workspace:project` marker), so an all-empty roster tells the model nothing it
 * cannot read off the Bundle shape itself.
 */
export function odNextRequestInputFactsAreEmptyV1(
  value: OdNextRequestInputFactsV1,
): boolean {
  return value.attachments.length === 0
    && value.comments.count === 0
    && value.mcp.serverCount === 0
    && value.workspace.linkedDirectories.length === 0;
}

/**
 * Every request input fact except attachments, for the Bundle's
 * `context/request_input_facts` slot. Attachments are a sibling slot, so
 * emitting them here too would duplicate them in the payload.
 *
 * Returns '' when the request carried no substantive input fact at all, so the
 * slot is omitted rather than emitting an all-zero state — the same no-empty-
 * slot rule the spec already mandates for `attachments`.
 */
export function serializeOdNextWorkspaceInputFactsV1(
  value: OdNextRequestInputFactsV1,
): string {
  if (odNextRequestInputFactsAreEmptyV1(value)) return '';
  return canonicalJson({
    schema: value.schema,
    comments: value.comments,
    mcp: value.mcp,
    workspace: value.workspace,
  });
}
