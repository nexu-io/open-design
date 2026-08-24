import path from 'node:path';
import { agentCapabilities } from './capabilities.js';
import type { RuntimeAgentDef } from './types.js';
import type { RuntimeContext } from './types.js';

export const OPENCODE_SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions';
export const OPENCODE_WORKSPACE_DIR_FLAG = '--dir';
export const OPENCODE_AUTO_APPROVE_FLAG = '--auto';
export const OPENCODE_PURE_FLAG = '--pure';

export const OPENCODE_PERMISSION_CAPABILITY = {
  helpArgs: ['run', '--help'],
  capabilityFlags: {
    [OPENCODE_SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
    [OPENCODE_WORKSPACE_DIR_FLAG]: 'workspaceDir',
    [OPENCODE_AUTO_APPROVE_FLAG]: 'autoApprove',
    [OPENCODE_PURE_FLAG]: 'pureMode',
  },
} satisfies Pick<RuntimeAgentDef, 'helpArgs' | 'capabilityFlags'>;

export function appendOpenCodePermissionBypass(args: string[], agentId: string): void {
  if (agentCapabilities.get(agentId)?.skipPermissions) {
    args.push(OPENCODE_SKIP_PERMISSIONS_FLAG);
  }
}

type OpenCodeExecutableFamily = 'opencode2' | 'legacy' | 'unknown';

function openCodeExecutableFamily(executablePath?: string | null): OpenCodeExecutableFamily {
  if (!executablePath) return 'unknown';
  const ext = path.extname(executablePath);
  const base = path.basename(executablePath, ext).toLowerCase();
  if (base === 'opencode2') return 'opencode2';
  if (base === 'opencode' || base === 'opencode-cli') return 'legacy';
  return 'unknown';
}

export function appendOpenCodeWorkspaceDir(
  args: string[],
  agentId: string,
  runtimeContext: RuntimeContext = {},
): void {
  const cwd = typeof runtimeContext.cwd === 'string' && runtimeContext.cwd.length > 0
    ? runtimeContext.cwd
    : null;
  if (!cwd) return;

  const caps = agentCapabilities.get(agentId);
  if (caps?.workspaceDir) {
    args.push(OPENCODE_WORKSPACE_DIR_FLAG, cwd);
    return;
  }
  if (caps && caps.workspaceDir === false) {
    return;
  }

  // Preserve the historical workspace pin unless a help probe explicitly
  // proves the installed CLI build does not advertise `--dir`.
  args.push(OPENCODE_WORKSPACE_DIR_FLAG, cwd);
}

export function resolveOpenCodeConnectionApprovalFlag(
  agentId: string,
  executablePath?: string | null,
): string | null {
  const caps = agentCapabilities.get(agentId);
  if (caps?.pureMode) return OPENCODE_PURE_FLAG;
  if (caps?.autoApprove) return OPENCODE_AUTO_APPROVE_FLAG;

  switch (openCodeExecutableFamily(executablePath)) {
    case 'legacy':
      return OPENCODE_PURE_FLAG;
    case 'opencode2':
      return OPENCODE_AUTO_APPROVE_FLAG;
    default:
      return null;
  }
}
