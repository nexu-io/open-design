import { describe, expect, it } from 'vitest';
import {
  PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
  PREVIEW_OBSERVABILITY_BRIDGE_MARKER,
  buildPreviewObservabilityBridge,
} from '@open-design/contracts/runtime/preview-observability';
import { applyUrlPreviewBridgesToHtml } from '../../src/routes/project/index.js';
import { buildPreviewRuntimeBootstrap } from '../../src/http/preview-runtime-bootstrap.js';
import { buildInstalledScriptRuntimeModule } from '../../src/http/preview-runtime-modules.js';

const html = '<!doctype html><html><head><title>Artifact</title></head><body><main>Hi</main></body></html>';

describe('first-visible-paint reporting reaches the URL transport', () => {
  // A missing constant must not read as a satisfied assertion: `undefined`
  // stringifies to a substring the injected bridge already contains.
  it('names the paint report on the wire', () => {
    expect(PREVIEW_FIRST_PAINT_MESSAGE_TYPE).toBe('od:preview-first-paint');
  });

  it('serves the paint reporter to a document that asked for observability', () => {
    const served = applyUrlPreviewBridgesToHtml(html, 'text/html', 'observability');
    const text = Buffer.isBuffer(served) ? served.toString('utf8') : served;

    expect(text).toContain(PREVIEW_OBSERVABILITY_BRIDGE_MARKER);
    expect(text).toContain(PREVIEW_FIRST_PAINT_MESSAGE_TYPE);
    // Ahead of author scripts: a document that throws on its first line still
    // has to be measurable, and a document that never paints still has to
    // produce a row.
    const reporterAt = text.indexOf(PREVIEW_FIRST_PAINT_MESSAGE_TYPE);
    expect(reporterAt).toBeGreaterThanOrEqual(0);
    expect(reporterAt).toBeLessThan(text.indexOf('<body'));
  });

  it('leaves documents that asked for other bridges alone', () => {
    const served = applyUrlPreviewBridgesToHtml(html, 'text/html', 'scroll');
    const text = Buffer.isBuffer(served) ? served.toString('utf8') : served;

    expect(text).not.toContain(PREVIEW_FIRST_PAINT_MESSAGE_TYPE);
  });

  it('carries the paint reporter through the versioned runtime module install', () => {
    const bootstrap = buildPreviewRuntimeBootstrap({
      sessionId: 'session-1',
      documentVersion: 'version-1',
      availableCapabilities: ['observability'],
      modules: [buildInstalledScriptRuntimeModule(
        'observability',
        buildPreviewObservabilityBridge(),
        PREVIEW_OBSERVABILITY_BRIDGE_MARKER,
      )],
    });

    expect(bootstrap).toContain(PREVIEW_FIRST_PAINT_MESSAGE_TYPE);
  });
});
