import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  replaceFile,
  SHELL_UPDATE_ALGEBRA,
  type LifecycleScope,
  type StandaloneShellUpdaterCommand,
  type StandaloneShellUpdaterSnapshot,
} from "@open-design/standalone";

let sequence = 0;

export function electronStandaloneShellUpdaterLedgerPath(storeRoot: string, scope: LifecycleScope): string {
  return join(resolve(storeRoot), "channels", scope.channel, "namespaces", scope.namespace, "electron-shell-updater.json");
}

/**
 * The Sidecar host is the normal writer. After physical retirement, the Shell
 * continuation holding the resource-set guard may finish the same durable
 * transition directly; there is deliberately no second cross-process lock.
 */
export class ElectronStandaloneShellUpdaterLedger {
  readonly path: string;

  constructor(storeRoot: string, readonly scope: LifecycleScope, readonly shellType: string) {
    this.path = electronStandaloneShellUpdaterLedgerPath(storeRoot, scope);
  }

  async read(): Promise<StandaloneShellUpdaterSnapshot> {
    try {
      const snapshot = SHELL_UPDATE_ALGEBRA.validate(JSON.parse(await readFile(this.path, "utf8")));
      if (snapshot.shellType !== this.shellType) throw new Error("Electron Shell updater ledger belongs to another Shell type");
      return snapshot;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return SHELL_UPDATE_ALGEBRA.initial(this.shellType);
      throw error;
    }
  }

  async write(snapshot: StandaloneShellUpdaterSnapshot): Promise<void> {
    const exact = SHELL_UPDATE_ALGEBRA.validate(snapshot);
    if (exact.shellType !== this.shellType) throw new Error("Electron Shell updater ledger belongs to another Shell type");
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.${sequence++}.tmp`;
    await writeFile(temporary, `${JSON.stringify(exact)}\n`, { encoding: "utf8", flag: "wx" });
    try { await replaceFile(temporary, this.path); }
    catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  }

  async update(command: StandaloneShellUpdaterCommand): Promise<StandaloneShellUpdaterSnapshot> {
    const next = SHELL_UPDATE_ALGEBRA.reduce(await this.read(), command);
    await this.write(next);
    return next;
  }
}
