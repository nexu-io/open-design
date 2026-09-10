import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CMS_HOST_RELEASE_INPUTS,
  cmsHostReleaseFingerprint,
} from '../../next.config';

const workspaceRoot = resolve(process.cwd(), '../..');
const readCmsHostReleaseInput = (
  file: (typeof CMS_HOST_RELEASE_INPUTS)[number],
) => readFileSync(resolve(workspaceRoot, file));

describe('CMS host release fingerprint', () => {
  it('is stable for identical host sources', () => {
    expect(cmsHostReleaseFingerprint(readCmsHostReleaseInput)).toBe(
      cmsHostReleaseFingerprint(readCmsHostReleaseInput),
    );
  });

  it.each([
    'apps/web/src/components/HoverTouchpointOverlay.tsx',
    'apps/web/src/components/HoverTouchpointOverlay.module.css',
  ] as const)('changes when real hover overlay input %s changes', (changedFile) => {
    expect(CMS_HOST_RELEASE_INPUTS).toContain(changedFile);

    const baseline = cmsHostReleaseFingerprint(readCmsHostReleaseInput);
    const changedOverlay = cmsHostReleaseFingerprint((file) =>
      file === changedFile
        ? Buffer.concat([readCmsHostReleaseInput(file), Buffer.from('\n/* changed */')])
        : readCmsHostReleaseInput(file),
    );

    expect(changedOverlay).not.toBe(baseline);
  });
});
