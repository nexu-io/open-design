import { requestJson } from './http.ts';

export type OrbitRunStart = {
  agentRunId: string;
  projectId: string;
};

export type OrbitSummary = {
  agentRunId?: string | null;
  artifactId?: string | null;
  artifactProjectId?: string | null;
  completedAt: string;
  connectorsChecked: number;
  connectorsFailed: number;
  connectorsSkipped: number;
  connectorsSucceeded: number;
  id?: string;
  markdown: string;
  templateSkillId?: string | null;
  trigger?: 'manual' | 'scheduled';
};

export type OrbitStatus = {
  config?: {
    enabled?: boolean;
    templateSkillId?: string | null;
    time?: string;
  };
  lastRun?: OrbitSummary | null;
  lastRunsByTemplate?: Record<string, OrbitSummary>;
  nextRunAt?: string | null;
  running?: boolean;
};

export async function readOrbitStatus(baseUrl: string): Promise<OrbitStatus> {
  return await requestJson<OrbitStatus>(baseUrl, '/api/orbit/status');
}

export async function startOrbitRun(baseUrl: string): Promise<OrbitRunStart> {
  return await requestJson<OrbitRunStart>(baseUrl, '/api/orbit/run', { body: {} });
}

export async function waitForOrbitSummary(
  baseUrl: string,
  agentRunId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<OrbitStatus> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 250;
  const startedAt = Date.now();
  let last: OrbitStatus | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    last = await readOrbitStatus(baseUrl);
    if (last.running === false && last.lastRun?.agentRunId === agentRunId) {
      return last;
    }
    await delay(intervalMs);
  }

  throw new Error(`Orbit summary for ${agentRunId} was not finalized within ${timeoutMs}ms; last=${JSON.stringify(last)}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
