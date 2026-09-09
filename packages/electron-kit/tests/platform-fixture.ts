import type { NodePlatformResource } from "@open-design/standalone/packages";

export function platformFixture(target: NodePlatformResource["target"] = "darwin-arm64"): NodePlatformResource {
  return { schemaVersion: 1, target, treeSha256: "f".repeat(64),
    blob: { sha256: "e".repeat(64), size: 123, mediaType: "application/zip",
      sources: [{ kind: "remote", url: "https://fixture.invalid/platform.zip" }] },
    executables: [target === "win32-x64" ? "node.exe" : "bin/node"] };
}
