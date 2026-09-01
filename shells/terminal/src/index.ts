import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { canonicalJson, replaceFile, type GenerationRecord, type LifecyclePort, type LifecycleStatus, type StandaloneUpdater, type UpdatePreparation, type VersionedLauncher } from "@open-design/standalone";

export const TERMINAL_SHELL_VERSION = "0.1.0";
export const OFFICIAL_NODE_VERSION = "24.18.0";
export const TERMINAL_SHELL_IDENTITY = Object.freeze({
  shell: "terminal",
  capabilities: ["exact-install", "lifecycle"] as const,
});

export function assertOfficialNodeVersion(version = process.versions.node): typeof OFFICIAL_NODE_VERSION {
  if (version !== OFFICIAL_NODE_VERSION) throw new Error(`Terminal carrier requires official Node ${OFFICIAL_NODE_VERSION}; got ${version}`);
  return OFFICIAL_NODE_VERSION;
}

export class FileFixtureLifecyclePort implements LifecyclePort {
  private readonly path: string;

  constructor(root: string, namespace: string) {
    this.path = join(root, "namespaces", namespace, "fixture-lifecycle.json");
  }

  private async read(): Promise<LifecycleStatus> {
    try { return JSON.parse(await readFile(this.path, "utf8")) as LifecycleStatus; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "stopped", generationId: null };
      throw error;
    }
  }

  private async write(status: LifecycleStatus): Promise<LifecycleStatus> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, canonicalJson(status), { encoding: "utf8", flag: "wx" });
    try { await replaceFile(temporary, this.path); }
    catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    return status;
  }

  start(generation: GenerationRecord): Promise<LifecycleStatus> {
    return this.write({ state: "running", generationId: generation.id });
  }

  status(): Promise<LifecycleStatus> { return this.read(); }

  async stop(): Promise<LifecycleStatus> {
    const current = await this.read();
    return this.write({ state: "stopped", generationId: current.generationId });
  }
}

export async function applyTerminalUpdate(updater: StandaloneUpdater, launcher: VersionedLauncher, preparation: UpdatePreparation): Promise<{ preparation: UpdatePreparation; lifecycle?: LifecycleStatus }> {
  if (preparation.status === "shell-reinstall-required") return { preparation };
  if (preparation.status === "current" && !preparation.applyRequired) return { preparation, lifecycle: await launcher.status() };
  return { preparation, lifecycle: await updater.applyNow(launcher) };
}
