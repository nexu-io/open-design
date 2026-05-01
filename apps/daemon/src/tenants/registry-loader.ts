// Spec 101 T014 — Tenant registry loader (boot-time validator).
//
// 7-step boot pipeline (refuses to start on any failure with structured error):
//   1. YAML parse
//   2. Schema validation (Zod, ported from openclaw scripts/lint/validate-registry.ts)
//   3. design_system file existence (apps/daemon/src/design-systems/<key>/index.ts)
//   4. Vercel team reachability (≤2s, must return 200)
//   5. wedge_endpoint reachability (HEAD ≤2s; only network failures fail boot)
//   6. data_dir is subpath of /data/ (path semantics; no '..', no symlinks)
//   7. tenant_id NOT in reserved subdomains
//
// Skip checks 4+5 in tests by setting `SKIP_NETWORK_CHECKS=true`.
//
// Public API:
//   - loadTenantRegistry(path): Promise<RegistryIndex>
//   - TenantConfig type
//   - RegistryBootError (thrown on failure, carries `phase`)

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml, YAMLException } from 'js-yaml';
import { z } from 'zod';

import { isReserved } from './reserved-subdomains.js';

const KEBAB = /^[a-z0-9-]+$/;
const WEDGE_PATTERN =
  /^https:\/\/([a-z0-9-]+)\.holalumina\.com\/api\/open-design\/lead-handoff$/;
const DATA_DIR_PATTERN = /^\/data\/[a-z0-9-]+$/;
const NETWORK_TIMEOUT_MS = 2000;

const OpenDesignBlockSchema = z
  .object({
    enabled: z.boolean(),
    wedge_endpoint: z
      .string()
      .url()
      .refine((u) => u.startsWith('https://'), {
        message: 'wedge_endpoint must be HTTPS',
      })
      .refine((u) => WEDGE_PATTERN.test(u), {
        message:
          'wedge_endpoint must match https://<tenant>.holalumina.com/api/open-design/lead-handoff',
      }),
    design_system: z.string().regex(KEBAB, 'design_system must be kebab-case'),
    vercel_team: z.string().regex(KEBAB, 'vercel_team must be kebab-case'),
    data_dir: z
      .string()
      .refine((s) => DATA_DIR_PATTERN.test(s), {
        message: 'data_dir must match /data/<kebab-case-id>',
      })
      .refine((s) => !s.includes('..'), { message: 'data_dir contains ".."' }),
    display_name: z.string().optional(),
    created_at: z.string().datetime().optional(),
  })
  .strict();

const TenantEntrySchema = z
  .object({
    customer_id: z.string(),
    open_design: OpenDesignBlockSchema.optional(),
  })
  .passthrough();

const RegistrySchema = z
  .object({
    tenants: z.array(TenantEntrySchema),
  })
  .passthrough();

export type OpenDesignBlock = z.infer<typeof OpenDesignBlockSchema>;
export type TenantEntry = z.infer<typeof TenantEntrySchema>;

export interface TenantConfig {
  customer_id: string;
  open_design?: OpenDesignBlock;
  // The validator preserves additional tenant-registry fields via `.passthrough()`,
  // but consumers should treat them as opaque.
  [key: string]: unknown;
}

export type RegistryIndex = Map<string, TenantConfig>;

export type BootPhase =
  | 'parse'
  | 'schema'
  | 'design_system'
  | 'vercel_team'
  | 'wedge'
  | 'data_dir'
  | 'reserved';

export class RegistryBootError extends Error {
  readonly phase: BootPhase;
  readonly tenantId: string | undefined;
  readonly details: string[];

  constructor(phase: BootPhase, message: string, options: {
    tenantId?: string;
    details?: string[];
    cause?: unknown;
  } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'RegistryBootError';
    this.phase = phase;
    this.tenantId = options.tenantId;
    this.details = options.details ?? [];
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function resolveDesignSystemsRoot(): string {
  const fromEnv = process.env.OPEN_DESIGN_DESIGN_SYSTEMS_ROOT;
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(fromEnv);
  }
  // Default: apps/daemon/src/design-systems/<key>/index.ts (per contract).
  // __dirname equivalent for ESM:
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'design-systems');
}

function checkDesignSystemExists(root: string, key: string): boolean {
  // Source-tree default uses index.ts; the compiled deploy ships index.js.
  // Accept either so the same validator works in dev and prod.
  return existsSync(path.join(root, key, 'index.ts'))
    || existsSync(path.join(root, key, 'index.js'));
}

