import { describe, expect, it } from "vitest";

import { startReleaseStorageFixtureServer } from "../src/release-storage-fixture.js";

describe("release storage fixture server", () => {
  it("accepts release storage PUT/GET requests and exposes ETags", async () => {
    const server = await startReleaseStorageFixtureServer();
    try {
      const objectUrl = `${server.info.endpointUrl}/${server.info.bucket}/preview/latest/metadata.json`;
      const put = await fetch(objectUrl, {
        body: "{\"ok\":true}\n",
        headers: {
          "cache-control": "public, max-age=60",
          "content-type": "application/json; charset=utf-8",
        },
        method: "PUT",
      });
      expect(put.ok).toBe(true);

      const object = await fetch(objectUrl);
      expect(object.headers.get("etag")).toMatch(/^"/);
      expect(object.headers.get("cache-control")).toBe("public, max-age=60");
      expect(object.headers.get("content-type")).toContain("application/json");
      expect(await object.text()).toBe("{\"ok\":true}\n");
      expect(server.listObjectKeys()).toEqual(["preview/latest/metadata.json"]);
    } finally {
      await server.close();
    }
  });

  it("honors latest metadata compare-and-swap preconditions", async () => {
    const server = await startReleaseStorageFixtureServer();
    try {
      const objectUrl = `${server.info.endpointUrl}/${server.info.bucket}/beta/latest/metadata.json`;
      const first = await fetch(objectUrl, {
        body: "{\"version\":1}\n",
        headers: { "if-none-match": "*" },
        method: "PUT",
      });
      expect(first.ok).toBe(true);

      const second = await fetch(objectUrl, {
        body: "{\"version\":2}\n",
        headers: { "if-none-match": "*" },
        method: "PUT",
      });
      expect(second.status).toBe(412);

      const current = await fetch(objectUrl);
      expect(await current.text()).toBe("{\"version\":1}\n");

      const third = await fetch(objectUrl, {
        body: "{\"version\":2}\n",
        headers: { "if-match": current.headers.get("etag") ?? "" },
        method: "PUT",
      });
      expect(third.ok).toBe(true);
    } finally {
      await server.close();
    }
  });
});
