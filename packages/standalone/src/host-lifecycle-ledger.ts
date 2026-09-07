import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { canonicalJson, validateStandaloneScope } from "./protocol.js";
import { initialSharedLifecycleState, validateSharedLifecycleState, type SharedLifecycleState } from "./shared-lifecycle.js";
import { replaceFile } from "./store.js";
import type { LifecycleScope } from "./launcher.js";
import type { StandaloneLifecycleStatePort } from "./host-lifecycle.js";

let sequence = 0;

export function standaloneHostLifecycleLedgerPath(storeRoot: string, scope: LifecycleScope): string {
  validateStandaloneScope(scope);
  return join(resolve(storeRoot), "channels", scope.channel, "namespaces", scope.namespace, "host-lifecycle.json");
}

/**
 * One durable logical ledger with atomic replacement and no independent lock.
 * The live Sidecar host is its sole normal writer; only a Shell continuation
 * holding the complete physical resource-set guard may write after retirement.
 */
export class StandaloneHostLifecycleLedger implements StandaloneLifecycleStatePort {
  readonly path: string;
  readonly scope: LifecycleScope;

  constructor(storeRoot: string, scope: LifecycleScope) {
    this.scope = Object.freeze({ ...validateStandaloneScope(scope) });
    this.path = standaloneHostLifecycleLedgerPath(storeRoot, this.scope);
  }

  async read(): Promise<SharedLifecycleState | null> {
    try {
      return validateSharedLifecycleState(JSON.parse(await readFile(this.path, "utf8")), this.scope);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    // Read-only fossil boundary: never drop an existing sealed transition when
    // upgrading the host. All subsequent writes use the shared canonical file.
    try {
      const legacy = join(dirname(this.path), "electron-lifecycle.json");
      return validateSharedLifecycleState(JSON.parse(await readFile(legacy, "utf8")), this.scope);
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
