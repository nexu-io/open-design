import { describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  resolveVisualValidationChromiumLaunchOptions,
  resolvePackagedPlaywrightBrowsersPath,
  runVisualValidation,
  similarityToCritiqueScore,
} from '../src/plugins/atoms/visual-validation.js';

describe('visual validation atom runner', () => {
  it('skips cleanly when no reference images are present', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-skip-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      const result = await runVisualValidation({
        cwd,
        captureScreenshot: async ({ outputPath }) => {
          await writeFile(outputPath, PNG.sync.write(createFilledPng(320, 240, [255, 255, 255, 255])));
        },
      });
      expect(result.report.status).toBe('skipped');
      expect(result.signals).toEqual({});
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('fails closed when references exist but no HTML entry file is found', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-missing-entry-'));
    try {
      await writeFile(
        path.join(cwd, 'reference-home.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );
      const result = await runVisualValidation({
        cwd,
        captureScreenshot: async ({ outputPath }) => {
          await writeFile(outputPath, PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('failed');
      expect(result.report.entryFile).toBeNull();
      expect(result.report.message).toContain('no HTML entry file found');
      expect(result.signals['preview.ok']).toBe(false);
      expect(result.signals['critique.score']).toBe(1);

      const reportPath = path.join(cwd, 'critique', 'visual-validation', 'report.json');
      const saved = JSON.parse(await readFile(reportPath, 'utf8')) as { status?: string; message?: string };
      expect(saved.status).toBe('failed');
      expect(saved.message).toContain('no HTML entry file found');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('compares rendered output against reference screenshots and writes a report', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-compare-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await writeFile(
        path.join(cwd, 'reference-home.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );
      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async ({ outputPath }) => {
          const png = createFilledPng(200, 120, [255, 255, 255, 255]);
          paintRect(png, { x: 40, y: 25, width: 60, height: 30 }, [255, 0, 0, 255]);
          await writeFile(outputPath, PNG.sync.write(png));
        },
      });

      expect(result.report.status).toBe('ok');
      expect(result.report.comparison?.similarity).toBeLessThan(95);
      expect(result.report.comparison?.diffPixels).toBeGreaterThan(0);
      expect(result.report.comparison?.suggestions.length).toBeGreaterThan(0);
      expect(result.signals['preview.ok']).toBe(true);
      expect(result.signals['critique.score']).toBe(3);

      const reportPath = path.join(cwd, 'critique', 'visual-validation', 'report.json');
      const saved = JSON.parse(await readFile(reportPath, 'utf8')) as { comparison?: { diffPixels?: number } };
      expect(saved.comparison?.diffPixels).toBe(result.report.comparison?.diffPixels);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('honors an explicit entryFile over auto-detected index.html', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-explicit-entry-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>stale</body></html>', 'utf8');
      await writeFile(path.join(cwd, 'active.html'), '<!doctype html><html><body>active</body></html>', 'utf8');
      await writeFile(
        path.join(cwd, 'reference-home.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );

      let capturedEntryFile: string | null = null;
      const result = await runVisualValidation({
        cwd,
        entryFile: 'active.html',
        entryUrl: 'about:blank',
        captureScreenshot: async ({ entryFile, outputPath }) => {
          capturedEntryFile = entryFile;
          await writeFile(outputPath, PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('ok');
      expect(result.report.entryFile).toBe('active.html');
      expect(capturedEntryFile).toBe('active.html');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('uses the daemon preview route instead of file:// when project context is available', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-preview-route-'));
    const originalFetch = globalThis.fetch;
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await writeFile(
        path.join(cwd, 'reference-home.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );

      globalThis.fetch = async (input) => {
        expect(String(input)).toBe(
          'http://127.0.0.1:7456/api/projects/project-123/preview-url?file=index.html',
        );
        return new Response(
          JSON.stringify({ url: '/api/projects/project-123/preview/scope-123/index.html' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      };

      let capturedEntryUrl: string | null = null;
      const result = await runVisualValidation({
        cwd,
        projectId: 'project-123',
        daemonUrl: 'http://127.0.0.1:7456/',
        captureScreenshot: async ({ entryUrl, outputPath }) => {
          capturedEntryUrl = entryUrl;
          await writeFile(outputPath, PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('ok');
      expect(capturedEntryUrl).toBe(
        'http://127.0.0.1:7456/api/projects/project-123/preview/scope-123/index.html',
      );
    } finally {
      globalThis.fetch = originalFetch;
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('fails closed instead of falling back to file:// when preview context is unavailable', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-missing-preview-context-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await writeFile(
        path.join(cwd, 'reference-home.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );

      const result = await runVisualValidation({ cwd });

      expect(result.report.status).toBe('failed');
      expect(result.report.message).toContain('requires daemon preview context');
      expect(result.signals['preview.ok']).toBe(false);
      expect(result.signals['critique.score']).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('captures with the reference dimensions instead of the old clamp bounds', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-reference-viewport-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await writeFile(
        path.join(cwd, 'reference-home.png'),
        PNG.sync.write(createFilledPng(1920, 300, [255, 255, 255, 255])),
      );

      let capturedViewport: { width: number; height: number } | null = null;
      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async ({ outputPath, viewport }) => {
          capturedViewport = viewport;
          await writeFile(outputPath, PNG.sync.write(createFilledPng(viewport.width, viewport.height, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('ok');
      expect(capturedViewport).toEqual({ width: 1920, height: 300 });
      expect(result.report.comparison?.referenceWidth).toBe(1920);
      expect(result.report.comparison?.actualWidth).toBe(1920);
      expect(result.report.comparison?.referenceHeight).toBe(300);
      expect(result.report.comparison?.actualHeight).toBe(300);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('fails closed when capture throws', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-fail-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await writeFile(
        path.join(cwd, 'reference-home.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );
      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async () => {
          throw new Error('playwright launch failed');
        },
      });

      expect(result.report.status).toBe('failed');
      expect(result.report.message).toContain('playwright launch failed');
      expect(result.signals['preview.ok']).toBe(false);
      expect(result.signals['critique.score']).toBe(1);

      const reportPath = path.join(cwd, 'critique', 'visual-validation', 'report.json');
      const saved = JSON.parse(await readFile(reportPath, 'utf8')) as { status?: string; message?: string };
      expect(saved.status).toBe('failed');
      expect(saved.message).toContain('playwright launch failed');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('fails closed when the visual-validation artifact directory cannot be created', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-artifact-dir-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await writeFile(
        path.join(cwd, 'reference-home.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );
      await writeFile(path.join(cwd, 'critique'), 'not-a-directory', 'utf8');

      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async ({ outputPath }) => {
          await writeFile(outputPath, PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('failed');
      expect(result.report.message).toContain('ENOTDIR');
      expect(result.signals['preview.ok']).toBe(false);
      expect(result.signals['critique.score']).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('fails closed when the Playwright browser runtime is unavailable', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-no-browser-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await writeFile(
        path.join(cwd, 'reference-home.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );
      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async () => {
          throw new Error(
            "browserType.launch: Executable doesn't exist at /tmp/ms-playwright/chromium\nPlease run the following command to download new browsers: npx playwright install",
          );
        },
      });

      expect(result.report.status).toBe('failed');
      expect(result.report.message).toContain("Executable doesn't exist");
      expect(result.signals['preview.ok']).toBe(false);
      expect(result.signals['critique.score']).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('resolves the packaged Playwright browser cache from OD_RESOURCE_ROOT', () => {
    expect(
      resolvePackagedPlaywrightBrowsersPath({
        OD_RESOURCE_ROOT: '/tmp/open-design/resources',
      } as NodeJS.ProcessEnv),
    ).toBe('/tmp/open-design/resources/ms-playwright');
  });

  it('preserves an explicit Playwright browser cache override', () => {
    expect(
      resolvePackagedPlaywrightBrowsersPath({
        OD_RESOURCE_ROOT: '/tmp/open-design/resources',
        PLAYWRIGHT_BROWSERS_PATH: '/custom/playwright-cache',
      } as NodeJS.ProcessEnv),
    ).toBe('/custom/playwright-cache');
  });

  it('launches visual validation with Playwright new-headless Chromium', () => {
    expect(resolveVisualValidationChromiumLaunchOptions()).toEqual({
      channel: 'chromium',
    });
  });

  it('skips ignored dependency trees before recursing for references', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-ignore-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await mkdir(path.join(cwd, 'references'), { recursive: true });
      await writeFile(
        path.join(cwd, 'references', 'reference-home.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );
      await mkdir(path.join(cwd, 'node_modules', 'huge-package', 'assets'), { recursive: true });
      await chmod(path.join(cwd, 'node_modules'), 0o000);

      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async ({ outputPath }) => {
          await writeFile(outputPath, PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('ok');
    } finally {
      await chmod(path.join(cwd, 'node_modules'), 0o755).catch(() => {});
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('fails closed when reference auto-discovery hits an unreadable non-ignored directory', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-discovery-unreadable-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await writeFile(
        path.join(cwd, 'reference-home.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );
      await mkdir(path.join(cwd, 'private-assets'), { recursive: true });
      await writeFile(path.join(cwd, 'private-assets', 'notes.txt'), 'keep out', 'utf8');
      await chmod(path.join(cwd, 'private-assets'), 0o000);

      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async ({ outputPath }) => {
          await writeFile(outputPath, PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('failed');
      expect(result.report.message).toContain('EACCES');
      expect(result.signals['preview.ok']).toBe(false);
      expect(result.signals['critique.score']).toBe(1);
    } finally {
      await chmod(path.join(cwd, 'private-assets'), 0o755).catch(() => {});
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('only auto-discovers PNG reference screenshots', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-png-only-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await writeFile(path.join(cwd, 'reference-home.jpg'), 'not-a-png', 'utf8');

      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async ({ outputPath }) => {
          await writeFile(outputPath, PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('skipped');
      expect(result.report.message).toContain('no reference screenshot found');
      expect(result.signals).toEqual({});
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('ignores arbitrary root-level spec-prefixed PNG assets', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-root-spec-asset-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await writeFile(
        path.join(cwd, 'special-offer.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );

      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async ({ outputPath }) => {
          await writeFile(outputPath, PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('skipped');
      expect(result.report.message).toContain('no reference screenshot found');
      expect(result.signals).toEqual({});
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('still auto-discovers spec-directory PNG assets', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-spec-dir-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await mkdir(path.join(cwd, 'spec'), { recursive: true });
      await writeFile(
        path.join(cwd, 'spec', 'special-offer.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );

      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async ({ outputPath }) => {
          await writeFile(outputPath, PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('ok');
      expect(result.report.comparison?.referencePath).toBe('spec/special-offer.png');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('skips symlinked directories while scanning for references', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-symlink-cycle-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await mkdir(path.join(cwd, 'references'), { recursive: true });
      await writeFile(
        path.join(cwd, 'references', 'reference-home.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );
      await mkdir(path.join(cwd, 'loop', 'nested'), { recursive: true });
      await symlink(path.join(cwd, 'loop'), path.join(cwd, 'loop', 'nested', 'back-to-loop'));

      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async ({ outputPath }) => {
          await writeFile(outputPath, PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('ok');
      expect(result.report.comparison?.referencePath).toBe('references/reference-home.png');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('keeps per-reference artifacts distinct when basenames collide', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-collisions-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await mkdir(path.join(cwd, 'references'), { recursive: true });
      await mkdir(path.join(cwd, 'spec'), { recursive: true });
      await writeFile(
        path.join(cwd, 'references', 'reference.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );
      await writeFile(
        path.join(cwd, 'spec', 'reference.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );

      const captures: string[] = [];
      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async ({ outputPath }) => {
          captures.push(path.relative(cwd, outputPath));
          await writeFile(outputPath, PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])));
        },
      });

      expect(result.report.status).toBe('ok');
      expect(captures).toEqual([
        'critique/visual-validation/references-reference-1.actual.png',
        'critique/visual-validation/spec-reference-2.actual.png',
      ]);
      expect(captures).toContain(result.report.comparison?.actualPath);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('does not treat substring directory names as reference-image segments', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-segment-match-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await mkdir(path.join(cwd, 'assets', 'aspect'), { recursive: true });
      await mkdir(path.join(cwd, 'preferences'), { recursive: true });
      await writeFile(
        path.join(cwd, 'assets', 'aspect', 'hero.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );
      await writeFile(
        path.join(cwd, 'preferences', 'panel.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );

      const result = await runVisualValidation({
        cwd,
        captureScreenshot: async () => {
          throw new Error('visual validation should skip when no reference images are present');
        },
      });

      expect(result.report.status).toBe('skipped');
      expect(result.report.message).toContain('no reference screenshot');
      expect(result.signals).toEqual({});
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('scores from the worst reference match instead of the best one', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-visual-worst-reference-'));
    try {
      await writeFile(path.join(cwd, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
      await mkdir(path.join(cwd, 'references'), { recursive: true });
      await writeFile(
        path.join(cwd, 'references', 'reference-desktop.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );
      await writeFile(
        path.join(cwd, 'references', 'reference-mobile.png'),
        PNG.sync.write(createFilledPng(200, 120, [255, 255, 255, 255])),
      );

      const result = await runVisualValidation({
        cwd,
        entryUrl: 'about:blank',
        captureScreenshot: async ({ outputPath }) => {
          const png = createFilledPng(200, 120, [255, 255, 255, 255]);
          if (outputPath.endsWith('reference-mobile-2.actual.png')) {
            paintRect(png, { x: 20, y: 20, width: 160, height: 80 }, [255, 0, 0, 255]);
          }
          await writeFile(outputPath, PNG.sync.write(png));
        },
      });

      expect(result.report.status).toBe('ok');
      expect(result.report.comparison?.referencePath).toBe('references/reference-mobile.png');
      expect(result.report.comparison?.similarity).toBeLessThan(50);
      expect(result.signals['preview.ok']).toBe(true);
      expect(result.signals['critique.score']).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('maps similarity bands to critique scores conservatively', () => {
    expect(similarityToCritiqueScore(99)).toBe(5);
    expect(similarityToCritiqueScore(96)).toBe(4);
    expect(similarityToCritiqueScore(90)).toBe(3);
    expect(similarityToCritiqueScore(80)).toBe(2);
    expect(similarityToCritiqueScore(60)).toBe(1);
  });
});

function createFilledPng(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0];
    png.data[i + 1] = rgba[1];
    png.data[i + 2] = rgba[2];
    png.data[i + 3] = rgba[3];
  }
  return png;
}

function paintRect(
  png: PNG,
  rect: { x: number; y: number; width: number; height: number },
  rgba: readonly [number, number, number, number],
): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const index = (y * png.width + x) << 2;
      png.data[index] = rgba[0];
      png.data[index + 1] = rgba[1];
      png.data[index + 2] = rgba[2];
      png.data[index + 3] = rgba[3];
    }
  }
}
