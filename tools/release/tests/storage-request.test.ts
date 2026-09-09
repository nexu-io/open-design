import { afterEach, expect, it, vi } from "vitest";
import { requestStorageObject } from "@/storage/s3-upload.ts";

afterEach(() => vi.unstubAllGlobals());

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
