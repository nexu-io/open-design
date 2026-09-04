import runtime from "../../config/runtime.json" with { type: "json" };
import manifest from "../../config/shell.json" with { type: "json" };
import standalone from "../../config/standalone.json" with { type: "json" };
import macRuntime from "../../config/platforms/mac.json" with { type: "json" };
import windowsLifecycle from "../../config/platforms/windows.json" with { type: "json" };

import type {
  ElectronRuntimeConfig,
  ElectronShellDefinition,
  ElectronShellManifest,
} from "@open-design/electron-kit/runtime";
import type { ElectronMacRuntimePolicy } from "@open-design/electron-kit/macos";
import type { ElectronWindowsLifecyclePolicy } from "@open-design/electron-kit/windows";

import { createElectronRendererAdapter } from "../adapters/renderer/renderer.js";
import { createElectronStandaloneAuthorityFactory } from "../adapters/standalone/authority.js";
import type { ElectronPhysicalResourceSetDeclaration } from "../adapters/standalone/physical-resources.js";
import { createInstallerHandoffAdapter } from "../adapters/updater/installer.js";
import { createWindowsCommittedObserver } from "../adapters/windows/lifecycle.js";
import { assertShellWarmupBindings } from "./warmup-bindings.js";

export function createElectronShellDefinition(installedManifest: ElectronShellManifest = manifest as ElectronShellManifest): ElectronShellDefinition {
  const shellManifest = installedManifest;
  const runtimeConfig = runtime as ElectronRuntimeConfig;
  const renderer = createElectronRendererAdapter(shellManifest.window.title);
  return Object.freeze({
    manifest: shellManifest,
    mac: macRuntime as ElectronMacRuntimePolicy,
    preflight: runtimeConfig.preflight,
    warmup: runtimeConfig.warmup,
    warmupExecutors: assertShellWarmupBindings(runtimeConfig.warmup, renderer.warmupExecutors),
    renderer: renderer.renderer,
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
    createStandaloneAuthority: createElectronStandaloneAuthorityFactory(
      shellManifest,
      standalone as ElectronPhysicalResourceSetDeclaration,
    ),
  });
}
