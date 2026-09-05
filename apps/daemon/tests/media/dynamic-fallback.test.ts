import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateMedia } from "../../src/media/index.js";
import { writeConfig } from "../../src/media/config.js";
import { renderVelaImage, VelaMediaError } from "../../src/media/vela.js";

const { runVelaCommandMock } = vi.hoisted(() => ({
  runVelaCommandMock: vi.fn(),
}));

vi.mock("../../src/integrations/vela-command.js", async () => {
  const actual = await vi.importActual("../../src/integrations/vela-command.js");
  return {
    ...actual,
    runVelaCommand: runVelaCommandMock,
  };
});

describe("Dynamic Image Provider Negotiation & Fallback", () => {
  let projectRoot: string;
  let projectsRoot: string;

  beforeEach(async () => {
    runVelaCommandMock.mockReset();
    runVelaCommandMock.mockRejectedValue(new Error("not logged in: authentication required"));
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

  it("does not re-lookup model catalog using alias when alias is configured", async () => {
    // Set an alias mapping a registered catalog model to another wire name
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      "gpt-image-2": "gpt-image-custom-wire",
    });

    // Configure nanobanana as fallback so generateMedia can succeed or fail at render step
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

    try {
      // Calling with canonical "gpt-image-2" must resolve "gpt-image-2" in the catalog
      // rather than failing or re-resolving with "gpt-image-custom-wire"
      const res = await generateMedia({
        projectRoot,
        projectsRoot,
        projectId: "test-alias",
        surface: "image",
        model: "gpt-image-2",
      });
      expect(res.providerId).toBe("nanobanana");
    } finally {
      delete process.env.OD_MEDIA_MODEL_ALIASES;
      globalThis.fetch = originalFetch;
    }
  });

  it("does not classify timeout or process errors from vela models command as UNAUTHORIZED", async () => {
    const fakeRunner = vi.fn().mockRejectedValue(new Error("ETIMEDOUT: command timed out"));

    await expect(
      renderVelaImage(
        {
          aspect: "16:9",
          imageRefs: [],
          model: "vela/gpt-image-2",
          prompt: "test prompt",
          quality: undefined,
          resolution: undefined,
          wireModel: "gpt-image-2",
          workspaceId: undefined,
        },
        fakeRunner as any,
      ),
    ).rejects.toThrow("ETIMEDOUT: command timed out");

    // Must NOT throw VelaMediaError with UNAUTHORIZED
    try {
      await renderVelaImage(
        {
          aspect: "16:9",
          imageRefs: [],
          model: "vela/gpt-image-2",
          prompt: "test prompt",
          quality: undefined,
          resolution: undefined,
          wireModel: "gpt-image-2",
          workspaceId: undefined,
        },
        fakeRunner as any,
      );
    } catch (err: any) {
      expect(err).not.toBeInstanceOf(VelaMediaError);
      expect(err.code).not.toBe("UNAUTHORIZED");
    }
  });

  it("does not dispatch an i2i request to a t2i-only provider when no i2i provider is available", async () => {
    // Configure nanobanana only — it is t2i-only (no i2i capability).
    // When generateMedia is called with an imageRef (i2i request) and the only
    // active fallback is Vela (which fails UNAUTHORIZED), the i2i fallback must
    // return null rather than silently downgrading to nanobanana.
    await writeConfig(projectRoot, {
      providers: { nanobanana: { apiKey: "test-google-key" } },
    });

    const originalFetch = globalThis.fetch;
    // Track every URL that fetch is called with
    const fetchedUrls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: any) => {
      fetchedUrls.push(String(url));
      // nanobanana / generativelanguage would succeed if called
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
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const projDir = path.join(projectsRoot, "test-i2i-no-downgrade");
    await mkdir(projDir, { recursive: true });
    const refImagePath = path.join(projDir, "ref.png");
    await writeFile(refImagePath, Buffer.from("fake-ref-png"));

    try {
      // generateMedia with an imageRef on a vela model when only t2i providers
      // are configured must NOT silently succeed via nanobanana (t2i-only).
      // It must fail — either with a provider-not-found error or a vela auth
      // error — but it must NOT call nanobanana with an i2i request.
      await expect(
        generateMedia({
          projectRoot,
          projectsRoot,
          projectId: "test-i2i-no-downgrade",
          surface: "image",
          model: "vela/gpt-image-2",
          image: "ref.png",
        }),
      ).rejects.toThrow();

      // Critically: nanobanana (generativelanguage.googleapis.com) must NOT
      // have been called — the i2i fallback returned null, not a t2i model.
      const nanobananaCalled = fetchedUrls.some((u) =>
        u.includes("generativelanguage.googleapis.com"),
      );
      expect(nanobananaCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
