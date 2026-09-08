import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { Script, constants } from "node:vm";
import { canonicalJson, standaloneTreeSha256, verifyDocument, type SignedDocument, type StandaloneShellIdentity, type StandaloneTrustedKeyRing } from "@open-design/standalone";
import { resolveElectronCompositeShellIdentity, validateElectronCapsuleManifest, type ElectronCapsuleManifest, type ElectronCapsuleTarget } from "../../contracts/capsule.js";
import type { ElectronShellDefinition, ElectronShellManifest } from "../../contracts/index.js";
import type { ElectronCapsuleSession, ElectronCapsuleReady } from "./capsule-session.js";

export type ElectronCapsuleModule = Readonly<{
  createElectronCapsuleDefinition(manifest: ElectronShellManifest, shell: Readonly<StandaloneShellIdentity>): ElectronShellDefinition;
  runElectronCapsule(definition: ElectronShellDefinition, session: ElectronCapsuleSession): Promise<ElectronCapsuleReady>;
}>;
export type LoadedElectronCapsule = ElectronCapsuleModule & Readonly<{
  shell: Readonly<StandaloneShellIdentity>;
  selection: Readonly<{ envelope: SignedDocument<ElectronCapsuleManifest>; root: string; revision: number }>;
}>;
export type LoadElectronCapsuleInput = Readonly<{
  envelope: SignedDocument<ElectronCapsuleManifest>;
  trustedKeys: StandaloneTrustedKeyRing;
  root: string;
  carrier: Readonly<{ target: ElectronCapsuleTarget; shell: StandaloneShellIdentity }>;
  selectionRevision?: number;
}>;

function selectCapsule(input: LoadElectronCapsuleInput) {
  verifyDocument(input.envelope, input.trustedKeys);
  const manifest = validateElectronCapsuleManifest(input.envelope.document);
  const shell = resolveElectronCompositeShellIdentity(manifest, input.carrier);
  if (!isAbsolute(input.root) || resolve(input.root) !== input.root) throw new Error("Capsule root must be absolute and normalized");
  return { root: input.root, manifest, shell };
}

async function readCapsuleSnapshot(selection: ReturnType<typeof selectCapsule>) {
  const { manifest, shell } = selection;
  const root = await realpath(selection.root);
  if (!(await lstat(root)).isDirectory() || JSON.stringify((await readdir(root)).sort()) !== '["capsule.cjs"]') throw new Error("Capsule materialization inventory mismatch");
  const entrypoint = join(root, manifest.entrypoint), info = await lstat(entrypoint);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Capsule entrypoint must be a regular file");
  const bytes = await readFile(entrypoint);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const treeSha256 = standaloneTreeSha256([{ path: manifest.entrypoint, sha256, size: bytes.byteLength }]);
  if (treeSha256 !== manifest.archive.treeSha256) throw new Error("Capsule materialization digest mismatch");
  return { root, manifest, shell, bytes, entrypoint, sha256 };
}

/** Authenticate an exact candidate without evaluating its code, consuming a
 * selection, or writing recovery state. This observation cannot authorize a
 * later load: the loader independently reads and executes verified bytes. */
export async function inspectElectronCapsule(input: LoadElectronCapsuleInput) {
  const snapshot = await readCapsuleSnapshot(selectCapsule(input));
  return Object.freeze({ root: snapshot.root, manifest: snapshot.manifest, shell: snapshot.shell,
    entrypoint: Object.freeze({ path: snapshot.manifest.entrypoint, sha256: snapshot.sha256, size: snapshot.bytes.length }) });
}

/** One loader per carrier process. Call only after stable OS identity/single
 * instance ownership. Acquisition and startup commit/recovery remain outside.
 * A failed load stays failed; this is not an in-process hot replacement API. */
export function createElectronCapsuleLoader(): (input: LoadElectronCapsuleInput) => Promise<LoadedElectronCapsule> {
  let selected: string | null = null;
  let loading: Promise<LoadedElectronCapsule> | null = null;
  return async input => {
    const snapshot = { ...input, envelope: structuredClone(input.envelope), carrier: structuredClone(input.carrier) };
    if (!Number.isSafeInteger(snapshot.selectionRevision ?? 0) || (snapshot.selectionRevision ?? 0) < 0) throw new Error("invalid Capsule selection revision");
    const candidate = selectCapsule(snapshot);
    const selection = canonicalJson({ ...candidate, envelope: snapshot.envelope, revision: snapshot.selectionRevision ?? 0 });
    if (selected != null && selected !== selection) throw new Error("Capsule replacement requires a new carrier process");
    if (loading != null) return loading;
    selected = selection;
    loading = (async () => {
      const { root, shell, entrypoint, bytes } = await readCapsuleSnapshot(candidate);
      // Execute the verified bytes, not a second path read through require's cache.
      // This is trusted main-process code, not a VM security sandbox.
      const module = { exports: {} as Partial<ElectronCapsuleModule> };
      const evaluate = new Script(`(function(exports,require,module,__filename,__dirname){${bytes.toString("utf8")}\n})`, {
        filename: entrypoint, importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
      }).runInThisContext();
      evaluate(module.exports, createRequire(entrypoint), module, entrypoint, root);
      if (typeof module.exports.createElectronCapsuleDefinition !== "function") throw new Error("Capsule module lacks its definition factory");
      if (typeof module.exports.runElectronCapsule !== "function") throw new Error("Capsule module lacks its startup entry");
      return Object.freeze({ shell, selection: Object.freeze({ envelope: snapshot.envelope, root: snapshot.root, revision: snapshot.selectionRevision ?? 0 }),
        createElectronCapsuleDefinition: module.exports.createElectronCapsuleDefinition,
        runElectronCapsule: module.exports.runElectronCapsule });
    })();
    return loading;
  };
}
