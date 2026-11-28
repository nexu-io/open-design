import { opencodeByokModelId } from '../byok-opencode.js';
import {
  OPENCODE_PERMISSION_CAPABILITY,
  appendOpenCodePermissionBypass,
  appendOpenCodeStandaloneServer,
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
    // OpenCode promotes nested directories to the enclosing Git worktree
    // unless its own directory flag is explicit. Managed OpenDesign projects
    // live under the development repository in local runs, so relying on
    // spawn({ cwd }) alone can make Write/Edit target the repo root instead
    // of the selected project. 2.x removed `--dir`; the helper keeps it for
    // 1.x binaries and falls back to cwd + OPENCODE_DISABLE_PROJECT_CONFIG
    // on the 2.x dialect.
    appendOpenCodeWorkspaceDir(args, runtimeContext.cwd, 'byok-opencode');
    appendOpenCodeStandaloneServer(args, 'byok-opencode');
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
