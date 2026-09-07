import { spawn } from "node:child_process";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { controlElectronDevelopment } from "@/lifecycle-api.js";

const mock = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("@open-design/sidecar", () => ({ launchSidecar: mock.launch }));
vi.mock("@open-design/electron-kit/dev", () => ({ prepareElectronDevShell: async () => ({ electronPath: "/electron", scene: { sceneRoot: "/scene" } }) }));
vi.mock("@/adapters/standalone/assemble-installation.ts", () => ({
  parseElectronInstallationInput: (value: unknown) => value,
  withElectronInstallation: async (_request: unknown, consume: (installation: unknown) => Promise<unknown>) => consume({ resourceDirectory: "/resources" }),
}));
vi.mock("@/adapters/standalone/installation.ts", () => ({ resolveElectronStandaloneTarget: () => "darwin-arm64", loadElectronStandaloneAuthorityResources: async () => [] }));
vi.mock("@/adapters/tools/observation.ts", () => ({ waitForElectronGeneration: async () => ({ state: "running" }) }));

const roots: string[] = [];
afterEach(async () => { vi.clearAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("passes the caller log descriptor to the physical launch without closing or replacing it", async () => {
  const root = await mkdtemp(join(tmpdir(), "electron-api-log-")); roots.push(root);
  const path = join(root, "desktop.log"), log = await open(path, "w");
  mock.launch.mockImplementation(async ({ logFd }: { logFd: number }) => {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["-e", "process.stderr.write('physical-child\\n')"], { stdio: ["ignore", logFd, logFd] });
      child.once("error", reject);
      child.once("exit", code => code === 0 ? resolve() : reject(new Error(`log child exited ${code}`)));
    });
    return { pid: process.pid };
  });
  try {
    await controlElectronDevelopment({ schemaVersion: 2, operation: "electron.dev.start", channel: "dev", namespace: "public-api",
      controlRuntimeRoot: root, installationRoot: join(root, "installation"), ownerPid: process.pid,
      installationInput: { channel: "dev", releaseVersion: "0.1.0", channelHeadUrl: "http://localhost/head", contentFile: "/content", trustFile: "/trust", seedFiles: ["/seed"] } }, { logFd: log.fd });
    expect(mock.launch).toHaveBeenCalledWith(expect.objectContaining({ logFd: log.fd, resources: expect.objectContaining({ ownerPid: process.pid }) }));
    await log.write("caller-still-owns-log\n");
  } finally { await log.close(); }
  expect(await readFile(path, "utf8")).toBe("physical-child\ncaller-still-owns-log\n");
});

it("rejects invalid descriptors before launching", async () => {
  await expect(controlElectronDevelopment({ schemaVersion: 2, operation: "electron.dev.status", channel: "dev", namespace: "public-api", controlRuntimeRoot: "/control" }, { logFd: -1 })).rejects.toThrow(/descriptor/u);
  expect(mock.launch).not.toHaveBeenCalled();
});
