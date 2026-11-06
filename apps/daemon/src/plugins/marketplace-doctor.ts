import type { MarketplaceManifest } from '@open-design/contracts';
import type { RegistryDoctorIssue, RegistryDoctorReport } from '@open-design/registry-protocol';
import { StaticRegistryBackend } from '../registry/static-backend.js';

export interface MarketplaceDoctorInput {
  id: string;
  trust: 'official' | 'trusted' | 'restricted';
  manifest: MarketplaceManifest;
  checkedAt?: number;
  strict?: boolean;
}

export async function doctorMarketplace(
  input: MarketplaceDoctorInput,
): Promise<RegistryDoctorReport & { warningsAsErrors: boolean }> {
  const backend = new StaticRegistryBackend({
    id: input.id,
    trust: input.trust,
    manifest: input.manifest,
  });
  const base = await backend.doctor();
  const issues: RegistryDoctorIssue[] = [...base.issues];

  const names = new Set<string>();
  for (const entry of input.manifest.plugins ?? []) {
    const lower = entry.name.toLowerCase();
    if (names.has(lower)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-name',
        message: 'Registry entries must have stable unique plugin ids.',
        pluginName: entry.name,
      });
    }
    names.add(lower);

    if (entry.dist?.archive && !entry.dist.integrity && !entry.integrity) {
      issues.push({
        severity: 'error',
        code: 'archive-integrity-required',
        message: 'Archive distribution entries must include sha256 integrity.',
        pluginName: entry.name,
      });
    }

    if (entry.distTags?.latest) {
      const hasLatest = (entry.versions ?? []).some((version) =>
        version.version === entry.distTags?.latest && !version.yanked,
      ) || entry.version === entry.distTags.latest;
      if (!hasLatest) {
        issues.push({
          severity: 'error',
          code: 'bad-latest-tag',
          message: 'distTags.latest must point at a non-yanked version.',
          pluginName: entry.name,
        });
      }
    }

    const publisherId = entry.publisher?.id ?? entry.publisher?.github;
    if (!publisherId) {
      issues.push({
        severity: 'warning',
        code: 'missing-publisher',
        message: 'Registry entry should declare publisher identity.',
        pluginName: entry.name,
      });
    }
  }

  const strict = input.strict === true;
  return {
    ok: !issues.some((issue) => issue.severity === 'error') &&
      (!strict || !issues.some((issue) => issue.severity === 'warning')),
    backendId: base.backendId,
    checkedAt: input.checkedAt ?? base.checkedAt,
    entriesChecked: base.entriesChecked,
    issues,
    warningsAsErrors: strict,
  };
}
