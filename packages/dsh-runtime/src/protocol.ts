export const PROTOCOL_VERSION = 1 as const;
export const RUNTIME_NAME = 'open-design' as const;
export const CAPABILITIES = {
  session_resume: true,
  session_cancel: true,
  structured_events: true,
} as const;

export type ModelCatalogEntry = {
  provider: string;
  provider_name: string;
  id: string;
  name: string;
  reasoning_options?: Array<{ id: string; name: string; default?: boolean }>;
};

export function modelsFrame(models: ModelCatalogEntry[]) {
  return {
    v: PROTOCOL_VERSION,
    type: 'models' as const,
    runtime: RUNTIME_NAME,
    models,
  };
}

export type ExecuteCommand = {
  v: 1;
  type: 'execute';
  request_id: string;
  cwd: string;
  prompt: string;
  resume_session_id?: string;
  model?: { provider: string; id: string };
  reasoning_effort?: string;
  mcp_servers: unknown[];
};

export type CancelCommand = {
  v: 1;
  type: 'cancel';
  request_id: string;
};

export type HostCommand = ExecuteCommand | CancelCommand;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseHostCommand(value: unknown): HostCommand {
  const input = record(value);
  if (!input || input.v !== 1 || !nonEmpty(input.type) || !nonEmpty(input.request_id)) {
    throw new Error('invalid protocol envelope');
  }
  if (input.type === 'cancel') {
    return { v: 1, type: 'cancel', request_id: input.request_id };
  }
  if (input.type !== 'execute' || !nonEmpty(input.cwd) || !nonEmpty(input.prompt) || !Array.isArray(input.mcp_servers)) {
    throw new Error('invalid execute command');
  }
  const model = record(input.model);
  if (input.model !== undefined && (!model || !nonEmpty(model.provider) || !nonEmpty(model.id))) {
    throw new Error('invalid model selection');
  }
  if (input.resume_session_id !== undefined && !nonEmpty(input.resume_session_id)) {
    throw new Error('invalid resume session id');
  }
  if (input.reasoning_effort !== undefined && !nonEmpty(input.reasoning_effort)) {
    throw new Error('invalid reasoning effort');
  }
  return {
    v: 1,
    type: 'execute',
    request_id: input.request_id,
    cwd: input.cwd,
    prompt: input.prompt,
    mcp_servers: input.mcp_servers,
    ...(input.resume_session_id === undefined ? {} : { resume_session_id: input.resume_session_id }),
    ...(model === null ? {} : { model: { provider: model.provider as string, id: model.id as string } }),
    ...(input.reasoning_effort === undefined ? {} : { reasoning_effort: input.reasoning_effort as string }),
  };
}

export function identityFrame(type: 'probe' | 'ready', pluginVersion: string) {
  return {
    v: PROTOCOL_VERSION,
    type,
    runtime: RUNTIME_NAME,
    protocol_version: PROTOCOL_VERSION,
    plugin_version: pluginVersion,
    capabilities: CAPABILITIES,
  };
}
