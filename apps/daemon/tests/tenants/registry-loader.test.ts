// Spec 101 T013 — registry-loader tests.
// Asserts boot-time validation pipeline (7 phases) refuses to start on any
// failure with a structured error carrying `phase`.
//
// Test phases covered:
//   (a) valid YAML loads — returns Map keyed by customer_id
//   (b) missing required field → throws phase: 'schema'
//   (c) reserved tenant_id → throws phase: 'reserved'
//   (d) design_system file missing → throws phase: 'design_system'
//   (e) wedge_endpoint unreachable (mock fetch) → throws phase: 'wedge'
//   (f) Vercel team unreachable (mock fetch) → throws phase: 'vercel_team'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  loadTenantRegistry,
  type RegistryBootError,
} from '../../src/tenants/registry-loader.js';

interface FixtureRoot {
  root: string;
  registryPath: string;
  designSystemsRoot: string;
}

function createFixtureRoot(): FixtureRoot {
  const root = mkdtempSync(path.join(tmpdir(), 'spec-101-registry-'));
  const designSystemsRoot = path.join(root, 'design-systems');
  mkdirSync(designSystemsRoot, { recursive: true });
  const registryPath = path.join(root, 'tenant-registry.yaml');
  return { root, registryPath, designSystemsRoot };
}

function ensureDesignSystem(designSystemsRoot: string, key: string): void {
  const dir = path.join(designSystemsRoot, key);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'index.ts'),
    'export const designSystem = { key: ' + JSON.stringify(key) + ' };\n',
    'utf8',
  );
}

const VALID_YAML = `tenants:
  - customer_id: ceremonia
    org_name: Ceremonia
    open_design:
      enabled: true
      wedge_endpoint: https://ceremonia.holalumina.com/api/open-design/lead-handoff
      design_system: ceremonia
      vercel_team: ceremonia-89dd9b81
      data_dir: /data/ceremonia
      display_name: "Ceremonia"
      created_at: "2026-04-30T00:00:00Z"
  - customer_id: ericedmeades
    org_name: Eric Edmeades
    open_design:
      enabled: true
      wedge_endpoint: https://ericedmeades.holalumina.com/api/open-design/lead-handoff
      design_system: ericedmeades
      vercel_team: ceremonia-89dd9b81
      data_dir: /data/ericedmeades
      display_name: "Eric Edmeades"
      created_at: "2026-04-30T00:00:00Z"
`;

