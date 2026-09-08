import runtime from "../../config/runtime.json" with { type: "json" };
import appearance from "../../config/appearance.json" with { type: "json" };
import splashMedia from "../../config/splash-media.json" with { type: "json" };
import standalone from "../../config/standalone.json" with { type: "json" };
import macRuntime from "../../config/platforms/mac.json" with { type: "json" };
import windowsLifecycle from "../../config/platforms/windows.json" with { type: "json" };

import type {
  ElectronWarmupTopology,
  ElectronShellAppearance,
  ElectronShellDefinition,
  ElectronShellManifest,
  ElectronCapsuleSession,
} from "@open-design/electron-kit/runtime";
import type { ElectronMacRuntimePolicy } from "@open-design/electron-kit/macos";
import { createElectronStartupPresentation } from "@open-design/electron-capsule";
import type { ElectronWindowsLifecyclePolicy } from "@open-design/electron-kit/windows";

import { createElectronRendererAdapter } from "../adapters/renderer/renderer.js";
import { createElectronStandaloneAuthorityFactory } from "../adapters/standalone/authority.js";
import { resolveElectronChannelHeadOverride } from "../adapters/standalone/release-feed.js";
import type { ElectronPhysicalResourceSetDeclaration } from "../adapters/standalone/physical-resources.js";
import { createInstallerHandoffAdapter } from "../adapters/updater/installer.js";
import { createInstallerRecoveryIntentAdapter } from "../adapters/updater/installer-recovery.js";
import { createWindowsCommittedObserver } from "../adapters/windows/lifecycle.js";
import { assertShellWarmupBindings } from "./warmup-bindings.js";

export function createElectronShellDefinition(installedManifest: ElectronShellManifest, shell: ElectronCapsuleSession["shell"]): ElectronShellDefinition {
  const shellManifest = installedManifest;
  const warmup = runtime.warmup as ElectronWarmupTopology;
  const windowTitles: Readonly<Record<string, string>> = appearance.windowTitles;
  const shellAppearance: ElectronShellAppearance = {
    schemaVersion: 1,
    window: { ...appearance.window, title: windowTitles[shellManifest.channel] ?? appearance.window.title },
    splash: appearance.splash,
  };
  const renderer = createElectronRendererAdapter(shellAppearance.window.title);
  return Object.freeze({
    manifest: shellManifest,
    appearance: shellAppearance,
    createStartupPresentation: () => createElectronStartupPresentation({
      productName: shellManifest.productName, appearance: shellAppearance,
      media: splashMedia as Readonly<{ mimeType: "video/webm"; base64: string }>,
    }),
    mac: macRuntime as ElectronMacRuntimePolicy,
    warmup,
    warmupExecutors: assertShellWarmupBindings(warmup, renderer.warmupExecutors),
    renderer: renderer.renderer,
    rendererRecovery: runtime.rendererRecovery,
    actions: Object.freeze({
      observeCommitted: createWindowsCommittedObserver(
        shellManifest,
        windowsLifecycle as ElectronWindowsLifecyclePolicy,
      ),
      openDeepLink(url: string) {
        console.info("[shell/electron] deep link", { url });
      },
      installUpdate: createInstallerHandoffAdapter(),
      resolveInstallerRecovery: createInstallerRecoveryIntentAdapter(),
    }),
    createStandaloneAuthority: createElectronStandaloneAuthorityFactory(
      shellManifest,
      standalone as ElectronPhysicalResourceSetDeclaration,
      shell,
      { channelHeadUrl: resolveElectronChannelHeadOverride() },
    ),
  });
}
