// Barrel for the project-view transport resource home. The slice's
// `dependencies.ts` binds these adapters onto its port; nothing else imports
// them directly.
export { fetchProjectRawText } from './raw-text';
export { postMemoryExtract } from './memory-extract';
