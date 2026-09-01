/*
 * `/codex-plugin/` — localized product-page copy.
 *
 * English is the authoritative source. Every active non-English landing
 * locale provides a complete, structurally identical copy object in
 * `open-design-plugin-locales/`; product names, URLs, command lines, prompts,
 * asset paths and numeric facts remain in the page component.
 */
import type { LandingLocaleCode } from './i18n';
import { OPEN_DESIGN_PLUGIN_TRANSLATIONS } from './open-design-plugin-locales';

type StepCopy = {
  phase: string;
  title: string;
  body: string;
  alt: string;
};

type PromptExampleCopy = {
  title: string;
};

type TemplateExampleCopy = {
  alt: string;
  label: string;
};

type FaqCopy = {
  q: string;
  a: string;
};

export type OpenDesignPluginCopy = {
  metadata: {
    title: string;
    description: string;
    keywords: string;
  };
  hero: {
    title: string;
    leadBefore: string;
    chatgptLabel: string;
    installAria: string;
    copy: string;
    github: string;
  };
  demo: {
    title: string;
    lead: string;
    overviewAlt: string;
    overviewLabel: string;
    overviewCaption: string;
    stepListAria: string;
    installPhase: string;
    installTitle: string;
    installBody: string;
    installNote: string;
    steps: [StepCopy, StepCopy, StepCopy, StepCopy];
  };
  use: {
    title: string;
    lead: string;
    promptLabel: string;
    copyPrompt: string;
    galleryAria: string;
    templates: [
      TemplateExampleCopy,
      TemplateExampleCopy,
      TemplateExampleCopy,
      TemplateExampleCopy,
    ];
    promptListAria: string;
    prompts: [
      PromptExampleCopy,
      PromptExampleCopy,
      PromptExampleCopy,
      PromptExampleCopy,
    ];
  };
  faq: {
    title: string;
    lead: string;
    items: [FaqCopy, FaqCopy, FaqCopy, FaqCopy, FaqCopy];
  };
  final: {
    aria: string;
    title: string;
    bodyBeforeMention: string;
    bodyAfterMention: string;
    copy: string;
    download: string;
    source: string;
  };
  clipboard: {
    copying: string;
    copied: string;
    failed: string;
  };
  schema: {
    pageName: string;
    applicationName: string;
  };
};

