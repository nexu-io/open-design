import { afterEach, expect, it, vi } from "vitest";
import { requestStorageObject } from "@/storage/s3-upload.ts";
import { versionInputStorage } from "@/exact/version-input-storage.ts";
import { resolveReleasePolicy } from "@/policy/release-profile.ts";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("freezes version inputs with create-only origin writes and rejects collisions", async () => {
  for (const [key, value] of Object.entries({ RELEASE_STORAGE_ENDPOINT: "https://storage.example", RELEASE_STORAGE_BUCKET: "releases",
    RELEASE_STORAGE_REGION: "auto", RELEASE_STORAGE_ACCESS_KEY_ID: "fixture-access", RELEASE_STORAGE_SECRET_ACCESS_KEY: "fixture-secret" })) vi.stubEnv(key, value);
  const policy = resolveReleasePolicy({ schemaVersion: 1, operation: "release.policy.resolve", profile: "exact-validation", channel: "betahyx",
    releaseVersion: "0.1.0-betahyx.21", sourceCommit: "a".repeat(40), sourceRef: "refs/heads/test",
    switches: { endUserDistribution: false, stableAuthorized: false }, target: { endpointUrl: "https://storage.example", bucket: "releases",
      publicBaseUrl: "https://public.example", latestChannelHeadUrl: "https://storage.example/releases/betahyx/latest/channel-head.json" } });
  let stored: string | undefined;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(String(url)).toBe("https://storage.example/releases/betahyx/0.1.0-betahyx.21/version-input.json");
    if (init.method === "GET") return new Response(stored ?? null, { status: stored == null ? 404 : 200 });
    expect(new Headers(init.headers).get("if-none-match")).toBe("*");
    if (stored != null) return new Response(null, { status: 412 });
    stored = Buffer.from(init.body as Uint8Array).toString();
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  const store = versionInputStorage(policy);
  expect(await store.read()).toBeUndefined();
  await store.create({ input: { version: "original" } });
  await store.create({ input: { version: "original" } });
  await expect(store.create({ input: { version: "replacement" } })).rejects.toThrow("collision");
  await expect(store.read()).resolves.toEqual({ input: { version: "original" } });
  expect(() => versionInputStorage({ ...policy, target: { ...policy.target, bucket: "another" } })).toThrow("differs");
});

it("reads the uncompressed storage representation for strong CAS validators", async () => {
  const fetch = vi.fn().mockImplementation(async (_url, init) => new Response("{}", {
    headers: { etag: init.headers["accept-encoding"] === "identity" ? '"current"' : 'W/"current"' },
  }));
  vi.stubGlobal("fetch", fetch);
  const config = { endpointUrl: "https://storage.example", bucket: "releases", region: "auto",
    accessKeyId: "fixture-access", secretAccessKey: "fixture-secret" };
  const response = await requestStorageObject(config, "betahyx/latest/channel-head.json", { method: "GET" });
  expect(response.headers.get("etag")).toBe('"current"');
  expect(fetch.mock.calls[0]![1].headers.Authorization).toContain("accept-encoding");
  await expect(requestStorageObject(config, "betahyx/latest/channel-head.json", {
    method: "PUT", body: Buffer.from("{}"), headers: { "if-match": 'W/"current"' },
  })).rejects.toThrow("ETag is weak");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("signs conditional R2 writes without losing status or ETag", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 412, headers: { etag: '"current"' } }));
  vi.stubGlobal("fetch", fetch);
  const response = await requestStorageObject({ endpointUrl: "https://storage.example", bucket: "releases", region: "auto",
    accessKeyId: "fixture-access", secretAccessKey: "fixture-secret" }, "betahyx/latest/channel-head.json", {
    method: "PUT", body: Buffer.from("candidate"), headers: { "if-match": "prior", "content-type": "application/json" },
  });
  expect(response.status).toBe(412);
  expect(response.headers.get("etag")).toBe('"current"');
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0]!;
  expect(String(url)).toBe("https://storage.example/releases/betahyx/latest/channel-head.json");
  expect(init.redirect).toBe("error");
  expect(init.headers["if-match"]).toBe('"prior"');
  expect(init.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=fixture-access\//);
  expect(init.headers.Authorization).toContain("if-match");
  expect(init.headers["x-amz-content-sha256"]).toMatch(/^[a-f0-9]{64}$/);
});
