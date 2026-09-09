import { createHash } from "node:crypto";
import JSZip from "jszip";
import { standaloneTreeSha256 } from "@open-design/standalone";

export async function capsuleFixture(source = "fixture Capsule module") {
  const zip = new JSZip();
  zip.file("capsule.cjs", source, { date: new Date("1980-01-01T00:00:00Z") });
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { bytes, archive: { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length,
    treeSha256: standaloneTreeSha256([{ path: "capsule.cjs", size: Buffer.byteLength(source),
      sha256: createHash("sha256").update(source).digest("hex") }]) } };
}