describe('loadTenantRegistry', () => {
  let fixture: FixtureRoot;

  beforeEach(() => {
    fixture = createFixtureRoot();
    process.env.SKIP_NETWORK_CHECKS = 'true';
    process.env.VERCEL_API_TOKEN = 'test-token';
    delete process.env.OPEN_DESIGN_DESIGN_SYSTEMS_ROOT;
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
    delete process.env.SKIP_NETWORK_CHECKS;
    delete process.env.VERCEL_API_TOKEN;
    delete process.env.OPEN_DESIGN_DESIGN_SYSTEMS_ROOT;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('(a) loads valid YAML and returns a Map keyed by customer_id', async () => {
    writeFileSync(fixture.registryPath, VALID_YAML, 'utf8');
    ensureDesignSystem(fixture.designSystemsRoot, 'ceremonia');
    ensureDesignSystem(fixture.designSystemsRoot, 'ericedmeades');
    process.env.OPEN_DESIGN_DESIGN_SYSTEMS_ROOT = fixture.designSystemsRoot;

    const registry = await loadTenantRegistry(fixture.registryPath);
    expect(registry).toBeInstanceOf(Map);
    expect(registry.size).toBe(2);
    expect(registry.has('ceremonia')).toBe(true);
    expect(registry.has('ericedmeades')).toBe(true);
    const ceremonia = registry.get('ceremonia');
    expect(ceremonia?.open_design?.design_system).toBe('ceremonia');
    expect(ceremonia?.open_design?.data_dir).toBe('/data/ceremonia');
  });

  it('(b) missing required field throws with phase: "schema"', async () => {
    // wedge_endpoint is required; remove it.
    const broken = `tenants:
  - customer_id: ceremonia
    org_name: Ceremonia
    open_design:
      enabled: true
      design_system: ceremonia
      vercel_team: ceremonia-89dd9b81
      data_dir: /data/ceremonia
`;
    writeFileSync(fixture.registryPath, broken, 'utf8');
    ensureDesignSystem(fixture.designSystemsRoot, 'ceremonia');
    process.env.OPEN_DESIGN_DESIGN_SYSTEMS_ROOT = fixture.designSystemsRoot;

    await expect(loadTenantRegistry(fixture.registryPath)).rejects.toMatchObject({
      phase: 'schema',
    } satisfies Partial<RegistryBootError>);
  });

  it('(c) reserved tenant_id throws with phase: "reserved"', async () => {
    const reserved = `tenants:
  - customer_id: admin
    org_name: Reserved Slot
    open_design:
      enabled: true
      wedge_endpoint: https://admin.holalumina.com/api/open-design/lead-handoff
      design_system: ceremonia
      vercel_team: ceremonia-89dd9b81
      data_dir: /data/admin
`;
    writeFileSync(fixture.registryPath, reserved, 'utf8');
    ensureDesignSystem(fixture.designSystemsRoot, 'ceremonia');
    process.env.OPEN_DESIGN_DESIGN_SYSTEMS_ROOT = fixture.designSystemsRoot;

    await expect(loadTenantRegistry(fixture.registryPath)).rejects.toMatchObject({
      phase: 'reserved',
    } satisfies Partial<RegistryBootError>);
  });

  it('(d) design_system file missing throws with phase: "design_system"', async () => {
    writeFileSync(fixture.registryPath, VALID_YAML, 'utf8');
    // Only create one of the two — ericedmeades is missing → phase: design_system
    ensureDesignSystem(fixture.designSystemsRoot, 'ceremonia');
    process.env.OPEN_DESIGN_DESIGN_SYSTEMS_ROOT = fixture.designSystemsRoot;

    await expect(loadTenantRegistry(fixture.registryPath)).rejects.toMatchObject({
      phase: 'design_system',
    } satisfies Partial<RegistryBootError>);
  });

  it('(e) wedge unreachable throws with phase: "wedge"', async () => {
    writeFileSync(fixture.registryPath, VALID_YAML, 'utf8');
    ensureDesignSystem(fixture.designSystemsRoot, 'ceremonia');
    ensureDesignSystem(fixture.designSystemsRoot, 'ericedmeades');
    process.env.OPEN_DESIGN_DESIGN_SYSTEMS_ROOT = fixture.designSystemsRoot;
    // Network checks must run for this test — disable the skip flag.
    delete process.env.SKIP_NETWORK_CHECKS;

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      // Vercel team check passes; wedge HEAD fails.
      if (url.startsWith('https://api.vercel.com/')) {
        return new Response(null, { status: 200 });
      }
      if ((init?.method ?? 'GET').toUpperCase() === 'HEAD') {
        throw new TypeError('fetch failed');
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadTenantRegistry(fixture.registryPath)).rejects.toMatchObject({
      phase: 'wedge',
    } satisfies Partial<RegistryBootError>);
  });

  it('(f) Vercel team unreachable throws with phase: "vercel_team"', async () => {
    writeFileSync(fixture.registryPath, VALID_YAML, 'utf8');
    ensureDesignSystem(fixture.designSystemsRoot, 'ceremonia');
    ensureDesignSystem(fixture.designSystemsRoot, 'ericedmeades');
    process.env.OPEN_DESIGN_DESIGN_SYSTEMS_ROOT = fixture.designSystemsRoot;
    delete process.env.SKIP_NETWORK_CHECKS;

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('https://api.vercel.com/')) {
        return new Response('{"error":{"code":"team_not_found"}}', { status: 404 });
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadTenantRegistry(fixture.registryPath)).rejects.toMatchObject({
      phase: 'vercel_team',
    } satisfies Partial<RegistryBootError>);
  });
});
