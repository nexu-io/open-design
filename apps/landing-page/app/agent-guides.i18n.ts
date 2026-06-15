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
import { localizedAgentGuidesPartE } from './agent-guides.part-e.i18n';
import { localizedAgentGuidesPartF } from './agent-guides.part-f.i18n';
import { localizedAgentGuidesPartG } from './agent-guides.part-g.i18n';
import { localizedAgentGuidesPartH } from './agent-guides.part-h.i18n';
import { localizedAgentGuidesPartI } from './agent-guides.part-i.i18n';
import { localizedAgentGuidesPartJ } from './agent-guides.part-j.i18n';
import { localizedAgentGuidesPartK } from './agent-guides.part-k.i18n';
import { localizedAgentGuidesPartL } from './agent-guides.part-l.i18n';
import { localizedAgentGuidesPartM } from './agent-guides.part-m.i18n';
import { localizedAgentGuidesPartN } from './agent-guides.part-n.i18n';
import { localizedAgentGuidesPartO } from './agent-guides.part-o.i18n';

type Guides = NonNullable<InfoPageCopy['agentGuides']>;

export function buildLocalizedAgentGuides(en: Guides): Partial<Record<LandingLocaleCode, Guides>> {
  return {
    ...localizedAgentGuidesPartA(en),
    ...localizedAgentGuidesPartB(en),
    ...localizedAgentGuidesPartC(en),
    ...localizedAgentGuidesPartD(en),
    ...localizedAgentGuidesPartE(en),
    ...localizedAgentGuidesPartF(en),
    ...localizedAgentGuidesPartG(en),
    ...localizedAgentGuidesPartH(en),
    ...localizedAgentGuidesPartI(en),
    ...localizedAgentGuidesPartJ(en),
    ...localizedAgentGuidesPartK(en),
    ...localizedAgentGuidesPartL(en),
    ...localizedAgentGuidesPartM(en),
    ...localizedAgentGuidesPartN(en),
    ...localizedAgentGuidesPartO(en),
  };
}
