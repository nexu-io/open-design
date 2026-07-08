import type { AgentInfo } from '@open-design/contracts';

const CACHE_KEY = 'od:agents:v1';
const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedAgents {
  agents: AgentInfo[];
  fetchedAt: number;
}

export function readAgentsCache(): AgentInfo[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedAgents = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > TTL_MS) return null;
    return parsed.agents;
  } catch {
    return null;
  }
}

export function writeAgentsCache(agents: AgentInfo[]): void {
  try {
    const payload: CachedAgents = { agents, fetchedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors (e.g. private mode)
  }
}

export function clearAgentsCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

export function isAgentsCacheValid(): boolean {
  return readAgentsCache() !== null;
}

/**
 * Fetch agents once and cache. If the cache is still valid, returns the cached
 * list immediately without a network request. Used by both the home-page and
 * project composers so the expensive local CLI scan only happens once.
 */
export async function fetchAgentsCached(): Promise<AgentInfo[]> {
  const cached = readAgentsCache();
  if (cached) return cached;

  const res = await fetch('/api/agents');
  const data = await res.json();
  const agents: AgentInfo[] = data.agents ?? [];
  writeAgentsCache(agents);
  return agents;
}
