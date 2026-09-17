import { spawn } from "node:child_process";
import path from "node:path";

import { normalizeNamespace } from "@open-design/sidecar-proto";

export const PASEO_PORTS_PROJECT = "open-design";

export type PaseoWorkspaceAction = "run" | "status" | "stop";

export function parsePaseoWorkspaceAction(value: string): PaseoWorkspaceAction {
  if (value === "run" || value === "status" || value === "stop") return value;
  throw new Error(`unsupported Paseo workspace action: ${value} (expected run, status, or stop)`);
}

export function resolvePaseoWorkspaceNamespace(workspaceRoot: string): string {
  const normalizedRoot = workspaceRoot.split(String.fromCharCode(92)).join("/");
  return normalizeNamespace(path.posix.basename(normalizedRoot));
}

export function resolvePaseoLeasePorts(
  env: NodeJS.ProcessEnv,
): { daemonPort: string; webPort: string } | null {
  if (env.PORTS_PROJECT !== PASEO_PORTS_PROJECT) return null;
  const daemonPort = env.DAEMON_PORT;
  const webPort = env.WEB_PORT;
  if (daemonPort == null || webPort == null) {
    throw new Error("Open Design port lease is missing DAEMON_PORT or WEB_PORT");
  }
  return { daemonPort, webPort };
}

export async function runPaseoPortLease(workspaceRoot: string): Promise<void> {
  const child = spawn(
    "ports",
    [
      "run",
      PASEO_PORTS_PROJECT,
      "--",
      "corepack",
      "pnpm",
      "tools-dev",
      "paseo-workspace",
      "run",
    ],
    {
      cwd: workspaceRoot,
      detached: process.platform !== "win32",
      env: process.env,
      shell: false,
      stdio: "inherit",
    },
  );

  let forwardedSignal = false;
  const forwardSignal = (signal: NodeJS.Signals) => {
    forwardedSignal = true;
    child.kill(signal);
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    if (result.code !== 0 && !forwardedSignal) {
      throw new Error(
        result.signal == null
          ? `ports run exited with code ${result.code ?? "unknown"}`
          : `ports run exited from ${result.signal}`,
      );
    }
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}
