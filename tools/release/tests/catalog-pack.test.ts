import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { exportCatalog } from "../src/catalog/export.ts";
import { packCatalogSnapshot, verifyCatalogChecksums, writeCatalogJson } from "../src/catalog/pack.ts";
import {
  createPlaywrightPreviewRenderer,
  createStubPreviewRenderer,
  renderCatalogPreviews,
  SystemicPreviewError,
} from "../src/catalog/render-previews.ts";
import {
  MINIMAL_WEBP,
  renderCardFromExternal,
  renderFallbackCard,
} from "../src/catalog/fallback-preview-card.ts";

const FIXTURE_ROOT = resolve(import.meta.dirname, "fixtures/catalog");
const SOURCE_COMMIT = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

async function stageFixtureCatalog(): Promise<string> {
  const stagingDir = await mkdtemp(join(tmpdir(), "od-catalog-pack-"));
  const { catalog } = exportCatalog({
    repoRoot: FIXTURE_ROOT,
    sourceCommit: SOURCE_COMMIT,
    generatedAt: "2026-08-29T00:00:00.000Z",
  });
  writeCatalogJson(stagingDir, catalog);
  await renderCatalogPreviews({
    catalog,
    repoRoot: FIXTURE_ROOT,
    stagingDir,
    renderer: createStubPreviewRenderer(),
    requireComplete: true,
  });
  return stagingDir;
}

describe("catalog pack", () => {
  it("writes checksums, provenance, previews, and runnable entry assets", async () => {
    const stagingDir = await stageFixtureCatalog();
    try {
      const result = packCatalogSnapshot({
        stagingDir,
        sourceCommit: SOURCE_COMMIT,
        exporterVersion: "tools-release@test",
      });

      expect(existsSync(join(stagingDir, "checksums.sha256"))).toBe(true);
      expect(existsSync(join(stagingDir, "provenance.json"))).toBe(true);
      expect(existsSync(join(stagingDir, "bundle.tar.zst"))).toBe(true);
      expect(result.bundleSha256).toMatch(/^[a-f0-9]{64}$/);

      const provenance = JSON.parse(await readFile(join(stagingDir, "provenance.json"), "utf8")) as {
        bundleSha256: string;
        exporterVersion: string;
        sourceCommit: string;
      };
      expect(provenance.bundleSha256).toBe(result.bundleSha256);
      expect(provenance.exporterVersion).toBe("tools-release@test");
      expect(provenance.sourceCommit).toBe(SOURCE_COMMIT);

      const checksums = await readFile(join(stagingDir, "checksums.sha256"), "utf8");
      expect(checksums).toContain("catalog.json");
      expect(checksums).toContain("previews/skills/alpha.webp");
      expect(checksums).toContain("entries/skills/alpha/example.html");
      expect(checksums).toContain("entries/templates/deck-one/example.html");
      expect(checksums).toContain("entries/plugins/examples/demo-plugin/example.html");
      expect(checksums).toContain("entries/plugins/examples/demo-plugin/assets/style.css");
      expect(checksums).toContain("entries/plugins/examples/demo-assets/assets/shared.css");

      // Preview bytes are the stub webp.
      expect(await readFile(join(stagingDir, "previews/skills/alpha.webp"))).toEqual(MINIMAL_WEBP);

      verifyCatalogChecksums(stagingDir);
    } finally {
      await rm(stagingDir, { force: true, recursive: true });
    }
  });

  it("verify rejects tampering with catalog.json", async () => {
    const stagingDir = await stageFixtureCatalog();
    try {
      packCatalogSnapshot({
        stagingDir,
        sourceCommit: SOURCE_COMMIT,
        exporterVersion: "tools-release@test",
      });
      const catalogPath = join(stagingDir, "catalog.json");
      const original = await readFile(catalogPath, "utf8");
      await writeFile(catalogPath, original.replace("Alpha Skill", "Tampered Skill"), "utf8");
      expect(() => verifyCatalogChecksums(stagingDir)).toThrow(/checksum mismatch/);
    } finally {
      await rm(stagingDir, { force: true, recursive: true });
    }
  });

  it("pack fails when a declared preview is missing", async () => {
    const stagingDir = await mkdtemp(join(tmpdir(), "od-catalog-incomplete-"));
    try {
      await mkdir(join(stagingDir, "previews/skills"), { recursive: true });
      const { catalog } = exportCatalog({
        repoRoot: FIXTURE_ROOT,
        sourceCommit: SOURCE_COMMIT,
        generatedAt: "2026-08-29T00:00:00.000Z",
      });
      writeCatalogJson(stagingDir, catalog);
      // Intentionally skip render — pack must fail closed.
      expect(() =>
        packCatalogSnapshot({
          stagingDir,
          sourceCommit: SOURCE_COMMIT,
          exporterVersion: "tools-release@test",
        }),
      ).toThrow(/incomplete bundle: missing preview/);
    } finally {
      await rm(stagingDir, { force: true, recursive: true });
    }
  });
});

