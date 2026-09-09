import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { get } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startReleaseStorageFixtureServer } from "../src/release-storage-fixture.js";

describe("release storage fixture server", () => {
  it.skipIf(process.platform === "win32")("serves HTTPS using only explicitly trusted fixture certificates", async () => {
    const root = await mkdtemp(join(tmpdir(), "release-storage-tls-"));
    try {
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
        "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", join(root, "key.pem"), "-out", join(root, "cert.pem")], { stdio: "ignore" });
      const cert = await readFile(join(root, "cert.pem"), "utf8"), key = await readFile(join(root, "key.pem"), "utf8");
      const server = await startReleaseStorageFixtureServer({ tls: { cert, key } });
      try {
        expect(server.info.origin).toMatch(/^https:\/\//);
        const request = (ca?: string) => new Promise<number | undefined>((resolve, reject) => {
          get(`${server.info.origin}/${server.info.bucket}/missing`, { ca }, response => { response.resume(); resolve(response.statusCode); }).on("error", reject);
        });
        await expect(request()).rejects.toThrow();
        await expect(request(cert)).resolves.toBe(404);
      } finally { await server.close(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

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
