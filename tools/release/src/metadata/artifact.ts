import { appendFileSync } from "node:fs";
import { parsePublishedInstaller, type PublishedInstaller } from "@open-design/release";
import { optional, required, requiredTarget, writeJson } from "../storage/common.ts";

type Metadata = {
  releaseVersion?: string;
  channel?: string;
  github?: { commit?: string };
  releaseTargets?: Record<string, { status?: string; artifacts?: Record<string, { name?: string; url?: string; sha256Url?: string }> }>;
};
const primary = { mac_arm64: "dmg", mac_x64: "dmg", win_x64: "installer", linux_x64: "appImage" } as const;

function output(key: string, value: string): void {
  console.log(`${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function read(url: string): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("release metadata requires public HTTPS");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  return response;
}

export async function readPublishedMetadata(url: string, expected: { version?: string; channel?: string; commit?: string }): Promise<Metadata> {
  const metadata = await (await read(url)).json() as Metadata;
  if (!metadata || typeof metadata.releaseVersion !== "string" || typeof metadata.channel !== "string") throw new Error("invalid version metadata");
  if (expected.version && metadata.releaseVersion !== expected.version) throw new Error("version metadata does not match the expected version");
  if (expected.channel && metadata.channel !== expected.channel) throw new Error("version metadata does not match the expected channel");
  if (expected.commit && metadata.github?.commit !== expected.commit) throw new Error("version metadata does not match the expected source commit");
  return metadata;
}

export async function resolvePublishedInstaller(metadata: Metadata, target: PublishedInstaller["target"]): Promise<PublishedInstaller> {
  const entry = metadata.releaseTargets?.[target];
  const asset = entry?.artifacts?.[primary[target]];
  if (entry?.status !== "published" || !asset?.url || !asset.sha256Url) throw new Error(`published target ${target} lacks an installer or sha256 sidecar`);
  const sha256 = (await (await read(asset.sha256Url)).text()).trim().split(/\s+/)[0]?.toLowerCase();
  return parsePublishedInstaller({ schemaVersion: 1, target, releaseVersion: metadata.releaseVersion,
    channel: metadata.channel, name: asset.name || primary[target], url: asset.url, sha256 });
}

export async function artifactCommand(action: string, options: { output?: string }): Promise<void> {
  if (action !== "plan" && action !== "resolve") throw new Error("artifact action must be plan or resolve");
  const metadata = await readPublishedMetadata(required("VERSION_METADATA_URL"), {
    version: optional("EXPECTED_VERSION"), channel: optional("EXPECTED_CHANNEL"), commit: optional("EXPECTED_COMMIT"),
  });
  if (action === "plan") {
    for (const target of Object.keys(primary)) {
      const entry = metadata.releaseTargets?.[target];
      output(target, String(entry?.status === "published" && entry.artifacts != null));
    }
    output("channel", metadata.channel!);
    output("release_version", metadata.releaseVersion!);
    return;
  }
  if (!options.output) throw new Error("artifact resolve requires --output");
  writeJson(options.output, await resolvePublishedInstaller(metadata, requiredTarget()));
}
