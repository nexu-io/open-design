// Spec 101 T015 — Reserved subdomains for the open-design platform.
// Used by the registry loader (boot-time validation) and by the Caddy
// subdomain resolver (Phase 6) to refuse tenant_ids that collide with
// platform-owned hostnames.

export const RESERVED_SUBDOMAINS = [
  'api',
  'www',
  'admin',
  'status',
  'docs',
  'health',
  'metrics',
] as const;

export type ReservedSubdomain = (typeof RESERVED_SUBDOMAINS)[number];

export function isReserved(slug: string): boolean {
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(slug);
}
