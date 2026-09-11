import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createAcceptanceScope, removeAcceptanceScope } from "@/exact/acceptance-scope.ts";

const state = vi.hoisted(() => ({ root: "", guard: vi.fn() }));
vi.mock("@open-design/shell-electron/lifecycle/inspection", () => ({
  describeElectronRuntimeDiagnostics: () => ({ namespaceRoot: join(state.root, "namespace"), runtimeLog: join(state.root, "namespace/runtime.jsonl") }),
}));
vi.mock("@open-design/shell-electron/lifecycle/installed", () => ({ withStoppedElectronSession: state.guard }));
const roots: string[] = [];
afterEach(async () => { vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  state.root = await mkdtemp(join(tmpdir(), "acceptance-scope-")); roots.push(state.root);
  const evidence = join(state.root, "evidence"), publication = join(state.root, "publication.json");
  await writeFile(publication, "{}");
  const scope = { productName: "Fixture", channel: "betahyx", namespace: "accept-test", presentation: "headless" as const };
  state.guard.mockImplementation(async (_scope, operation) => operation({ namespaceRoot: join(state.root, "namespace") }));
  return { evidence, publication, scope, namespaceRoot: join(state.root, "namespace") };
}
it("removes only its owned namespace after the stop guard, retaining evidence", async () => {
  const f = await fixture(); await createAcceptanceScope(f.evidence, f.publication, f.scope);
  await writeFile(join(f.namespaceRoot, "runtime.jsonl"), "verified runtime evidence");
  await removeAcceptanceScope(f.evidence, f.publication, f.scope);
  expect(state.guard).toHaveBeenCalledOnce();
  await expect(readFile(join(f.namespaceRoot, ".release-acceptance-owner.json"))).rejects.toThrow();
  expect(JSON.parse(await readFile(join(f.evidence, "cleanup.json"), "utf8"))).toMatchObject({ removed: f.namespaceRoot });
  await expect(readFile(join(f.evidence, "scope.json"))).resolves.toBeDefined();
  expect(await readFile(join(f.evidence, "runtime.jsonl"), "utf8")).toBe("verified runtime evidence");
});
it("never adopts an existing namespace", async () => {
  const f = await fixture(); await mkdir(f.namespaceRoot);
  await expect(createAcceptanceScope(f.evidence, f.publication, f.scope)).rejects.toThrow();
  await expect(readFile(join(f.evidence, "scope.json"))).rejects.toThrow();
});
it.each(["scope", "publication", "marker", "symlink", "live"])("retains state on %s mismatch", async fault => {
  const f = await fixture(); await createAcceptanceScope(f.evidence, f.publication, f.scope);
  const marker = join(f.namespaceRoot, ".release-acceptance-owner.json");
  if (fault === "publication") await writeFile(f.publication, '{"changed":true}');
  if (fault === "marker") await writeFile(marker, "{}");
  if (fault === "symlink") { await rm(marker); await symlink(join(f.evidence, "scope.json"), marker); }
  if (fault === "live") state.guard.mockRejectedValueOnce(new Error("session owned"));
  await expect(removeAcceptanceScope(f.evidence, f.publication, fault === "scope" ? { ...f.scope, namespace: "other" } : f.scope)).rejects.toThrow();
  await expect(readFile(marker)).resolves.toBeDefined();
  await expect(readFile(join(f.evidence, "cleanup.json"))).rejects.toThrow();
});
