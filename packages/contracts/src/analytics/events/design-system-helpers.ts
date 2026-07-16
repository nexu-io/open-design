/**
 * @module analytics/events/design-system-helpers
 * Design-system tracking bucket/slug helpers.
 */
import type { TrackingDesignSystemFolderCountBucket, TrackingDesignSystemLengthBucket, TrackingDesignSystemModuleType, TrackingDesignSystemRepoHost, TrackingDesignSystemTotalSizeBucket } from './design-systems.js';
// ---- Design-system tracking helpers --------------------------------------

// `length` is a character count (after trimming). Buckets match the
// v2 doc literally so brand description / notes / feedback all share
// the same shape.
export function designSystemLengthBucket(
  text: string | null | undefined,
): TrackingDesignSystemLengthBucket {
  const length = (text ?? '').trim().length;
  if (length === 0) return '0';
  if (length <= 50) return '1_50';
  if (length <= 200) return '51_200';
  if (length <= 500) return '201_500';
  return '500_plus';
}

export function designSystemFolderCountBucket(
  count: number | null | undefined,
): TrackingDesignSystemFolderCountBucket {
  if (count === null || count === undefined || !Number.isFinite(count)) {
    return 'unknown';
  }
  if (count <= 0) return '0';
  if (count <= 10) return '1_10';
  if (count <= 50) return '11_50';
  if (count <= 200) return '51_200';
  return '200_plus';
}

export function designSystemTotalSizeBucket(
  bytes: number | null | undefined,
): TrackingDesignSystemTotalSizeBucket {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return 'unknown';
  }
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return '0_1mb';
  if (mb < 10) return '1_10mb';
  if (mb < 50) return '10_50mb';
  return '50mb_plus';
}

// Slugifies a DESIGN.md section header (`## Typography & Type Scale`)
// into a stable module id (`typography-type-scale`). Lowercases, strips
// punctuation, collapses whitespace to `-`. Empty input → 'unknown'.
export function designSystemModuleSlug(
  header: string | null | undefined,
): string {
  const trimmed = (header ?? '').trim().replace(/^#+\s*/, '');
  if (!trimmed) return 'unknown';
  return (
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  );
}

// Normalizes a question-form option value or form id into a snake_case
// tracking token: "Live artifact" → "live_artifact", "HyperFrames" →
// "hyperframes", "task-type" → "task_type". Values that slug to nothing
// (e.g. fully localized non-latin labels) collapse to 'unknown'.
export function questionsFormTrackingId(
  raw: string | null | undefined,
): string {
  const slug = (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return slug || 'unknown';
}

// Maps a DESIGN.md section slug to one of the six review module
// types. Heuristic keyword match; defaults to `'other'`.
export function designSystemModuleType(
  slug: string | null | undefined,
): TrackingDesignSystemModuleType {
  const s = (slug ?? '').toLowerCase();
  if (!s) return 'other';
  if (/(typography|type|font)/.test(s)) return 'typography';
  if (/(color|palette)/.test(s)) return 'colors';
  if (/(spacing|layout|grid|radius|shadow|elevation)/.test(s)) {
    return 'spacing';
  }
  if (/(component|button|input|form|icon|widget)/.test(s)) return 'components';
  if (/(brand|asset|logo|image|illustration)/.test(s)) return 'brand_assets';
  return 'other';
}

// Maps a repository URL host to the tracking enum. Unparseable URLs
// → `'unknown'`. Non-github/gitlab hosts → `'other'`.
export function designSystemRepoHostFromUrl(
  url: string | null | undefined,
): TrackingDesignSystemRepoHost {
  const raw = (url ?? '').trim();
  if (!raw) return 'unknown';
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === 'github.com' || host.endsWith('.github.com')) return 'github';
    if (host === 'gitlab.com' || host.endsWith('.gitlab.com')) return 'gitlab';
    return 'other';
  } catch {
    return 'unknown';
  }
}
