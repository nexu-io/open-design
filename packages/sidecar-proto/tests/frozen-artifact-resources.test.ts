import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeDesktopSidecarMessage, SIDECAR_MESSAGES } from '../src/index.js';

function message(bytesBase64 = 'YQ==', resourcePath = 'assets/a.png') {
  return {
    type: SIDECAR_MESSAGES.EXPORT_ARTIFACT,
    input: {
      html: '<!doctype html><img src="assets/a.png">', title: 'Cover',
      deck: false, format: 'image', imageFormat: 'png', captureMode: 'first_viewport_thumbnail',
      frozenResources: {
        version: 1, entryPath: 'index.html',
        resources: [{ path: resourcePath, mime: 'image/png', bytesBase64,
          sha256: createHash('sha256').update(Buffer.from(bytesBase64, 'base64')).digest('hex') }],
      },
    },
  };
}

describe('immutable artifact resources IPC', () => {
  it('accepts a legal 8 MiB base64 string without recursive regular-expression overflow', () => {
    const input = message('A'.repeat(8 * 1024 * 1024));
    expect(normalizeDesktopSidecarMessage(input)).toEqual(input);
  });

  it.each(['assets/中文 空格%2F?#.png', 'assets/a.png'])('preserves literal resource filename %s', (name) => {
    const input = message('YQ==', name);
    expect(normalizeDesktopSidecarMessage(input)).toEqual(input);
  });

  it.each(['../a.png', '/a.png', 'assets//a.png', '.env', 'assets/.hidden.png', 'assets\\a.png', 'assets/a\n.png'])('rejects non-visible or ambiguous path %s', (name) => {
    expect(() => normalizeDesktopSidecarMessage(message('YQ==', name))).toThrow(/path/);
  });

  it.each(['A', 'A===', 'AA=A', 'YQ==\n', '====', 'YQ_=', 'AAAA='])('rejects malformed base64 %s', (value) => {
    expect(() => normalizeDesktopSidecarMessage(message(value))).toThrow(/base64/);
  });

  it('rejects duplicate paths and an entry alias in the resource map', () => {
    const duplicate = message();
    duplicate.input.frozenResources.resources.push(duplicate.input.frozenResources.resources[0]!);
    expect(() => normalizeDesktopSidecarMessage(duplicate)).toThrow(/duplicate/);
    expect(() => normalizeDesktopSidecarMessage(message('YQ==', 'index.html'))).toThrow(/duplicate/);
  });

  it('rejects live baseHref and full-page use with frozen thumbnail resources', () => {
    const frozen = message();
    expect(() => normalizeDesktopSidecarMessage({ ...frozen, input: { ...frozen.input, baseHref: 'http://localhost/live/' } })).toThrow(/without baseHref/);
    expect(() => normalizeDesktopSidecarMessage({ ...frozen, input: { ...frozen.input, captureMode: 'full_page_export' } })).toThrow(/thumbnail/);
  });

  it('preserves the legacy payload when no resource capability is used', () => {
    const input = { type: SIDECAR_MESSAGES.EXPORT_ARTIFACT,
      input: { html: '<p>Legacy</p>', title: 'Legacy', deck: false, format: 'image', imageFormat: 'png' } };
    expect(normalizeDesktopSidecarMessage(input)).toEqual(input);
  });
});
