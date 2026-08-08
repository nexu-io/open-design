import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type ControlContext = Readonly<{
  roots: Readonly<{ dataRoot: string }>;
}>;

type Attached = Readonly<{
  waitUntilStopped(): Promise<void>;
}>;

type Attach = (options: Readonly<{
  startRuntime(context: ControlContext): Promise<unknown>;
}>) => Promise<Attached>;

const workspaceRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

async function loadAttach(relativePath: string, exportName: string): Promise<Attach> {
  const moduleUrl = pathToFileURL(join(workspaceRoot, relativePath)).href;
  const loaded = await import(moduleUrl) as Record<string, unknown>;
  const attach = loaded[exportName];
  if (typeof attach !== "function") throw new Error(`missing sidecar adapter export: ${exportName}`);
  return attach as Attach;
}

function stoppedLatch(): Readonly<{
  stop(): void;
  wait(): Promise<void>;
}> {
  let resolve!: () => void;
  const task = new Promise<void>((done) => {
    resolve = done;
  });
  return {
    stop: resolve,
    async wait() {
      return await task;
    },
  };
}

async function main(): Promise<void> {
  const role = process.argv.at(-1);
  if (role === "daemon") {
    const attachDaemonStandaloneSidecar = await loadAttach(
      "apps/daemon/src/sidecar/standalone-control.ts",
      "attachDaemonStandaloneSidecar",
    );
    const sidecar = await attachDaemonStandaloneSidecar({
      async startRuntime(context) {
        const stopped = stoppedLatch();
        let running = true;
        return {
          async registerWebUrl(url: string) {
            await writeFile(join(context.roots.dataRoot, "registered-web-url.txt"), url, "utf8");
          },
          async status() {
            return {
              pid: process.pid,
              state: running ? "running" : "stopped",
              url: running ? "http://127.0.0.1:43123" : null,
            } as const;
          },
          async stop() {
            running = false;
            stopped.stop();
          },
          async waitUntilStopped() {
            await stopped.wait();
          },
        };
      },
    });
    await sidecar.waitUntilStopped();
    return;
  }

  if (role === "web") {
    const attachWebStandaloneSidecar = await loadAttach(
      "apps/web/sidecar/standalone-control.ts",
      "attachWebStandaloneSidecar",
    );
    const sidecar = await attachWebStandaloneSidecar({
      async startRuntime() {
        const stopped = stoppedLatch();
        let running = true;
        return {
          async status() {
            return {
              pid: process.pid,
              state: running ? "running" : "stopped",
              updatedAt: new Date().toISOString(),
              url: running ? "http://127.0.0.1:43234" : null,
            } as const;
          },
          async stop() {
            running = false;
            stopped.stop();
          },
          async waitUntilStopped() {
            await stopped.wait();
          },
        };
      },
    });
    await sidecar.waitUntilStopped();
    return;
  }

  throw new Error(`unsupported normalized product sidecar role: ${String(role)}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
