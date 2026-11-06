import { afterEach, describe, expect, it, vi } from "vitest";

import { storagePrefixHasObjects, type StorageConfig } from "../src/storage/s3-upload.ts";

const storage: StorageConfig = {
  accessKeyId: "test-access-key",
  bucket: "releases",
  endpointUrl: "https://storage.example.test",
  region: "auto",
  secretAccessKey: "test-secret-key",
};

describe("release storage prefix inspection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([0, 1])("reports whether a version prefix contains objects (KeyCount=%s)", async (count) => {
    const fetch = vi.fn().mockResolvedValue(new Response(
      `<?xml version="1.0"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><KeyCount>${count}</KeyCount></ListBucketResult>`,
    ));
    vi.stubGlobal("fetch", fetch);
    const prefix = "prerelease/versions/1.2.3-prerelease.4/";

    await expect(storagePrefixHasObjects({ ...storage, prefix })).resolves.toBe(count > 0);
    const [url, request] = fetch.mock.calls[0]! as [URL, RequestInit];
    expect(url.pathname).toBe("/releases/");
    expect(url.search).toBe("?list-type=2&max-keys=1&prefix=prerelease%2Fversions%2F1.2.3-prerelease.4%2F");
    expect(request.method).toBe("GET");
  });

  it("fails closed when storage refuses to list a version prefix", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("access denied", { status: 403 })));
    await expect(storagePrefixHasObjects({ ...storage, prefix: "prerelease/versions/1.2.3-prerelease.4/" }))
      .rejects.toThrow(/LIST .* failed with HTTP 403/);
  });

  it.each(["<Error>unknown</Error>", "<ListBucketResult></ListBucketResult>"])("rejects an unrecognized listing instead of treating it as an empty prefix: %s", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(storagePrefixHasObjects({ ...storage, prefix: "prerelease/versions/1.2.3-prerelease.4/" }))
      .rejects.toThrow("invalid ListObjectsV2 response");
  });
});
