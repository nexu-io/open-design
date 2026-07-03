/** @module user/index
 * CRUD layer for user-owned design systems: create, read, update, delete, revisions, file listing, and project linking.
 * All state is persisted under the daemon data root; no in-memory caching.
 */
export {
  buildDesignSystemSkillsMarkdown,
  buildUserDesignSystemArchive,
  propagateWorkspaceProjectRename,
  workspaceRenameDesignSystemId,
  createUserDesignSystem,
  createUserDesignSystemRevision,
  deleteUserDesignSystem,
  linkUserDesignSystemProject,
  listUserDesignSystemFiles,
  listUserDesignSystemRevisions,
  readUserDesignSystemFile,
  readUserDesignSystemRevision,
  updateUserDesignSystem,
  updateUserDesignSystemRevisionStatus,
} from './registry.js';
