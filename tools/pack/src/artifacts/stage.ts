import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { downloadCopyAndClear } from "@open-design/download";
import { parsePublishedInstaller } from "@open-design/release";
import { resolveToolPackConfig } from "../config/index.js";
import { resolveMacPaths } from "../mac/paths.js";
import { resolveWinPaths } from "../win/paths.js";
import { publishedLinuxAppImagePath } from "../linux.js";

/** Stage a verified installer; publication selection belongs to tools-release. */
export async function stagePublishedArtifact(reference: string, options: { dir?: string; namespace?: string; buildJson?: string }): Promise<void> {
  const artifact = parsePublishedInstaller(JSON.parse(readFileSync(reference, "utf8")));
  const dir = options.dir || process.env.TOOLS_PACK_DIR;
  const namespace = options.namespace || process.env.RELEASE_NAMESPACE;
  const buildJson = options.buildJson || process.env.BUILD_JSON_PATH;
  if (!dir || !namespace || !buildJson) throw new Error("stage-artifact requires dir, namespace and build JSON path");
  const platform = artifact.target.startsWith("mac_") ? "mac" : artifact.target === "win_x64" ? "win" : "linux";
  const config = resolveToolPackConfig(platform, { dir, namespace, appVersion: artifact.releaseVersion });
  const destination = platform === "mac" ? resolveMacPaths(config).dmgPath : platform === "win" ? resolveWinPaths(config).setupPath : publishedLinuxAppImagePath(config);
  const { bytes } = await downloadCopyAndClear({
    basePath: join(config.roots.output.namespaceRoot, "downloads"), bucket: "published-installer", fileName: "installer",
    payload: { url: artifact.url, checksum: { algorithm: "sha256", value: artifact.sha256 } },
    outputPath: destination, maxAttempts: 1, signal: AbortSignal.timeout(600_000),
  });
  mkdirSync(dirname(buildJson), { recursive: true });
  writeFileSync(buildJson, JSON.stringify({
    source: "published-artifact", generatedAt: new Date().toISOString(), outputRoot: config.roots.output.root,
    releaseTarget: artifact.target, releaseVersion: artifact.releaseVersion, channel: artifact.channel, namespace,
    publishedArtifact: { bytes, name: artifact.name, sha256: artifact.sha256, url: artifact.url },
    [platform === "mac" ? "dmgPath" : platform === "win" ? "installerPath" : "appImagePath"]: destination,
    cacheReport: { entries: [] }, timings: [],
  }, null, 2) + "\n");
  for (const [key, value] of Object.entries({ artifact_path: destination, artifact_url: artifact.url, artifact_bytes: String(bytes) })) {
    console.log(`${key}=${value}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}