describe("catalog pack helpers", () => {
  it("hashes match checksums lines", async () => {
    const stagingDir = await stageFixtureCatalog();
    try {
      packCatalogSnapshot({
        stagingDir,
        sourceCommit: SOURCE_COMMIT,
        exporterVersion: "tools-release@test",
      });
      const lines = (await readFile(join(stagingDir, "checksums.sha256"), "utf8"))
        .split("\n")
        .filter(Boolean);
      for (const line of lines) {
        const [hash, rel] = line.split("  ");
        const body = await readFile(join(stagingDir, rel!));
        expect(createHash("sha256").update(body).digest("hex")).toBe(hash);
      }
    } finally {
      await rm(stagingDir, { force: true, recursive: true });
    }
  });

  it("produces identical immutable bytes for independent packs of one commit", async () => {
    const first = await stageFixtureCatalog();
    const second = await stageFixtureCatalog();
    try {
      const firstResult = packCatalogSnapshot({
        stagingDir: first,
        sourceCommit: SOURCE_COMMIT,
        exporterVersion: "tools-release@test",
      });
      const secondResult = packCatalogSnapshot({
        stagingDir: second,
        sourceCommit: SOURCE_COMMIT,
        exporterVersion: "tools-release@test",
      });

      expect(await readFile(join(first, "catalog.json"))).toEqual(
        await readFile(join(second, "catalog.json")),
      );
      expect(await readFile(join(first, "provenance.json"))).toEqual(
        await readFile(join(second, "provenance.json")),
      );
      expect(firstResult.bundleSha256).toBe(secondResult.bundleSha256);
    } finally {
      await Promise.all([
        rm(first, { force: true, recursive: true }),
        rm(second, { force: true, recursive: true }),
      ]);
    }
  });
});

