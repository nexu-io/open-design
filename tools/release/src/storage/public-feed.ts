import { normalizePublicUrl } from "./common.ts";

type JsonRecord = Record<string, unknown>;

export type PublicFeedObservation = {
  checkedAt: string;
  expectedVersion: string;
  latestMetadataUrl: string;
  probes: Array<{
    contentLength: string | null;
    etag: string | null;
    status: number;
    url: string;
  }>;
  status: "success";
  versionMetadataUrl: string;
};

function assertRecord(value: unknown, label: string): asserts value is JsonRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

async function readMetadata(fetchImpl: typeof fetch, url: string, label: string): Promise<JsonRecord> {
  const response = await fetchImpl(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}: ${url}`);
  const value = await response.json() as unknown;
  assertRecord(value, label);
  return value;
}

function collectPublicFileUrls(value: unknown, publicOrigin: string): string[] {
  const origin = new URL(publicOrigin).origin;
  const urls = new Set<string>();
  const visit = (current: unknown): void => {
    if (typeof current === "string" && /^https?:\/\//.test(current)) {
      const normalized = normalizePublicUrl(current);
      if (normalized !== current) {
        throw new Error(`public metadata contains a non-canonical URL: ${current}`);
      }
      const parsed = new URL(current);
      if (parsed.origin === origin && !parsed.pathname.endsWith("/")) urls.add(current);
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (current != null && typeof current === "object") {
      for (const child of Object.values(current as JsonRecord)) visit(child);
    }
  };
  visit(value);
  return [...urls].sort();
}

export async function observePublicFeed(input: {
  expectedVersion: string;
  fetchImpl?: typeof fetch;
  latestMetadataUrl: string;
  publicOrigin: string;
  versionMetadataUrl: string;
}): Promise<PublicFeedObservation> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const latestMetadataUrl = normalizePublicUrl(input.latestMetadataUrl);
  const versionMetadataUrl = normalizePublicUrl(input.versionMetadataUrl);
  const [latest, version] = await Promise.all([
    readMetadata(fetchImpl, latestMetadataUrl, "latest public metadata"),
    readMetadata(fetchImpl, versionMetadataUrl, "version public metadata"),
  ]);

  for (const [label, metadata] of [["latest", latest], ["version", version]] as const) {
    if (metadata.releaseVersion !== input.expectedVersion) {
      throw new Error(`${label} public metadata version mismatch: expected ${input.expectedVersion}, got ${String(metadata.releaseVersion)}`);
    }
  }
  if (JSON.stringify(latest) !== JSON.stringify(version)) {
    throw new Error("latest and version public metadata differ");
  }

  const urls = collectPublicFileUrls(version, input.publicOrigin)
    .filter((url) => url !== latestMetadataUrl && url !== versionMetadataUrl);
  const probes = [];
  for (const url of urls) {
    const response = await fetchImpl(url, { method: "HEAD", redirect: "follow" });
    if (!response.ok) throw new Error(`public release object returned HTTP ${response.status}: ${url}`);
    probes.push({
      contentLength: response.headers.get("content-length"),
      etag: response.headers.get("etag"),
      status: response.status,
      url,
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    expectedVersion: input.expectedVersion,
    latestMetadataUrl,
    probes,
    status: "success",
    versionMetadataUrl,
  };
}
