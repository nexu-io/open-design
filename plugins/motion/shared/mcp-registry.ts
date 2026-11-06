import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profiles: Record<string, { tools: string[] | null; instructions: string | null }> = JSON.parse(readFileSync(new URL('./mcp-profiles.json', import.meta.url), 'utf8'));
export const releaseProfile: string = JSON.parse(readFileSync(new URL('./mcp-release.json', import.meta.url), 'utf8')).profile;

/** The packaged profile controls discovery and dispatch, not the internal business handlers. */
export function createToolRegistry<T extends { name: string }>(implementations: readonly T[], profile = releaseProfile) {
  assert(typeof profile === 'string' && Object.hasOwn(profiles, profile), `Unknown MCP release profile: ${profile}`);
  const definition = profiles[profile];
  const byName = new Map(implementations.map(tool => [tool.name, tool]));
  assert.equal(byName.size, implementations.length, 'Duplicate MCP implementation names');
  const names = definition.tools ?? implementations.map(tool => tool.name);
  assert(Array.isArray(names) && names.every(name => typeof name === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(name)), 'Invalid MCP registration list');
  assert.equal(new Set(names).size, names.length, 'Duplicate MCP public names');
  const missing = names.filter(name => !byName.has(name));
  assert.equal(missing.length, 0, `MCP_PROFILE_INCOMPLETE (${profile}): missing registrations: ${missing.join(', ')}. Existing names are not equivalent adapters; no partial phase-one package was produced.`);
  return { profile, tools: names.map(name => byName.get(name)!), instructions: definition.instructions };
}
