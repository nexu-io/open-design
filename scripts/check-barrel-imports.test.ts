import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_BARREL_DOMAINS,
  type CapabilityBarrelDomain,
  collectBarrelImportViolationsFromSource,
  validateDomainConfig,
} from "./check-barrel-imports.ts";

// A fixture domain mirroring the real design-systems shape, so rule tests stay stable
// independent of future registry edits (a separate test asserts the real registry is valid).
const domain: CapabilityBarrelDomain = {
  name: "design-systems",
  root: "apps/daemon/src/design-systems",
  subdirs: ["core", "catalog", "user", "import", "tokens", "jobs"],
  foundation: "core",
  allowedEdges: [
    ["user", "catalog"],
    ["import", "tokens"],
    ["jobs", "user"],
    ["jobs", "catalog"],
  ],
};

const inUser = "apps/daemon/src/design-systems/user/registry.ts";
const inCatalog = "apps/daemon/src/design-systems/catalog/reader.ts";
const external = "apps/daemon/src/routes/design-systems.ts";

function violate(fromPath: string, source: string): ReturnType<typeof collectBarrelImportViolationsFromSource> {
  return collectBarrelImportViolationsFromSource(fromPath, source, domain);
}

// ── Rule 1: external code must use the domain barrel ──────────────────────────

test("Rule 1: external code importing a subdir directly is a violation", () => {
  const v = violate(external, "import { x } from '../design-systems/user/registry.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /must import `design-systems` via its barrel/);
});

test("Rule 1: external code importing the domain barrel is allowed", () => {
  assert.deepEqual(violate(external, "import { x } from '../design-systems/index.js';"), []);
});

// ── Foundation + same-subdir + allowed edges: no violation ───────────────────

test("a sibling importing core directly (any path) is allowed — foundation kernel", () => {
  assert.deepEqual(violate(inCatalog, "import { readFile } from '../core/file-utils.js';"), []);
  assert.deepEqual(violate(inCatalog, "import type { X } from '../core/index.js';"), []);
});

test("same-subdir imports are allowed", () => {
  assert.deepEqual(violate(inUser, "import { writeUserMetadata } from './revisions.js';"), []);
});

test("an allowed edge through the sibling barrel is permitted", () => {
  assert.deepEqual(violate(inUser, "import { listDesignSystems } from '../catalog/index.js';"), []);
});

// ── Rule 4: cross-subdir dependency rules ────────────────────────────────────

test("Rule 4: an allowed edge reaching a private sibling file is a violation", () => {
  const v = violate(inUser, "import { listDesignSystems } from '../catalog/reader.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /through its barrel .* not a private file/);
});

test("Rule 4: a non-declared sibling edge is a violation", () => {
  const v = violate(inUser, "import { importLocalDesignSystemProject } from '../import/index.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /may not import sibling `import\/`/);
});

// ── Rule 5: no subdir → domain root barrel ───────────────────────────────────

test("Rule 5: a subdir importing the domain root barrel is a violation", () => {
  const v = violate(inUser, "import { x } from '../index.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /must not import the domain root barrel/);
});

// ── Rule 6: domain-root files may reach a subdir only through its barrel ─────

const atDomainRoot = "apps/daemon/src/design-systems/server-services.ts";
const domainRootBarrel = "apps/daemon/src/design-systems/index.ts";

test("Rule 6: a domain-root file importing a subdir private file is a violation", () => {
  const v = violate(atDomainRoot, "import { writeUserMetadata } from './user/revisions.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /must import `user\/` through its barrel .* not a private file/);
});

test("Rule 6: a domain-root file importing a subdir barrel is allowed", () => {
  assert.deepEqual(violate(atDomainRoot, "import type { DesignSystemSummary } from './core/index.js';"), []);
  assert.deepEqual(violate(atDomainRoot, "import { listDesignSystems } from './catalog';"), []);
});

test("Rule 6: the root index importing subdir barrels stays allowed", () => {
  assert.deepEqual(
    violate(
      domainRootBarrel,
      "export { parseFrontmatter } from './core/index.js';\nexport { listDesignSystems } from './catalog/index.js';",
    ),
    [],
  );
});

test("Rule 6: the root index importing a subdir private file is a violation", () => {
  const v = violate(domainRootBarrel, "export { listDesignSystems } from './catalog/reader.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /must import `catalog\/` through its barrel/);
});

// ── Rule 7: the domain root barrel must use named re-exports, not export * ───

test("Rule 7: `export *` in the domain root barrel is a violation", () => {
  const v = violate(domainRootBarrel, "export * from './import/index.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /must re-export named symbols, not `export \*/);
});

test("Rule 7: named re-exports in the domain root barrel are allowed", () => {
  assert.deepEqual(violate(domainRootBarrel, "export { importLocalDesignSystemProject } from './import/index.js';"), []);
});

test("Rule 7: `export *` inside a subdir barrel (own private file) stays allowed", () => {
  const subdirBarrel = "apps/daemon/src/design-systems/user/index.ts";
  assert.deepEqual(violate(subdirBarrel, "export * from './registry.js';"), []);
});

// ── AST completeness: every import form is scanned ───────────────────────────

test("dynamic import() of a private sibling file is flagged (allowed-edge, wrong path)", () => {
  const v = violate(inUser, "export async function f() { return import('../catalog/reader.js'); }");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /through its barrel .* not a private file/);
});

test("dynamic import() of a non-declared sibling is flagged", () => {
  const v = violate(inUser, "export async function f() { return import('../import/import.js'); }");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /may not import sibling `import\/`/);
});

test("import-equals require() of a non-declared sibling is flagged", () => {
  const v = violate(inUser, "import req = require('../import/import.js');\nexport const _r = req;");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /may not import sibling `import\/`/);
});

test("export ... from a private sibling file is flagged", () => {
  const v = violate(inUser, "export { listDesignSystems } from '../catalog/reader.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /through its barrel .* not a private file/);
});

test("dynamic import() of a bare builtin is not flagged", () => {
  assert.deepEqual(violate(inCatalog, "export async function f() { return import('node:fs/promises'); }"), []);
});

// ── Config validation: acyclic allowedEdges ──────────────────────────────────

test("every registered capability-barrel domain has a valid, acyclic config", () => {
  for (const registered of CAPABILITY_BARREL_DOMAINS) {
    assert.deepEqual(validateDomainConfig(registered), [], `domain ${registered.name} should validate cleanly`);
  }
});

test("config validation rejects a two-way (cyclic) edge set", () => {
  const errors = validateDomainConfig({
    ...domain,
    allowedEdges: [["user", "catalog"], ["catalog", "user"]],
  });
  assert.ok(errors.some((e) => /cycle/.test(e)), errors.join("; "));
});

test("config validation rejects a self-loop edge", () => {
  const errors = validateDomainConfig({ ...domain, allowedEdges: [["catalog", "catalog"]] });
  assert.ok(errors.some((e) => /cycle/.test(e)), errors.join("; "));
});

test("config validation rejects an edge referencing an unknown subdir", () => {
  const errors = validateDomainConfig({ ...domain, allowedEdges: [["user", "ghost"]] });
  assert.ok(errors.some((e) => /not a declared subdir/.test(e)), errors.join("; "));
});

test("config validation rejects the foundation appearing in an edge", () => {
  const errors = validateDomainConfig({ ...domain, allowedEdges: [["user", "core"]] });
  assert.ok(errors.some((e) => /foundation/.test(e)), errors.join("; "));
});
