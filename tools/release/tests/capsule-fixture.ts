import { createHash } from "node:crypto";
import { zipFixture } from "./archive-fixture.ts";
import { standaloneTreeSha256 } from "@open-design/standalone";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writePlatformFixture(root: string, target = "darwin-arm64") {
  await mkdir(root, { recursive: true });
  const archiveFile = join(root, "platform.zip"), resourceFile = join(root, "platform-resource.json");
  const bytes = Buffer.from("platform fixture bytes");
  await writeFile(archiveFile, bytes);
  await writeFile(resourceFile, JSON.stringify({ schemaVersion: 1, target,
    blob: { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, mediaType: "application/zip", sources: [] },
    treeSha256: "f".repeat(64), executables: [target === "win32-x64" ? "node.exe" : "bin/node"] }));
  return { target, archiveFile, resourceFile };
}

export async function capsuleFixture(source = "fixture Capsule module") {
  const bytes = await zipFixture({ "capsule.cjs": source });
  return { bytes, archive: { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length,
    treeSha256: standaloneTreeSha256([{ path: "capsule.cjs", size: Buffer.byteLength(source),
      sha256: createHash("sha256").update(source).digest("hex") }]) } };
}
