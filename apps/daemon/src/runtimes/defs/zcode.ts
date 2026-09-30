import { DEFAULT_MODEL_OPTION } from './shared.js';
import { listZcodeSavedModels } from '../zcode-config.js';
import type { RuntimeAgentDef } from '../types.js';

export const zcodeAgentDef = {
    id: 'zcode',
    name: 'ZCode',
    // ZCode's app bundle exposes the CLI entrypoint under
    // `ZCode.app/Contents/Resources/glm/zcode.cjs`. Keep the logical CLI name
    // here; runtimes/executables.ts handles macOS app-bundle discovery plus
    // the process-level ZCODE_BIN override used for diagnostics/tests.
    bin: 'zcode',
    versionArgs: ['--version'],
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
    ],
    fetchModels: async (_resolvedBin, env) => {
      const homeDir = env.HOME || env.USERPROFILE;
      return listZcodeSavedModels({ ...(homeDir ? { homeDir } : {}) });
    },
    // Unlike prompt-style runtimes such as `kimi --prompt`, ZCode's viable
    // integration path is its long-lived stdio protocol server:
    //
    //   zcode app-server
    //
    // The daemon will need a dedicated adapter that speaks ZCode Protocol
    // methods like `session/create`, `session/send`, and `session/subscribe`
    // over stdin/stdout instead of sending the user prompt as plain argv or
    // raw stdin text.
    buildArgs: () => ['app-server'],
    // Placeholder stream format for the forthcoming protocol adapter.
    // This def is intentionally kept out of the runtime registry until the
    // daemon knows how to launch the bundle entrypoint and parse the stream.
    streamFormat: 'zcode-protocol',
    docsUrl: 'https://zcode.z.ai',
} satisfies RuntimeAgentDef;
