import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export type ToolPackArtifactDescriptor = Readonly<{
  digest: `sha256:${string}`;
  path: string;
  size: number;
}>;

export async function describeToolPackArtifact(path: string | null): Promise<ToolPackArtifactDescriptor | null> {
  if (path == null) return null;
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  const metadata = await stat(path);
  return Object.freeze({
    digest: `sha256:${hash.digest("hex")}`,
    path,
    size: metadata.size,
  });
}
