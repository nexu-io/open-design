/**
 * @module validation
 *
 * Internal structural-validation primitives shared by the per-message and
 * per-stamp normalizers. These are NOT part of the package's public surface —
 * the root barrel does not re-export them; only sibling modules import them.
 */

/** @internal Assert `value` is a plain object (not array/null) and narrow it. */
export function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

/** @internal Assert `value` has no keys outside `allowed`, else throw. */
export function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set<string>(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unexpected.join(", ")}`);
  }
}

/** @internal Normalize a required non-empty string field. */
export function normalizeNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  if (value.length === 0) throw new Error(`${label} must not be empty`);
  return value;
}

/** @internal Normalize a required boolean field. */
export function normalizeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

/** @internal Normalize an optional positive, finite number field. */
export function normalizeOptionalPositiveNumber(value: unknown, label: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return value;
}
