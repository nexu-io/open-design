import { opencodeByokModelId } from '../byok-opencode.js';
import {
  OPENCODE_PERMISSION_CAPABILITY,
  appendOpenCodePermissionBypass,
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
    if (typeof runtimeContext.cwd === 'string' && runtimeContext.cwd.length > 0) {
      // OpenCode promotes nested directories to the enclosing Git worktree
      // unless its own directory flag is explicit. Managed OpenDesign
      // projects live under the development repository in local runs, so
      // relying on spawn({ cwd }) alone can make Write/Edit target the repo
      // root instead of the selected project.
      args.push('--dir', runtimeContext.cwd);
    }
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
