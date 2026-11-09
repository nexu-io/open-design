import readline from 'node:readline';

type JsonObject = Record<string, unknown>;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: JsonObject;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

interface McpServerResult {
  exitCode: number;
}

const EMPTY_OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} satisfies JsonObject;

const CONNECTORS_LIST_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    useCase: { type: 'string', enum: ['personal_daily_digest'] },
  },
} satisfies JsonObject;

const ARTIFACT_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  description: 'LiveArtifactCreateInput/LiveArtifactUpdateInput JSON plus optional templateHtml and provenanceJson fields.',
} satisfies JsonObject;

export function createLiveArtifactsMcpTools(): McpTool[] {
  return [
    {
      name: 'live_artifacts_create',
      description: 'Create a project-scoped live artifact through the daemon tool endpoint. POSIX equivalent: `"$OD_NODE_BIN" "$OD_BIN" tools live-artifacts create --input artifact.json`.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['input'],
        properties: {
          input: ARTIFACT_INPUT_SCHEMA,
          templateHtml: { type: 'string' },
          provenanceJson: { type: 'object', additionalProperties: true },
        },
      },
    },
    {
      name: 'live_artifacts_list',
      description: 'List compact project-scoped live artifacts through the daemon tool endpoint. POSIX equivalent: `"$OD_NODE_BIN" "$OD_BIN" tools live-artifacts list --format compact`.',
      inputSchema: EMPTY_OBJECT_SCHEMA,
    },
    {
      name: 'live_artifacts_update',
      description: 'Update a live artifact through the daemon tool endpoint. POSIX equivalent: `"$OD_NODE_BIN" "$OD_BIN" tools live-artifacts update --artifact-id <id> --input artifact.json`.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['artifactId', 'input'],
        properties: {
          artifactId: { type: 'string', minLength: 1 },
          input: ARTIFACT_INPUT_SCHEMA,
          templateHtml: { type: 'string' },
          provenanceJson: { type: 'object', additionalProperties: true },
        },
      },
    },
    {
      name: 'live_artifacts_refresh',
      description: 'Refresh a live artifact through the daemon tool endpoint. POSIX equivalent: `"$OD_NODE_BIN" "$OD_BIN" tools live-artifacts refresh --artifact-id <id>`.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['artifactId'],
        properties: {
          artifactId: { type: 'string', minLength: 1 },
        },
      },
    },
    {
      name: 'capture_design_jury_viewports',
      description: 'For an active Design Jury run only, capture the current project-relative HTML entry at 390x844, 1024x768, and 1280x800. Returns the actual PNG images and host-measured DOM geometry. Requires entryFile; do not use for arbitrary URLs.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['entryFile'],
        properties: {
          entryFile: { type: 'string', minLength: 1 },
        },
      },
    },
    {
      name: 'connectors_list',
      description: 'List connector catalog and available read-only tools through the daemon tool endpoint. Use `{ "useCase": "personal_daily_digest" }` for curated daily-digest tools. POSIX equivalent: `"$OD_NODE_BIN" "$OD_BIN" tools connectors list --use-case personal_daily_digest --format compact` or fallback `"$OD_NODE_BIN" "$OD_BIN" tools connectors list --format compact`.',
      inputSchema: CONNECTORS_LIST_INPUT_SCHEMA,
    },
    {
      name: 'connectors_execute',
      description: 'Execute an allowed connector read tool through the daemon tool endpoint. POSIX equivalent: `"$OD_NODE_BIN" "$OD_BIN" tools connectors execute --connector <id> --tool <name> --input input.json`.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['connectorId', 'toolName', 'input'],
        properties: {
          connectorId: { type: 'string', minLength: 1 },
          toolName: { type: 'string', minLength: 1 },
          input: { type: 'object', additionalProperties: true },
        },
      },
    },
  ];
}

function daemonUrl(): URL {
  const rawUrl = process.env.OD_DAEMON_URL;
  if (!rawUrl) throw new Error('OD_DAEMON_URL is required');
  const url = new URL(rawUrl);
  url.pathname = url.pathname.replace(/\/+$/u, '');
  url.search = '';
  url.hash = '';
  return url;
}

function toolToken(): string {
  const token = process.env.OD_TOOL_TOKEN;
  if (!token) throw new Error('OD_TOOL_TOKEN is required');
  return token;
}

function endpoint(baseUrl: URL, pathname: string): string {
  const url = new URL(baseUrl.toString());
  const [pathPart, searchPart] = pathname.split('?');
  url.pathname = `${url.pathname}${pathPart ?? ''}`.replace(/\/+/gu, '/');
  url.search = searchPart === undefined ? '' : `?${searchPart}`;
  return url.toString();
}

async function requestJson<T = unknown>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint(daemonUrl(), pathname), {
    ...init,
    headers: {
      Authorization: `Bearer ${toolToken()}`,
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    const error = new Error(`daemon tool endpoint failed with ${response.status}`);
    (error as Error & { details?: unknown }).details = body;
    throw error;
  }
  return body as T;
}

