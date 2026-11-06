import { randomUUID } from 'node:crypto';

export const PLAYWRIGHT_RUN_NAMESPACE_ENV = 'OD_E2E_RUN_NAMESPACE';

type Environment = Record<string, string | undefined>;

export function initializePlaywrightRunNamespace(
  env: Environment = process.env,
  createToken: () => string = () => `${process.pid}-${randomUUID().slice(0, 8)}`,
): string {
  const existingNamespace = env[PLAYWRIGHT_RUN_NAMESPACE_ENV]?.trim();
  if (existingNamespace) return sanitizeSegment(existingNamespace);

  const namespacePrefix = env.OD_E2E_NAMESPACE?.trim() || 'playwright';
  const namespace = sanitizeSegment(`${namespacePrefix}-${createToken()}`);
  env[PLAYWRIGHT_RUN_NAMESPACE_ENV] = namespace;
  return namespace;
}

export function resolvePlaywrightSlotNamespace(
  parallelIndex: number,
  env: Environment = process.env,
): string {
  if (!Number.isInteger(parallelIndex) || parallelIndex < 0) {
    throw new Error(`Playwright parallelIndex must be a non-negative integer, got: ${parallelIndex}`);
  }

  const namespaceBase = env[PLAYWRIGHT_RUN_NAMESPACE_ENV];
  if (namespaceBase == null || namespaceBase.trim().length === 0) {
    throw new Error(
      `Playwright run namespace is missing; initialize ${PLAYWRIGHT_RUN_NAMESPACE_ENV} in the Playwright config`,
    );
  }
  return `${sanitizeSegment(namespaceBase)}-w${parallelIndex}`;
}

export function sanitizeSegment(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'playwright';
}
