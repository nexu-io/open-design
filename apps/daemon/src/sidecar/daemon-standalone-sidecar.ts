import { attachDaemonStandaloneSidecar } from "./standalone-control.js";

async function main(): Promise<void> {
  const sidecar = await attachDaemonStandaloneSidecar();
  const stop = (): void => {
    void sidecar.stop().finally(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await sidecar.waitUntilStopped();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
