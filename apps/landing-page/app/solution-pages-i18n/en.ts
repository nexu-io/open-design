import type { SolutionLocaleCopy } from './types';

export const EN: SolutionLocaleCopy = {
  aiWireframeGenerator: {
    title: 'AI Wireframe Generator — prompt to wireframe with Open Design',
    description:
      'A free, open-source AI wireframe generator that turns a prompt into editable, multi-screen wireframes — and takes them all the way to shipped code. Open Design runs inside the coding agent you already use, so the wireframe and the real product share one source.',
    breadcrumb: 'AI wireframe generator',
    label: 'Tool · AI wireframe generator',
    heading: 'Wireframe at the speed of a prompt',
    lead: 'Describe the screen or flow and let your agent generate a clean, editable wireframe — consistent layout, real components, multiple screens. Then keep going: the same artifact becomes a styled prototype and shipped code, in the agent you already run.',
    heroImageAlt:
      'Editorial illustration of a prompt turning into an editable wireframe and then a finished UI, framed by a green selection box',
    tldrTitle: 'In one line',
    tldrBody:
      'Most AI wireframe generators hand you a picture you rebuild later. Open Design generates the wireframe inside your coding agent and carries it from prompt to shipped code — no export step, no handoff gap, no per-seat meter.',
    stepsTitle: 'How the AI wireframe generator works',
    steps: [
      {
        title: 'Describe the screen',
        body: 'Tell your agent what to wireframe in plain language — "a dashboard with a sidebar, a stats row, and a recent-activity table." Open Design loads the wireframe skill so the agent lays out structure and hierarchy, not just a single static image.',
        imageAlt: 'Illustration of a plain-language screen description typed into a terminal',
      },
      {
        title: 'Generate editable wireframes',
        body: 'The agent applies layout patterns and components from a reusable design system, so every screen shares spacing, grid, and structure. You get editable, coherent wireframes — multiple screens as a set, not disconnected boxes.',
        imageAlt: 'Illustration of several wireframe screens appearing with one consistent layout grid',
      },
      {
        title: 'Raise the fidelity',
        body: 'Ask the agent to take the wireframe to a styled, clickable prototype — typography, color, real interactions. The same artifact gains fidelity instead of being redrawn, so nothing is thrown away between lo-fi and hi-fi.',
        imageAlt: 'Illustration of a low-fidelity wireframe turning into a polished high-fidelity screen',
      },
      {
        title: 'Ship the code you own',
        body: 'Because the artifact lives in your project, the wireframe and the eventual code share one source of truth. Iterate by talking to the agent; the output is HTML/code you own and can ship — no vendor lock-in.',
        imageAlt: 'Illustration of a wireframe flowing into shipped code held in a green selection frame',
      },
    ],
    tableTitle: 'Open Design vs. typical AI wireframe generators',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Typical AI wireframe generators',
    tableRows: [
      {
        capability: 'Generate from a prompt',
        withOd: 'One prompt in the agent you already have open',
        without: 'Sign up for a separate web tool, generate in their cloud',
      },
      {
        capability: 'Multiple linked screens',
        withOd: 'Generated as a set with shared layout and components',
        without: 'Often one screen at a time',
      },
      {
        capability: 'Lo-fi to hi-fi',
        withOd: 'Same artifact gains fidelity — wireframe → prototype → code',
        without: 'Wireframe is a dead end; rebuild for hi-fi and for code',
      },
      {
        capability: 'Own the output',
        withOd: 'Plain files and code in your repo, fully yours',
        without: 'Editable only inside their app; export-limited',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat or per-credit subscription, vendor-hosted',
      },
    ],
    featuresTitle: 'What you can wireframe',
    features: [
      {
        title: 'Web app screens',
        body: 'Dashboards, settings, multi-screen flows — wireframed as a coherent set, then taken to code.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Mobile app flows',
        body: 'Screen-by-screen mobile journeys with consistent structure and states.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'SaaS landing pages',
        body: 'Marketing and SaaS landing layouts you can wireframe, style, and ship.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Onboarding & forms',
        body: 'Multi-step onboarding, sign-up, and form flows laid out with clear hierarchy.',
        thumb: 'example-hr-onboarding',
      },
      {
        title: 'Any visual taste',
        body: 'Start lo-fi, then carry a coherent style end to end — editorial, soft, or bold.',
        thumb: 'example-gamified-app',
      },
      {
        title: 'Landing & conversion',
        body: 'Hero, pricing, and waitlist layouts wired and on brand from the first pass.',
        thumb: 'example-kami-landing',
      },
    ],
    galleryTitle: 'Wireframes built with Open Design',
    galleryLead:
      'Every one started as a prompt and rendered to an editable, clickable artifact. Pick a template close to your idea, describe your variation, and the agent adapts it — from wireframe to shipped code.',
    gallery: [
      { thumb: 'example-dating-web', caption: 'Dating web app — multi-screen wireframe' },
      { thumb: 'example-hr-onboarding', caption: 'HR onboarding flow' },
      { thumb: 'example-kami-landing', caption: 'Product landing layout' },
      { thumb: 'example-web-prototype-taste-soft', caption: 'Soft-style web wireframe' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse templates',
    faqTitle: 'AI wireframe generator FAQ',
    faq: [
      {
        q: 'Is the AI wireframe generator free?',
        a: 'Yes. Open Design is open source and runs inside the coding agent you already use with your own provider keys — there is no per-seat or per-credit meter on the wireframe generator itself.',
      },
      {
        q: 'Are the wireframes editable, or just images?',
        a: 'Editable. The output is real HTML and code, so you can refine layout, components, and content by talking to the agent — not pixels baked into a picture you would have to rebuild.',
      },
      {
        q: 'Can a wireframe become a hi-fi prototype and real code?',
        a: 'That is the whole point. The same artifact gains fidelity — wireframe to styled prototype to shipped code — because it lives in your project, instead of being redrawn at each stage.',
      },
      {
        q: 'Which agents does it work with?',
        a: 'Open Design works with Claude Code, Codex, Cursor Agent, Gemini CLI, and a dozen more first-party adapters. You bring your own provider keys; nothing is hosted for you.',
      },
    ],
    ctaTitle: 'Generate your first wireframe tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your next screen idea into an editable wireframe — and then into shipped code — in the agent you already use.',
    relatedTitle: 'Related tools & guides',
    related: [
      { href: '/solutions/ai-ui-generator/', label: 'AI UI generator' },
      { href: '/solutions/design-to-code/', label: 'Design to code with Open Design' },
      { href: '/blog/design-to-code-tools/', label: 'Best design-to-code tools' },
      { href: '/solutions/prototype/', label: 'Prototyping with Open Design' },
    ],
  },
  aiUiGenerator: {
    title: 'AI UI Generator — prompt to production UI with Open Design',
    description:
      'A free, open-source AI UI generator that turns a prompt into a real, component-based interface — and takes it all the way to shipped code. Open Design runs inside the coding agent you already use, so the generated UI and the production code are the same artifact.',
    breadcrumb: 'AI UI generator',
    label: 'Tool · AI UI generator',
    heading: 'Generate UI you can actually ship',
    lead: 'Describe the interface and let your agent generate a real, component-based UI — consistent design system, responsive layout, working states. Then keep going: the same artifact becomes shipped code, in the agent you already run.',
    heroImageAlt:
      'Editorial illustration of a prompt turning into a component-based UI and then production code, framed by a green selection box',
    tldrTitle: 'In one line',
    tldrBody:
      'Most AI UI generators give you a mockup or a throwaway React snippet. Open Design generates the UI inside your coding agent and carries it from prompt to shipped code — real components, your design system, no export step, no per-seat meter.',
    stepsTitle: 'How the AI UI generator works',
    steps: [
      {
        title: 'Describe the interface',
        body: 'Tell your agent what to build in plain language — "a settings page with a sidebar, tabbed sections, and a save bar." Open Design loads the UI skill so the agent reaches for real components and a design system, not a one-off screen.',
        imageAlt: 'Illustration of a plain-language UI description typed into a terminal',
      },
      {
        title: 'Generate a component-based UI',
        body: 'The agent assembles the interface from reusable components and design tokens, so spacing, type scale, and color stay consistent across every screen. You get a coherent UI — not a pile of inline styles you have to untangle.',
        imageAlt: 'Illustration of a UI assembling from reusable component blocks on a grid',
      },
      {
        title: 'Refine by talking',
        body: 'Adjust layout, states, and theme in conversation — "tighten the spacing," "add an empty state," "make it dark by default." The artifact updates in place instead of being regenerated from scratch.',
        imageAlt: 'Illustration of a UI being refined through chat, with subtle before/after states',
      },
      {
        title: 'Ship the code you own',
        body: 'Because the UI lives in your project, the design and the production code share one source of truth. The output is HTML/code you own and can ship — no vendor lock-in, no redraw between design and build.',
        imageAlt: 'Illustration of a generated UI flowing into shipped code held in a green selection frame',
      },
    ],
    tableTitle: 'Open Design vs. typical AI UI generators',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Typical AI UI generators',
    tableRows: [
      {
        capability: 'Generate from a prompt',
        withOd: 'One prompt in the agent you already have open',
        without: 'Sign up for a separate web tool, generate in their cloud',
      },
      {
        capability: 'Real components',
        withOd: 'Built from a reusable design system, consistent across screens',
        without: 'One-off markup or inline styles you refactor later',
      },
      {
        capability: 'Design to code',
        withOd: 'Same artifact becomes shipped code — no redraw',
        without: 'UI mockup is a dead end; rebuild for production',
      },
      {
        capability: 'Own the output',
        withOd: 'Plain files and code in your repo, fully yours',
        without: 'Editable only inside their app; export-limited',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat or per-credit subscription, vendor-hosted',
      },
    ],
    featuresTitle: 'What you can generate',
    features: [
      {
        title: 'Web app interfaces',
        body: 'Dashboards, settings, data tables — generated as a coherent component set, then taken to code.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Mobile app UI',
        body: 'Screen-by-screen mobile interfaces with consistent components and states.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'SaaS & marketing pages',
        body: 'Landing, pricing, and marketing UI you can generate, theme, and ship.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Forms & flows',
        body: 'Multi-step forms, onboarding, and auth flows with clear hierarchy and states.',
        thumb: 'example-hr-onboarding',
      },
      {
        title: 'Design systems',
        body: 'Generate UI that respects a shared design system — tokens, components, spacing.',
        thumb: 'example-gamified-app',
      },
      {
        title: 'Any visual taste',
        body: 'Editorial, soft, or bold — carry one coherent style end to end.',
        thumb: 'example-kami-landing',
      },
    ],
    galleryTitle: 'UI built with Open Design',
    galleryLead:
      'Every one started as a prompt and rendered to a real, component-based artifact. Pick a template close to your idea, describe your variation, and the agent adapts it — from UI to shipped code.',
    gallery: [
      { thumb: 'example-dating-web', caption: 'Dating web app — component-based UI' },
      { thumb: 'example-hr-onboarding', caption: 'HR onboarding flow' },
      { thumb: 'example-kami-landing', caption: 'Product landing UI' },
      { thumb: 'example-web-prototype-taste-soft', caption: 'Soft-style web UI' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse templates',
    faqTitle: 'AI UI generator FAQ',
    faq: [
      {
        q: 'Is the AI UI generator free?',
        a: 'Yes. Open Design is open source and runs inside the coding agent you already use with your own provider keys — there is no per-seat or per-credit meter on the UI generator itself.',
      },
      {
        q: 'Does it generate real components or just a mockup?',
        a: 'Real components. The output is HTML and code built from a reusable design system, so you refine layout, states, and theme by talking to the agent instead of rebuilding a flat mockup.',
      },
      {
        q: 'Can the generated UI become production code?',
        a: 'That is the point. The same artifact becomes shipped code because it lives in your project — there is no redraw or handoff gap between the generated UI and what you deploy.',
      },
      {
        q: 'Which agents does it work with?',
        a: 'Open Design works with Claude Code, Codex, Cursor Agent, Gemini CLI, and a dozen more first-party adapters. You bring your own provider keys; nothing is hosted for you.',
      },
    ],
    ctaTitle: 'Generate your first UI tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your next interface idea into a real, component-based UI — and then into shipped code — in the agent you already use.',
    relatedTitle: 'Related tools & guides',
    related: [
      { href: '/solutions/ai-wireframe-generator/', label: 'AI wireframe generator' },
      { href: '/solutions/design-to-code/', label: 'Design to code with Open Design' },
      { href: '/blog/best-ai-design-tools/', label: 'Best AI design tools' },
      { href: '/solutions/designer/', label: 'Open Design for designers' },
    ],
  },
  designToCode: {
    title: 'Design to Code — turn a design into shipped code with Open Design',
    description:
      'A free, open-source design-to-code workflow that turns a prompt or a design into real, editable code — inside the coding agent you already use. No export, no handoff: the design and the production code are one artifact you own and ship.',
    breadcrumb: 'Design to code',
    label: 'Tool · Design to code',
    heading: 'Design to code, with no handoff',
    lead: 'Describe the screen, or bring a design, and let your agent turn it into clean, component-based code — responsive layout, real states, your stack. The design and the code are the same artifact, so nothing is lost in translation.',
    heroImageAlt:
      'Editorial illustration of a design turning into clean production code, framed by a green selection box',
    tldrTitle: 'In one line',
    tldrBody:
      'Most design-to-code tools export a one-time snapshot you then babysit. Open Design keeps the design and the code as one living artifact inside your agent — iterate by talking, ship code you own, no per-seat meter.',
    stepsTitle: 'How design to code works',
    steps: [
      {
        title: 'Start from a prompt or a design',
        body: 'Describe the screen in plain language, or point your agent at a design direction. Open Design loads the right skill so the agent builds structure and components, not a brittle one-off conversion.',
        imageAlt: 'Illustration of a design and a prompt feeding into a terminal',
      },
      {
        title: 'Generate component-based code',
        body: 'The agent produces clean, readable code built from reusable components and design tokens — consistent spacing, type, and color — instead of a wall of generated markup you would refactor away.',
        imageAlt: 'Illustration of a design converting into structured, component-based code',
      },
      {
        title: 'Iterate in conversation',
        body: 'Refine layout, states, and behavior by talking — "make it responsive," "wire the form," "match our tokens." The code updates in place; the design stays in sync because they are one artifact.',
        imageAlt: 'Illustration of code being refined through chat while the design stays in sync',
      },
      {
        title: 'Ship the code you own',
        body: 'The output is HTML/code in your repo, fully yours — no export step, no vendor-locked editor, no redraw between design and build. Ship it, then keep evolving it in the agent.',
        imageAlt: 'Illustration of finished code held in a green selection frame, ready to ship',
      },
    ],
    tableTitle: 'Open Design vs. typical design-to-code tools',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Typical design-to-code tools',
    tableRows: [
      {
        capability: 'Start the conversion',
        withOd: 'One prompt in the agent you already have open',
        without: 'Install a plugin or upload to a separate web tool',
      },
      {
        capability: 'Code quality',
        withOd: 'Clean, component-based code from a design system',
        without: 'Absolute-positioned or one-off markup you rewrite',
      },
      {
        capability: 'Design ↔ code sync',
        withOd: 'One artifact — design and code never drift apart',
        without: 'A one-time export that goes stale after the first edit',
      },
      {
        capability: 'Own the output',
        withOd: 'Plain files and code in your repo, fully yours',
        without: 'Locked to their editor or component library',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat or per-credit subscription, vendor-hosted',
      },
    ],
    featuresTitle: 'What you can convert',
    features: [
      {
        title: 'Prompt to code',
        body: 'Describe a screen and get clean, component-based code in your stack.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Wireframe to code',
        body: 'Take a generated wireframe all the way to shipped code — same artifact.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'UI to production',
        body: 'Turn a generated UI into responsive, real-state production code.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Landing pages',
        body: 'Hero, pricing, and waitlist sections converted to clean, on-brand code.',
        thumb: 'example-kami-landing',
      },
      {
        title: 'Forms & flows',
        body: 'Multi-step forms and onboarding wired up with real validation and states.',
        thumb: 'example-hr-onboarding',
      },
      {
        title: 'Any visual taste',
        body: 'Editorial, soft, or bold — the code carries one coherent style end to end.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Shipped from design with Open Design',
    galleryLead:
      'Every one started as a prompt or a design and became code you can ship. Pick a template close to your idea, describe your variation, and the agent converts it — design to code, with no handoff.',
    gallery: [
      { thumb: 'example-dating-web', caption: 'Dating web app — design to code' },
      { thumb: 'example-hr-onboarding', caption: 'HR onboarding flow' },
      { thumb: 'example-kami-landing', caption: 'Product landing in code' },
      { thumb: 'example-web-prototype-taste-soft', caption: 'Soft-style web build' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse templates',
    faqTitle: 'Design to code FAQ',
    faq: [
      {
        q: 'Is the design-to-code workflow free?',
        a: 'Yes. Open Design is open source and runs inside the coding agent you already use with your own provider keys — there is no per-seat or per-credit meter on the design-to-code workflow itself.',
      },
      {
        q: 'What kind of code does it produce?',
        a: 'Clean, component-based HTML and code built from a reusable design system, so you can read, refine, and ship it — not absolute-positioned markup you would have to rewrite.',
      },
      {
        q: 'Do the design and code stay in sync?',
        a: 'Yes — they are one artifact. Because the design and the code live together in your project, there is no one-time export that goes stale after your first edit.',
      },
      {
        q: 'Which agents does it work with?',
        a: 'Open Design works with Claude Code, Codex, Cursor Agent, Gemini CLI, and a dozen more first-party adapters. You bring your own provider keys; nothing is hosted for you.',
      },
    ],
    ctaTitle: 'Turn your next design into code tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your next screen — prompt, wireframe, or design — into clean, shippable code in the agent you already use.',
    relatedTitle: 'Related tools & guides',
    related: [
      { href: '/solutions/ai-wireframe-generator/', label: 'AI wireframe generator' },
      { href: '/solutions/ai-ui-generator/', label: 'AI UI generator' },
      { href: '/blog/design-to-code-tools/', label: 'Best design-to-code tools' },
      { href: '/solutions/engineering/', label: 'Open Design for engineering' },
    ],
  },
  prototype: {
    title: 'Build interactive prototypes with Open Design + Claude Code',
    description:
      'Turn a prompt into a clickable, multi-screen prototype without leaving your terminal. Open Design gives your coding agent the design skills, templates, and design system to ship real prototypes you can open in a browser.',
    breadcrumb: 'Prototype',
    label: 'Use case · Prototype',
    heading: 'Prototype at the speed of a prompt',
    lead: 'Describe the flow you have in mind and let your agent assemble a real, clickable prototype — multiple screens, shared styles, and live interactions — rendered straight to HTML you can open, share, and hand to engineering.',
    heroImageAlt:
      'Editorial illustration of a hand sketching a wireframe that turns into a clickable multi-screen app prototype',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design is the design layer for the coding agent you already use. For prototyping, that means going from a one-paragraph idea to a navigable, styled prototype in a single session — no design tool, no export step, no handoff gap.',
    stepsTitle: 'How prototyping works with Open Design',
    steps: [
      {
        title: 'Describe the flow',
        body: 'Tell your agent what you are building in plain language — "an onboarding flow with a welcome screen, a plan picker, and a confirmation." Open Design loads the prototype skill so the agent knows to produce screens, not a single page.',
        imageAlt:
          'Illustration of a person typing a plain-language description of an app flow into a terminal',
      },
      {
        title: 'Generate styled screens',
        body: 'The agent applies a design system and prototype templates from Open Design, so every screen shares typography, spacing, and components instead of looking like a rough draft. You get a coherent set of screens, not disconnected mockups.',
        imageAlt:
          'Illustration of several app screens appearing in sequence, all sharing one consistent visual style',
      },
      {
        title: 'Wire up the interactions',
        body: 'Buttons navigate, tabs switch, modals open. The prototype renders to self-contained HTML, so it behaves like the real thing in any browser — no prototyping tool account required to view it.',
        imageAlt:
          'Illustration of a cursor clicking through linked screens with arrows showing navigation between them',
      },
      {
        title: 'Iterate and hand off',
        body: 'Refine by talking to the agent — "make the plan picker a three-column layout." Because the artifact lives in your project, the design and the eventual code share one source of truth, closing the usual designer-to-engineer handoff gap.',
        imageAlt:
          'Illustration of a prototype being revised then passed to an engineer, with design and code merging into one file',
      },
    ],
    tableTitle: 'Prototyping with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Traditional prototyping tools',
    tableRows: [
      {
        capability: 'Go from idea to first screen',
        withOd: 'One prompt in the agent you already have open',
        without: 'Open a separate tool, start a file, drag boxes by hand',
      },
      {
        capability: 'Multiple linked screens',
        withOd: 'Generated as a set with shared styles and working navigation',
        without: 'Each frame drawn and linked manually',
      },
      {
        capability: 'Consistent visual system',
        withOd: 'Pulled from a reusable design system the agent applies',
        without: 'Re-created per file or maintained by hand',
      },
      {
        capability: 'Shareable result',
        withOd: 'Self-contained HTML — opens in any browser, no account',
        without: 'Viewer needs a seat or a share link in the vendor tool',
      },
      {
        capability: 'Path to real code',
        withOd: 'Artifact lives in your repo; design and code share one source',
        without: 'Re-built from scratch after a separate handoff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat subscription, vendor-hosted, export-limited',
      },
    ],
    featuresTitle: 'What you can prototype',
    features: [
      {
        title: 'Multi-screen web apps',
        body: 'Full flows with shared navigation — onboarding, dashboards, settings — not single pages.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Mobile app flows',
        body: 'Screen-by-screen mobile journeys with native-feeling transitions and states.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Landing pages',
        body: 'Marketing pages and SaaS landings you can click through and ship.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Any visual taste',
        body: 'Editorial, soft, or brutalist — the prototype carries a coherent style end to end.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Waitlist & pricing',
        body: 'Conversion surfaces — waitlists, pricing tables — wired and on brand.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Gamified & playful',
        body: 'Interaction-heavy concepts where motion and state are part of the pitch.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototypes people built with Open Design',
    galleryLead:
      'Every one of these started as a prompt and rendered to a clickable artifact. Pick a template close to your idea, describe your variation, and the agent adapts it.',
    gallery: [
      { thumb: "example-dating-web", caption: "Dating web app — multi-screen flow" },
      { thumb: "example-hr-onboarding", caption: "HR onboarding flow" },
      { thumb: "example-kami-landing", caption: "Product landing page" },
      { thumb: "example-web-prototype-taste-soft", caption: "Soft-style web prototype" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse prototype templates',
    faqTitle: 'Prototyping FAQ',
    faq: [
      {
        q: 'Do I need a design tool like Figma to prototype with Open Design?',
        a: 'No. Open Design runs inside your coding agent and renders prototypes to HTML. You describe the flow in language; the agent produces the screens. There is no separate canvas tool to learn or pay for.',
      },
      {
        q: 'Are the prototypes interactive or just static mockups?',
        a: 'Interactive. Navigation, tabs, and modals work because the output is real HTML and CSS. You can click through it in any browser exactly as a user would.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Open Design works with Claude Code, Codex, Cursor Agent, Gemini CLI, and a dozen more first-party adapters. You bring your own provider keys; nothing is hosted for you.',
      },
      {
        q: 'Can a prototype become the real product?',
        a: 'That is the point. The artifact lives in your project, so the same design system and components carry into production code instead of being thrown away after a handoff.',
      },
    ],
    ctaTitle: 'Prototype your next idea tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your next "what if" into something you can click — in the agent you already use.',
  },
  dashboard: {
    title: 'Generate data dashboards with Open Design + Claude Code',
    description:
      'Describe the metrics you track and let your coding agent build a styled, responsive dashboard — charts, KPI cards, and tables rendered to HTML you can host anywhere. No BI tool seat, no drag-and-drop builder.',
    breadcrumb: 'Dashboard',
    label: 'Use case · Dashboard',
    heading: 'Dashboards from a description, not a drag-and-drop builder',
    lead: 'Tell your agent what to show and how it should feel. Open Design supplies the chart patterns, layout system, and visual language so you get a coherent, presentable dashboard — not a wall of default-styled widgets.',
    heroImageAlt:
      'Editorial illustration of raw numbers on the left flowing into a clean dashboard of charts and KPI cards on the right',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns a plain-language spec of your metrics into a styled dashboard your agent renders to HTML — versioned in your repo, hostable anywhere, with no per-seat BI subscription.',
    stepsTitle: 'How dashboards work with Open Design',
    steps: [
      {
        title: 'Describe the metrics',
        body: 'List what matters — "weekly active users, revenue by plan, churn, and a 30-day trend." The agent loads the dashboard skill so it knows to lay out KPI cards, charts, and a table rather than a single block of text.',
        imageAlt: 'Illustration of a person listing the metrics they care about',
      },
      {
        title: 'Pick the chart patterns',
        body: 'Open Design ships chart and layout templates, so trends become line charts, breakdowns become bars, and ratios become the right visual — consistent typography and spacing throughout instead of mismatched defaults.',
        imageAlt: 'Illustration of several chart types arranged into a coherent grid',
      },
      {
        title: 'Wire in your data',
        body: 'Point the dashboard at a CSV, a JSON endpoint, or paste sample rows. It renders to self-contained HTML that updates when the data does — open it in any browser, drop it on any static host.',
        imageAlt: 'Illustration of a data file connecting into a live-updating dashboard',
      },
      {
        title: 'Refine and ship',
        body: 'Adjust by talking to the agent — "group revenue by region, move the KPI row to the top." The artifact lives in your project, so the dashboard is reviewable and versioned like any other code.',
        imageAlt: 'Illustration of a dashboard being refined then deployed',
      },
    ],
    tableTitle: 'Dashboards with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'BI tools / hand-coded',
    tableRows: [
      {
        capability: 'Go from metrics list to layout',
        withOd: 'One prompt; the agent lays out cards, charts, and tables',
        without: 'Drag widgets one by one, or write chart code from scratch',
      },
      {
        capability: 'Consistent visual system',
        withOd: 'Chart patterns and spacing from a reusable design system',
        without: 'Default widget styles, or styled by hand per chart',
      },
      {
        capability: 'Connect data',
        withOd: 'CSV / JSON / pasted rows, rendered to live HTML',
        without: 'Vendor connectors or bespoke data plumbing',
      },
      {
        capability: 'Hosting & sharing',
        withOd: 'Self-contained HTML on any static host, no account',
        without: 'Viewer needs a seat in the BI vendor',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Lives in your repo; diffable like code',
        without: 'Locked inside the vendor, no real diff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat subscription, vendor-hosted',
      },
    ],
    featuresTitle: "What you can build",
    features: [
      { title: "Product analytics", body: "Active users, funnels, retention — the metrics a product team lives in.", thumb: "example-dashboard" },
      { title: "Repo & dev metrics", body: "Stars, PRs, CI health — engineering dashboards from your own data.", thumb: "example-github-dashboard" },
      { title: "Finance reports", body: "Revenue, burn, runway laid out as a shareable report.", thumb: "example-finance-report" },
      { title: "Live operations", body: "Real-time metrics that refresh as the underlying data moves.", thumb: "example-live-dashboard" },
      { title: "Social & marketing", body: "Channel performance and campaign tracking in one view.", thumb: "example-social-media-dashboard" },
      { title: "Domain reports", body: "Structured reports for any field — from clinical to trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboards people built with Open Design',
    galleryLead:
      'Real dashboards rendered from a prompt and a data source. Start from one close to yours and describe the metrics you track.',
    gallery: [
      { thumb: "example-data-report", caption: "Data report" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Live ops dashboard" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Trading analysis dashboard" },
      { thumb: "example-frame-data-chart-nyt", caption: "Editorial data chart" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse dashboard templates',
    faqTitle: 'Dashboard FAQ',
    faq: [
      {
        q: 'Do I need a BI tool like Tableau or Looker?',
        a: 'No. Open Design renders dashboards to HTML inside your coding agent. You describe the metrics and point it at your data; there is no separate BI platform to license or learn.',
      },
      {
        q: 'Where does the data come from?',
        a: 'A CSV, a JSON endpoint, or rows you paste in. The dashboard is plain HTML and JavaScript, so you control exactly where it reads from — nothing is proxied through a hosted service.',
      },
      {
        q: 'Can non-technical teammates view it?',
        a: 'Yes. The output is a self-contained web page. Anyone with the link or file can open it in a browser — no account, no seat.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and a dozen more first-party adapters. You bring your own provider keys.',
      },
    ],
    ctaTitle: 'Build your dashboard tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your metrics into a dashboard you can host anywhere — in the agent you already use.',
  },
  slides: {
    title: 'Generate presentation decks with Open Design + Claude Code',
    description:
      'Turn an outline into a designed, on-brand slide deck without opening a presentation app. Open Design gives your coding agent deck templates and a visual system, rendering slides to HTML you can present, export, or share.',
    breadcrumb: 'Slides',
    label: 'Use case · Slides',
    heading: 'Decks that look designed, written by a prompt',
    lead: 'Hand your agent an outline and a tone. Open Design applies a deck template and visual system so every slide is laid out, typeset, and on-brand — not a bullet list on a blank background.',
    heroImageAlt:
      'Editorial illustration of an outline on the left turning into a sequence of designed presentation slides on the right',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns an outline into a designed HTML deck your agent renders in one session — present it in the browser, export to PDF or PPTX, and keep the source in your repo.',
    stepsTitle: 'How decks work with Open Design',
    steps: [
      {
        title: 'Give it the outline',
        body: 'Paste your talking points or a rough structure. The agent loads the deck skill so it produces a sequence of laid-out slides, not one long document.',
        imageAlt: 'Illustration of a text outline being handed to an agent',
      },
      {
        title: 'Choose a deck style',
        body: 'Open Design ships deck templates — editorial, Swiss-international, dark technical, and more. The agent applies one so typography, grid, and accents stay consistent across every slide.',
        imageAlt: 'Illustration of several deck style options laid side by side',
      },
      {
        title: 'Generate the slides',
        body: 'Each point becomes a designed slide with the right hierarchy — titles, supporting visuals, data callouts. It renders to HTML, so it presents full-screen in any browser.',
        imageAlt: 'Illustration of a sequence of finished slides with consistent styling',
      },
      {
        title: 'Present, export, iterate',
        body: 'Present from the browser, or export to PDF / PPTX for sharing. Refine by talking to the agent — "tighten the data slide, add a closing call to action." The deck source stays in your project.',
        imageAlt: 'Illustration of a deck being presented and exported to multiple formats',
      },
    ],
    tableTitle: 'Decks with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'PowerPoint / Keynote / AI slide tools',
    tableRows: [
      {
        capability: 'Go from outline to slides',
        withOd: 'One prompt; the agent lays out every slide',
        without: 'Build each slide by hand, or fight a template',
      },
      {
        capability: 'Consistent design',
        withOd: 'Deck templates with a real grid and type system',
        without: 'Theme drift, manual alignment, off-brand defaults',
      },
      {
        capability: 'Data & diagrams',
        withOd: 'Charts and callouts rendered as part of the slide',
        without: 'Paste static images or rebuild charts each time',
      },
      {
        capability: 'Export formats',
        withOd: 'HTML to present, plus PDF / PPTX export',
        without: 'Locked to one app’s format',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Source lives in your repo, diffable',
        without: 'Binary file, no meaningful diff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'App license or per-seat AI add-on',
      },
    ],
    featuresTitle: "What you can present",
    features: [
      { title: "Pitch decks", body: "Investor and sales decks with a strong narrative and clean data slides.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Swiss / editorial", body: "Grid-driven, typographic decks that look art-directed.", thumb: "example-deck-swiss-international" },
      { title: "Course modules", body: "Teaching decks with clear steps, callouts, and pacing.", thumb: "example-html-ppt-course-module" },
      { title: "Data-graph decks", body: "Dark, chart-forward decks for analytics and reviews.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Presenter mode", body: "Reveal-style decks built to present live in the browser.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Technical blueprints", body: "Architecture and knowledge decks that map complex systems.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Decks people built with Open Design',
    galleryLead:
      'Real decks rendered from an outline. Pick a style close to your talk and describe the content.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Editorial magazine deck" },
      { thumb: "example-guizang-ppt", caption: "Illustrated keynote" },
      { thumb: "example-deck-open-slide-canvas", caption: "Open slide canvas deck" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Gradient theme deck" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse deck templates',
    faqTitle: 'Slides FAQ',
    faq: [
      {
        q: 'Do I need PowerPoint or Keynote?',
        a: 'No. Open Design renders decks to HTML inside your coding agent and can export to PDF or PPTX. You present from the browser or hand off a file — no presentation app required to build it.',
      },
      {
        q: 'Are these just AI-generated bullet points?',
        a: 'No. The agent applies a real deck template with a grid, type scale, and visual hierarchy, so slides look designed rather than auto-filled.',
      },
      {
        q: 'Can I export to PowerPoint for a client?',
        a: 'Yes. Decks export to PPTX and PDF in addition to the HTML you present from, so they fit whatever the audience expects.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Build your next deck tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your outline into a designed deck — in the agent you already use.',
  },
  image: {
    title: 'Generate on-brand graphics with Open Design + Claude Code',
    description:
      'Produce social cards, article covers, and marketing graphics from a prompt — laid out with real typography and your brand system, rendered to crisp HTML you can export to PNG. No design app, no template subscription.',
    breadcrumb: 'Image',
    label: 'Use case · Image',
    heading: 'On-brand graphics, generated and laid out for you',
    lead: 'Describe the card or cover you need. Open Design composes it with real type, grid, and your brand colors — then renders to HTML you can export as an image, instead of wrestling a design app or a generic template.',
    heroImageAlt:
      'Editorial illustration of a prompt turning into a set of laid-out social cards and article covers',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns a prompt into a typeset, on-brand graphic your agent renders to HTML and exports to PNG — repeatable, versioned, and free of per-seat design tools.',
    stepsTitle: 'How graphics work with Open Design',
    steps: [
      {
        title: 'Describe the graphic',
        body: 'Say what it is — "a Twitter card for our launch with the headline and a quote." The agent loads the right skill so it composes a laid-out graphic, not a plain text block.',
        imageAlt: 'Illustration of a person describing a social card they need',
      },
      {
        title: 'Apply the brand system',
        body: 'Open Design pulls your colors, type, and spacing from a reusable design system, so every card matches the rest of your brand instead of looking like a one-off.',
        imageAlt: 'Illustration of brand colors and type being applied to a card layout',
      },
      {
        title: 'Render and export',
        body: 'The graphic renders to HTML at the exact dimensions you need — social card, cover, banner — then exports to PNG. Crisp text, real layout, no manual nudging.',
        imageAlt: 'Illustration of a graphic rendering and exporting to an image file',
      },
      {
        title: 'Reuse the recipe',
        body: 'Because it is a template, the next graphic is one prompt away — change the headline, keep the layout. Series of cards stay perfectly consistent.',
        imageAlt: 'Illustration of one card template producing a consistent series of graphics',
      },
    ],
    tableTitle: 'Graphics with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Design apps / generic templates',
    tableRows: [
      {
        capability: 'Go from idea to laid-out graphic',
        withOd: 'One prompt; the agent composes type and layout',
        without: 'Open an app, place every element by hand',
      },
      {
        capability: 'Stay on brand',
        withOd: 'Colors and type from a reusable design system',
        without: 'Re-pick brand styles per file, or drift off-brand',
      },
      {
        capability: 'Consistent series',
        withOd: 'Same template, new copy — perfectly aligned set',
        without: 'Re-align each variant manually',
      },
      {
        capability: 'Export',
        withOd: 'HTML at exact dimensions, exported to PNG',
        without: 'Manual canvas sizing and export settings',
      },
      {
        capability: 'Repeatable',
        withOd: 'A prompt-driven recipe in your repo',
        without: 'A one-off file you recreate each time',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Per-seat design tool or template marketplace',
      },
    ],
    featuresTitle: "What you can make",
    features: [
      { title: "Social cards", body: "X / Twitter cards composed with your headline and brand.", thumb: "example-card-twitter" },
      { title: "Article covers", body: "Editorial, magazine-style covers for posts and newsletters.", thumb: "example-article-magazine" },
      { title: "Xiaohongshu cards", body: "RedNote-style cards tuned for that feed.", thumb: "example-card-xiaohongshu" },
      { title: "Hero graphics", body: "Liquid, gradient hero visuals for sites and launches.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carousels", body: "Multi-slide social carousels that stay consistent across frames.", thumb: "example-social-carousel" },
      { title: "UI mock frames", body: "Notification and device frames for product storytelling.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Graphics people built with Open Design',
    galleryLead:
      'Real cards and covers rendered from a prompt. Pick one close to what you need and swap in your copy.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Pastel social card" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Editorial tri-tone poster" },
      { thumb: "example-magazine-poster", caption: "Magazine-style poster" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Bold editorial cover" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse graphic templates',
    faqTitle: 'Image FAQ',
    faq: [
      {
        q: 'Is this an AI image generator like Midjourney?',
        a: 'No. Open Design composes graphics with real layout and typography — your headline, your brand, exact dimensions — and renders to HTML you export as PNG. It is design composition, not pixel generation.',
      },
      {
        q: 'Can I make a consistent series of cards?',
        a: 'Yes. Because each graphic is a template, you keep the layout and change the copy, so a whole series stays perfectly aligned and on-brand.',
      },
      {
        q: 'What sizes can it produce?',
        a: 'Any — the graphic renders at the exact dimensions you specify, from a square social card to a wide banner, then exports to PNG.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Make your next graphic tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn a prompt into an on-brand graphic — in the agent you already use.',
  },
  video: {
    title: 'Generate motion graphics & short video with Open Design + Claude Code',
    description:
      'Turn a script into animated frames and short-form video — title cards, motion backgrounds, and outros composed with your brand system and rendered from HTML. No motion-graphics suite, no timeline scrubbing.',
    breadcrumb: 'Video',
    label: 'Use case · Video',
    heading: 'Motion graphics from a script, not a timeline',
    lead: 'Describe the moment you want — a title reveal, a data animation, a logo outro. Open Design composes animated frames with your brand system and renders them to video, no motion-graphics suite required.',
    heroImageAlt:
      'Editorial illustration of a script turning into a sequence of animated video frames',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design turns a script into animated, on-brand frames your agent renders to short-form video — composed from HTML, versioned in your repo, with no timeline editor to learn.',
    stepsTitle: 'How motion works with Open Design',
    steps: [
      {
        title: 'Describe the moment',
        body: 'Say what should happen — "a glitch title that resolves into our logo, then a closing card." The agent loads the motion skill so it produces animated frames, not a static image.',
        imageAlt: 'Illustration of a person describing a motion sequence',
      },
      {
        title: 'Apply the brand & motion style',
        body: 'Open Design supplies frame templates — cinematic light leaks, glitch titles, logo outros — and applies your colors and type, so the motion looks intentional and on-brand.',
        imageAlt: 'Illustration of brand styling applied to animated frames',
      },
      {
        title: 'Render the frames to video',
        body: 'Frames are composed in HTML and rendered to video, so timing and layout are precise and repeatable — no manual keyframing on a timeline.',
        imageAlt: 'Illustration of HTML frames rendering into a video clip',
      },
      {
        title: 'Iterate and export',
        body: 'Refine by talking to the agent — "slow the title reveal, add a caption." Export short-form clips for social or product. The source stays in your project.',
        imageAlt: 'Illustration of a video clip being refined and exported for social',
      },
    ],
    tableTitle: 'Motion with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'After Effects / motion suites',
    tableRows: [
      {
        capability: 'Go from script to animated frames',
        withOd: 'One prompt; the agent composes the sequence',
        without: 'Keyframe each element on a timeline by hand',
      },
      {
        capability: 'Stay on brand',
        withOd: 'Frame templates + your colors and type',
        without: 'Rebuild brand styling per project',
      },
      {
        capability: 'Precise, repeatable timing',
        withOd: 'Composed in HTML, rendered deterministically',
        without: 'Manual scrubbing, hard to reproduce',
      },
      {
        capability: 'Export for social',
        withOd: 'Short-form clips rendered to video',
        without: 'Export presets and codec wrangling',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Frame source lives in your repo, diffable',
        without: 'Binary project file, no real diff',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, bring your own keys, runs locally',
        without: 'Expensive suite, steep learning curve',
      },
    ],
    featuresTitle: "What you can animate",
    features: [
      { title: "Hyperframes", body: "Frame-by-frame motion sequences composed from HTML.", thumb: "example-video-hyperframes" },
      { title: "Short-form social", body: "Vertical clips built for social feeds.", thumb: "example-video-shortform" },
      { title: "Motion frame sets", body: "Reusable animated frames you compose into a clip.", thumb: "example-motion-frames" },
      { title: "Cinematic light leaks", body: "Filmic transitions and atmospheric backgrounds.", thumb: "example-frame-light-leak-cinema" },
      { title: "Glitch titles", body: "Title reveals with motion and texture.", thumb: "example-frame-glitch-title" },
      { title: "Logo outros", body: "Branded closing animations for any clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Motion people built with Open Design',
    galleryLead:
      'Real animated frames and clips rendered from a prompt. Pick one close to your idea and describe the motion.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes sequence" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Liquid motion background" },
      { thumb: "example-frame-macos-notification", caption: "Animated UI frame" },
      { thumb: "example-frame-data-chart-nyt", caption: "Animated data chart" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse motion templates',
    faqTitle: 'Video FAQ',
    faq: [
      {
        q: 'Do I need After Effects or a motion-graphics suite?',
        a: 'No. Open Design composes animated frames in HTML and renders them to video inside your coding agent. There is no timeline editor to learn or license.',
      },
      {
        q: 'What kind of video is this good for?',
        a: 'Short-form motion — title cards, data animations, logo outros, social clips. It is built for brand and product motion, not feature-length editing.',
      },
      {
        q: 'Is the timing reproducible?',
        a: 'Yes. Because frames are composed in code and rendered deterministically, you get the same result every time and can tweak it precisely with a prompt.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Animate your next idea tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn a script into motion — in the agent you already use.',
  },
  designSystem: {
    title: 'Build and apply a design system with Open Design + Claude Code',
    description:
      'Capture your brand as a reusable design system your coding agent applies to every artifact — colors, type, components, and tone in one DESIGN.md. Define it once; every prototype, deck, and dashboard stays on brand.',
    breadcrumb: 'Design System',
    label: 'Use case · Design System',
    heading: 'One design system, applied to everything your agent makes',
    lead: 'Define your brand once and Open Design carries it into every output — prototypes, decks, dashboards, graphics. The system lives in your repo as a DESIGN.md the agent reads, so consistency is automatic, not manual.',
    heroImageAlt:
      'Editorial illustration of a single design system radiating into many on-brand artifacts',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design captures your brand as a portable design system your agent applies to every artifact — defined once in your repo, enforced everywhere, with no central design tool to gate-keep it.',
    stepsTitle: 'How design systems work with Open Design',
    steps: [
      {
        title: 'Capture the system',
        body: 'Describe your brand — colors, type, spacing, voice — or point the agent at an existing site to extract it. Open Design writes it into a DESIGN.md that lives in your project.',
        imageAlt: 'Illustration of a brand being captured into a single design-system file',
      },
      {
        title: 'Start from a proven base',
        body: 'Open Design ships 140+ reference design systems — from Apple and Linear to editorial and brutalist. Fork one close to your brand instead of starting from a blank page.',
        imageAlt: 'Illustration of a gallery of reference design systems being browsed',
      },
      {
        title: 'Apply it everywhere',
        body: 'Every other skill reads the same system, so a prototype, a deck, and a dashboard all share one visual language — without you re-specifying it each time.',
        imageAlt: 'Illustration of one system applied consistently across many artifact types',
      },
      {
        title: 'Evolve it in one place',
        body: 'Change the system and the next render reflects it everywhere. Because it is a file in your repo, design decisions are reviewed and versioned like code.',
        imageAlt: 'Illustration of a design system being updated and propagating to all outputs',
      },
    ],
    tableTitle: 'Design systems with Open Design vs. the old way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Design-tool libraries / style guides',
    tableRows: [
      {
        capability: 'Define the system',
        withOd: 'A DESIGN.md the agent reads, forked from 140+ references',
        without: 'A static style guide or a tool-bound library',
      },
      {
        capability: 'Apply across artifact types',
        withOd: 'Same system feeds prototypes, decks, dashboards, graphics',
        without: 'Re-implemented per tool and per file',
      },
      {
        capability: 'Keep everything consistent',
        withOd: 'Automatic — every skill reads one source',
        without: 'Manual discipline; drifts over time',
      },
      {
        capability: 'Evolve the brand',
        withOd: 'Edit once; next render updates everywhere',
        without: 'Hunt-and-replace across files and tools',
      },
      {
        capability: 'Review & versioning',
        withOd: 'Lives in your repo, diffable like code',
        without: 'Buried in a design tool, hard to audit',
      },
      {
        capability: 'Cost & lock-in',
        withOd: 'Open source, portable, runs locally',
        without: 'Locked to a design-tool subscription',
      },
    ],
    featuresTitle: "Systems you can start from",
    features: [
      { title: "Apple", body: "Clean, restrained, system-font aesthetic.", thumb: "design-system-apple" },
      { title: "Linear", body: "Crisp product-tool look with tight spacing.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Soft, document-first, approachable.", thumb: "design-system-notion" },
      { title: "Figma", body: "Playful, colorful, creative-tool energy.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimal, neutral, research-grade.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Dense, technical, developer-native.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Design systems in Open Design',
    galleryLead:
      'A few of the 140+ reference systems you can fork as a starting point. Pick one close to your brand and adapt it.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Airbnb-style system" },
      { thumb: "design-system-vercel", caption: "Vercel-style system" },
      { thumb: "design-system-stripe", caption: "Stripe-style system" },
      { thumb: "design-system-spotify", caption: "Spotify-style system" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Browse design systems',
    faqTitle: 'Design System FAQ',
    faq: [
      {
        q: 'What exactly is the design system here?',
        a: 'A DESIGN.md file in your repo that captures colors, type, spacing, components, and voice. Every Open Design skill reads it, so your brand is applied automatically to whatever the agent produces.',
      },
      {
        q: 'Do I have to start from scratch?',
        a: 'No. Open Design ships 140+ reference design systems you can fork — from Apple and Linear to editorial and brutalist — then adapt to your brand.',
      },
      {
        q: 'How does it stay consistent across decks, dashboards, and prototypes?',
        a: 'Because all of those skills read the same DESIGN.md. Define the system once and consistency is automatic instead of something you police by hand.',
      },
      {
        q: 'Which agents can I use?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI, and more first-party adapters, with your own provider keys.',
      },
    ],
    ctaTitle: 'Define your design system tonight',
    ctaBody:
      'Star the repo, install Open Design, and give your agent one brand to apply everywhere — in the agent you already use.',
  },
  roleSoloBuilder: {
    title: 'Open Design for solo builders & indie hackers',
    description:
      'Ship like a team of one. Open Design turns your coding agent into the design half of your startup — prototypes, landing pages, dashboards, and brand visuals, all from a prompt, all on brand, all in your repo.',
    breadcrumb: 'Solo Builder',
    label: 'For · Solo Builders',
    heading: 'Your design team is the agent you already run',
    lead: 'No designer, no budget, no handoff. Describe what you need and your agent renders it — a landing page this morning, a dashboard this afternoon, social cards before you ship — all sharing one design system you defined once.',
    heroImageAlt:
      'Editorial illustration of one person at a desk surrounded by a landing page, an app, a dashboard and social cards all in one consistent style',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design is the design department a solo founder never had: prompt-to-artifact across every surface your product needs, on one brand, with zero handoff and no extra tools.',
    stepsTitle: 'How a solo builder uses Open Design',
    steps: [
      {
        title: 'Define your brand once',
        body: 'Capture colors, type and voice in a DESIGN.md (or fork one of 140+ reference systems). Every artifact you generate after that is automatically on brand.',
        imageAlt: 'Illustration of a single brand definition file',
      },
      {
        title: 'Generate whatever you need next',
        body: 'Prototype, landing page, dashboard, pitch deck, social card — same agent, same brand, one prompt each. No switching tools or re-buying seats.',
        imageAlt: 'Illustration of many artifact types coming from one prompt',
      },
      {
        title: 'Ship it — it is already real',
        body: 'Everything renders to HTML / code in your repo, so the prototype becomes the product and the landing page goes live. No throwaway mockups.',
        imageAlt: 'Illustration of an artifact going straight from prompt to live',
      },
    ],
    tableTitle: 'Solo building with Open Design vs. doing it the hard way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Going it alone today',
    tableRows: [
      { capability: 'Cover every design surface', withOd: 'One agent does prototype, landing, dashboard, brand', without: 'Stitch together five SaaS tools and tutorials' },
      { capability: 'Stay on brand', withOd: 'One DESIGN.md applied everywhere automatically', without: 'Re-create the look per tool, drift over time' },
      { capability: 'Move at solo speed', withOd: 'Idea to artifact in one prompt', without: 'Learn a design tool you do not have time for' },
      { capability: 'Ship, not mock', withOd: 'HTML / code in your repo, ready to deploy', without: 'A mockup someone still has to build' },
      { capability: 'Cost', withOd: 'Open source, bring your own keys, runs locally', without: 'A stack of per-seat subscriptions' },
    ],
    featuresTitle: 'What a solo builder can ship',
    features: [
      { title: 'Landing pages', body: 'Marketing and SaaS landings, click-through and live.', thumb: 'example-saas-landing' },
      { title: 'Product prototypes', body: 'Multi-screen web apps to validate the idea.', thumb: 'example-web-prototype' },
      { title: 'Dashboards', body: 'Metrics and admin views for your product.', thumb: 'example-dashboard' },
      { title: 'Brand graphics', body: 'Covers and posters that match your brand.', thumb: 'example-magazine-poster' },
      { title: 'Mobile flows', body: 'App screens when you go beyond the web.', thumb: 'example-mobile-app' },
      { title: 'Social cards', body: 'Launch and update cards for every channel.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Built solo with Open Design',
    galleryLead:
      'Every surface a one-person startup needs, from a prompt. Pick one close to your next move and describe it.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'SaaS landing page' },
      { thumb: 'example-web-prototype', caption: 'Product prototype' },
      { thumb: 'example-dashboard', caption: 'Product dashboard' },
      { thumb: 'example-card-twitter', caption: 'Launch social card' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse templates',
    faqTitle: 'Solo builder FAQ',
    faq: [
      { q: 'I am not a designer — can I really use this?', a: 'Yes. You describe what you want in plain language; the agent applies a design system and renders it. The skill is writing the prompt, not pushing pixels.' },
      { q: 'Does it cover everything, or just one thing?', a: 'Everything a small product needs — prototypes, landing pages, dashboards, decks, graphics — from the same agent and the same brand.' },
      { q: 'What do the outputs become?', a: 'Real HTML / code in your repo, so a prototype can become the product and a landing page can go live, instead of a mockup you throw away.' },
      { q: 'Which agents can I use?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI and more first-party adapters, with your own provider keys.' },
    ],
    ctaTitle: 'Build your whole thing tonight',
    ctaBody:
      'Star the repo, install Open Design, and let one agent be your design team — in the agent you already use.',
  },
  roleDesigner: {
    title: 'Open Design for designers',
    description:
      'Spend your time on taste, not toil. Open Design lets your agent handle the repetitive production work — variants, states, full design systems — while you direct the look and keep final say.',
    breadcrumb: 'Designer',
    label: 'For · Designers',
    heading: 'Direct the design — let the agent do the production',
    lead: 'You set the system and the standard; the agent renders the screens, the states, the variants, the high-fidelity comps. Less pushing rectangles, more deciding what good looks like.',
    heroImageAlt:
      'Editorial illustration of a designer directing while an agent fills in screens, variants and a design system',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design is the production assistant that never tires: you define the design system and call the taste; the agent generates the rest, on system, in your repo.',
    stepsTitle: 'How a designer uses Open Design',
    steps: [
      {
        title: 'Encode your system',
        body: 'Turn your brand into a DESIGN.md — type scale, color, spacing, components, voice. This is the source of truth the agent obeys.',
        imageAlt: 'Illustration of a design system captured as a file',
      },
      {
        title: 'Generate the long tail',
        body: 'Every screen, state, and variant you would otherwise hand-build — the agent renders them on system, so the boring 80% is done in minutes.',
        imageAlt: 'Illustration of many on-system screens generated at once',
      },
      {
        title: 'Direct and refine',
        body: 'Critique in language — “tighten the spacing, make the empty state warmer.” You keep final say; the agent does the iterations.',
        imageAlt: 'Illustration of a designer giving direction and the design updating',
      },
    ],
    tableTitle: 'Designing with Open Design vs. the manual way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Manual design tooling',
    tableRows: [
      { capability: 'Build a design system', withOd: 'A DESIGN.md the agent applies everywhere', without: 'A library you maintain by hand per tool' },
      { capability: 'Produce variants & states', withOd: 'Generated on system from a prompt', without: 'Duplicate frames and tweak each one' },
      { capability: 'High-fidelity comps', withOd: 'Rendered to real HTML, not a flat mockup', without: 'Pixel work that engineering rebuilds anyway' },
      { capability: 'Stay consistent', withOd: 'One system, automatically enforced', without: 'Manual discipline; drifts over time' },
      { capability: 'Handoff', withOd: 'Artifact is code — no translation gap', without: 'Spec docs and redlines' },
    ],
    featuresTitle: 'What a designer can direct',
    features: [
      { title: 'Editorial layouts', body: 'Art-directed, grid-driven compositions.', thumb: 'example-web-prototype-taste-editorial' },
      { title: 'Article covers', body: 'Magazine-style covers and features.', thumb: 'example-article-magazine' },
      { title: 'Posters', body: 'Bold typographic posters on brand.', thumb: 'example-magazine-poster' },
      { title: 'Social sets', body: 'Consistent multi-frame carousels.', thumb: 'example-social-carousel' },
      { title: 'App screens', body: 'High-fidelity mobile and web screens.', thumb: 'example-mobile-app' },
      { title: 'Dashboards', body: 'Data UI that respects your system.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Directed with Open Design',
    galleryLead:
      'High-fidelity, on-system work the agent produced from direction. Pick one close to your style and refine it.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: 'Editorial layout' },
      { thumb: 'example-article-magazine', caption: 'Magazine cover' },
      { thumb: 'example-social-carousel', caption: 'Social carousel' },
      { thumb: 'example-magazine-poster', caption: 'Typographic poster' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse templates',
    faqTitle: 'Designer FAQ',
    faq: [
      { q: 'Does this replace me?', a: 'No — it replaces the toil. You set the system and the taste; the agent does the repetitive production so you spend time on the decisions only you can make.' },
      { q: 'How do I keep control of the look?', a: 'Your DESIGN.md is the contract. The agent renders within it, and you critique in language until it is right.' },
      { q: 'Is the output editable / real?', a: 'It is real HTML/CSS, not a flat export — so it carries straight into production instead of being rebuilt.' },
      { q: 'Which agents can I use?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI and more first-party adapters, with your own provider keys.' },
    ],
    ctaTitle: 'Direct your next design tonight',
    ctaBody:
      'Star the repo, install Open Design, and let the agent handle production while you call the taste — in the agent you already use.',
  },
  roleEngineering: {
    title: 'Open Design for engineers',
    description:
      'Skip the design handoff. Open Design turns a DESIGN.md into real front-end your coding agent writes directly — on-system UI, prototypes, and dashboards, in the repo, no Figma round-trip.',
    breadcrumb: 'Engineering',
    label: 'For · Engineering',
    heading: 'From spec to front-end, no handoff in between',
    lead: 'Point your agent at a DESIGN.md and a description; it writes on-system, real front-end code — components, screens, dashboards — straight in your project. No redlines, no “waiting on design.”',
    heroImageAlt:
      'Editorial illustration of a DESIGN.md flowing directly into front-end code and rendered UI, skipping a handoff step',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design closes the designer-to-engineer gap by making the design system machine-readable: the same agent that writes your code applies the system and renders real UI.',
    stepsTitle: 'How an engineer uses Open Design',
    steps: [
      {
        title: 'Read the system, not a redline',
        body: 'The DESIGN.md lives in the repo. Your agent reads it the way it reads the rest of the codebase — no exported specs to interpret.',
        imageAlt: 'Illustration of an agent reading a DESIGN.md alongside code',
      },
      {
        title: 'Generate on-system UI',
        body: 'Describe the screen or component; the agent writes front-end that already matches the system. Prototypes, admin dashboards, internal tools — in minutes.',
        imageAlt: 'Illustration of UI code generated to match a design system',
      },
      {
        title: 'It is already your code',
        body: 'Output is HTML / framework code in your repo, reviewable in a PR. No translation step between “the design” and “the build.”',
        imageAlt: 'Illustration of generated UI landing as a reviewable PR',
      },
    ],
    tableTitle: 'Front-end with Open Design vs. the handoff way',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Design-to-dev handoff',
    tableRows: [
      { capability: 'Get a design to build from', withOd: 'A DESIGN.md your agent reads directly', without: 'A Figma file you re-interpret by hand' },
      { capability: 'Match the system', withOd: 'Enforced automatically at generation time', without: 'Eyeball it against a spec, drift creeps in' },
      { capability: 'Build internal tools / dashboards', withOd: 'Prompt → on-system front-end in the repo', without: 'Wait for a designer, then build it twice' },
      { capability: 'Review', withOd: 'It is code — diff it in a PR', without: 'Pixel-compare against a mockup' },
      { capability: 'Cost & lock-in', withOd: 'Open source, in your repo, runs locally', without: 'A design tool the whole team must license' },
    ],
    featuresTitle: 'What an engineer can generate',
    features: [
      { title: 'Web app UI', body: 'Multi-screen front-ends from a description.', thumb: 'example-web-prototype' },
      { title: 'Dev dashboards', body: 'Repo, CI and metrics dashboards.', thumb: 'example-github-dashboard' },
      { title: 'Data reports', body: 'Structured reports from your data.', thumb: 'example-data-report' },
      { title: 'Admin dashboards', body: 'Internal tools and admin views.', thumb: 'example-dashboard' },
      { title: 'Landing pages', body: 'Marketing pages without waiting on design.', thumb: 'example-saas-landing' },
      { title: 'Kanban / boards', body: 'Internal workflow UIs.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: 'Built by engineers with Open Design',
    galleryLead:
      'Real, on-system front-end generated straight in the repo. Pick one close to what you are building and describe it.',
    gallery: [
      { thumb: 'example-web-prototype', caption: 'Web app UI' },
      { thumb: 'example-github-dashboard', caption: 'Dev dashboard' },
      { thumb: 'example-data-report', caption: 'Data report' },
      { thumb: 'example-kanban-board', caption: 'Internal board UI' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse templates',
    faqTitle: 'Engineering FAQ',
    faq: [
      { q: 'Do I still need a designer?', a: 'For brand and direction, yes. But for building on-system UI and internal tools, the agent reads the DESIGN.md and writes the front-end — no handoff round-trip.' },
      { q: 'What does it output?', a: 'Real HTML / framework code in your repo, reviewable in a PR — not a mockup you reimplement.' },
      { q: 'How does it stay on system?', a: 'The DESIGN.md is the source of truth; the agent applies it at generation time, so output matches without manual pixel-checking.' },
      { q: 'Which agents can I use?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI and more first-party adapters, with your own provider keys.' },
    ],
    ctaTitle: 'Generate your next UI tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn a DESIGN.md into front-end — in the agent you already use.',
  },
  roleProductManagers: {
    title: 'Open Design for product managers',
    description:
      'Stop waiting on design bandwidth to communicate an idea. Open Design lets a PM turn a prompt into a clickable prototype or wireframe — to align stakeholders and brief the team, without a design ticket.',
    breadcrumb: 'Product Managers',
    label: 'For · Product Managers',
    heading: 'Make the idea clickable before the kickoff',
    lead: 'Describe the flow and your agent renders a real, clickable prototype you can put in front of stakeholders today — so reviews discuss the actual thing, not a paragraph in a doc.',
    heroImageAlt:
      'Editorial illustration of a PM turning a written idea into a clickable prototype shown to stakeholders',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design gives a PM a design-free way to make ideas tangible: prompt-to-prototype for alignment and briefs, without spending the team’s design budget.',
    stepsTitle: 'How a PM uses Open Design',
    steps: [
      {
        title: 'Describe the flow',
        body: 'Write the user journey in plain language — the screens, the states, the happy path. No wireframing tool required.',
        imageAlt: 'Illustration of a PM describing a user flow',
      },
      {
        title: 'Get a clickable prototype',
        body: 'The agent renders navigable screens you can actually click through — far clearer than a slide or a doc for a stakeholder review.',
        imageAlt: 'Illustration of a clickable prototype produced from a description',
      },
      {
        title: 'Align and hand off',
        body: 'Share the link, gather feedback on the real thing, then pass the prototype to design/eng as a precise, shared starting point.',
        imageAlt: 'Illustration of a prototype shared for alignment then handed to the team',
      },
    ],
    tableTitle: 'PM work with Open Design vs. waiting on design',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Without it today',
    tableRows: [
      { capability: 'Make an idea tangible', withOd: 'Prompt → clickable prototype yourself', without: 'File a design ticket and wait for bandwidth' },
      { capability: 'Align stakeholders', withOd: 'They click the real flow', without: 'They read a doc and imagine it differently' },
      { capability: 'Brief the team', withOd: 'A concrete prototype as the spec', without: 'A wall of text and back-and-forth' },
      { capability: 'Iterate before build', withOd: 'Change it in a prompt, re-share', without: 'Another round on the design queue' },
      { capability: 'Cost', withOd: 'Open source, in the agent you already use', without: 'Design hours spent on throwaway concepts' },
    ],
    featuresTitle: 'What a PM can put in front of people',
    features: [
      { title: 'Mobile flows', body: 'End-to-end app journeys, clickable.', thumb: 'example-mobile-app' },
      { title: 'Onboarding flows', body: 'Welcome → setup → first run.', thumb: 'example-mobile-onboarding' },
      { title: 'Boards & workflows', body: 'Kanban and process UIs for specs.', thumb: 'example-kanban-board' },
      { title: 'Dashboards', body: 'Metric views to frame the problem.', thumb: 'example-dashboard' },
      { title: 'Web prototypes', body: 'Multi-screen web flows to review.', thumb: 'example-web-prototype' },
      { title: 'Trend views', body: '30-day and trend snapshots for context.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'Prototyped by PMs with Open Design',
    galleryLead:
      'Clickable flows rendered from a description, ready for a stakeholder review. Pick one close to your idea and describe it.',
    gallery: [
      { thumb: 'example-mobile-app', caption: 'Mobile flow' },
      { thumb: 'example-mobile-onboarding', caption: 'Onboarding flow' },
      { thumb: 'example-kanban-board', caption: 'Workflow board' },
      { thumb: 'example-web-prototype', caption: 'Web prototype' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse templates',
    faqTitle: 'Product manager FAQ',
    faq: [
      { q: 'I can’t design — is this for me?', a: 'Yes. You describe the flow in words; the agent makes it clickable. It is for communicating and aligning, no design tool required.' },
      { q: 'Is it a real prototype or a mockup?', a: 'Real and clickable — navigation and states work, so stakeholders react to the actual experience.' },
      { q: 'Does it replace design?', a: 'No — it gives design and eng a precise, shared starting point instead of a text spec, and saves design bandwidth for the work that needs it.' },
      { q: 'Which agents can I use?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI and more first-party adapters, with your own provider keys.' },
    ],
    ctaTitle: 'Make your idea clickable tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn your next spec into something people can click — in the agent you already use.',
  },
  roleMarketing: {
    title: 'Open Design for marketing teams',
    description:
      'Ship campaigns at content speed. Open Design lets your agent produce landing pages, social cards, and campaign visuals from a prompt — on brand, on demand, without queuing design.',
    breadcrumb: 'Marketing',
    label: 'For · Marketing',
    heading: 'Campaign visuals at the speed of a prompt',
    lead: 'Landing pages, social cards, covers, announcement graphics — described in language, rendered on brand, shipped the same day. No design ticket, no template wrangling.',
    heroImageAlt:
      'Editorial illustration of a marketer turning a brief into a landing page and a set of on-brand social cards',
    tldrTitle: 'In one line',
    tldrBody:
      'Open Design is the always-on design resource for marketing: prompt-to-asset for landing pages and social, on brand, so campaigns ship at the speed you write copy.',
    stepsTitle: 'How a marketing team uses Open Design',
    steps: [
      {
        title: 'Lock the brand',
        body: 'Your DESIGN.md holds the colors, type and voice. Every asset the agent makes is automatically on brand — no per-asset re-styling.',
        imageAlt: 'Illustration of a brand system applied to marketing assets',
      },
      {
        title: 'Generate the campaign',
        body: 'Landing page, social cards, covers, announcement graphics — one prompt each, a consistent set across every channel.',
        imageAlt: 'Illustration of a full campaign set generated from prompts',
      },
      {
        title: 'Ship and iterate',
        body: 'Landing pages render to HTML you can deploy; graphics export to PNG. Change the headline, re-render the set — no waiting on a queue.',
        imageAlt: 'Illustration of campaign assets shipping and being iterated quickly',
      },
    ],
    tableTitle: 'Marketing with Open Design vs. the usual scramble',
    tableColCapability: 'What you need',
    tableColWithOd: 'With Open Design',
    tableColWithout: 'Without it today',
    tableRows: [
      { capability: 'Launch a landing page', withOd: 'Prompt → on-brand page, deployable', without: 'Brief design or fight a website builder' },
      { capability: 'A consistent social set', withOd: 'Same template, new copy, perfectly aligned', without: 'Re-align each card by hand' },
      { capability: 'Stay on brand', withOd: 'One DESIGN.md applied to every asset', without: 'Hope each asset matches the guidelines' },
      { capability: 'Move at campaign speed', withOd: 'Asset in a prompt, same day', without: 'Queue behind the design backlog' },
      { capability: 'Cost', withOd: 'Open source, no per-seat design tool', without: 'Subscriptions plus design hours' },
    ],
    featuresTitle: 'What a marketing team can ship',
    features: [
      { title: 'Landing pages', body: 'Campaign and product landings, deployable.', thumb: 'example-saas-landing' },
      { title: 'Social cards', body: 'X / Twitter cards on brand.', thumb: 'example-card-twitter' },
      { title: 'Carousels', body: 'Multi-slide social sets, consistent.', thumb: 'example-social-carousel' },
      { title: 'Posters', body: 'Announcement and event posters.', thumb: 'example-magazine-poster' },
      { title: 'Article covers', body: 'Blog and newsletter covers.', thumb: 'example-article-magazine' },
      { title: 'Web pages', body: 'Microsites and campaign pages.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: 'Shipped by marketing with Open Design',
    galleryLead:
      'On-brand campaign assets rendered from a prompt. Pick one close to your campaign and swap in your copy.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Campaign landing page' },
      { thumb: 'example-card-twitter', caption: 'Social card' },
      { thumb: 'example-social-carousel', caption: 'Social carousel' },
      { thumb: 'example-magazine-poster', caption: 'Announcement poster' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Browse templates',
    faqTitle: 'Marketing FAQ',
    faq: [
      { q: 'Do we need a designer for every asset?', a: 'No. The agent renders on-brand landing pages and social assets from a prompt, so the team ships routine campaign work without queuing design.' },
      { q: 'How do assets stay on brand?', a: 'Your DESIGN.md is applied to everything automatically — colors, type and voice carry across every asset.' },
      { q: 'Can the landing pages actually go live?', a: 'Yes — they render to HTML you can deploy, and graphics export to PNG. These are shippable assets, not mockups.' },
      { q: 'Which agents can I use?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI and more first-party adapters, with your own provider keys.' },
    ],
    ctaTitle: 'Ship your next campaign tonight',
    ctaBody:
      'Star the repo, install Open Design, and turn briefs into on-brand assets — in the agent you already use.',
  },
};

// ---------------------------------------------------------------------------
// Simplified Chinese (hand-reviewed)
// ---------------------------------------------------------------------------
