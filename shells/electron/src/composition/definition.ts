import runtime from "../../config/runtime.json" with { type: "json" };
import manifest from "../../config/shell.json" with { type: "json" };
import macRuntime from "../../config/platforms/mac.json" with { type: "json" };
import windowsLifecycle from "../../config/platforms/windows.json" with { type: "json" };

import { createElectronFixtureStandaloneAuthorityFactory } from "@open-design/electron-kit/runtime";
import type {
  ElectronRuntimeConfig,
  ElectronShellDefinition,
  ElectronShellManifest,
} from "@open-design/electron-kit/runtime";
import type { ElectronMacRuntimePolicy } from "@open-design/electron-kit/macos";
import type { ElectronWindowsLifecyclePolicy } from "@open-design/electron-kit/windows";

import { createPlaceholderRendererAdapter } from "../adapters/renderer/placeholder.js";
import { createInstallerHandoffAdapter } from "../adapters/updater/installer.js";
import { createWindowsCommittedObserver } from "../adapters/windows/lifecycle.js";
import { assertShellWarmupBindings } from "./warmup-bindings.js";

export function createElectronShellDefinition(): ElectronShellDefinition {
  const shellManifest = manifest as ElectronShellManifest;
  const runtimeConfig = runtime as ElectronRuntimeConfig;
  const placeholder = createPlaceholderRendererAdapter(shellManifest.window.title);
  return Object.freeze({
    manifest: shellManifest,
    mac: macRuntime as ElectronMacRuntimePolicy,
    preflight: runtimeConfig.preflight,
    warmup: runtimeConfig.warmup,
    warmupExecutors: assertShellWarmupBindings(runtimeConfig.warmup, placeholder.warmupExecutors),
    renderer: placeholder.renderer,
    actions: Object.freeze({
      observeCommitted: createWindowsCommittedObserver(
        shellManifest,
        windowsLifecycle as ElectronWindowsLifecyclePolicy,
      ),
      openDeepLink(url: string) {
        console.info("[shell/electron] deep link", { url });
      },
      installUpdate: createInstallerHandoffAdapter(),
    }),
    createStandaloneAuthority: createElectronFixtureStandaloneAuthorityFactory(shellManifest),
  });
}
