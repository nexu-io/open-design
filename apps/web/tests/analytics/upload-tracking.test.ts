// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { deriveUploadCohort } from '../../src/analytics/upload-tracking';

// `deriveUploadCohort` only reads `name`, `type`, `size` — keep the
// fixture lightweight so 100 MB boundary cases don't allocate real bytes.
function makeFile(name: string, type: string, size: number): File {
  return { name, type, size } as unknown as File;
}

describe('deriveUploadCohort', () => {
  it('classifies a homogeneous image batch as image', () => {
    const cohort = deriveUploadCohort([
      makeFile('a.png', 'image/png', 1024),
      makeFile('b.jpg', 'image/jpeg', 2048),
    ]);
    expect(cohort).toEqual({
      file_count: 2,
      file_type: 'image',
      file_size_bucket: '0_1mb',
    });
  });

  it('detects zip by MIME', () => {
    const cohort = deriveUploadCohort([
      makeFile('bundle.zip', 'application/zip', 500),
    ]);
    expect(cohort.file_type).toBe('zip');
  });

  it('detects zip by .zip extension when MIME is missing', () => {
    const cohort = deriveUploadCohort([
      makeFile('bundle.ZIP', '', 500),
      makeFile('also.zip', 'application/octet-stream', 500),
    ]);
    expect(cohort.file_type).toBe('zip');
  });

  it('collapses mixed-type batches to other', () => {
    const cohort = deriveUploadCohort([
      makeFile('a.png', 'image/png', 100),
      makeFile('b.pdf', 'application/pdf', 100),
    ]);
    expect(cohort.file_type).toBe('other');
  });

  it('returns other for an empty batch', () => {
    expect(deriveUploadCohort([])).toEqual({
      file_count: 0,
      file_type: 'other',
      file_size_bucket: '0_1mb',
    });
  });

  it('buckets total bytes across the 1/10/100 MB thresholds', () => {
    const MB = 1024 * 1024;
    const cases: Array<{ total: number; bucket: string }> = [
      { total: MB - 1, bucket: '0_1mb' },
      { total: MB, bucket: '1_10mb' },
      { total: 10 * MB - 1, bucket: '1_10mb' },
      { total: 10 * MB, bucket: '10_100mb' },
      { total: 100 * MB - 1, bucket: '10_100mb' },
      { total: 100 * MB, bucket: '100mb_plus' },
    ];
    for (const { total, bucket } of cases) {
      const cohort = deriveUploadCohort([
        makeFile('blob.bin', 'application/octet-stream', total),
      ]);
      expect(cohort.file_size_bucket, `total=${total}`).toBe(bucket);
    }
  });

  it('sums sizes across multiple files for the bucket', () => {
    const MB = 1024 * 1024;
    const cohort = deriveUploadCohort([
      makeFile('a.png', 'image/png', 0.6 * MB),
      makeFile('b.png', 'image/png', 0.6 * MB),
    ]);
    expect(cohort.file_size_bucket).toBe('1_10mb');
  });

  it('treats missing size/type defensively', () => {
    const cohort = deriveUploadCohort([
      { name: 'x', type: '', size: 0 } as unknown as File,
    ]);
    expect(cohort).toEqual({
      file_count: 1,
      file_type: 'other',
      file_size_bucket: '0_1mb',
    });
  });
});
