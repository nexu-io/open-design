import { lstat, mkdir, realpath } from "node:fs/promises";
import { resolveElectronSessionPaths, resolveElectronSessionNamespace, acquireElectronSessionLease,
  type ElectronSessionScope } from "@open-design/electron-kit";
import resources from "../../../../config/standalone.json" with { type: "json" };
import { withElectronStoppedResourceSet } from "../../standalone/guarded-lifecycle.ts";
import { validateElectronPhysicalResourceSet } from "../../standalone/physical-resources.ts";

/** Caller owns mutation policy. This guard never stops a consumer to make room. */
export async function withStoppedElectronSession<T>(session: ElectronSessionScope,
  operation: (paths: Readonly<{ namespaceRoot: string }>) => Promise<T>): Promise<T> {
  const paths = resolveElectronSessionPaths(session);
  const info = await lstat(paths.namespaceRoot);
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(paths.namespaceRoot) !== paths.namespaceRoot) {
    throw new Error("Electron maintenance requires a canonical existing namespace directory");
  }
  const scope = { channel: session.channel, namespace: resolveElectronSessionNamespace(session.namespace, session.presentation) };
  return withElectronStoppedResourceSet(validateElectronPhysicalResourceSet(resources), scope, async () => {
    // A failed pre-launch attempt may not have created the carrier's lease root.
    await mkdir(paths.runtimeRoot, { recursive: true });
    const lease = await acquireElectronSessionLease(paths.runtimeRoot);
    try { return await operation(Object.freeze({ namespaceRoot: paths.namespaceRoot })); }
    finally { await lease.release(); }
  });
}
