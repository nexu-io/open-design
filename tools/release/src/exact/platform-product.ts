import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateNodePlatformResource } from "@open-design/standalone/packages";
import { describeFile, readObject } from "./control-common.ts";

/** Promote neutral producer bytes. Publication URLs are signed composition,
 * never compiler inputs or an independently mutable platform feed. */
export async function preparePlatformProduct(input: Readonly<{
  target: string; resourceFile: string; archiveFile: string;
  outputDirectory: string; artifactBaseUrl: string;
}>) {
  const resource = validateNodePlatformResource(await readObject(input.resourceFile));
  const archive = await describeFile(input.archiveFile, "application/zip");
  if (resource.target !== input.target || resource.blob.sources.length !== 0
    || archive.sha256 !== resource.blob.sha256 || archive.size !== resource.blob.size) throw new Error("platform product binding mismatch");
  const name = `platform-${input.target}-${archive.sha256}.zip`;
  const root = join(resolve(input.outputDirectory), "artifacts");
  await mkdir(root, { recursive: true });
  const path = join(root, name);
  await copyFile(input.archiveFile, path);
  const copied = await describeFile(path, "application/zip");
  if (copied.sha256 !== archive.sha256 || copied.size !== archive.size) throw new Error("platform source changed during copy");
  return { archive: copied, resource: validateNodePlatformResource({ ...resource,
    blob: { ...resource.blob, sources: [{ kind: "remote", url: `${input.artifactBaseUrl.replace(/\/$/u, "")}/${name}` }] } }) };
}
