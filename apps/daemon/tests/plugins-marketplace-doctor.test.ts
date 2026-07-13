import { describe, expect, it } from 'vitest';
import { doctorMarketplace } from '../src/plugins/marketplace-doctor.js';

describe('marketplace doctor', () => {
  it('reports registry-grade issues for catalogs', async () => {
    const report = await doctorMarketplace({
      id: 'community',
      trust: 'restricted',
      checkedAt: 123,
      strict: true,
      manifest: {
        specVersion: '1.0.0',
        name: 'community',
        version: '1.0.0',
        plugins: [
          {
            name: 'bad-flat-name',
            version: '0.1.0',
            source: 'github:example/bad',
            dist: { archive: 'https://example.com/bad.tgz' },
          },
          {
            name: 'vendor/good',
            version: '1.0.0',
            source: 'github:vendor/good',
            license: 'MIT',
            capabilitiesSummary: ['prompt:inject'],
            publisher: { id: 'vendor' },
          },
        ],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.checkedAt).toBe(123);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'invalid-name',
        'archive-integrity-required',
        'missing-license',
        'missing-capabilities',
        'missing-publisher',
      ]),
    );
  });
});
