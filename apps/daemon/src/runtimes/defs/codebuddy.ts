import { agentCapabilities } from '../capabilities.js';
import { DEFAULT_MODEL_OPTION } from '../models.js';
import type { RuntimeAgentDef } from '../types.js';

export const codebuddyAgentDef = {
    id: 'codebuddy',
    name: 'CodeBuddy Code',
    bin: 'codebuddy',
    versionArgs: ['--version'],
    helpArgs: ['-p', '--help'],
    capabilityFlags: {
      '--include-partial-messages': 'partialMessages',
      '--add-dir': 'addDir',
    },
    // CodeBuddy Code does not expose a models subcommand; ship placeholder
    // ids as hints. Users can supply other ids via the custom-model input.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
    ],
    buildArgs: (_prompt, _imagePaths, extraAllowedDirs = [], options = {}) => {
      const caps = agentCapabilities.get('codebuddy') || {};
      const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
      if (caps.partialMessages) {
        args.push('--include-partial-messages');
      }
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && d.length > 0,
      );
      if (dirs.length > 0 && caps.addDir !== false) {
        args.push('--add-dir', ...dirs);
      }
      args.push('--permission-mode', 'bypassPermissions');
      return args;
    },
    // CodeBuddy Code auto-loads `.mcp.json` from the project cwd at spawn,
    // same as Claude Code.
    externalMcpInjection: 'claude-mcp-json',
    promptViaStdin: true,
    promptInputFormat: 'stream-json',
    streamFormat: 'claude-stream-json',
} satisfies RuntimeAgentDef;
