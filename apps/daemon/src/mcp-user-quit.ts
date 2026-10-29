import { readFile } from 'node:fs/promises';
import { uptime } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { isMcpUserQuitRecordActive, MCP_BOOTSTRAP_CONTRACT } from '@open-design/sidecar-proto';

const USER_QUIT_CODE = 'OD_MCP_USER_QUIT';

export class McpUserQuitError extends Error {
  readonly code = USER_QUIT_CODE;
  constructor() {
    super('OpenDesign was explicitly quit by the user. Open the app manually, then retry this request. MCP will not reopen it automatically during this system session.');
    this.name = 'McpUserQuitError';
  }
}

/** Error codes survive separately bundled copies of this module. */
export function isMcpUserQuitError(error: unknown): error is Error & { code: string } {
  return error != null && typeof error === 'object'
    && 'code' in error && error.code === USER_QUIT_CODE;
}

/** The registering daemon supplies its resolved root; never infer one from cwd. */
export async function assertMcpNotUserQuit(env: NodeJS.ProcessEnv): Promise<void> {
  const dataRoot = env.OD_DATA_DIR?.trim();
  if (!dataRoot || !isAbsolute(dataRoot)) return;
  let record: unknown;
  try {
    record = JSON.parse(await readFile(join(dataRoot, MCP_BOOTSTRAP_CONTRACT.USER_QUIT_FILE), 'utf8'));
  } catch {
    return;
  }
  if (isMcpUserQuitRecordActive(record, Date.now(), uptime())) throw new McpUserQuitError();
}
