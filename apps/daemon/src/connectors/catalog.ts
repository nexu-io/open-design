import type { BoundedJsonObject, BoundedJsonValue } from '../live-artifacts/schema.js';

export type ConnectorStatus = 'available' | 'connected' | 'error' | 'disabled';
export type ConnectorToolSideEffect = 'read' | 'write' | 'destructive' | 'unknown';
export type ConnectorToolApproval = 'auto' | 'confirm' | 'disabled';

export interface ConnectorToolSafety {
  sideEffect: ConnectorToolSideEffect;
  approval: ConnectorToolApproval;
  reason: string;
}

export interface ConnectorToolDetail {
  name: string;
  title: string;
  description?: string;
  inputSchemaJson?: BoundedJsonObject;
  outputSchemaJson?: BoundedJsonObject;
  safety: ConnectorToolSafety;
  refreshEligible: boolean;
}

export interface ConnectorCatalogToolDefinition extends ConnectorToolDetail {
  /** Provider scopes required for this tool. Empty for local/read-only providers. */
  requiredScopes: string[];
  /** Provider-native tool identifier, when different from the Open Design tool name. */
  providerToolId?: string;
}

export interface ConnectorDetail {
  id: string;
  name: string;
  provider: string;
  category: string;
  description?: string;
  status: ConnectorStatus;
  accountLabel?: string;
  tools: ConnectorToolDetail[];
  featuredToolNames?: string[];
  minimumApproval?: ConnectorToolApproval;
  lastError?: string;
  auth?: ConnectorAuthDetail;
}

export interface ConnectorAuthDetail {
  provider: 'local' | 'none' | 'oauth' | 'composio';
  configured: boolean;
}

export interface ConnectorCatalogDefinition {
  id: string;
  name: string;
  provider: string;
  category: string;
  description?: string;
  tools: ConnectorCatalogToolDefinition[];
  /** The complete allowlist of callable tool names for this connector. */
  allowedToolNames: string[];
  /** How the connector is made available. `none` and `local` connectors require no user OAuth state. */
  authentication?: 'local' | 'none' | 'oauth' | 'composio';
  /** Provider toolkit slug used by external connector providers such as Composio. */
  providerConnectorId?: string;
  featuredToolNames?: string[];
  minimumApproval?: ConnectorToolApproval;
  disabled?: boolean;
}

export interface ConnectorToolSafetyClassificationInput {
  name: string;
  title?: string;
  description?: string;
  requiredScopes?: readonly string[];
}

const destructiveHintPattern = /(?:^|[._:\-/\s])(?:destructive|destroy|drop|truncate|purge|erase|wipe|remove-all|remove_all|revoke|reset)(?:$|[._:\-/\s])/i;
const writeHintPattern = /(?:^|[._:\-/\s])(?:write|create|update|delete|admin|send|post|manage)(?:$|[._:\-/\s])/i;
const readOnlyHintPattern = /(?:^|[._:\-/\s])(?:read|readonly|read-only|read_only|get|list|search|fetch|view|query|inspect|summary|status)(?:$|[._:\-/\s])/i;

function connectorToolSafetyHaystack(input: ConnectorToolSafetyClassificationInput): string {
  return [input.name, input.title, input.description, ...(input.requiredScopes ?? [])]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}

export function classifyConnectorToolSafety(input: ConnectorToolSafetyClassificationInput): ConnectorToolSafety {
  const haystack = connectorToolSafetyHaystack(input);
  if (destructiveHintPattern.test(haystack)) {
    return {
      sideEffect: 'destructive',
      approval: 'disabled',
      reason: 'Tool name, scope, or description contains destructive hints; destructive tools are not refreshable.',
    };
  }
  if (writeHintPattern.test(haystack)) {
    return {
      sideEffect: 'write',
      approval: 'confirm',
      reason: 'Tool name or required scope indicates write-capable behavior; explicit confirmation is required.',
    };
  }
  if (readOnlyHintPattern.test(haystack)) {
    return {
      sideEffect: 'read',
      approval: 'auto',
      reason: 'Tool name, scope, or description indicates explicit read-only behavior.',
    };
  }
  return {
    sideEffect: 'write',
    approval: 'confirm',
    reason: 'Tool safety could not be proven read-only; defaulting to confirmation-required write policy.',
  };
}

export function isRefreshEligibleConnectorToolSafety(safety: ConnectorToolSafety): boolean {
  return safety.sideEffect === 'read' && safety.approval === 'auto';
}

export function defineConnectorTool(
  tool: Omit<ConnectorCatalogToolDefinition, 'safety' | 'refreshEligible'> & {
    safety?: ConnectorToolSafety;
    refreshEligible?: boolean;
  },
): ConnectorCatalogToolDefinition {
  const safety = tool.safety ?? classifyConnectorToolSafety(tool);
  return {
    ...tool,
    safety,
    refreshEligible: tool.refreshEligible ?? isRefreshEligibleConnectorToolSafety(safety),
  };
}

function cloneBoundedJsonValue(value: BoundedJsonValue): BoundedJsonValue {
  if (Array.isArray(value)) return value.map((item) => cloneBoundedJsonValue(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneBoundedJsonValue(entry)]));
  }
  return value;
}

function cloneBoundedJsonObject(value: BoundedJsonObject): BoundedJsonObject {
  return cloneBoundedJsonValue(value) as BoundedJsonObject;
}

function toolDefinitionToDetail(tool: ConnectorCatalogToolDefinition): ConnectorToolDetail {
  return {
    name: tool.name,
    title: tool.title,
    ...(tool.description === undefined ? {} : { description: tool.description }),
    ...(tool.inputSchemaJson === undefined ? {} : { inputSchemaJson: cloneBoundedJsonObject(tool.inputSchemaJson) }),
    ...(tool.outputSchemaJson === undefined ? {} : { outputSchemaJson: cloneBoundedJsonObject(tool.outputSchemaJson) }),
    safety: { ...tool.safety },
    refreshEligible: tool.refreshEligible,
  };
}

export function connectorDefinitionToDetail(definition: ConnectorCatalogDefinition): ConnectorDetail {
  return {
    id: definition.id,
    name: definition.name,
    provider: definition.provider,
    category: definition.category,
    ...(definition.description === undefined ? {} : { description: definition.description }),
    status: definition.disabled ? 'disabled' : 'available',
    tools: definition.tools.map((tool) => toolDefinitionToDetail(tool)),
    ...(definition.featuredToolNames === undefined ? {} : { featuredToolNames: [...definition.featuredToolNames] }),
    ...(definition.minimumApproval === undefined ? {} : { minimumApproval: definition.minimumApproval }),
    auth: {
      provider: definition.authentication ?? (definition.provider === 'open-design' ? 'local' : 'oauth'),
      configured: definition.authentication === 'local' || definition.authentication === 'none',
    },
  };
}
