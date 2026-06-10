/*
 * Localized agent-guide copy for the landing-page agent detail pages.
 *
 * en + zh live directly in info-page-i18n.ts. Every other landing locale
 * gets its agent pages from the part files here (split to stay under the
 * repo changed-file blob guard). buildLocalizedAgentGuides() spreads the
 * English guide first then overrides with the translation; it is wired into
 * compactInfoPageCopy so a compact locale renders fully localized agent
 * pages instead of falling back to English. Machine-translated; native
 * review welcome.
 */
import type { InfoPageCopy } from './info-page-i18n';
import type { LandingLocaleCode } from './i18n';
import { localizedAgentGuidesPartA } from './agent-guides.part-a.i18n';
import { localizedAgentGuidesPartB } from './agent-guides.part-b.i18n';
import { localizedAgentGuidesPartC } from './agent-guides.part-c.i18n';
import { localizedAgentGuidesPartD } from './agent-guides.part-d.i18n';

type Guides = NonNullable<InfoPageCopy['agentGuides']>;

export function buildLocalizedAgentGuides(en: Guides): Partial<Record<LandingLocaleCode, Guides>> {
  return {
    ...localizedAgentGuidesPartA(en),
    ...localizedAgentGuidesPartB(en),
    ...localizedAgentGuidesPartC(en),
    ...localizedAgentGuidesPartD(en),
  };
}
