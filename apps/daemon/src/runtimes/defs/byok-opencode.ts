import { opencodeByokModelId } from '../byok-opencode.js';
import {
  OPENCODE_PERMISSION_CAPABILITY,
  appendOpenCodePermissionBypass,
  appendOpenCodeWorkspaceDir,
} from '../opencode-permissions.js';
import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const byokOpenCodeAgentDef = {
  id: 'byok-opencode',
  name: 'BYOK OpenCode',
  bin: 'opencode-cli',
  fallbackBins: ['opencode'],
  versionArgs: ['--version'],
  ...OPENCODE_PERMISSION_CAPABILITY,
  fallbackModels: [DEFAULT_MODEL_OPTION],
  buildArgs: (_prompt, _imagePaths, _extra, options = {}, runtimeContext = {}) => {
    const args = ['run', '--format', 'json'];
    // 1.x pinned the workspace via `--dir <cwd>`; 2.x removed the flag and
    // `run` has no directory positional, so the spawn cwd (project dir) is
    // the only pin. `appendOpenCodeWorkspaceDir` is a documented no-op.
    appendOpenCodeWorkspaceDir(args, runtimeContext.cwd);
    appendOpenCodePermissionBypass(args, 'byok-opencode');
    const model = opencodeByokModelId(options.model);
    if (model) args.push('-m', model);
    return args;
  },
  promptViaStdin: true,
  streamFormat: 'json-event-stream',
  eventParser: 'opencode',
  externalMcpInjection: 'opencode-env-content',
  supportsCustomModel: true,
} satisfies RuntimeAgentDef;