export const OPEN_DESIGN_PLUGIN_EN: OpenDesignPluginCopy = {
  metadata: {
    title: 'OpenDesign for Codex/ChatGPT | Install the OpenDesign Cloud Plugin',
    description:
      'Install OpenDesign Cloud in Codex/ChatGPT and create websites, slides, prototypes and design systems from the same task.',
    keywords:
      'OpenDesign Codex plugin, ChatGPT desktop plugin, Codex plugin install, OpenDesign Cloud, Codex design plugin, Codex MCP',
  },
  hero: {
    title: 'OpenDesign plugin for Codex/ChatGPT',
    leadBefore: 'Enter the instruction below into any task in your',
    chatgptLabel: 'ChatGPT desktop app',
    installAria: 'Install OpenDesign Cloud in Codex/ChatGPT',
    copy: 'Copy',
    github: 'View installation guide on GitHub ↗',
  },
  demo: {
    title: 'Install once. Create from Codex/ChatGPT.',
    lead:
      'See the complete Codex and OpenDesign workspace first, then follow the real install-to-result sequence.',
    overviewAlt:
      'A real Codex task using the OpenDesign plugin alongside the finished Goodfield cafe website',
    overviewLabel: 'Real Codex task',
    overviewCaption:
      'The prompt, OpenDesign handoff, generated files and finished website stay visible in one workspace.',
    stepListAria: 'The five stages in the real Codex plugin run',
    installPhase: 'Install',
    installTitle: 'Ask Codex to install it',
    installBody:
      'Paste this instruction into a Codex task. Codex adds the canonical Git marketplace source, installs the plugin only if it is missing and completes the local MCP setup without requiring a public catalog listing.',
    installNote: 'Paste into Codex once—the installation details are handled for you.',
    steps: [
      {
        phase: 'Use',
        title: 'Start a fresh Codex task',
        body:
          'After Codex finishes the installation, open the installed OpenDesign plugin in the new task and choose “Try now” to begin.',
        alt: 'The real OpenDesign plugin detail screen in Codex with a Try now button',
      },
      {
        phase: 'Create',
        title: 'Write the design brief',
        body:
          'Mention OpenDesign, then describe the artifact, content, visual direction and responsive requirements.',
        alt: 'A real Codex prompt asking OpenDesign to create a warm neighborhood cafe website',
      },
      {
        phase: 'Create',
        title: 'Follow the live handoff',
        body:
          'Codex confirms the direction, creates the project and hands the work into OpenDesign while files appear live.',
        alt:
          'A real Codex and OpenDesign workspace while the neighborhood cafe website is being generated',
      },
      {
        phase: 'Create',
        title: 'Review the result',
        body:
          'The same task returns the responsive Goodfield café landing page, its generated images and editable files.',
        alt:
          'The finished Goodfield neighborhood cafe landing page generated through the OpenDesign plugin in Codex',
      },
    ],
  },
  use: {
    title: 'Start with the exact prompt.',
    lead:
      'Select OpenDesign from Codex’s plugin menu, describe the artifact and keep refining from the same task. Codex renders the plugin mention as an OpenDesign chip.',
    promptLabel: 'Prompt used in the recorded Codex task',
    copyPrompt: 'Copy Codex prompt',
    galleryAria: 'Examples created with OpenDesign',
    templates: [
      {
        alt: 'Oryzo product landing page with a tactile cutting mat and cork object',
        label: 'Product launch',
      },
      {
        alt: 'OpenDesign Osaka event landing page with a typographic map',
        label: 'Event page',
      },
      {
        alt: 'Fable 5 dark editorial product website',
        label: 'Editorial site',
      },
      {
        alt: 'OpenDesign model timeline interface on a bright canvas',
        label: 'Interactive story',
      },
    ],
    promptListAria: 'OpenDesign Cloud prompt examples',
    prompts: [
      { title: 'Website' },
      { title: 'Slides' },
      { title: 'Prototype' },
      { title: 'Design system' },
    ],
  },
  faq: {
    title: 'Questions before you install',
    lead: 'Codex stays in control of the task. OpenDesign handles the visual workflow.',
    items: [
      {
        q: 'What does the plugin add to Codex?',
        a:
          'It gives Codex an OpenDesign workflow for websites, slides, prototypes and design systems. The plugin connects to the local OpenDesign MCP for briefs, projects and artifact generation.',
      },
      {
        q: 'Which Codex products are supported?',
        a:
          'The current package supports Codex Desktop and Codex CLI. Codex is the first supported host.',
      },
      {
        q: 'What do I need before installing?',
        a:
          'Use Codex CLI 0.144.6 or newer and OpenDesign 0.17.0 or newer. Install OpenDesign before registering its local MCP.',
      },
      {
        q: 'Why do I need a new Codex task?',
        a:
          'Codex loads plugin and MCP capabilities when a task starts. A fresh task picks up the newly installed OpenDesign Cloud plugin.',
      },
      {
        q: 'Does the OpenDesign window need to stay open?',
        a:
          'No. The registered local MCP can start the signed OpenDesign runtime headlessly when it is needed.',
      },
    ],
  },
  final: {
    aria: 'Install OpenDesign Cloud in Codex/ChatGPT',
    title: 'Bring OpenDesign into your next Codex/ChatGPT task.',
    bodyBeforeMention: 'Install the plugin, connect the local MCP and invoke',
    bodyAfterMention: '.',
    copy: 'Copy',
    download: 'Download OpenDesign',
    source: 'View source',
  },
  clipboard: {
    copying: 'Copying…',
    copied: 'Copied',
    failed: 'Select and copy',
  },
  schema: {
    pageName: 'OpenDesign Cloud Plugin for Codex/ChatGPT',
    applicationName: 'OpenDesign Cloud Plugin for Codex/ChatGPT',
  },
};

export function getOpenDesignPluginCopy(locale: LandingLocaleCode): OpenDesignPluginCopy {
  if (locale === 'en') return OPEN_DESIGN_PLUGIN_EN;
  return OPEN_DESIGN_PLUGIN_TRANSLATIONS[locale] ?? OPEN_DESIGN_PLUGIN_EN;
}
