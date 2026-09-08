import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { Script, constants } from "node:vm";
import { canonicalJson, standaloneTreeSha256, verifyDocument, type SignedDocument, type StandaloneShellIdentity, type StandaloneTrustedKeyRing } from "@open-design/standalone";
import { resolveElectronCompositeShellIdentity, validateElectronCapsuleManifest, type ElectronCapsuleManifest, type ElectronCapsuleTarget } from "../../contracts/capsule.js";
import type { ElectronShellDefinition, ElectronShellManifest } from "../../contracts/index.js";
import type { ElectronCapsuleSession } from "./capsule-session.js";

export type ElectronCapsuleModule = Readonly<{
  createElectronCapsuleDefinition(manifest: ElectronShellManifest, shell: Readonly<StandaloneShellIdentity>): ElectronShellDefinition;
  runElectronCapsule(definition: ElectronShellDefinition, session: ElectronCapsuleSession): Promise<void>;
}>;
export type LoadedElectronCapsule = ElectronCapsuleModule & Readonly<{ shell: Readonly<StandaloneShellIdentity> }>;
export type LoadElectronCapsuleInput = Readonly<{
  envelope: SignedDocument<ElectronCapsuleManifest>;
  trustedKeys: StandaloneTrustedKeyRing;
  root: string;
  carrier: Readonly<{ target: ElectronCapsuleTarget; shell: StandaloneShellIdentity }>;
}>;

/** One loader per carrier process. Call only after stable OS identity/single
 * instance ownership. Acquisition and startup commit/recovery remain outside.
 * A failed load stays failed; this is not an in-process hot replacement API. */
export function createElectronCapsuleLoader(): (input: LoadElectronCapsuleInput) => Promise<LoadedElectronCapsule> {
  let selected: string | null = null;
  let loading: Promise<LoadedElectronCapsule> | null = null;
  return async input => {
    verifyDocument(input.envelope, input.trustedKeys);
    const manifest = validateElectronCapsuleManifest(input.envelope.document);
    const shell = resolveElectronCompositeShellIdentity(manifest, input.carrier);
    if (!isAbsolute(input.root) || resolve(input.root) !== input.root) throw new Error("Capsule root must be absolute and normalized");
    const selection = canonicalJson({ root: input.root, manifest, shell });
    if (selected != null && selected !== selection) throw new Error("Capsule replacement requires a new carrier process");
    if (loading != null) return loading;
    selected = selection;
    loading = (async () => {
      const root = await realpath(input.root);
      if (!(await lstat(root)).isDirectory() || JSON.stringify((await readdir(root)).sort()) !== '["capsule.cjs"]') throw new Error("Capsule materialization inventory mismatch");
      const entrypoint = join(root, manifest.entrypoint), info = await lstat(entrypoint);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("Capsule entrypoint must be a regular file");
      const bytes = await readFile(entrypoint);
      const treeSha256 = standaloneTreeSha256([{ path: manifest.entrypoint, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength }]);
      if (treeSha256 !== manifest.archive.treeSha256) throw new Error("Capsule materialization digest mismatch");
      // Execute the verified bytes, not a second path read through require's cache.
      // This is trusted main-process code, not a VM security sandbox.
      const module = { exports: {} as Partial<ElectronCapsuleModule> };
      const evaluate = new Script(`(function(exports,require,module,__filename,__dirname){${bytes.toString("utf8")}\n})`, {
        filename: entrypoint, importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
      }).runInThisContext();
      evaluate(module.exports, createRequire(entrypoint), module, entrypoint, root);
      if (typeof module.exports.createElectronCapsuleDefinition !== "function") throw new Error("Capsule module lacks its definition factory");
      if (typeof module.exports.runElectronCapsule !== "function") throw new Error("Capsule module lacks its startup entry");
      return Object.freeze({ shell, createElectronCapsuleDefinition: module.exports.createElectronCapsuleDefinition,
        runElectronCapsule: module.exports.runElectronCapsule });
    })();
    return loading;
  };
}