function checkDataDirSafe(dir: string): { ok: true } | { ok: false; reason: string } {
  if (!DATA_DIR_PATTERN.test(dir)) {
    return { ok: false, reason: 'data_dir must match /data/<kebab-case-id>' };
  }
  if (dir.includes('..')) {
    return { ok: false, reason: 'data_dir contains ".."' };
  }
  const resolved = path.resolve(dir);
  if (resolved !== dir) {
    return { ok: false, reason: 'data_dir is not canonical' };
  }
  if (!resolved.startsWith('/data/')) {
    return { ok: false, reason: 'data_dir must be a subpath of /data/' };
  }
  // Symlink check is best-effort: if the path doesn't exist on this host yet
  // (typical at boot before provisioning), skip realpath. If it does exist
  // and resolves to a different path, that's a symlink — refuse.
  if (existsSync(resolved)) {
    try {
      const real = realpathSync(resolved);
      if (real !== resolved) {
        return { ok: false, reason: 'data_dir is a symlink' };
      }
      const st = statSync(resolved);
      if (!st.isDirectory()) {
        return { ok: false, reason: 'data_dir is not a directory' };
      }
    } catch (err) {
      return { ok: false, reason: `data_dir realpath failed: ${getErrorMessage(err)}` };
    }
  }
  return { ok: true };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkVercelTeam(slug: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) {
    return { ok: false, reason: 'VERCEL_API_TOKEN not set' };
  }
  const url = `https://api.vercel.com/v2/teams/${encodeURIComponent(slug)}`;
  try {
    const res = await fetchWithTimeout(
      url,
      { headers: { Authorization: `Bearer ${token}` } },
      NETWORK_TIMEOUT_MS,
    );
    if (res.status !== 200) {
      return { ok: false, reason: `Vercel team API returned ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Vercel team fetch failed: ${getErrorMessage(err)}` };
  }
}

async function checkWedgeReachable(url: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    // 2xx-4xx all count as reachable; only a network/DNS failure fails boot.
    await fetchWithTimeout(url, { method: 'HEAD' }, NETWORK_TIMEOUT_MS);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `wedge HEAD failed: ${getErrorMessage(err)}` };
  }
}

function parseYamlOrThrow(filePath: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new RegistryBootError(
      'parse',
      `failed to read registry at ${filePath}: ${getErrorMessage(err)}`,
      { cause: err },
    );
  }
  try {
    return parseYaml(raw);
  } catch (err) {
    const message =
      err instanceof YAMLException ? err.message : getErrorMessage(err);
    throw new RegistryBootError('parse', `YAML parse failed: ${message}`, {
      cause: err,
    });
  }
}

function validateSchemaOrThrow(input: unknown): z.infer<typeof RegistrySchema> {
  const parsed = RegistrySchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => {
      const pathStr = issue.path.join('.');
      return pathStr.length > 0 ? `${pathStr}: ${issue.message}` : issue.message;
    });
    const first = details[0] ?? 'schema validation failed';
    throw new RegistryBootError('schema', `schema validation failed: ${first}`, {
      details,
    });
  }
  return parsed.data;
}

export async function loadTenantRegistry(filePath: string): Promise<RegistryIndex> {
  // Phase 1: parse
  const raw = parseYamlOrThrow(filePath);

  // Phase 2: schema
  const data = validateSchemaOrThrow(raw);

  const designSystemsRoot = resolveDesignSystemsRoot();
  const skipNetwork = process.env.SKIP_NETWORK_CHECKS === 'true';
  const index: RegistryIndex = new Map();

  for (const tenant of data.tenants) {
    const customerId = tenant.customer_id;

    // Phase 7: reserved (run early to give a clear error before more expensive checks).
    if (isReserved(customerId)) {
      throw new RegistryBootError(
        'reserved',
        `tenant_id "${customerId}" is reserved and cannot be used`,
        { tenantId: customerId },
      );
    }

    if (tenant.open_design) {
      const od = tenant.open_design;

      // Cross-field: wedge subdomain must equal customer_id.
      const match = WEDGE_PATTERN.exec(od.wedge_endpoint);
      if (!match || match[1] !== customerId) {
        throw new RegistryBootError(
          'schema',
          `[${customerId}] wedge_endpoint subdomain "${match?.[1] ?? '(none)'}" does not match customer_id`,
          { tenantId: customerId },
        );
      }

      // Phase 3: design_system file existence.
      if (!checkDesignSystemExists(designSystemsRoot, od.design_system)) {
        const expected = path.join(designSystemsRoot, od.design_system, 'index.ts');
        throw new RegistryBootError(
          'design_system',
          `[${customerId}] design_system "${od.design_system}" does not resolve to ${expected}`,
          { tenantId: customerId },
        );
      }

      // Phase 6: data_dir safety (path semantics; no FS-side network).
      const dirCheck = checkDataDirSafe(od.data_dir);
      if (!dirCheck.ok) {
        throw new RegistryBootError(
          'data_dir',
          `[${customerId}] data_dir invalid: ${dirCheck.reason}`,
          { tenantId: customerId },
        );
      }

      if (!skipNetwork) {
        // Phase 4: Vercel team reachability.
        const teamCheck = await checkVercelTeam(od.vercel_team);
        if (!teamCheck.ok) {
          throw new RegistryBootError(
            'vercel_team',
            `[${customerId}] vercel_team "${od.vercel_team}" unreachable: ${teamCheck.reason}`,
            { tenantId: customerId },
          );
        }

        // Phase 5: wedge reachability.
        const wedgeCheck = await checkWedgeReachable(od.wedge_endpoint);
        if (!wedgeCheck.ok) {
          throw new RegistryBootError(
            'wedge',
            `[${customerId}] wedge_endpoint unreachable: ${wedgeCheck.reason}`,
            { tenantId: customerId },
          );
        }
      }
    }

    // Build immutable copy keyed by customer_id. Strip undefined fields so
    // exactOptionalPropertyTypes is satisfied (open_design is absent vs
    // explicitly-undefined are different shapes under that flag).
    const { open_design, ...rest } = tenant;
    const entry: TenantConfig =
      open_design !== undefined ? { ...rest, open_design } : { ...rest };
    if (index.has(customerId)) {
      throw new RegistryBootError(
        'schema',
        `duplicate customer_id "${customerId}" in registry`,
        { tenantId: customerId },
      );
    }
    index.set(customerId, entry);
  }

  return index;
}
