// Transport for the automations dashboard's routine list, project list,
// template catalog, and evolution-proposal list, plus the routine mutations
// (run/pause/delete). `/api/routines` and its siblings are fetched only from
// the automations slice today, but the fan-out fetch shape (parallel requests
// with independent soft-fail handling) is genuinely one atomic operation, so
// it stays a single adapter rather than four hand-wired hook-level fetches.
import type {
  AutomationEvolutionProposal,
  AutomationEvolutionProposalListResponse,
  AutomationTemplate as ContractAutomationTemplate,
  AutomationTemplateListResponse,
  ProjectsResponse,
  Routine,
  RoutinesResponse,
} from '@open-design/contracts';

export interface RoutineProjectSummary {
  id: string;
  name: string;
}

export interface AutomationsSnapshot {
  routines: Routine[];
  /** `null` means the projects fetch failed — caller should keep its prior list. */
  projects: RoutineProjectSummary[] | null;
  /** `null` means the templates fetch failed — caller should keep its prior list. */
  automationCatalog: ContractAutomationTemplate[] | null;
  /** `null` means the proposals fetch failed — caller should keep its prior list. */
  proposals: AutomationEvolutionProposal[] | null;
  proposalRefreshFailed: boolean;
}

/**
 * One round-trip snapshot of everything the automations dashboard renders.
 * Routines/projects/templates/proposals are fetched in parallel; a failed
 * routines fetch throws (the dashboard has nothing to show), while the other
 * three fail soft so a template-catalog or proposal outage doesn't blank the
 * routine list.
 */
export async function fetchAutomationsSnapshot(): Promise<AutomationsSnapshot> {
  let proposalRefreshFailed = false;
  const templateRequest = fetch('/api/automation-templates')
    .then(async (res) => {
      if (!res.ok) return null;
      return (await res.json()) as AutomationTemplateListResponse;
    })
    .catch(() => null);
  const proposalRequest = fetch('/api/automation-proposals?status=pending-review')
    .then(async (res) => {
      if (!res.ok) {
        proposalRefreshFailed = true;
        return null;
      }
      return (await res.json()) as AutomationEvolutionProposalListResponse;
    })
    .catch(() => {
      proposalRefreshFailed = true;
      return null;
    });
  const [rRes, pRes, tJson, proposalJson] = await Promise.all([
    fetch('/api/routines'),
    fetch('/api/projects'),
    templateRequest,
    proposalRequest,
  ]);
  if (!rRes.ok) throw new Error(`routines: ${rRes.status}`);
  const rJson = (await rRes.json()) as RoutinesResponse;

  let projects: RoutineProjectSummary[] | null = null;
  if (pRes.ok) {
    const pJson = (await pRes.json()) as ProjectsResponse;
    projects = (pJson.projects ?? []).map((p) => ({ id: p.id, name: p.name }));
  }

  return {
    routines: rJson.routines ?? [],
    projects,
    automationCatalog: tJson ? (Array.isArray(tJson.templates) ? tJson.templates : []) : null,
    proposals: proposalJson ? (Array.isArray(proposalJson.proposals) ? proposalJson.proposals : []) : null,
    proposalRefreshFailed,
  };
}

export interface RunRoutineResult {
  projectId?: string;
  conversationId?: string | null;
}

export async function runRoutineNow(id: string): Promise<RunRoutineResult | null> {
  const res = await fetch(`/api/routines/${id}/run`, { method: 'POST' });
  if (!res.ok && res.status !== 202) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `run failed: ${res.status}`);
  }
  return (await res.json().catch(() => null)) as RunRoutineResult | null;
}

export async function toggleRoutinePaused(routine: Routine): Promise<void> {
  const res = await fetch(`/api/routines/${routine.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: !routine.enabled }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `update failed: ${res.status}`);
  }
}

export async function deleteRoutine(id: string): Promise<void> {
  const res = await fetch(`/api/routines/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `delete failed: ${res.status}`);
  }
}
