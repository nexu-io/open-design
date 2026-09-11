import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { releaseObjects } from "@/exact/release-object.ts";
import { verifyPublishedArtifact } from "@/exact/publication-artifact.ts";
import { resolveReleasePolicy } from "@/policy/release-profile.ts";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function fixture() {
  const policy = resolveReleasePolicy({ schemaVersion: 1, operation: "release.policy.resolve", profile: "exact-validation",
    channel: "betahyx", releaseVersion: "0.1.0-betahyx.35", sourceCommit: "a".repeat(40), sourceRef: "refs/heads/test",
    switches: { endUserDistribution: false, stableAuthorized: false }, target: { endpointUrl: "https://storage.example",
      bucket: "release", publicBaseUrl: "https://cdn.example", latestChannelHeadUrl: "https://storage.example/release/betahyx/latest/channel-head.json" } });
  for (const [key, value] of Object.entries({ RELEASE_STORAGE_ACCESS_KEY_ID: "test", RELEASE_STORAGE_SECRET_ACCESS_KEY: "test",
    RELEASE_STORAGE_BUCKET: "release", RELEASE_STORAGE_ENDPOINT: "https://storage.example", RELEASE_STORAGE_REGION: "auto" })) vi.stubEnv(key, value);
  const bytes = Buffer.from("immutable payload"), sha256 = createHash("sha256").update(bytes).digest("hex"), size = bytes.length;
  const descriptor = { file: "/producer/resource.zip", sha256, size, publication: { schemaVersion: 1, channel: policy.channel,
    releaseVersion: policy.releaseVersion, sourceCommit: policy.sourceCommit, name: "resource.zip", sha256, size } };
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { headers: {
    "x-amz-meta-sha256": sha256, "content-length": String(size), etag: '"verified"',
  } }));
  vi.stubGlobal("fetch", fetch);
  return { policy, descriptor, bytes, fetch };
}
it("authenticates only the final version object with HEAD, without downloading payload bytes", async () => {
  const f = fixture();
  expect(await verifyPublishedArtifact(f.policy, f.descriptor)).toEqual({ etag: '"verified"' });
  const [url, init] = f.fetch.mock.calls[0]!;
  expect(String(url)).toBe("https://storage.example/release/betahyx/0.1.0-betahyx.35/resource.zip");
  expect(init).toMatchObject({ method: "HEAD", redirect: "error" });
  expect(new Headers(init?.headers).get("authorization")).toContain("AWS4-HMAC-SHA256");
});
it.each(["channel", "releaseVersion", "sourceCommit", "name", "sha256", "size"])("refuses a foreign %s binding before origin access", async field => {
  const f = fixture();
  await expect(verifyPublishedArtifact(f.policy, { ...f.descriptor, publication: { ...f.descriptor.publication, [field]: "foreign" } })).rejects.toThrow("binding");
  expect(f.fetch).not.toHaveBeenCalled();
});
it.each([404, "digest", "size", "missing"])("refuses missing or mismatched origin proof: %s", async failure => {
  const f = fixture(), headers = new Headers({ "x-amz-meta-sha256": f.descriptor.sha256, "content-length": String(f.bytes.length) });
  if (failure === "digest") headers.set("x-amz-meta-sha256", "b".repeat(64));
  if (failure === "size") headers.set("content-length", "0");
  if (failure === "missing") headers.delete("x-amz-meta-sha256");
  f.fetch.mockResolvedValue(new Response(null, { status: failure === 404 ? 404 : 200, headers }));
  await expect(verifyPublishedArtifact(f.policy, f.descriptor)).rejects.toThrow("binding mismatch");
});
it("creates bytes conditionally with a computed digest and verifies original bytes before returning", async () => {
  const f = fixture();
  f.fetch.mockResolvedValueOnce(new Response(null, { status: 201 }))
    .mockResolvedValueOnce(new Response(new Uint8Array(f.bytes)));
  await releaseObjects(f.policy).create("resource.zip", f.bytes, "application/zip");
  const headers = new Headers(f.fetch.mock.calls[0]![1]?.headers);
  expect(headers.get("if-none-match")).toBe("*");
  expect(headers.get("x-amz-meta-sha256")).toBe(f.descriptor.sha256);
  f.fetch.mockResolvedValueOnce(new Response(null, { status: 412 }))
    .mockResolvedValueOnce(new Response("different"));
  await expect(releaseObjects(f.policy).create("resource.zip", f.bytes, "application/zip")).rejects.toThrow("collision");
});
