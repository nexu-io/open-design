import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  validateStandaloneBootstrapDescriptor,
  validateStandaloneBootstrapProgress,
  validateStandaloneBootstrapResult,
  type StandaloneBootstrapDescriptor,
  type StandaloneBootstrapProgress,
  type StandaloneBootstrapResolution,
} from "@open-design/standalone/protocol";

import { ElectronStandaloneLaunchError } from "./standalone-handoff.js";

async function runBootstrapChild(input: Readonly<{
  bootloaderPath: string;
  env: NodeJS.ProcessEnv;
  nodeCommand: string;
  onProgress?: (progress: StandaloneBootstrapProgress) => void;
}>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(input.nodeCommand, [input.bootloaderPath], {
      env: input.env,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-32 * 1024);
    });
    child.on("message", (message: unknown) => {
      try {
        const progress = validateStandaloneBootstrapProgress(message);
        input.onProgress?.(progress);
      } catch {
        // Progress IPC is optional; the result file remains the bootstrap authority.
      }
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim();
      reject(new Error(
        `Standalone bootstrap exited ${code == null ? `after signal ${signal ?? "unknown"}` : `with code ${code}`}`
        + (detail.length === 0 ? "" : `: ${detail}`),
      ));
    });
  });
}

export async function resolveStandaloneViaOfficialNode(input: Readonly<{
  bootloaderPath: string;
  descriptor: StandaloneBootstrapDescriptor;
  nodeCommand: string;
  onProgress?: (progress: StandaloneBootstrapProgress) => void;
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
    await runBootstrapChild({
      bootloaderPath: input.bootloaderPath,
      env: {
        ...process.env,
        OD_STANDALONE_BOOTSTRAP_INPUT_V1: inputPath,
        OD_STANDALONE_BOOTSTRAP_RESULT_V1: resultPath,
      },
      nodeCommand: input.nodeCommand,
      ...(input.onProgress == null ? {} : { onProgress: input.onProgress }),
    });
    const result = validateStandaloneBootstrapResult(
      JSON.parse(await readFile(resultPath, "utf8")) as unknown,
    );
    if (result.outcome === "rejected") {
      throw new ElectronStandaloneLaunchError(
        result.error.code === "installer-required"
          ? "installer-required"
          : result.error.code === "resource-unavailable"
            ? "resource-unavailable"
          : result.error.code === "standalone-occupied"
            ? "standalone-occupied"
            : "standalone-start-failed",
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
