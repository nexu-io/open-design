import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";

import {
  StandaloneFeedbackEmitter,
  cleanupStandaloneTrash,
  compareVersions,
  deriveMinimumShellVersion,
  discardStandaloneStoreEntry,
  ensureStandaloneBlob,
  materializeStandaloneBlob,
  sha256Hex,
  standaloneTreeSha256,
  withStandaloneMaintenanceLock,
} from "../src/index.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("Standalone blob repository", () => {
  it("promotes a Shell candidate, repairs one corrupt CAS entry, and drains trash within a budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-blob-")); roots.push(root);
    const bytes = Buffer.from("shell carried resource");
    const digest = sha256Hex(bytes);
    const candidate = join(root, "carrier", "resource.bin");
    await mkdir(join(root, "carrier"), { recursive: true });
    await writeFile(candidate, bytes);
    const events: unknown[] = [];
    const feedback = new StandaloneFeedbackEmitter("fixture", { channel: "somechan", namespace: "shared" }, (event) => { events.push(event); });
    const blob = { sha256: digest, size: bytes.length, mediaType: "application/octet-stream", sources: [{ kind: "remote" as const, url: "https://fixtures.invalid/resource.bin" }] };
    const first = await ensureStandaloneBlob(root, blob, { candidates: [{ path: candidate, source: "shell" }], feedback, resourceId: "resource" });
    expect(first).toMatchObject({ reused: false, source: "shell" });
    await writeFile(first.path, "corrupt");
    const repaired = await ensureStandaloneBlob(root, blob, { candidates: [{ path: candidate, source: "shell" }] });
    expect(await readFile(repaired.path)).toEqual(bytes);
    expect(await readdir(join(root, "trash"))).toHaveLength(1);
    expect(await cleanupStandaloneTrash(root, { maxEntries: 1, maxDurationMs: 10_000 })).toMatchObject({ attempted: 1, removed: 1, remaining: 0 });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ phase: "blob-resolution", source: "shell", state: "complete" })]));
  });

  it("materializes a verified zip tree and reuses it", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-tree-")); roots.push(root);
    const zip = new JSZip();
    zip.file("skills/SKILL.md", "# Skill\n");
    zip.file("runtime.json", "{}\n");
    const bytes = await zip.generateAsync({ type: "nodebuffer" });
    const blobPath = join(root, "resource.zip");
    await writeFile(blobPath, bytes);
    const entries = [
      { path: "runtime.json", sha256: sha256Hex(Buffer.from("{}\n")), size: 3 },
      { path: "skills/SKILL.md", sha256: sha256Hex(Buffer.from("# Skill\n")), size: 8 },
    ];
    const blob = { sha256: sha256Hex(bytes), size: bytes.length, mediaType: "application/zip", sources: [{ kind: "remote" as const, url: "https://fixtures.invalid/resource.zip" }] };
    const materialization = { type: "zip" as const, entrypoint: "skills/SKILL.md", treeSha256: standaloneTreeSha256(entries) };
    const first = await materializeStandaloneBlob(root, blob, blobPath, materialization, { resourceId: "skills" });
    expect(await readFile(first.entrypoint, "utf8")).toBe("# Skill\n");
    await expect(materializeStandaloneBlob(root, blob, blobPath, materialization)).resolves.toMatchObject({ path: first.path, reused: true });
  });

  it("keeps a build floor while the compatibility hash is stable and raises it when the hash changes", () => {
    const oldHash = createHash("sha256").update("old").digest("hex");
    const nextHash = createHash("sha256").update("next").digest("hex");
    expect(deriveMinimumShellVersion({ buildHash: oldHash, currentVersion: "0.3.0", previous: { buildHash: oldHash, minVersion: "0.1.0" } })).toBe("0.1.0");
    expect(deriveMinimumShellVersion({ buildHash: nextHash, currentVersion: "0.3.0", previous: { buildHash: oldHash, minVersion: "0.1.0" } })).toBe("0.3.0");
    expect(deriveMinimumShellVersion({ buildHash: oldHash, currentVersion: "0.3.0", previous: { buildHash: oldHash, minVersion: "0.4.0" } })).toBe("0.3.0");
  });

  it("orders non-stable Shell versions using SemVer precedence", () => {
    expect(compareVersions("1.2.3-somechan.2", "1.2.3-somechan.10")).toBeLessThan(0);
    expect(compareVersions("1.2.3-somechan.10", "1.2.3")).toBeLessThan(0);
    expect(compareVersions("1.2.3", "1.2.3-somechan.10")).toBeGreaterThan(0);
  });

  it("refuses to discard paths outside the Store", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-trash-")); roots.push(root);
    await expect(discardStandaloneStoreEntry(root, join(root, "..", "escape"))).rejects.toThrow("outside the live Store");
    await expect(stat(join(root, "trash"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("renews a long maintenance lease so a competing sweep cannot steal it", async () => {
    const root = await mkdtemp(join(tmpdir(), "standalone-maintenance-")); roots.push(root);
    const entered: string[] = [];
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolveFinish) => { releaseFirst = resolveFinish; });
    const timing = { heartbeatIntervalMs: 25, leaseDurationMs: 120 };
    const first = withStandaloneMaintenanceLock(root, async () => {
      entered.push("first");
      await firstMayFinish;
    }, timing);
    while (entered.length === 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
    const second = withStandaloneMaintenanceLock(root, async () => { entered.push("second"); }, timing);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    expect(entered).toEqual(["first"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(entered).toEqual(["first", "second"]);
  });
});
