import type { AgentGuideCopy, AgentRichCopy } from './info-page-i18n';
import { DEEPSEEK_HARNESS_REPO } from './cta-actions';

const firstParagraph = (rich: AgentRichCopy, sectionId: string): string | undefined => {
  const section = rich.sections.find(({ id }) => id === sectionId);
  const paragraph = section?.blocks.find((block) => block.kind === 'p');
  return paragraph?.kind === 'p' ? paragraph.text : undefined;
};

export type DeepSeekHarnessTutorialCopy = {
  title: string;
  heading: string;
  lead: string;
  heroCtaLead: string;
  intro: string[];
};

// English and Simplified Chinese already carry the tutorial-first rewrite.
// Older locale shards still contain a fully translated architecture-first
// frame. Reuse their translated setup/workflow paragraphs to shape the visible
// opening without introducing machine-generated strings at render time.
export const deepseekHarnessTutorialCopy = (
  page: AgentGuideCopy,
): DeepSeekHarnessTutorialCopy => {
  const rich = page.rich;
  if (!rich) {
    return {
      title: page.title,
      heading: page.heading,
      lead: page.lead,
      heroCtaLead: page.lead,
      intro: [],
    };
  }

  const isCurrentTutorialCopy = rich.heroCtaActions.some(
    ({ href }) => href === DEEPSEEK_HARNESS_REPO,
  );
  if (isCurrentTutorialCopy) {
    return {
      title: page.title,
      heading: page.heading,
      lead: page.lead,
      heroCtaLead: rich.heroCtaLead,
      intro: rich.intro,
    };
  }

  const designContract = firstParagraph(rich, 'why-design');
  const workflow = firstParagraph(rich, 'design-workflow');
  const localizedContext = rich.intro[1];

  return {
    title: page.title,
    heading: page.heading,
    lead: designContract ?? page.lead,
    heroCtaLead: workflow ?? rich.heroCtaLead,
    intro: localizedContext ? [localizedContext] : rich.intro.slice(1),
  };
};
