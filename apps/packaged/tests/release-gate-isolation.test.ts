import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PackagedConfig } from "../src/config.js";
import { resolvePackagedNamespacePaths } from "../src/paths.js";
// Public subpath export (CW-08 consumers use this same resolver). Importing
// the built package keeps the test inside the packaged `rootDir` for typecheck
// while still asserting against the real Creator-backup root resolver.
import { resolveCreatorBackupRoot } from "@open-design/daemon/creator-backup";

function isWithin(base: string, target: string): boolean {
  const rel = relative(resolve(base), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function makeConfig(namespaceBaseRoot: string, namespace: string): PackagedConfig {
  return {
    amrProfile: null,
    appVersion: null,
    daemonCliEntry: null,
    daemonSidecarEntry: null,
    namespace,
    namespaceBaseRoot,
    nodeCommand: null,
    posthogHost: null,
    posthogKey: null,
    resourceRoot: join(namespaceBaseRoot, "resources", "open-design"),
    telemetryRelayUrl: null,
    updateMetadataUrl: null,
    webOutputMode: "server",
    webSidecarEntry: null,
    webStandaloneRoot: null,
  };
}

describe("CW-09 desktop release isolation contract", () => {
  const roots: string[] = [];

  beforeEach(() => {
    roots.push(mkdtempSync(join(tmpdir(), "od-cw09-iso-")));
  });

  afterEach(() => {
    while (roots.length > 0) {
      const root = roots.pop();
      if (root != null) rmSync(root, { force: true, recursive: true });
    }
  });

  it("models data/update/runtime/installation roots as isolated namespace-scoped siblings", () => {
    const base = roots[roots.length - 1];
    const namespace = "cw09-smoke";
    const config = makeConfig(base, namespace);
    const paths = resolvePackagedNamespacePaths(config, namespace);

    const namespaceRoot = join(base, namespace);
    expect(paths.namespaceRoot).toBe(namespaceRoot);
    expect(paths.dataRoot).toBe(join(namespaceRoot, "data"));
    expect(paths.updateRoot).toBe(join(namespaceRoot, "updates"));
    expect(paths.runtimeRoot).toBe(join(namespaceRoot, "runtime"));
    expect(paths.installationRoot).toBe(join(base, ".."));

    // None of the release-relevant roots is contained within another: a
    // faulty resolver that nested data inside updates (or vice versa) would
    // let an updater rollback clobber user data.
    expect(isWithin(paths.dataRoot, paths.updateRoot)).toBe(false);
    expect(isWithin(paths.updateRoot, paths.dataRoot)).toBe(false);
    expect(isWithin(paths.dataRoot, paths.runtimeRoot)).toBe(false);
    expect(isWithin(paths.runtimeRoot, paths.dataRoot)).toBe(false);
    expect(isWithin(paths.updateRoot, paths.runtimeRoot)).toBe(false);
    expect(isWithin(paths.runtimeRoot, paths.updateRoot)).toBe(false);

    // All four share the same parent (the namespace root), which is the
    // structural guarantee of isolation.
    expect(join(paths.dataRoot, "..")).toBe(namespaceRoot);
    expect(join(paths.updateRoot, "..")).toBe(namespaceRoot);
    expect(join(paths.runtimeRoot, "..")).toBe(namespaceRoot);
  });

  it("keeps the CW-08 Creator backup root separate from the updater payload rollback (.back)", () => {
    const base = roots[roots.length - 1];
    const namespace = "cw09-smoke";
    const config = makeConfig(base, namespace);
    const paths = resolvePackagedNamespacePaths(config, namespace);

    const backupRoot = resolveCreatorBackupRoot(paths.dataRoot);
    const namespaceRoot = paths.namespaceRoot;

    // CW-08 resolved the Creator backup root one level above the data dir,
    // outside it: <namespaceRoot>/backups/creator.
    expect(backupRoot).toBe(join(namespaceRoot, "backups", "creator"));

    // The Creator backup is a sibling of `data` and `updates`, never inside
    // either. The updater's payload-rollback directory lives at
    // <updateRoot>/.back — a DIFFERENT directory from the Creator backup.
    const backDir = join(paths.updateRoot, ".back");

    expect(backupRoot).not.toBe(paths.updateRoot);
    expect(backupRoot).not.toBe(backDir);
    expect(isWithin(paths.updateRoot, backupRoot)).toBe(false);
    expect(isWithin(backupRoot, paths.updateRoot)).toBe(false);
    expect(isWithin(backupRoot, backDir)).toBe(false);
    expect(isWithin(backDir, backupRoot)).toBe(false);
    expect(isWithin(paths.dataRoot, backupRoot)).toBe(false);
    expect(isWithin(backupRoot, paths.dataRoot)).toBe(false);
  });

  it("derives a distinct Creator backup root per namespace under a shared OD_DATA_DIR", () => {
    const base = roots[roots.length - 1];
    // An unscoped, absolute OD_DATA_DIR base; packaged appends the namespace.
    const config = makeConfig(base, "cw09-smoke");

    const nsA = "release-stable-win";
    const nsB = "release-beta-win";
    const dataRootA = resolvePackagedNamespacePaths(config, nsA, { OD_DATA_DIR: base }).dataRoot;
    const dataRootB = resolvePackagedNamespacePaths(config, nsB, { OD_DATA_DIR: base }).dataRoot;
    const backupRootA = resolveCreatorBackupRoot(dataRootA);
    const backupRootB = resolveCreatorBackupRoot(dataRootB);

    expect(dataRootA).not.toBe(dataRootB);
    expect(backupRootA).not.toBe(backupRootB);
    expect(backupRootA).toBe(join(base, "namespaces", nsA, "backups", "creator"));
    expect(backupRootB).toBe(join(base, "namespaces", nsB, "backups", "creator"));

    // Each namespace's Creator backup must stay out of that namespace's
    // updater area (so a rollback in one namespace never reaches another
    // namespace's Creator backups).
    const updateRootA = resolvePackagedNamespacePaths(config, nsA, { OD_DATA_DIR: base }).updateRoot;
    const updateRootB = resolvePackagedNamespacePaths(config, nsB, { OD_DATA_DIR: base }).updateRoot;
    expect(isWithin(updateRootA, backupRootA)).toBe(false);
    expect(isWithin(updateRootB, backupRootB)).toBe(false);
    expect(isWithin(backupRootA, updateRootB)).toBe(false);
  });

  it("does not write Creator backup artifacts into the updater update root", () => {
    const base = roots[roots.length - 1];
    const namespace = "cw09-smoke";
    const config = makeConfig(base, namespace);
    const paths = resolvePackagedNamespacePaths(config, namespace);
    const backupRoot = resolveCreatorBackupRoot(paths.dataRoot);

    // Materialise the layout the way a real packaged launch would.
    mkdirSync(paths.dataRoot, { recursive: true });
    mkdirSync(paths.updateRoot, { recursive: true });
    mkdirSync(backupRoot, { recursive: true });

    // Seed a CW-08 Creator backup snapshot file and a planted guard file in
    // the update root; nothing in the release-gate path may move the backup
    // under updates, nor must the update root absorb the backup.
    writeFileSync(join(backupRoot, "creator-backup:seed.json"), "{}");
    writeFileSync(join(paths.updateRoot, ".keep"), "");

    expect(join(backupRoot, "..")).toBe(join(paths.namespaceRoot, "backups"));
    expect(isWithin(paths.updateRoot, backupRoot)).toBe(false);
    expect(isWithin(backupRoot, paths.updateRoot)).toBe(false);
  });
});
