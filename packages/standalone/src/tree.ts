import { createHash } from "node:crypto";
import { canonicalJson } from "./protocol.js";

export type StandaloneTreeEntry = Readonly<{ path: string; sha256: string; size: number }>;

/** Pure tree identity shared by producers and materialization verification. */
export function standaloneTreeSha256(entries: readonly StandaloneTreeEntry[]): string {
  return createHash("sha256").update(canonicalJson([...entries].sort((left, right) => left.path.localeCompare(right.path)))).digest("hex");
}
