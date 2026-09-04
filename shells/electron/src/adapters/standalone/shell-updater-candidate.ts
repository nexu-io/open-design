import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { canonicalJson, replaceFile, type LifecycleScope } from "@open-design/standalone";

import { ElectronReleaseExactFeed, type ElectronReleaseExactCandidate } from "./release-feed.js";

let sequence = 0;

export class ElectronStandaloneShellCandidateLedger {
  readonly path: string;

  constructor(storeRoot: string, scope: LifecycleScope, private readonly feed: ElectronReleaseExactFeed) {
    this.path = join(resolve(storeRoot), "channels", scope.channel, "namespaces", scope.namespace, "electron-shell-candidate.json");
  }

  async read(): Promise<ElectronReleaseExactCandidate | null> {
    try { return this.feed.validateCandidate(JSON.parse(await readFile(this.path, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }

  async write(candidate: ElectronReleaseExactCandidate): Promise<void> {
    const exact = this.feed.validateCandidate(candidate);
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.${sequence++}.tmp`;
    await writeFile(temporary, canonicalJson(exact), { encoding: "utf8", flag: "wx" });
    try { await replaceFile(temporary, this.path); }
    catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  }
}
