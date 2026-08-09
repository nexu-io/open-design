import { describe, expect, it, vi } from "vitest";

import { observePublicFeed } from "../src/storage/public-feed.js";

const publicOrigin = "https://releases.example";
const version = "0.19.0-beta.10";

function metadata(artifactUrl = `${publicOrigin}/beta/artifacts/Open%20Design.dmg`) {
  return {
    releaseTargets: {
      mac_arm64: {
        artifacts: {
          dmg: { url: artifactUrl },
        },
      },
    },
    releaseVersion: version,
  };
}

describe("public feed observation", () => {
  it("compares latest with immutable metadata and probes canonical public objects", async () => {
    const value = metadata();
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (init?.method === "HEAD") {
        return new Response(null, { headers: { "content-length": "42", etag: '"digest"' }, status: 200 });
      }
      if (url.endsWith("metadata.json")) return Response.json(value);
      return new Response(null, { status: 404 });
    });

    const result = await observePublicFeed({
      expectedVersion: version,
      fetchImpl,
      latestMetadataUrl: `${publicOrigin}/beta/latest/metadata.json`,
      publicOrigin,
      versionMetadataUrl: `${publicOrigin}/beta/versions/${version}/metadata.json`,
    });

    expect(result.status).toBe("success");
    expect(result.probes).toEqual([{
      contentLength: "42",
      etag: '"digest"',
      status: 200,
      url: `${publicOrigin}/beta/artifacts/Open%20Design.dmg`,
    }]);
  });

  it("rejects non-canonical artifact URLs as an observation failure", async () => {
    const value = metadata(`${publicOrigin}/beta/artifacts/Open Design.dmg`);
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(value));

    await expect(observePublicFeed({
      expectedVersion: version,
      fetchImpl,
      latestMetadataUrl: `${publicOrigin}/beta/latest/metadata.json`,
      publicOrigin,
      versionMetadataUrl: `${publicOrigin}/beta/versions/${version}/metadata.json`,
    })).rejects.toThrow(/non-canonical URL/);
  });

  it("rejects a latest pointer that has not converged on the version", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const value = String(input).includes("/latest/")
        ? { ...metadata(), releaseVersion: "0.19.0-beta.9" }
        : metadata();
      return Response.json(value);
    });

    await expect(observePublicFeed({
      expectedVersion: version,
      fetchImpl,
      latestMetadataUrl: `${publicOrigin}/beta/latest/metadata.json`,
      publicOrigin,
      versionMetadataUrl: `${publicOrigin}/beta/versions/${version}/metadata.json`,
    })).rejects.toThrow(/latest public metadata version mismatch/);
  });
});
