/*
 * Localized agent-guide copy for the landing-page agent detail pages.
 *
 * en + zh live directly in info-page-i18n.ts. Every other landing locale gets
 * its agent pages from the part files here (split for the changed-file blob
 * guard). Wired into compactInfoPageCopy via buildLocalizedAgentGuides.
 * Machine-translated; native review welcome.
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
