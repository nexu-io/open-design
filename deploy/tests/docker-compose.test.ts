import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = join(import.meta.dirname, '../..');
const composePath = join(repoRoot, 'deploy/docker-compose.yml');
const dokployPath = join(repoRoot, 'deploy/dokploy-compose.yml');

// ---------------------------------------------------------------------------
// Minimal YAML helper — handles the subset used in docker-compose files.
// Not a general-purpose parser; good enough for structural assertions.
// ---------------------------------------------------------------------------

type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

/**
 * Parse a simple YAML document (block scalars, flow sequences, nested maps).
 * Handles docker-compose.yml structure: key: value, key: [flow], block lists.
 */
function parseComposeYaml(text: string): Record<string, YamlValue> {
  const lines = text.split('\n');
  const root: Record<string, YamlValue> = {};
  let i = 0;

  function parseBlock(indent: number): Record<string, YamlValue> {
    const obj: Record<string, YamlValue> = {};
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '' || line.trim().startsWith('#')) {
        i++;
        continue;
      }
      const currentIndent = line.search(/\S/);
      if (currentIndent < indent) break;
      if (currentIndent > indent) break; // shouldn't happen at top level

      const match = line.match(/^(\s*)([^#:]+?):\s*(.*)/);
      if (!match) {
        i++;
        continue;
      }

      const key = match[2].trim();
      const value = match[3].trim();

      if (value === '' || value === '|' || value === '>') {
        // Check if next non-empty line is a list, flow sequence, or indented block
        i++;
        const childIndent = findNextContentIndent();
        if (childIndent > currentIndent) {
          const nextLine = lines[i]?.trim();
          if (nextLine?.startsWith('- ')) {
            obj[key] = parseList(currentIndent + 2);
          } else if (nextLine?.startsWith('[')) {
            // Multi-line flow sequence
            let flowText = '';
            while (i < lines.length) {
              const fl = lines[i].trim();
              flowText += ' ' + fl;
              i++;
              if (fl.includes(']')) break;
            }
            obj[key] = parseFlowSequence(flowText.trim());
          } else {
            obj[key] = parseBlock(currentIndent + 2);
          }
        } else {
          obj[key] = null;
        }
      } else if (value.startsWith('[')) {
        // Flow sequence — may span multiple lines
        let flowText = value;
        while (!flowText.includes(']') && i < lines.length - 1) {
          i++;
          flowText += ' ' + lines[i].trim();
        }
        obj[key] = parseFlowSequence(flowText);
        i++;
      } else if (value.startsWith('{')) {
        // Flow mapping — not needed for compose
        obj[key] = value;
        i++;
      } else if (value.startsWith('"') || value.startsWith("'")) {
        obj[key] = value.slice(1, -1);
        i++;
      } else {
        obj[key] = parseScalar(value);
        i++;
      }
    }
    return obj;
  }

  function parseList(indent: number): YamlValue[] {
    const items: YamlValue[] = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '' || line.trim().startsWith('#')) {
        i++;
        continue;
      }
      const currentIndent = line.search(/\S/);
      if (currentIndent < indent) break;

      const listMatch = line.match(/^\s*-\s+(.*)/);
      if (!listMatch) break;

      const value = listMatch[1].trim();
      // Check if it's a YAML mapping (key: value with space after colon)
      // vs a scalar string with colons (like volume mounts: name:/path)
      const isMapping = /^[^#:]+?:\s+/.test(value) && !value.startsWith('"') && !value.startsWith("'") && !value.startsWith('[');
      if (isMapping) {
        // It's a mapping item in a list
        const keyMatch = value.match(/^([^#:]+?):\s+(.*)/);
        if (keyMatch) {
          const obj: Record<string, YamlValue> = {};
          const k = keyMatch[1].trim();
          const v = keyMatch[2].trim();
          i++;
          if (v === '') {
            const childIndent = findNextContentIndent();
            if (childIndent > currentIndent) {
              obj[k] = parseBlock(currentIndent + 4);
            } else {
              obj[k] = null;
            }
          } else {
            obj[k] = parseScalar(v);
          }
          items.push(obj);
        } else {
          items.push(parseScalar(value));
          i++;
        }
      } else {
        items.push(parseScalar(value));
        i++;
      }
    }
    return items;
  }

  function findNextContentIndent(): number {
    let j = i;
    while (j < lines.length) {
      const line = lines[j];
      if (line.trim() === '' || line.trim().startsWith('#')) {
        j++;
        continue;
      }
      return line.search(/\S/);
    }
    return 0;
  }

  function parseFlowSequence(value: string): string[] {
    // Parse [item1, item2, ...]
    const inner = value.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
  }

  function parseScalar(value: string): string | number | boolean | null {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null' || value === '~') return null;
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
    if (value.startsWith('"') || value.startsWith("'")) return value.slice(1, -1);
    return value;
  }

  // Skip BOM and leading comments
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#') || line.trim().startsWith('version:')) {
      i++;
      continue;
    }
    break;
  }

  Object.assign(root, parseBlock(0));
  return root;
}

function getEnvKeys(doc: Record<string, YamlValue>): string[] {
  const svc = (doc.services as Record<string, YamlValue>)?.['open-design'] as Record<string, YamlValue>;
  const env = svc?.environment;
  if (!env || typeof env !== 'object' || Array.isArray(env)) return [];
  return Object.keys(env as Record<string, YamlValue>);
}

function getVolumeStrings(doc: Record<string, YamlValue>): string[] {
  const svc = (doc.services as Record<string, YamlValue>)?.['open-design'] as Record<string, YamlValue>;
  const vols = svc?.volumes;
  if (!Array.isArray(vols)) return [];
  return vols.map(String);
}

function getTopLevelVolumes(doc: Record<string, YamlValue>): string[] {
  const vols = doc.volumes;
  if (!vols || typeof vols !== 'object' || Array.isArray(vols)) return [];
  return Object.keys(vols as Record<string, YamlValue>);
}

function getTmpfs(doc: Record<string, YamlValue>): string[] {
  const svc = (doc.services as Record<string, YamlValue>)?.['open-design'] as Record<string, YamlValue>;
  const tmpfs = svc?.tmpfs;
  if (!Array.isArray(tmpfs)) return [];
  return tmpfs.map(String);
}

// ---------------------------------------------------------------------------
// Task 2.1 — docker-compose.yml invariants
// ---------------------------------------------------------------------------

test('docker-compose.yml has no deprecated Cloudflare Access env vars', async () => {
  const content = await readFile(composePath, 'utf8');
  const doc = parseComposeYaml(content);
  const envKeys = getEnvKeys(doc);

  const deprecated = [
    'OD_BEHIND_PROXY',
    'OD_CF_ACCESS_TEAM_DOMAIN',
    'OD_CF_ACCESS_AUD',
    'OD_CF_ACCESS_UNSAFE_DOMAIN',
  ];

  for (const key of deprecated) {
    assert.ok(
      !envKeys.includes(key),
      `environment should not contain deprecated key: ${key}. Found keys: ${envKeys.join(', ')}`,
    );
  }
});

test('docker-compose.yml persistent volumes are exactly open_design_data and open_design_home', async () => {
  const content = await readFile(composePath, 'utf8');
  const doc = parseComposeYaml(content);
  const volumes = getVolumeStrings(doc);

  // Extract volume names (before the colon)
  const persistent = volumes
    .filter(v => v.includes(':'))
    .map(v => v.split(':')[0].trim());

  assert.deepEqual(
    persistent.sort(),
    ['open_design_data', 'open_design_home'].sort(),
    `expected exactly open_design_data and open_design_home, got: ${persistent.join(', ')}`,
  );
});

test('docker-compose.yml tmpfs includes npm cache', async () => {
  const content = await readFile(composePath, 'utf8');
  const doc = parseComposeYaml(content);
  const tmpfs = getTmpfs(doc);

  assert.ok(
    tmpfs.some(t => t.includes('/home/open-design/.npm')),
    `tmpfs should include /home/open-design/.npm, got: ${tmpfs.join(', ')}`,
  );
});

test('docker-compose.yml top-level volumes are exactly open_design_data and open_design_home', async () => {
  const content = await readFile(composePath, 'utf8');
  const doc = parseComposeYaml(content);
  const topLevel = getTopLevelVolumes(doc);

  assert.deepEqual(
    topLevel.sort(),
    ['open_design_data', 'open_design_home'].sort(),
    `expected exactly open_design_data and open_design_home, got: ${topLevel.join(', ')}`,
  );
});

// ---------------------------------------------------------------------------
// Task 2.2 — dokploy-compose.yml mirror invariants
// ---------------------------------------------------------------------------

test('dokploy-compose.yml exists and parses as YAML', async () => {
  const content = await readFile(dokployPath, 'utf8');
  const doc = parseComposeYaml(content);
  const svc = (doc.services as Record<string, YamlValue>)?.['open-design'];
  assert.ok(svc, 'dokploy-compose.yml should have services.open-design');
});

test('dokploy-compose.yml uses expose and not ports', async () => {
  const content = await readFile(dokployPath, 'utf8');
  const doc = parseComposeYaml(content);
  const svc = (doc.services as Record<string, YamlValue>)?.['open-design'] as Record<string, YamlValue>;

  assert.deepEqual(
    svc.expose,
    ['7456'],
    'dokploy should expose port 7456',
  );
  assert.equal(
    svc.ports,
    undefined,
    'dokploy should not declare ports',
  );
});

test('dokploy-compose.yml has no deprecated Cloudflare Access env vars', async () => {
  const content = await readFile(dokployPath, 'utf8');
  const doc = parseComposeYaml(content);
  const envKeys = getEnvKeys(doc);

  const deprecated = [
    'OD_BEHIND_PROXY',
    'OD_CF_ACCESS_TEAM_DOMAIN',
    'OD_CF_ACCESS_AUD',
    'OD_CF_ACCESS_UNSAFE_DOMAIN',
  ];

  for (const key of deprecated) {
    assert.ok(
      !envKeys.includes(key),
      `environment should not contain deprecated key: ${key}. Found keys: ${envKeys.join(', ')}`,
    );
  }
});

test('dokploy-compose.yml mirrors docker-compose.yml service shape (ignoring ports/expose)', async () => {
  const [composeContent, dokployContent] = await Promise.all([
    readFile(composePath, 'utf8'),
    readFile(dokployPath, 'utf8'),
  ]);

  // Normalize both files: strip lines containing ports: or expose: and their list items
  function stripPublishing(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let skipIndent = -1;
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip the ports: or expose: key line and its indented children
      if (trimmed.startsWith('ports:') || trimmed.startsWith('expose:')) {
        skipIndent = line.search(/\S/);
        continue;
      }
      if (skipIndent >= 0) {
        const indent = line.search(/\S/);
        if (indent > skipIndent && trimmed !== '') continue;
        skipIndent = -1;
      }
      result.push(line);
    }
    return result.join('\n');
  }

  const normalizedCompose = stripPublishing(composeContent);
  const normalizedDokploy = stripPublishing(dokployContent);

  assert.equal(
    normalizedDokploy,
    normalizedCompose,
    'dokploy should mirror docker-compose after stripping ports/expose',
  );

  // Also verify top-level volumes match
  const composeDoc = parseComposeYaml(composeContent);
  const dokployDoc = parseComposeYaml(dokployContent);

  assert.deepEqual(
    getTopLevelVolumes(dokployDoc).sort(),
    getTopLevelVolumes(composeDoc).sort(),
    'top-level volumes should match between compose files',
  );
});
