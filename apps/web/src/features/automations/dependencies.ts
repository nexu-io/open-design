// Composition root for the automations slice: binds concrete transport
// adapters to the slice's ports. This is the ONE feature file allowed to
// import `providers/` — everything else depends on a port, so swapping an
// adapter (or a fake in tests) touches only this file.
import {
  confirmDialog,
  crystallizeRoutineRun,
  deleteRoutine,
  fetchAutomationsSnapshot,
  fetchRoutineRuns,
  lockBodyScroll,
  reviewAutomationProposal,
  runRoutineNow,
  scheduleTimeout,
  subscribeEscapeKey,
  toggleRoutinePaused,
  createRoutine,
  updateRoutine,
} from '../../providers/routines';
import { fetchMcpServers } from '../../providers/mcp';
import { listPlugins } from '../../state/projects';
import type {
  AutomationCapabilitiesPort,
  AutomationDomPort,
  AutomationSubmitPort,
  RoutineHistoryPort,
  RoutinesDashboardPort,
} from './ports';

/** Default binding: the real `/api/routines` + friends transport. */
export const routinesDashboardPort: RoutinesDashboardPort = {
  fetchAutomationsSnapshot,
  runRoutineNow,
  toggleRoutinePaused,
  deleteRoutine,
  reviewAutomationProposal,
  crystallizeRoutineRun,
};

/** Default binding: a routine row's expanded run history. */
export const routineHistoryPort: RoutineHistoryPort = {
  fetchRoutineRuns,
};

/** Default binding: the "@mention" capability picker's plugin + MCP server lists. */
export const automationCapabilitiesPort: AutomationCapabilitiesPort = {
  listPlugins: () => listPlugins(),
  fetchMcpServers,
};

/** Default binding: the create/edit modal's submit transport. */
export const automationSubmitPort: AutomationSubmitPort = {
  createRoutine,
  updateRoutine,
};

/** Default binding: the Escape key, body-scroll lock, and timer bridges. */
export const automationDomPort: AutomationDomPort = {
  subscribeEscapeKey,
  lockBodyScroll,
  scheduleTimeout,
  confirmDialog,
};
