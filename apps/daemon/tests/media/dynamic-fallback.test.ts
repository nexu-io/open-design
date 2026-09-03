import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateMedia } from "../../src/media/index.js";
import { writeConfig } from "../../src/media/config.js";

describe("Dynamic Image Provider Negotiation & Fallback", () => {
  let projectRoot: string;
  let projectsRoot: string;

  beforeEach(async () => {
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_SANDBOX_MODE;
    projectRoot = await mkdtemp(path.join(tmpdir(), "od-media-proj-"));
    projectsRoot = path.join(projectRoot, "projects");
    await mkdir(projectsRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("throws friendly actionable error when neither target nor fallback providers are configured", async () => {
    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: "test-p1",
        surface: "image",
        model: "gpt-image-2",
      })
    ).rejects.toThrow(/Image generation failed.*Settings -> API Providers/);
  });

  it("auto-routes unauthenticated vela call to configured nanobanana provider", async () => {
    await writeConfig(projectRoot, {
      providers: { nanobanana: { apiKey: "test-google-key" } },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: any) => {
      if (String(url).includes("generativelanguage.googleapis.com")) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: Buffer.from("fake-png-bytes").toString("base64"),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("not found", { status: 404 });
    });

    const projDir = path.join(projectsRoot, "test-p3");
    await mkdir(projDir, { recursive: true });
    await writeFile(path.join(projDir, "ref.png"), Buffer.from("fake-png"));

    try {
      const res = await generateMedia({
        projectRoot,
        projectsRoot,
        projectId: "test-p2",
        surface: "image",
        model: "vela/gpt-image-2",
      });
      expect(res.providerId).toBe("nanobanana");
      expect(res.providerNote).toContain("[auto-routed]");
      expect(res.providerNote).toContain("nanobanana");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("prioritizes an i2i-capable provider when an image reference is supplied", async () => {
    // Configure both nanobanana (t2i only) and custom-image (t2i + i2i)
    await writeConfig(projectRoot, {
      providers: {
        nanobanana: { apiKey: "test-google-key" },
        "custom-image": { apiKey: "test-custom-key", baseUrl: "https://custom.test/v1", model: "custom-model" },
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: any) => {
      if (String(url).includes("custom.test")) {
        return new Response(
          JSON.stringify({
            data: [{ b64_json: Buffer.from("fake-custom-i2i").toString("base64") }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("not found", { status: 404 });
    });

    const projDir = path.join(projectsRoot, "test-p3");
    await mkdir(projDir, { recursive: true });
    await writeFile(path.join(projDir, "ref.png"), Buffer.from("fake-png"));

    try {
      const res = await generateMedia({
        projectRoot,
        projectsRoot,
        projectId: "test-p3",
        surface: "image",
        model: "vela/gpt-image-2",
        image: "ref.png",
      });
      expect(res.providerId).toBe("custom-image");
      expect(res.providerNote).toContain("[auto-routed]");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
