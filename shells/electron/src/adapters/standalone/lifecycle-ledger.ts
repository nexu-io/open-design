import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  canonicalJson,
  initialSharedLifecycleState,
  replaceFile,
  validateSharedLifecycleState,
  type LifecycleScope,
  type SharedLifecycleState,
} from "@open-design/standalone";

import type { ElectronStandaloneLifecycleStatePort } from "./host-lifecycle.js";

let sequence = 0;

export function electronStandaloneLifecycleLedgerPath(storeRoot: string, scope: LifecycleScope): string {
  return join(resolve(storeRoot), "channels", scope.channel, "namespaces", scope.namespace, "electron-lifecycle.json");
}

/**
 * One durable logical ledger with atomic replacement and no independent lock.
 * The live Sidecar host is its sole normal writer; only a Shell continuation
 * holding the complete physical resource-set guard may write after retirement.
 */
export class ElectronStandaloneLifecycleLedger implements ElectronStandaloneLifecycleStatePort {
  readonly path: string;

  constructor(storeRoot: string, readonly scope: LifecycleScope) {
    this.path = electronStandaloneLifecycleLedgerPath(storeRoot, scope);
  }

  async read(): Promise<SharedLifecycleState | null> {
    try {
      return validateSharedLifecycleState(JSON.parse(await readFile(this.path, "utf8")), this.scope);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async write(state: SharedLifecycleState): Promise<void> {
    const exact = validateSharedLifecycleState(state, this.scope);
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.${sequence++}.tmp`;
    await writeFile(temporary, canonicalJson(exact), { encoding: "utf8", flag: "wx" });
    try { await replaceFile(temporary, this.path); }
    catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  }

  async readOrInitial(): Promise<SharedLifecycleState> {
    return await this.read() ?? initialSharedLifecycleState(this.scope);
  }
}
