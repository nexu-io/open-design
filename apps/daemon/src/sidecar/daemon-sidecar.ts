import {
  bootstrapDaemonSidecarRuntime,
  startAndReportDaemonSidecar,
} from "./runtime.js";

async function main(): Promise<void> {
  const runtime = bootstrapDaemonSidecarRuntime();
  const server = await startAndReportDaemonSidecar(runtime);
  await server.waitUntilStopped();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
