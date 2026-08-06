import { APP_KEYS, OPEN_DESIGN_SIDECAR_CONTRACT, type SidecarStamp } from "@open-design/sidecar-proto";
import { bootstrapSidecarRuntime, type SidecarRuntimeContext } from "@open-design/sidecar";
import { readProcessStamp } from "@open-design/platform";

import { startDaemonSidecar, type DaemonSidecarHandle } from "./server.js";

export function bootstrapDaemonSidecarRuntime(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): SidecarRuntimeContext<SidecarStamp> {
  const stamp = readProcessStamp(argv, OPEN_DESIGN_SIDECAR_CONTRACT);
  if (stamp == null) throw new Error("sidecar stamp is required");

  return bootstrapSidecarRuntime(stamp, env, {
    app: APP_KEYS.DAEMON,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });
}

export async function startAndReportDaemonSidecar(
  runtime: SidecarRuntimeContext<SidecarStamp>,
): Promise<DaemonSidecarHandle> {
  const server = await startDaemonSidecar(runtime);
  process.stdout.write(`${JSON.stringify(await server.status(), null, 2)}\n`);
  return server;
}
