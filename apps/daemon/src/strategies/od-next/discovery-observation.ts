import { DELIVERABLE_SKILL_CATALOG_VERSION, DELIVERABLE_SKILLS } from '@open-design/contracts';

type Event = { event?: string; data?: unknown };
type Load = { skill_id: string; version: string; tool_use_id: string; source: 'file_read'; status: 'requested' | 'loaded' | 'failed' | 'unknown'; content_coverage?: 'complete' | 'unknown' };
const observers = new WeakMap<object, ReturnType<typeof createObserver>>();
const MAX_LOADS = 128;

function createObserver() {
  const reads = new Map<string, Load>();
  const ranged = new Set<string>();
  let enabled = false;
  let injected = false;
  let partial = false;
  let skillRoot: string | undefined;
  return {
    push(event: Event) {
      if (!event.data || typeof event.data !== 'object') return;
      const data = event.data as Record<string, unknown>;
      if (data.type === 'skill_discovery_policy') {
        enabled = true;
        injected ||= data.injected === true;
        if (typeof data.skillRoot === 'string') skillRoot = data.skillRoot.replaceAll('\\', '/');
      }
      if (data.type === 'tool_use' && typeof data.id === 'string') {
        const input = data.input as Record<string, unknown> | undefined;
        const file = input?.filePath ?? input?.file_path ?? input?.path;
        const match = typeof file === 'string' ? /\/od-next-strategy\/assets\/task-profiles\/([a-z-]+)\.md$/.exec(file.replaceAll('\\', '/')) : null;
        const skill = DELIVERABLE_SKILLS.find((candidate) => candidate.id === match?.[1]);
        if (skill && skillRoot && file === `${skillRoot}/${skill.id}.md` && ['Read', 'read', 'read_file', 'read_text_file'].includes(String(data.name))) {
          if (reads.size >= MAX_LOADS && !reads.has(data.id)) { partial = true; return; }
          if (!reads.has(data.id)) reads.set(data.id, { skill_id: skill.id, version: skill.version,
            tool_use_id: data.id, source: 'file_read', status: 'requested' });
          if (input?.offset !== undefined || input?.limit !== undefined || input?.start_line !== undefined || input?.end_line !== undefined) ranged.add(data.id);
        } else if (JSON.stringify(input ?? {}).includes('/task-profiles/')) partial = true;
      }
      if (data.type === 'tool_result' && typeof data.toolUseId === 'string') {
        const read = reads.get(data.toolUseId);
        if (!read) return;
        read.status = data.isError === true ? 'failed'
          : typeof data.content !== 'string' || !data.content.trim() || ranged.has(data.toolUseId)
            ? 'unknown' : 'loaded';
        // Some adapters truncate only the observability copy after a successful
        // native Read. Record that real event, but never claim full body coverage.
        read.content_coverage = read.status === 'loaded' && typeof data.content === 'string'
          && !/\[truncated\]|output truncated|lines? omitted|\[REDACTED:/i.test(data.content)
          ? 'complete' : 'unknown';
      }
    },
    metadata(): Record<string, unknown> {
      const events = [...reads.values()].map((read) => ({ ...read, status: read.status === 'requested' ? 'unknown' : read.status }));
      return {
        skill_discovery_enabled: enabled,
        skill_discovery_policy_injected: injected,
        skill_discovery_catalog_version: enabled ? DELIVERABLE_SKILL_CATALOG_VERSION : null,
        skill_load_events: events,
        skill_ids_loaded: [...new Set(events.filter((read) => read.status === 'loaded').map((read) => read.skill_id))].sort(),
        skill_ids_provided: [],
        // The marker protocol has no machine-readable selection claim.
        // Read events prove loading, not that a particular artifact was delivered.
        skill_observation_status: partial || events.some((read) => read.status === 'unknown') ? 'partial' : enabled ? 'complete' : 'unavailable',
      };
    },
  };
}

/** Bounded ID-only state survives the runtime's event-ring truncation, without a DB or body copy. */
export function observeDiscoveryEvent(run: object, event: Event): void {
  let observer = observers.get(run);
  if (!observer) { observer = createObserver(); observers.set(run, observer); }
  observer.push(event);
}

export function discoveryObservation(events: readonly Event[]): Record<string, unknown> {
  const observer = createObserver();
  events.forEach((event) => observer.push(event));
  return observer.metadata();
}

export function discoveryObservationForRun(run: { events: readonly Event[] }): Record<string, unknown> {
  const observer = observers.get(run);
  if (!observer) return { ...discoveryObservation(run.events), skill_observation_status: 'partial' };
  // Includes terminal diagnostic events emitted after the live stream closed.
  run.events.filter((event) => event.event === 'diagnostic').forEach((event) => observer.push(event));
  return observer.metadata();
}
