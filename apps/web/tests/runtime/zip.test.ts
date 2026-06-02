import { describe, expect, it } from 'vitest';

import { buildZip } from '../../src/runtime/zip';

describe('buildZip', () => {
  it('stores binary entry bytes without UTF-8 string re-encoding', async () => {
    const payload = new Uint8Array([0, 255, 128, 65]);
    const blob = buildZip([{ path: 'bin.dat', content: payload }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const filenameLength = new DataView(bytes.buffer).getUint16(26, true);
    const dataStart = 30 + filenameLength;

    expect(Array.from(bytes.slice(dataStart, dataStart + payload.length))).toEqual(Array.from(payload));
  });
});