describe("playwright preview fail-closed", () => {
  it("keeps generated fallback cards free of remote dependencies", () => {
    const cards = [
      renderFallbackCard(
        { slug: "alpha", displayName: "Alpha", description: "Local skill card" },
        1,
      ),
      renderCardFromExternal(
        { slug: "plugin-alpha", title: "Plugin Alpha", description: "Local plugin card" },
        2,
      ),
    ];

    for (const card of cards) {
      expect(card).not.toMatch(/https?:\/\//u);
      expect(card).not.toContain("fonts.googleapis.com");
    }
  });

  it("throws when playwright cannot be imported", async () => {
    const renderer = createPlaywrightPreviewRenderer({
      importPlaywright: async () => {
        throw new Error("Cannot find package 'playwright'");
      },
    });
    await expect(
      renderer({
        bucket: "skills",
        stableId: "alpha",
        relativePath: "previews/skills/alpha.webp",
        htmlContent: "<html></html>",
        label: "skill:alpha",
      }),
    ).rejects.toThrow(SystemicPreviewError);
    await renderer.close?.();
  });

  it("throws when chromium launch fails", async () => {
    const renderer = createPlaywrightPreviewRenderer({
      importPlaywright: async () => ({
        chromium: {
          launch: async () => {
            throw new Error("Executable doesn't exist");
          },
        },
      }),
    });
    await expect(
      renderer({
        bucket: "skills",
        stableId: "alpha",
        relativePath: "previews/skills/alpha.webp",
        htmlContent: "<html></html>",
        label: "skill:alpha",
      }),
    ).rejects.toThrow(/systemic preview failure: playwright browser launch failed/);
    await renderer.close?.();
  });

  it("loads chromium from Playwright's CommonJS default export", async () => {
    const renderer = createPlaywrightPreviewRenderer({
      importPlaywright: async () => ({
        default: {
          chromium: {
            launch: async () => {
              throw new Error("default chromium reached");
            },
          },
        },
      }),
    });
    await expect(
      renderer({
        bucket: "skills",
        stableId: "alpha",
        relativePath: "previews/skills/alpha.webp",
        htmlContent: "<html></html>",
        label: "skill:alpha",
      }),
    ).rejects.toThrow(/default chromium reached/);
    await renderer.close?.();
  });

  it("does not count launch failure as a successful stub preview", async () => {
    const stagingDir = await mkdtemp(join(tmpdir(), "od-catalog-playwright-fail-"));
    try {
      const { catalog } = exportCatalog({
        repoRoot: FIXTURE_ROOT,
        sourceCommit: SOURCE_COMMIT,
        generatedAt: "2026-08-29T00:00:00.000Z",
      });
      writeCatalogJson(stagingDir, catalog);
      await expect(
        renderCatalogPreviews({
          catalog,
          repoRoot: FIXTURE_ROOT,
          stagingDir,
          renderer: createPlaywrightPreviewRenderer({
            importPlaywright: async () => {
              throw new Error("Cannot find package 'playwright'");
            },
          }),
          requireComplete: true,
        }),
      ).rejects.toThrow(SystemicPreviewError);
    } finally {
      await rm(stagingDir, { force: true, recursive: true });
    }
  });

  it("writes fallback webp when a single page capture fails", async () => {
    const renderer = createPlaywrightPreviewRenderer({
      importPlaywright: async () => ({
        chromium: {
          launch: async () => ({
            newContext: async () => ({
              addInitScript: async () => undefined,
              route: async () => undefined,
              newPage: async () => ({
                clock: {
                  install: async () => undefined,
                  pauseAt: async () => undefined,
                  runFor: async () => undefined,
                },
                setContent: async () => {
                  throw new Error("bad html");
                },
                goto: async () => {
                  throw new Error("bad html");
                },
                evaluate: async () => undefined,
                waitForTimeout: async () => undefined,
                screenshot: async () => Buffer.from("png"),
              }),
              close: async () => undefined,
            }),
            close: async () => undefined,
          }),
        },
      }),
    });
    const result = await renderer({
      bucket: "skills",
      stableId: "alpha",
      relativePath: "previews/skills/alpha.webp",
      htmlContent: "<html></html>",
      label: "skill:alpha",
    });
    expect(result.source).toBe("fallback");
    expect(result.warning).toMatch(/bad html/);
    expect(result.bytes).toEqual(MINIMAL_WEBP);
    await renderer.close?.();
  });

  it("fails when every preview result is a fallback", async () => {
    const stagingDir = await mkdtemp(join(tmpdir(), "od-catalog-all-fallback-"));
    try {
      const { catalog } = exportCatalog({
        repoRoot: FIXTURE_ROOT,
        sourceCommit: SOURCE_COMMIT,
        generatedAt: "2026-08-29T00:00:00.000Z",
      });

      await expect(
        renderCatalogPreviews({
          catalog,
          repoRoot: FIXTURE_ROOT,
          stagingDir,
          renderer: async (job) => ({
            bytes: Buffer.from(MINIMAL_WEBP),
            source: "fallback",
            warning: `shared capture failure for ${job.label}`,
          }),
          requireComplete: true,
        }),
      ).rejects.toThrow(/systemic preview failure: all \d+ preview job\(s\) failed/);
    } finally {
      await rm(stagingDir, { force: true, recursive: true });
    }
  });

  it("fails a complete production render when only some previews fall back", async () => {
    const stagingDir = await mkdtemp(join(tmpdir(), "od-catalog-mixed-fallback-"));
    try {
      const { catalog } = exportCatalog({
        repoRoot: FIXTURE_ROOT,
        sourceCommit: SOURCE_COMMIT,
        generatedAt: "2026-08-29T00:00:00.000Z",
      });
      let renderCount = 0;

      await expect(
        renderCatalogPreviews({
          catalog,
          repoRoot: FIXTURE_ROOT,
          stagingDir,
          renderer: async (job) => {
            renderCount += 1;
            if (renderCount === 1) {
              return { bytes: Buffer.from(MINIMAL_WEBP), source: "render" };
            }
            return {
              bytes: Buffer.from(MINIMAL_WEBP),
              source: "fallback",
              warning: `capture failed for ${job.label}`,
            };
          },
          requireComplete: true,
        }),
      ).rejects.toThrow(/incomplete preview bundle: failed/);
      expect(renderCount).toBeGreaterThan(1);
    } finally {
      await rm(stagingDir, { force: true, recursive: true });
    }
  });

  it("renders a deterministic local card when an entry requests an HTTP dependency", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "#ff0000" },
    }).png().toBuffer();
    let abortCalls = 0;
    let screenshotCalls = 0;
    let clockRunCalls = 0;
    const renderedHtml: string[] = [];
    const renderer = createPlaywrightPreviewRenderer({
      importPlaywright: async () => ({
        chromium: {
          launch: async () => ({
            newContext: async () => ({
              route: async (_pattern, handler) => {
                await handler({
                  abort: async () => {
                    abortCalls += 1;
                  },
                });
              },
              addInitScript: async () => undefined,
              newPage: async () => ({
                clock: {
                  install: async () => undefined,
                  pauseAt: async () => undefined,
                  runFor: async () => {
                    clockRunCalls += 1;
                    if (clockRunCalls === 1) throw new Error("Chart is not defined");
                  },
                },
                setContent: async (html) => {
                  renderedHtml.push(html);
                },
                goto: async () => undefined,
                evaluate: async () => undefined,
                waitForTimeout: async () => undefined,
                screenshot: async () => {
                  screenshotCalls += 1;
                  return png;
                },
              }),
              close: async () => undefined,
            }),
            close: async () => undefined,
          }),
        },
      }),
    });

    const result = await renderer({
      bucket: "skills",
      stableId: "alpha",
      relativePath: "previews/skills/alpha.webp",
      htmlContent: '<script src="https://cdn.example.test/runtime.js"></script>',
      remoteDependencyCard: renderFallbackCard(
        { slug: "alpha", displayName: "Alpha", description: "Local replacement" },
        1,
      ),
      label: "skill:alpha",
    });
    expect(result.source).toBe("render");
    expect(result.warning).toMatch(/local deterministic card/);
    expect(result.bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(abortCalls).toBe(1);
    expect(clockRunCalls).toBe(2);
    expect(screenshotCalls).toBe(1);
    expect(renderedHtml).toHaveLength(2);
    expect(renderedHtml[1]).toContain("alpha");
    expect(renderedHtml[1]).not.toMatch(/https?:\/\//u);
    await renderer.close?.();
  });

  it("still fails a remote-dependent entry without a deterministic replacement card", async () => {
    const renderer = createPlaywrightPreviewRenderer({
      importPlaywright: async () => ({
        chromium: {
          launch: async () => ({
            newContext: async () => ({
              route: async (_pattern, handler) => {
                await handler({ abort: async () => undefined });
              },
              addInitScript: async () => undefined,
              newPage: async () => ({
                clock: {
                  install: async () => undefined,
                  pauseAt: async () => undefined,
                  runFor: async () => undefined,
                },
                setContent: async () => undefined,
                goto: async () => undefined,
                evaluate: async () => undefined,
                waitForTimeout: async () => undefined,
                screenshot: async () => Buffer.from("unreachable"),
              }),
              close: async () => undefined,
            }),
            close: async () => undefined,
          }),
        },
      }),
    });

    const result = await renderer({
      bucket: "skills",
      stableId: "alpha",
      relativePath: "previews/skills/alpha.webp",
      htmlContent: '<script src="https://cdn.example.test/runtime.js"></script>',
      label: "skill:alpha",
    });
    expect(result.source).toBe("fallback");
    expect(result.warning).toMatch(/blocked HTTP\(S\) dependency/);
    expect(result.bytes).toEqual(MINIMAL_WEBP);
    await renderer.close?.();
  });

  it("freezes dynamic browser state and converts captures to actual WebP bytes", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "#ff0000" },
    }).png().toBuffer();
    const initScripts: string[] = [];
    const clockEvents: string[] = [];
    const routePatterns: RegExp[] = [];
    let screenshotOptions: Record<string, unknown> | undefined;
    const renderer = createPlaywrightPreviewRenderer({
      importPlaywright: async () => ({
        chromium: {
          launch: async () => ({
            newContext: async () => ({
              route: async (pattern, _handler) => {
                routePatterns.push(pattern);
              },
              addInitScript: async ({ content }) => {
                initScripts.push(content);
              },
              newPage: async () => ({
                clock: {
                  install: async ({ time }) => {
                    clockEvents.push(`install:${time}`);
                  },
                  pauseAt: async (time) => {
                    clockEvents.push(`pause:${time}`);
                  },
                  runFor: async (ms) => {
                    clockEvents.push(`run:${ms}`);
                  },
                },
                setContent: async () => undefined,
                goto: async () => undefined,
                evaluate: async () => undefined,
                waitForTimeout: async () => undefined,
                screenshot: async (options) => {
                  screenshotOptions = options;
                  return png;
                },
              }),
              close: async () => undefined,
            }),
            close: async () => undefined,
          }),
        },
      }),
    });

    const result = await renderer({
      bucket: "skills",
      stableId: "alpha",
      relativePath: "previews/skills/alpha.webp",
      htmlContent: "<html></html>",
      label: "skill:alpha",
    });
    expect((await sharp(result.bytes).metadata()).format).toBe("webp");
    expect(initScripts).toHaveLength(1);
    expect(initScripts[0]).toContain("Math.random =");
    expect(routePatterns).toHaveLength(1);
    expect(routePatterns[0]?.test("https://cdn.example.test/script.js")).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(clockEvents).toEqual([
      "install:2026-01-01T00:00:00.000Z",
      "pause:2026-01-01T00:00:00.000Z",
      "run:800",
    ]);
    expect(screenshotOptions).toMatchObject({ animations: "disabled", type: "png" });
    await renderer.close?.();
  });

  it("closes the cached browser after the render loop", async () => {
    let closeCalls = 0;
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "#000000" },
    }).png().toBuffer();
    const renderer = createPlaywrightPreviewRenderer({
      importPlaywright: async () => ({
        chromium: {
          launch: async () => ({
            newContext: async () => ({
              addInitScript: async () => undefined,
              route: async () => undefined,
              newPage: async () => ({
                clock: {
                  install: async () => undefined,
                  pauseAt: async () => undefined,
                  runFor: async () => undefined,
                },
                setContent: async () => undefined,
                goto: async () => undefined,
                evaluate: async () => undefined,
                waitForTimeout: async () => undefined,
                screenshot: async () => png,
              }),
              close: async () => undefined,
            }),
            close: async () => {
              closeCalls += 1;
            },
          }),
        },
      }),
    });
    const stagingDir = await mkdtemp(join(tmpdir(), "od-catalog-close-browser-"));
    try {
      const { catalog } = exportCatalog({
        repoRoot: FIXTURE_ROOT,
        sourceCommit: SOURCE_COMMIT,
        generatedAt: "2026-08-29T00:00:00.000Z",
      });
      await renderCatalogPreviews({
        catalog,
        repoRoot: FIXTURE_ROOT,
        stagingDir,
        renderer,
      });
      expect(closeCalls).toBe(1);
    } finally {
      await rm(stagingDir, { force: true, recursive: true });
    }
  });
});
