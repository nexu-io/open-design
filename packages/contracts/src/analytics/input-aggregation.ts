import { z } from 'zod';

/** Opt-in shadow collection; no mode in this contract suppresses original events. */
export const inputAggregationTrialSchema = z.object({
  trial_id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  revision: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  mode: z.enum(['shadow', 'drain', 'paused']),
  host: z.string().max(256),
  project_key: z.string().max(256),
}).strict();
export type InputAggregationTrial = z.infer<typeof inputAggregationTrialSchema>;

/** Cloud ingestion only; a fake-key loopback receiver is the local fault-test exception. */
export function isInputAggregationDestination(host: string, key: string): boolean {
  try {
    const u = new URL(host);
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return false;
    if (u.protocol === 'http:' && u.hostname === '127.0.0.1') return key === 'phc_local_poc_only';
    return u.protocol === 'https:' && !u.port && ['us.i.posthog.com', 'eu.i.posthog.com'].includes(u.hostname)
      && /^phc_[a-zA-Z0-9_]+$/.test(key) && key !== 'phc_local_poc_only';
  } catch { return false; }
}

export function parseInputAggregationTrial(value: unknown, host: string, key: string): InputAggregationTrial | null {
  const parsed = inputAggregationTrialSchema.safeParse(value);
  if (!parsed.success || !isInputAggregationDestination(host, key)) return null;
  const trial = parsed.data;
  if (trial.host.replace(/\/+$/, '') !== host.replace(/\/+$/, '') || trial.project_key !== key) return null;
  return trial;
}
