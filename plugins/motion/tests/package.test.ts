import test from 'node:test';
import assert from 'node:assert/strict';
import { zip } from '../scripts/package.ts';
test('ZIP stores UTF-8 names and file sizes in local and central headers', () => {
  const archive = zip([{ name: 'motion/测试.txt', data: Buffer.from('editable project') }]);
  assert.equal(archive.readUInt32LE(0), 0x04034b50);
  assert.equal(archive.readUInt32LE(18), 16);
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  assert.equal(archive.readUInt16LE(end + 10), 1);
  assert.equal(archive.readUInt32LE(archive.readUInt32LE(end + 16)), 0x02014b50);
});
