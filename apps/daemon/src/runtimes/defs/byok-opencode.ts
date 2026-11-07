import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const byokOpenCodeAgentDef = {
  id: 'byok-opencode',
  name: 'BYOK OpenCode',
  // SDK-only transport: `opencode run --format json` spawning was removed.
  // `bin` / `versionArgs` / `streamFormat` / `buildArgs` remain only because
  // `RuntimeAgentDef` still requires them; they are not consulted on the
  // SDK path (`opencode-sdk-host.ts` + `opencode-sdk-events.ts`).
  bin: 'opencode',
  versionArgs: ['--version'],
  fallbackModels: [DEFAULT_MODEL_OPTION],
  buildArgs: (_prompt, _imagePaths, _extraAllowedDirs, _options, _runtimeContext) => {
    throw new Error('CLI removed, use SDK');
  },
  streamFormat: 'json-event-stream',
  supportsCustomModel: true,
  // Native SDK is the default and only transport for the opencode family.
  transport: 'sdk' as const,
} satisfies RuntimeAgentDef;
