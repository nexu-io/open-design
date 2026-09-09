import { describe, expect, it } from 'vitest';
import {
  PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
  PREVIEW_OBSERVABILITY_BRIDGE_MARKER,
} from '@open-design/contracts/runtime/preview-observability';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

const html = '<!doctype html><html><head><title>Artifact</title></head><body><main>Hi</main></body></html>';

describe('first-visible-paint reporting reaches the srcdoc transport', () => {
  // A missing constant must not read as a satisfied assertion: `undefined`
  // stringifies to a substring the injected bridge already contains.
  it('names the paint report on the wire', () => {
    expect(PREVIEW_FIRST_PAINT_MESSAGE_TYPE).toBe('od:preview-first-paint');
  });

  it('ships the paint reporter with the observability bridge', () => {
    const srcdoc = buildSrcdoc(html, { previewObservability: true });

    expect(srcdoc).toContain(PREVIEW_OBSERVABILITY_BRIDGE_MARKER);
    expect(srcdoc).toContain(PREVIEW_FIRST_PAINT_MESSAGE_TYPE);
    // Before author scripts, like every other guard: a document that throws on
    // its first line still has to be measurable.
    const reporterAt = srcdoc.indexOf(PREVIEW_FIRST_PAINT_MESSAGE_TYPE);
    expect(reporterAt).toBeGreaterThanOrEqual(0);
    expect(reporterAt).toBeLessThan(srcdoc.indexOf('<body'));
  });

  it('stays out of documents that did not ask for observability', () => {
    // Exports and other off-screen srcdoc consumers have no host listening,
    // so a paint report there would be an unread message from a frame nobody
    // is looking at.
    expect(buildSrcdoc(html)).not.toContain(PREVIEW_FIRST_PAINT_MESSAGE_TYPE);
  });
});
