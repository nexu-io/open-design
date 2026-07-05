/** @module templates/index
 * Automation template catalog: the built-in template set plus user-defined template
 * read/normalize/upsert operations. Self-contained (contracts types + filesystem);
 * imports no sibling subdirectory.
 */

export {
  BUILT_IN_AUTOMATION_TEMPLATES,
  getAnyAutomationTemplate,
  getAutomationTemplate,
  listAllAutomationTemplates,
  listAutomationTemplates,
  normalizeAutomationTemplate,
  upsertUserAutomationTemplate,
} from './catalog.js';
