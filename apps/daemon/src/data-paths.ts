/**
 * Tenant-scoped data path resolver.
 *
 * Spec 101 — multi-tenant open-design platform.
 *
 * Every on-disk write that targets per-tenant project data MUST flow through
 * `resolveDataDir()` to:
 *   1. Validate the projectId against a strict allowlist (alphanumeric + dash +
 *      underscore, max 64 chars). Anything else is rejected before it can
 *      escape the tenant directory via traversal, separators, or null bytes.
 *   2. Compose the absolute path as `<host_data_root><ctx.data_dir>/<projectId>`
 *      where `host_data_root = process.env.OD_DATA_ROOT ?? '/'`. The
 *      `host_data_root` indirection exists for tests; production daemons
 *      always run with the default '/'.
 *
 * After the directory has been created, callers SHOULD additionally pass the
 * realpath through `assertWithinTenantDir()` to detect symlinks that point
 * outside the tenant boundary. The symlink check is intentionally separate
 * from `resolveDataDir()` because the path may not exist on first write.
 *
 * Contract source:
 *   - specs/101-open-design-platform/contracts/data-paths.contract.md
 */

import path from 'node:path';
import type { RequestTenantContext } from './auth/tenant-context.js';

/** Discriminator for the kinds of failures `resolveDataDir` can produce. */
export type DataPathErrorKind = 'traversal' | 'invalid_chars' | 'cross_tenant';

/**
 * Typed error class for data-path validation failures.
 *
 * Always prefer the discriminator (`err.kind`) over message parsing — messages
 * are for humans, kinds are for code paths (HTTP status mapping, telemetry).
 */
export class DataPathError extends Error {
  public readonly kind: DataPathErrorKind;

  constructor(kind: DataPathErrorKind, message: string) {
    super(message);
    this.name = 'DataPathError';
    this.kind = kind;
  }
}

/** Allowed projectId shape: nanoid-style flat IDs only. */
const PROJECT_ID_RE = /^[a-zA-Z0-9_-]+$/;
const PROJECT_ID_MAX_LEN = 64;

/**
 * Resolve the absolute on-disk data directory for a tenant + project.
 *
 * Validates projectId before joining anything onto the tenant data_dir to
 * prevent path traversal, separator injection, and null-byte tricks.
 *
 * @throws DataPathError(kind='traversal') when projectId contains '..'
 * @throws DataPathError(kind='invalid_chars') when projectId contains a path
 *   separator, null byte, is empty, exceeds max length, or fails the
 *   alphanumeric+dash+underscore regex.
 */
export function resolveDataDir(
  ctx: Pick<RequestTenantContext, 'tenant_id' | 'data_dir'>,
  projectId: string,
): string {
  validateProjectId(projectId);

  const hostDataRoot = process.env.OD_DATA_ROOT ?? '/';
  return path.join(hostDataRoot, ctx.data_dir, projectId);
}

/**
 * Assert that `realPath` (typically from `fs.realpathSync.native`) lies inside
 * `tenantDataDir`. Used as a post-write check to catch symlinks that escape
 * the tenant boundary.
 *
 * @throws DataPathError(kind='cross_tenant') when realPath is outside the
 *   tenant data directory.
 */
export function assertWithinTenantDir(
  realPath: string,
  tenantDataDir: string,
): void {
  const normalizedTenant = tenantDataDir.endsWith(path.sep)
    ? tenantDataDir
    : tenantDataDir + path.sep;

  if (realPath !== tenantDataDir && !realPath.startsWith(normalizedTenant)) {
    throw new DataPathError(
      'cross_tenant',
      `path "${realPath}" is outside tenant data dir "${tenantDataDir}"`,
    );
  }
}

function validateProjectId(projectId: string): void {
  if (typeof projectId !== 'string' || projectId.length === 0) {
    throw new DataPathError('invalid_chars', 'projectId must be a non-empty string');
  }

  if (projectId.length > PROJECT_ID_MAX_LEN) {
    throw new DataPathError(
      'invalid_chars',
      `projectId exceeds max length of ${PROJECT_ID_MAX_LEN}`,
    );
  }

  if (projectId.includes('\0')) {
    throw new DataPathError('invalid_chars', 'projectId contains null byte');
  }

  if (projectId.includes('..')) {
    throw new DataPathError('traversal', 'projectId contains ".."');
  }

  if (projectId.includes('/') || projectId.includes('\\')) {
    throw new DataPathError('invalid_chars', 'projectId contains path separator');
  }

  if (!PROJECT_ID_RE.test(projectId)) {
    throw new DataPathError(
      'invalid_chars',
      'projectId must match /^[a-zA-Z0-9_-]+$/',
    );
  }
}
