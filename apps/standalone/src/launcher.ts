import { pathToFileURL } from "node:url";

import {
  STANDALONE_BOOTLOADER_EXPORT_NAME,
  type StandaloneHandoff,
} from "@open-design/standalone-proto";

import {
  readStandaloneLauncherBootstrap,
  resolveStandaloneBodyBootloaderPath,
} from "./launcher-bootstrap.js";
import { attachStandaloneBodyBridge } from "./process-bridge.js";

type BootloaderModule = Readonly<Record<string, unknown>>;

function bodyHandoff(module: BootloaderModule): StandaloneHandoff {
  const handoff = module[STANDALONE_BOOTLOADER_EXPORT_NAME];
  if (typeof handoff !== "function") {
    throw new Error(
      `Standalone body bootloader must export ${STANDALONE_BOOTLOADER_EXPORT_NAME}()`,
    );
  }
  return handoff as StandaloneHandoff;
}

async function runStandaloneLauncher(): Promise<void> {
  const bootstrap = readStandaloneLauncherBootstrap();
  const bodyBootloaderPath = resolveStandaloneBodyBootloaderPath(bootstrap.descriptor);
  const module = await import(pathToFileURL(bodyBootloaderPath).href) as BootloaderModule;
  let resolveExit!: () => void;
  const exitRequested = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });
  const bridge = await attachStandaloneBodyBridge({
    descriptor: bootstrap.descriptor,
    handoff: bodyHandoff(module),
    onExitRequested: resolveExit,
  });
  let closing: Promise<void> | null = null;
  const close = async (): Promise<void> => {
    if (closing == null) closing = bridge.close();
    await closing;
    resolveExit();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
  await exitRequested;
  await close();
}

await runStandaloneLauncher().catch((error: unknown) => {
  process.stderr.write(
    `open-design standalone launcher failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
