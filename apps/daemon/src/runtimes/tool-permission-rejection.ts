/**
 * Headless OpenCode runs (BYOK OpenCode, local `opencode`) have no approval
 * UI. A tool call that leaves the run's `external_directory` allowlist is
 * auto-denied and the model is told "The user rejected permission to use this
 * specific tool call." It then often ends the turn without output, which the
 * empty-output guard used to report as an empty provider response.
 *
 * The tracker remembers the last denied call so that guard can name the tool
 * and target instead.
 */
export const OPENCODE_PERMISSION_REJECTION_TEXT =
  'The user rejected permission to use this specific tool call';

/** Stable wording the failure classifier keys on; keep in sync with it. */
export const TOOL_PERMISSION_REJECTED_MARKER =
  'is outside the folders this run is allowed to access';

export interface ToolPermissionRejection {
  tool: string;
  target: string | null;
}

const TARGET_KEYS = ['filePath', 'file_path', 'path', 'file', 'directory', 'pattern', 'command'] as const;
const MAX_TARGET_CHARS = 200;

export function createToolPermissionRejectionTracker() {
  const uses = new Map<string, { tool: string; input: unknown }>();
  let latest: ToolPermissionRejection | null = null;
  return {
    observe(ev: unknown) {
      if (!ev || typeof ev !== 'object') return;
      const event = ev as Record<string, unknown>;
      if (event.type === 'tool_use' && typeof event.id === 'string') {
        uses.set(event.id, {
          tool: typeof event.name === 'string' ? event.name : 'tool',
          input: event.input,
        });
        return;
      }
      if (
        event.type === 'tool_result' &&
        event.isError === true &&
        typeof event.content === 'string' &&
        event.content.includes(OPENCODE_PERMISSION_REJECTION_TEXT)
      ) {
        const use = typeof event.toolUseId === 'string' ? uses.get(event.toolUseId) : undefined;
        latest = { tool: use?.tool ?? 'tool', target: describeTarget(use?.input) };
      }
    },
    latest: () => latest,
  };
}

export function toolPermissionRejectionMessage(rejection: ToolPermissionRejection): string {
  const target = rejection.target ? ` on ${rejection.target}` : '';
  return (
    `The agent's ${rejection.tool} call${target} was blocked: the path ${TOOL_PERMISSION_REJECTED_MARKER}, ` +
    'and the agent stopped without producing output. Move the file into the project folder, or ask the agent to work inside the project, then retry.'
  );
}

function describeTarget(input: unknown): string | null {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      return truncate(input);
    }
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of TARGET_KEYS) {
    if (typeof record[key] === 'string' && record[key]) return truncate(record[key] as string);
  }
  return null;
}

function truncate(value: string): string {
  return value.length > MAX_TARGET_CHARS ? `${value.slice(0, MAX_TARGET_CHARS)}…` : value;
}
