import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describeElectronRuntimeDiagnostics, type ElectronDiagnosticSession } from "@open-design/shell-electron/lifecycle/inspection";
import { withStoppedElectronSession } from "@open-design/shell-electron/lifecycle/installed";
import { canonicalBytes, checkedFile, describeFile, readObject, writeObject } from "./control-common.ts";

const ownerFile = ".release-acceptance-owner.json";

export async function createAcceptanceScope(root: string, publication: string, scope: ElectronDiagnosticSession) {
  const { namespaceRoot } = describeElectronRuntimeDiagnostics(scope);
  await mkdir(dirname(namespaceRoot), { recursive: true });
  await mkdir(namespaceRoot); // Never adopt an existing user's namespace.
  const owner = { schemaVersion: 2, operation: "release.acceptance.scope", scope,
    token: randomUUID(), publication: await describeFile(publication) };
  await writeFile(join(namespaceRoot, ownerFile), canonicalBytes(owner), { flag: "wx", mode: 0o600 });
  await writeObject(join(root, "scope.json"), owner);
}

/** Only this invocation's successfully collected execution state is disposable.
 * Evidence and failure diagnostics stay in the execution workspace. */
export async function removeAcceptanceScope(root: string, publication: string, expected: ElectronDiagnosticSession) {
  const owner = await readObject(join(root, "scope.json"));
  if (owner.schemaVersion !== 2 || owner.operation !== "release.acceptance.scope"
    || typeof owner.token !== "string" || !/^[0-9a-f-]{36}$/u.test(owner.token)
    || !canonicalBytes(owner.scope).equals(canonicalBytes(expected))) throw new Error("Acceptance scope ownership mismatch");
  await checkedFile(owner.publication, "Acceptance scope publication", publication);
  const { namespaceRoot, runtimeLog } = describeElectronRuntimeDiagnostics(expected);
  const verify = async () => {
    const marker = join(namespaceRoot, ownerFile), info = await lstat(marker);
    if (!info.isFile() || info.isSymbolicLink() || !(await readFile(marker)).equals(canonicalBytes(owner))) throw new Error("Acceptance namespace owner marker mismatch");
  };
  await verify();
  await withStoppedElectronSession(expected, async paths => {
    if (paths.namespaceRoot !== namespaceRoot) throw new Error("Acceptance cleanup path mismatch");
    await verify();
    // Retention failure must preserve the namespace, not silently delete evidence.
    await copyFile(runtimeLog, join(root, "runtime.jsonl"));
    await rm(paths.namespaceRoot, { recursive: true });
  });
  await writeObject(join(root, "cleanup.json"), { schemaVersion: 1, operation: "release.acceptance.cleanup",
    scope: expected, removed: namespaceRoot });
}
