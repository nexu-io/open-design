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

type AgentInstallStepCopy = {
  title: string;
  body: string;
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
  agentInstall: {
    howToName: string;
    howToDescription: string;
    eyebrow: string;
    title: string;
    intro: string;
    downloadLabel: string;
    steps: [
      AgentInstallStepCopy,
      AgentInstallStepCopy,
      AgentInstallStepCopy,
      AgentInstallStepCopy,
      AgentInstallStepCopy,
    ];
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
    title: 'Open Design for Codex/ChatGPT | Install the Open Design Cloud Plugin',
    description:
      'Install Open Design Cloud in Codex/ChatGPT and create websites, slides, prototypes and design systems from the same task.',
    keywords:
      'Open Design Codex plugin, ChatGPT desktop plugin, Codex plugin install, Open Design Cloud, Codex design plugin, Codex MCP',
  },
  hero: {
    title: 'Open Design plugin for Codex/ChatGPT',
    leadBefore: 'Enter the instruction below into any task in your',
    chatgptLabel: 'ChatGPT desktop app',
    installAria: 'Install Open Design Cloud in Codex/ChatGPT',
    copy: 'Copy',
    github: 'View source on GitHub ↗',
  },
  agentInstall: {
    howToName: 'Install the Open Design plugin in Codex',
    howToDescription:
      'Agent-executable steps for installing the Open Design Codex plugin and its local MCP registration.',
    eyebrow: 'Agent-readable installation protocol',
    title: 'Install the Codex plugin completely.',
    intro:
      'If the user asked you to install Open Design, execute this protocol in order. The request authorizes changes only to the user’s Codex plugin and MCP configuration. Preserve unrelated marketplaces, plugins, MCP servers and authentication state.',
    downloadLabel: 'Official Open Design download page ↗',
    steps: [
      {
        title: 'Preflight the supported environment',
        body:
          'Read plugin.minimumCodexCliVersion and plugin.minimumOpenDesignVersion from release-manifest.json. Before any configuration mutation, require both minimums. Accept the Open Design runtime version only from the probed Open Design CLI, or from CFBundleShortVersionString in a signed macOS app bundle that passes code-signature and Gatekeeper checks. A missing or PATH-shadowed od, including /usr/bin/od, and a stopped daemon must fall through to the signed-bundle probe. If neither verified probe is available, stop before mutation, direct the user to Open Design Settings → MCP server to copy the client-specific absolute-path snippet, and then retry. Direct the user to the official download page only when the app is absent or too old; never silently download an installer or run an unverified script.',
      },
      {
        title: 'Inspect before changing configuration',
        body:
          'Read the required selector and version from release-manifest.json, then compare them with the inspected Codex state. Inspect MCP state only through the filtered MCP snapshot derived from codex mcp list --json. Emit only name, enabled, transport.type and command; discard args, env, env_vars, headers and token fields before output. A missing open-design result is expected and non-fatal. Never print or report the raw list or codex mcp get open-design --json output because transport values can contain credentials. If the open-design marketplace name points to another source, stop and report the collision. Preserve open-design@open-design only when its installed version matches the version declared in release-manifest.json.',
      },
      {
        title: 'Install only missing components',
        body:
          'Run the marketplace command only if the canonical marketplace is absent, and stop without running the plugin command if adding the marketplace fails. Run the plugin command when open-design@open-design is missing. If it is installed at a different version, ask the user for confirmation before updating or reinstalling it; only after explicit confirmation, rerun this step with OPEN_DESIGN_PLUGIN_UPDATE_CONFIRMED=1. Skip installation only when the exact required version is present. An alreadyAdded: true result is success. Do not hand-edit Codex configuration or copy plugin files into the Codex home directory.',
      },
      {
        title: 'Ensure the local Open Design MCP',
        body:
          'Preserve an existing open-design MCP only when it is enabled, uses stdio, and its absolute command matches a verified Open Design launcher. Otherwise run the MCP installer supplied by the installed Open Design application. On POSIX systems, execute the resolved od path only after its probe returns open-design-cli:mcp-install:v1. If that path is missing, shadowed by /usr/bin/od, or cannot finish, use /usr/bin/open with the verified signed macOS app bundle and --headless --mcp-install codex, then poll only the filtered MCP snapshot with the same structural checks. If no verified launcher is available, stop, direct the user to Open Design Settings → MCP server to copy the client-specific absolute-path snippet, and retry this step. Never guess a localhost port or run codex mcp login; Vela login belongs to Open Design.',
      },
      {
        title: 'Verify, report and start a new task',
        body:
          'Verify plugin id open-design@open-design, its canonical marketplace source, and an installed version that exactly matches plugin.version in release-manifest.json. Use the filtered MCP snapshot to confirm an enabled stdio MCP named open-design whose absolute command matches the same verified Open Design launcher used during installation. Inspect only name, enabled, transport.type and command; raw args, env, env_vars, headers, token, bearer token, API key and Vela credential values must never appear in output or reports. Report what was installed and any remaining Open Design or Vela-login prerequisite. Start a new Codex task so it loads the installed plugin snapshot, then invoke @open-design.',
      },
    ],
  },
  demo: {
    title: 'Install once. Create from Codex/ChatGPT.',
    lead:
      'See the complete Codex and Open Design workspace first, then follow the real install-to-result sequence.',
    overviewAlt:
      'A real Codex task using the Open Design plugin alongside the finished Goodfield cafe website',
    overviewLabel: 'Real Codex task',
    overviewCaption:
      'The prompt, Open Design handoff, generated files and finished website stay visible in one workspace.',
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
          'After Codex finishes the installation, open the installed Open Design plugin in the new task and choose “Try now” to begin.',
        alt: 'The real Open Design plugin detail screen in Codex with a Try now button',
      },
      {
        phase: 'Create',
        title: 'Write the design brief',
        body:
          'Mention Open Design, then describe the artifact, content, visual direction and responsive requirements.',
        alt: 'A real Codex prompt asking Open Design to create a warm neighborhood cafe website',
      },
      {
        phase: 'Create',
        title: 'Follow the live handoff',
        body:
          'Codex confirms the direction, creates the project and hands the work into Open Design while files appear live.',
        alt:
          'A real Codex and Open Design workspace while the neighborhood cafe website is being generated',
      },
      {
        phase: 'Create',
        title: 'Review the result',
        body:
          'The same task returns the responsive Goodfield café landing page, its generated images and editable files.',
        alt:
          'The finished Goodfield neighborhood cafe landing page generated through the Open Design plugin in Codex',
      },
    ],
  },
  use: {
    title: 'Start with the exact prompt.',
    lead:
      'Select Open Design from Codex’s plugin menu, describe the artifact and keep refining from the same task. Codex renders the plugin mention as an Open Design chip.',
    promptLabel: 'Prompt used in the recorded Codex task',
    copyPrompt: 'Copy Codex prompt',
    galleryAria: 'Examples created with Open Design',
    templates: [
      {
        alt: 'Oryzo product landing page with a tactile cutting mat and cork object',
        label: 'Product launch',
      },
      {
        alt: 'Open Design Osaka event landing page with a typographic map',
        label: 'Event page',
      },
      {
        alt: 'Fable 5 dark editorial product website',
        label: 'Editorial site',
      },
      {
        alt: 'Open Design model timeline interface on a bright canvas',
        label: 'Interactive story',
      },
    ],
    promptListAria: 'Open Design Cloud prompt examples',
    prompts: [
      { title: 'Website' },
      { title: 'Slides' },
      { title: 'Prototype' },
      { title: 'Design system' },
    ],
  },
  faq: {
    title: 'Questions before you install',
    lead: 'Codex stays in control of the task. Open Design handles the visual workflow.',
    items: [
      {
        q: 'What does the plugin add to Codex?',
        a:
          'It gives Codex an Open Design workflow for websites, slides, prototypes and design systems. The plugin connects to the local Open Design MCP for briefs, projects and artifact generation.',
      },
      {
        q: 'Which Codex products are supported?',
        a:
          'The current package supports Codex Desktop and Codex CLI. Codex is the first supported host.',
      },
      {
        q: 'What do I need before installing?',
        a:
          'Use Codex CLI 0.144.6 or newer and Open Design 0.17.0 or newer. Install Open Design before registering its local MCP.',
      },
      {
        q: 'Why do I need a new Codex task?',
        a:
          'Codex loads plugin and MCP capabilities when a task starts. A fresh task picks up the newly installed Open Design Cloud plugin.',
      },
      {
        q: 'Does the Open Design window need to stay open?',
        a:
          'No. The registered local MCP can start the signed Open Design runtime headlessly when it is needed.',
      },
    ],
  },
  final: {
    aria: 'Install Open Design Cloud in Codex/ChatGPT',
    title: 'Bring Open Design into your next Codex/ChatGPT task.',
    bodyBeforeMention: 'Install the plugin, connect the local MCP and invoke',
    bodyAfterMention: '.',
    copy: 'Copy',
    download: 'Download Open Design',
    source: 'View source',
  },
  clipboard: {
    copying: 'Copying…',
    copied: 'Copied',
    failed: 'Select and copy',
  },
  schema: {
    pageName: 'Open Design Cloud Plugin for Codex/ChatGPT',
    applicationName: 'Open Design Cloud Plugin for Codex/ChatGPT',
  },
};

export function getOpenDesignPluginCopy(locale: LandingLocaleCode): OpenDesignPluginCopy {
  if (locale === 'en') return OPEN_DESIGN_PLUGIN_EN;
  return OPEN_DESIGN_PLUGIN_TRANSLATIONS[locale] ?? OPEN_DESIGN_PLUGIN_EN;
}
