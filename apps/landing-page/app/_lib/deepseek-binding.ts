/*
 * Binds the DeepSeek Harness design catalogue + copy to the shared
 * curated-collection components.
 */
import {
  DEEPSEEK_COLLECTION,
  DEEPSEEK_GUIDE_HREF,
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
  // The heading already names the collection, so the default eyebrow-prefixed
  // title would read "DeepSeek Harness design · DeepSeek Harness plugins …".
  hubTitle: (copy) => `${copy.collectionHeading} · Open Design`,
  // The hero's secondary CTA sends readers to the "design with DeepSeek
  // Harness inside Open Design" guide instead of the upstream repo.
  heroGuideHref: DEEPSEEK_GUIDE_HREF,
  skillCopy: (copy, slug) => deepseekSkillCopy(copy as DeepseekCopy, slug),
  categoryLabel: (copy, category) =>
    deepseekCategoryLabel(copy as DeepseekCopy, category as DeepseekSkillCategory),
};
