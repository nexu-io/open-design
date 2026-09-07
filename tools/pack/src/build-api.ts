import { managedDownload } from "@open-design/download";
import { basename, isAbsolute, join } from "node:path";

/** Local immutable build-input reuse, independent of any Shell or native builder. */
export async function acquireBuildArchive(input: Readonly<{ cacheRoot: string; fileName: string; url: string; sha256: string }>) {
  const url = new URL(input.url);
  if (!isAbsolute(input.cacheRoot) || !input.fileName || basename(input.fileName) !== input.fileName
    || /[\\/\u0000-\u001f]/u.test(input.fileName) || !/^[a-f0-9]{64}$/u.test(input.sha256)
    || url.protocol !== "https:" || url.username || url.password) throw new Error("invalid immutable build archive input");
  return managedDownload({ basePath: join(input.cacheRoot, "build-inputs"), bucket: "archives", fileName: input.fileName,
    payload: { url: input.url, checksum: { algorithm: "sha256", value: input.sha256 } }, signal: AbortSignal.timeout(120_000) });
}