async function callTool(name: string, args: JsonObject): Promise<unknown> {
  if (name === 'live_artifacts_create') {
    return await requestJson('/api/tools/live-artifacts/create', {
      method: 'POST',
      body: JSON.stringify({
        input: args.input ?? {},
        ...(typeof args.templateHtml === 'string' ? { templateHtml: args.templateHtml } : {}),
        ...(args.provenanceJson && typeof args.provenanceJson === 'object' && !Array.isArray(args.provenanceJson) ? { provenanceJson: args.provenanceJson } : {}),
      }),
    });
  }
  if (name === 'live_artifacts_list') {
    return await requestJson('/api/tools/live-artifacts/list', { method: 'GET' });
  }
  if (name === 'live_artifacts_update') {
    return await requestJson('/api/tools/live-artifacts/update', {
      method: 'POST',
      body: JSON.stringify({
        artifactId: args.artifactId,
        input: typeof args.input === 'object' && args.input ? args.input : {},
        ...(typeof args.templateHtml === 'string' ? { templateHtml: args.templateHtml } : {}),
        ...(args.provenanceJson && typeof args.provenanceJson === 'object' && !Array.isArray(args.provenanceJson) ? { provenanceJson: args.provenanceJson } : {}),
      }),
    });
  }
  if (name === 'live_artifacts_refresh') {
    return await requestJson('/api/tools/live-artifacts/refresh', { method: 'POST', body: JSON.stringify({ artifactId: args.artifactId }) });
  }
  if (name === 'capture_design_jury_viewports') {
    const capture = await requestJson<{
      ok?: boolean;
      receipt?: string;
      artifactPath?: string;
      revision?: string;
      captures?: Array<{ width: number; height: number; evidencePath: string; geometry: JsonObject; image: string; mimeType: string }>;
    }>('/api/tools/visual-capture', {
      method: 'POST',
      body: JSON.stringify({ entryFile: args.entryFile }),
    });
    if (capture.ok !== true || !capture.receipt || !Array.isArray(capture.captures) || capture.captures.length !== 3) {
      throw new Error('The host did not return all required rendered evidence.');
    }
    await requestJson('/api/tools/visual-capture/ack', {
      method: 'POST',
      body: JSON.stringify({ receipt: capture.receipt }),
    });
    return capture;
  }
  if (name === 'connectors_list') {
    const useCase = args.useCase === 'personal_daily_digest' ? '?useCase=personal_daily_digest' : '';
    return await requestJson(`/api/tools/connectors/list${useCase}`, { method: 'GET' });
  }
  if (name === 'connectors_execute') {
    return await requestJson('/api/tools/connectors/execute', {
      method: 'POST',
      body: JSON.stringify({ connectorId: args.connectorId, toolName: args.toolName, input: args.input ?? {} }),
    });
  }
  throw new Error(`unknown MCP tool: ${name}`);
}

export async function handleLiveArtifactsMcpRequest(request: JsonRpcRequest): Promise<JsonObject | undefined> {
  const id = request.id ?? null;
  const method = request.method;

  if (method === 'notifications/initialized') return undefined;

  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'open-design-live-artifacts', version: '0.1.0' },
        },
      };
    }

    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: createLiveArtifactsMcpTools() } };
    }

    if (method === 'tools/call') {
      const params = request.params ?? {};
      const name = typeof params.name === 'string' ? params.name : '';
      const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? (params.arguments as JsonObject) : {};
      const result = await callTool(name, args);
      if (name === 'capture_design_jury_viewports' && result && typeof result === 'object') {
        const response = result as { receipt?: unknown; artifactPath?: unknown; revision?: unknown; captures?: unknown };
        const captures = Array.isArray(response.captures) ? response.captures : [];
        const content: Array<Record<string, unknown>> = [{
          type: 'text',
          text: JSON.stringify({
            receipt: response.receipt,
            artifactPath: response.artifactPath,
            revision: response.revision,
            captures: captures.map((capture) => {
              if (!capture || typeof capture !== 'object') return capture;
              const item = capture as Record<string, unknown>;
              const { image: _image, ...metadata } = item;
              return metadata;
            }),
          }),
        }];
        for (const capture of captures) {
          if (!capture || typeof capture !== 'object') continue;
          const item = capture as Record<string, unknown>;
          if (typeof item.image === 'string' && item.mimeType === 'image/png') {
            content.push({ type: 'image', data: item.image, mimeType: 'image/png' });
          }
        }
        return {
          jsonrpc: '2.0',
          id,
          result: { content },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        },
      };
    }

    return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${String(method)}` } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details = error && typeof error === 'object' && 'details' in error ? (error as { details?: unknown }).details : undefined;
    return { jsonrpc: '2.0', id, error: { code: -32000, message, ...(details === undefined ? {} : { data: details }) } };
  }
}

export async function runLiveArtifactsMcpServer(): Promise<McpServerResult> {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })}\n`);
      continue;
    }
    const response = await handleLiveArtifactsMcpRequest(request);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }

  return { exitCode: 0 };
}
