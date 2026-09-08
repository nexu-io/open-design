import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { build } from "esbuild";
import JSZip from "jszip";
import { canonicalJson, standaloneTreeSha256 } from "@open-design/standalone";
import { validateElectronCapsuleContent, type ElectronCapsuleContent, type ElectronCapsuleTarget } from "../contracts/capsule.js";

const sha256 = (body: Uint8Array) => createHash("sha256").update(body).digest("hex");
export type BuildElectronCapsuleContentInput = Readonly<{
  entryPath: string;
  outputRoot: string;
  target: ElectronCapsuleTarget;
}>;

/** Produce a self-contained CommonJS payload. The fixed preload and carrier
 * remain separate inputs; this function owns no cache, signatures or selection. */
export async function buildElectronCapsuleContent(input: BuildElectronCapsuleContentInput): Promise<Readonly<{
  content: ElectronCapsuleContent; contentPath: string; archivePath: string;
}>> {
  if (!isAbsolute(input.entryPath) || !isAbsolute(input.outputRoot) || resolve(input.outputRoot) !== input.outputRoot) throw new Error("Capsule build paths must be absolute and normalized");
  const bundled = await build({ entryPoints: [input.entryPath], bundle: true, external: ["electron"],
    format: "cjs", platform: "node", target: "node24", write: false, legalComments: "none" });
  if (bundled.outputFiles.length !== 1) throw new Error("Capsule must produce one self-contained module");
  const module = bundled.outputFiles[0]!.contents;
  const zip = new JSZip();
  zip.file("capsule.cjs", module, { createFolders: false, date: new Date("1980-01-01T00:00:00Z"), unixPermissions: 0o100644 });
  const body = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 }, platform: "UNIX" });
  const content = validateElectronCapsuleContent({ schemaVersion: 1, protocol: "electron-capsule-v1",
    target: input.target, entrypoint: "capsule.cjs",
    archive: { sha256: sha256(body), size: body.byteLength, treeSha256: standaloneTreeSha256([{ path: "capsule.cjs", sha256: sha256(module), size: module.byteLength }]) },
  });
  // Fresh output only: never overwrite an existing artifact or a user directory.
  await mkdir(dirname(input.outputRoot), { recursive: true });
  await mkdir(input.outputRoot);
  const archivePath = join(input.outputRoot, "capsule.zip"), contentPath = join(input.outputRoot, "capsule-content.json");
  await writeFile(archivePath, body, { flag: "wx" });
  await writeFile(contentPath, canonicalJson(content), { flag: "wx" });
  return Object.freeze({ content, contentPath, archivePath });
}
