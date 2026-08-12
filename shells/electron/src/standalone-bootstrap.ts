import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  validateStandaloneBootstrapDescriptor,
  validateStandaloneBootstrapResult,
  type StandaloneBootstrapDescriptor,
  type StandaloneBootstrapResolution,
} from "@open-design/standalone-proto";

import { ElectronStandaloneLaunchError } from "./standalone-handoff.js";

const execFileAsync = promisify(execFile);

export async function resolveStandaloneViaOfficialNode(input: Readonly<{
  bootloaderPath: string;
  descriptor: StandaloneBootstrapDescriptor;
  nodeCommand: string;
}>): Promise<StandaloneBootstrapResolution> {
  const descriptor = validateStandaloneBootstrapDescriptor(input.descriptor);
  const exchangeRoot = join(
    descriptor.paths.runtimeRoot,
    "bootstrap",
    `${process.pid}-${randomUUID()}`,
  );
  const inputPath = join(exchangeRoot, "input.json");
  const resultPath = join(exchangeRoot, "result.json");
  await mkdir(exchangeRoot, { recursive: true });
  try {
    await writeFile(inputPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
    await execFileAsync(input.nodeCommand, [input.bootloaderPath], {
      env: {
        ...process.env,
        OD_STANDALONE_BOOTSTRAP_INPUT_V1: inputPath,
        OD_STANDALONE_BOOTSTRAP_RESULT_V1: resultPath,
      },
      windowsHide: true,
    });
    const result = validateStandaloneBootstrapResult(
      JSON.parse(await readFile(resultPath, "utf8")) as unknown,
    );
    if (result.outcome === "rejected") {
      throw new ElectronStandaloneLaunchError(
        result.error.code === "installer-required" ? "installer-required" : "standalone-start-failed",
        result.error.message,
      );
    }
    return result.resolution;
  } finally {
    await rm(exchangeRoot, { force: true, recursive: true }).catch(() => undefined);
  }
}

export function resolveElectronStandaloneTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | null {
  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) return `darwin-${arch}`;
  if (platform === "win32" && arch === "x64") return "win32-x64";
  return null;
}
