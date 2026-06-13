import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { BrowserUseDiscoveryFacts, BrowserUseRunState } from '@open-design/contracts';

const BROWSER_USE_REGISTRY_BASENAME = 'codex-browser-use';
const DEFAULT_STALE_THRESHOLD_MS = 10 * 60 * 1000;

export function browserUseRegistryPath(tmpDir: string = os.tmpdir()): string {
  return path.join(tmpDir, BROWSER_USE_REGISTRY_BASENAME);
}

export function isBrowserUseRequested(...values: unknown[]): boolean {
  return values.some((value) => (
    typeof value === 'string' &&
    (
      /(^|\s)@agent-browser(\s|$)/.test(value) ||
      value.includes('Browser tab context:') ||
      value.includes('Use the selected Open Design Browser tab as the bound target.')
    )
  ));
}

export function collectBrowserUseDiscoveryFacts({
  registryPath = browserUseRegistryPath(),
  now = Date.now(),
  currentSessionId = null,
  staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS,
}: {
  registryPath?: string;
  now?: number;
  currentSessionId?: string | null;
  staleThresholdMs?: number;
} = {}): BrowserUseDiscoveryFacts {
  try {
    const entries = fs.readdirSync(registryPath, { withFileTypes: true });
    let socketCount = 0;
    let candidateCount = 0;
    let staleCount = 0;
    let newestMtime = 0;
    let currentSessionIdPresent = currentSessionId ? false : null;

    for (const entry of entries) {
      const maybeSocket = entry.isSocket?.() || entry.name.endsWith('.sock');
      if (!maybeSocket) continue;
      socketCount += 1;
      candidateCount += 1;
      if (currentSessionId && entry.name.includes(currentSessionId)) {
        currentSessionIdPresent = true;
      }
      try {
        const stat = fs.statSync(path.join(registryPath, entry.name));
        newestMtime = Math.max(newestMtime, stat.mtimeMs);
        if (now - stat.mtimeMs > staleThresholdMs) staleCount += 1;
      } catch {
        staleCount += 1;
      }
    }

    return {
      registryPath,
      registryExists: true,
      socketCount,
      candidateCount,
      staleCount,
      currentSessionIdPresent,
      probeFailureCategory: 'not-probed',
      ...(newestMtime > 0 ? { newestSocketAgeMs: Math.max(0, now - newestMtime) } : {}),
      staleThresholdMs,
    };
  } catch (error) {
    const code = typeof (error as { code?: unknown })?.code === 'string'
      ? (error as { code: string }).code
      : '';
    return {
      registryPath,
      registryExists: false,
      socketCount: 0,
      candidateCount: 0,
      staleCount: 0,
      currentSessionIdPresent: currentSessionId ? false : null,
      probeFailureCategory: code === 'ENOENT' ? 'registry-missing' : 'registry-unreadable',
      staleThresholdMs,
    };
  }
}

export function buildBrowserUseRunState({
  requested,
  agentId,
  diagnostics,
}: {
  requested: boolean;
  agentId: string | null | undefined;
  diagnostics?: BrowserUseDiscoveryFacts;
}): BrowserUseRunState | null {
  if (!requested || agentId !== 'codex') return null;
  const facts = diagnostics ?? collectBrowserUseDiscoveryFacts();
  return {
    requested: true,
    available: false,
    reason: 'no-matching-browser-backend',
    diagnostics: facts,
  };
}

export function renderBrowserUseUnavailablePrompt(state: BrowserUseRunState | null): string {
  if (!state || state.available) return '';
  return [
    '## Browser automation availability',
    '',
    `Browser automation was requested, but Open Design has not confirmed a matching in-app browser backend for this run. Reason: \`${state.reason}\`.`,
    'Treat browser-use / in-app-browser automation as unavailable for this turn.',
    'Do not use raw Google Chrome headless or ad-hoc Chrome fallback from the packaged desktop sandbox.',
    'If the task requires browser evidence, report the unavailable reason and use only the provided browser tab URL, title, and saved project context until a backend is attached.',
  ].join('\n');
}
