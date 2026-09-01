/*
 * Binds the Codex design catalogue + copy to the shared curated-collection
 * components (`curated-skill-detail.astro`, `curated-collection-hub.astro`).
 */
import {
  AWESOME_REPO_URL,
  CODEX_COLLECTION,
  CODEX_SKILLS,
  OD_DOWNLOAD_URL,
  type CodexSkillCategory,
} from './codex-design';
import { categoryLabel, getCodexCopy, skillCopy, type CodexCopy } from './codex-i18n';
import type { CuratedBinding } from './curated-collection';

export const CODEX_BINDING: CuratedBinding = {
  collectionName: CODEX_COLLECTION.eyebrow,
  hubPath: '/plugins/codex-design/',
  listUrl: AWESOME_REPO_URL,
  downloadUrl: OD_DOWNLOAD_URL,
  collection: CODEX_COLLECTION,
  skills: CODEX_SKILLS,
  getCopy: getCodexCopy,
  skillCopy: (copy, slug) => skillCopy(copy as CodexCopy, slug),
  categoryLabel: (copy, category) =>
    categoryLabel(copy as CodexCopy, category as CodexSkillCategory),
};
