import { attachWebStandaloneSidecar } from "./standalone-control.js";

async function main(): Promise<void> {
  const sidecar = await attachWebStandaloneSidecar();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void sidecar.stop();
    });
  }
  await sidecar.waitUntilStopped();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
