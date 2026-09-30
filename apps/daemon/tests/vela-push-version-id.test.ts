import { describe, expect, it } from 'vitest';
import { parseVelaPushVersionId } from '../src/collab/vela-cli-resource-adapter.js';

describe('push immutable version ID', () => {
  it('uses the wire id, never the display version or a compatibility alias', () => {
    expect(parseVelaPushVersionId(JSON.stringify({ id: 'immutable-v1', version: 42, versionId: 'other' }))).toBe('immutable-v1');
  });
  it.each(['', 'not-json', 'null', '[]', '42', '{"version":1}', '{"versionId":"v1"}', '{"id":""}', '{"id":"  "}', '{"id":123}'])('rejects invalid push output %s without disclosing it', (wire) => {
    expect(() => parseVelaPushVersionId(wire)).toThrow('vela push response has no immutable version id');
  });
});
