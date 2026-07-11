// The automations slice's dependency on the outside world, expressed as
// interfaces it owns. The slice depends on these ports, never on `providers/`
// directly; a concrete adapter is bound to each in `dependencies.ts`. Tests
// supply hand-written fakes — no global `fetch` mocking, no module-path mocks.
import type {
  CreateRoutineRequest,
  InstalledPluginRecord,
  McpServerConfig,
  Routine,
  RoutineRun,
  RoutineRunCrystallizeResponse,
  UpdateRoutineRequest,
} from '@open-design/contracts';

import type { AutomationsSnapshot, RunRoutineResult } from './types';

/** Transport the automations dashboard needs: the aggregate snapshot fetch
 * plus every routine/proposal mutation the page triggers. */
export interface RoutinesDashboardPort {
  fetchAutomationsSnapshot(): Promise<AutomationsSnapshot>;
  runRoutineNow(id: string): Promise<RunRoutineResult | null>;
  toggleRoutinePaused(routine: Routine): Promise<void>;
  deleteRoutine(id: string): Promise<void>;
  reviewAutomationProposal(id: string, action: 'apply' | 'reject', reason: string): Promise<void>;
  crystallizeRoutineRun(routineId: string, runId: string): Promise<RoutineRunCrystallizeResponse>;
}

/** Transport a single routine row's expanded run history needs. */
export interface RoutineHistoryPort {
  fetchRoutineRuns(routineId: string, limit: number): Promise<RoutineRun[]>;
}

/** Transport the "@mention" capability picker needs: installed plugins and
 * enabled MCP servers. */
export interface AutomationCapabilitiesPort {
  listPlugins(): Promise<InstalledPluginRecord[]>;
  fetchMcpServers(): Promise<{ servers: McpServerConfig[]; templates: unknown[] } | null>;
}

/** Transport the create/edit modal's submit action needs. */
export interface AutomationSubmitPort {
  createRoutine(body: CreateRoutineRequest): Promise<Routine>;
  updateRoutine(id: string, body: UpdateRoutineRequest): Promise<Routine>;
}

/** Browser side-effect bridges (Escape key, body-scroll lock, timers) the
 * dashboard's focus-highlight and the modal's Escape/scroll-lock/autofocus
 * behavior need. Kept DOM-free at the slice layer via this port. */
export interface AutomationDomPort {
  subscribeEscapeKey(onEscape: () => void): () => void;
  lockBodyScroll(): () => void;
  scheduleTimeout(fn: () => void, delayMs: number): () => void;
  confirmDialog(message: string): boolean;
}
