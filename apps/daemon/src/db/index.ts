/**
 * @module db/index
 * Public API of the db persistence module. Re-exports the exact SQLite access surface
 * (openDatabase/closeDatabase plus per-table CRUD) from the subdirectory barrels only.
 * External daemon code imports from here; internals (core/, schema/, concern subdirs) stay private.
 */
export { openDatabase, closeDatabase } from './connection/index.js';
export {
  listDeployments,
  getDeployment,
  getDeploymentById,
  upsertDeployment,
} from './deployments/index.js';
export {
  listProjects,
  listLatestProjectRunStatuses,
  listLatestConversationRunStatuses,
  listFirstConversationRunStatuses,
  listLatestRunStatuses,
  listProjectsAwaitingInput,
  listConversationsAwaitingInput,
  getProject,
  insertProject,
  updateProject,
  deleteProject,
} from './projects/index.js';
export {
  listTemplates,
  getTemplate,
  findTemplateByNameAndProject,
  insertTemplate,
  updateTemplate,
  deleteTemplate,
} from './templates/index.js';
export {
  listConversations,
  getConversation,
  normalizeConversationSessionMode,
  insertConversation,
  updateConversation,
  deleteConversation,
} from './conversations/index.js';
export {
  getAgentSession,
  upsertAgentSession,
  getAgentSessionRecord,
  latestCompletedAssistantMessageId,
  updateAgentSessionStableHash,
  clearAgentSession,
} from './agent-sessions/index.js';
export {
  listMessages,
  upsertMessage,
  getMessageTelemetryFinalizationState,
  appendMessageStatusEvent,
  appendMessageAgentEvent,
  deleteMessage,
} from './messages/index.js';
export {
  listPreviewComments,
  upsertPreviewComment,
  updatePreviewCommentStatus,
  deletePreviewComment,
} from './preview-comments/index.js';
export {
  listRoutines,
  getRoutine,
  insertRoutine,
  updateRoutine,
  deleteRoutine,
  listRoutineRuns,
  getLatestRoutineRun,
  getRoutineRun,
  insertRoutineRun,
  insertScheduledRoutineRun,
  updateRoutineRun,
} from './routines/index.js';
export { listTabs, setTabs } from './tabs/index.js';
