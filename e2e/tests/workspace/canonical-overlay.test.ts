import { describe, expect, it } from 'vitest';
import { assertCanonicalToolsOverlay } from '@/playwright/workspace-funding-lease';

function given() {
  const paths = ['sandbox/cli.py', 'sandbox/app/docker-compose.yml'];
  const overlay = { sourceSha: '3dfcdc6fb4f940f2955cfa4835315d4ee9f83c82',
    files: paths.map((path, index) => ({ path, sha256: String(index + 1).repeat(64) })) };
  const observed = overlay.files.map(f => ({ path: f.path, rawSha256: f.sha256, gitBlobSha256: f.sha256 }));
  return { paths, overlay, observed };
}

describe('exact canonical seats UI tools overlay preserves the fixed product boundary', () => {
  it('accepts only the two reviewed tools with equal declared, committed and raw bytes', () => {
    const { paths, overlay, observed } = given();
    expect(() => assertCanonicalToolsOverlay(overlay, paths, observed)).not.toThrow();
  });
  it.each(['source', 'productDiff', 'missingDiff', 'extraFile', 'duplicatePath', 'rawBytes', 'gitBlob', 'missingObservation'] as const)('rejects %s', kind => {
    const { paths, overlay, observed } = given();
    if (kind === 'source') overlay.sourceSha = 'a'.repeat(40);
    if (kind === 'productDiff') paths.push('services/api/src/index.ts');
    if (kind === 'missingDiff') paths.pop();
    if (kind === 'extraFile') overlay.files.push({ path: 'apps/web/src/app.tsx', sha256: '3'.repeat(64) });
    if (kind === 'duplicatePath') overlay.files[1]!.path = overlay.files[0]!.path;
    if (kind === 'rawBytes') observed[0]!.rawSha256 = '4'.repeat(64);
    if (kind === 'gitBlob') observed[0]!.gitBlobSha256 = '5'.repeat(64);
    if (kind === 'missingObservation') observed.pop();
    expect(() => assertCanonicalToolsOverlay(overlay, paths, observed)).toThrow();
  });
});
