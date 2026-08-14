/*
 * Binds the DeepSeek Harness design catalogue + copy to the shared
 * curated-collection components.
 */
import {
  DEEPSEEK_COLLECTION,
  DEEPSEEK_HUB_PATH,
  DEEPSEEK_OD_DOWNLOAD_URL,
  DEEPSEEK_SKILLS,
  DSH_REPO_URL,
  type DeepseekSkillCategory,
} from './deepseek-design';
import {
  deepseekCategoryLabel,
  deepseekSkillCopy,
  getDeepseekCopy,
  type DeepseekCopy,
} from './deepseek-i18n';
import type { CuratedBinding } from './curated-collection';

export const DEEPSEEK_BINDING: CuratedBinding = {
  collectionName: DEEPSEEK_COLLECTION.eyebrow,
  hubPath: DEEPSEEK_HUB_PATH,
  listUrl: DSH_REPO_URL,
  downloadUrl: DEEPSEEK_OD_DOWNLOAD_URL,
  collection: DEEPSEEK_COLLECTION,
  skills: DEEPSEEK_SKILLS,
  getCopy: getDeepseekCopy,
  skillCopy: (copy, slug) => deepseekSkillCopy(copy as DeepseekCopy, slug),
  categoryLabel: (copy, category) =>
    deepseekCategoryLabel(copy as DeepseekCopy, category as DeepseekSkillCategory),
};
