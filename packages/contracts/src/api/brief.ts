export const OPEN_DESIGN_BRIEF_ARTIFACT_TYPES = [
  'website',
  'product-prototype',
  'presentation',
  'document',
  'image',
  'video',
  'audio',
  'design-system',
] as const;

export type OpenDesignBriefArtifactType =
  (typeof OPEN_DESIGN_BRIEF_ARTIFACT_TYPES)[number];

export interface OpenDesignBriefOption {
  /** Stable, unlocalized value submitted by Desktop and CLI hosts. */
  id: string;
  label: string;
  description: string;
}

export interface OpenDesignBriefQuestion {
  /** Stable, artifact-qualified decision id. */
  id: string;
  label: string;
  description: string;
  type: 'radio';
  required: true;
  allowCustom: false;
  defaultOptionId: string;
  options: readonly OpenDesignBriefOption[];
}

export type OpenDesignBriefAnswers = Readonly<Record<string, readonly string[]>>;

export interface OpenDesignBriefDecision {
  artifactType: OpenDesignBriefArtifactType;
  decisionSource: 'open-design-shared-brief-v1';
  questions: readonly OpenDesignBriefQuestion[];
  answers: OpenDesignBriefAnswers;
  summary: string;
  complete: boolean;
}

export interface CollectOpenDesignBriefInput {
  artifactType: OpenDesignBriefArtifactType;
  previousArtifactType?: OpenDesignBriefArtifactType;
  knownAnswers?: Readonly<Record<string, unknown>>;
  /**
   * Explicit "use recommended defaults" path. This is the deterministic
   * counterpart of the product's "don't ask, generate" Brief exception.
   */
  skip?: boolean;
}

export type OpenDesignBriefCatalog = Readonly<
  Record<OpenDesignBriefArtifactType, readonly OpenDesignBriefQuestion[]>
>;

function option(id: string, label: string, description: string): OpenDesignBriefOption {
  return { id, label, description };
}

function question(
  id: string,
  label: string,
  description: string,
  defaultOptionId: string,
  options: readonly OpenDesignBriefOption[],
): OpenDesignBriefQuestion {
  return {
    id,
    label,
    description,
    type: 'radio',
    required: true,
    allowCustom: false,
    defaultOptionId,
    options,
  };
}

function freezeBriefCatalog<
  T extends Record<string, readonly OpenDesignBriefQuestion[]>,
>(catalog: T): T {
  for (const questions of Object.values(catalog)) {
    for (const item of questions) {
      for (const candidate of item.options) Object.freeze(candidate);
      Object.freeze(item.options);
      Object.freeze(item);
    }
    Object.freeze(questions);
  }
  return Object.freeze(catalog);
}

/**
 * Canonical V1 decision catalog shared by the local OpenDesign MCP, Codex
 * Desktop widget, and structured CLI representation. Visible copy may be
 * localized later, but ids, ordering, defaults, and skip behavior are product
 * protocol.
 */
export const openDesignBriefCatalog: OpenDesignBriefCatalog = freezeBriefCatalog({
  website: [
    question(
      'website.goal',
      'What should this website do?',
      'Choose the primary conversion goal.',
      'launch-product',
      [
        option('launch-product', 'Launch a product', 'Explain the value and drive sign-ups.'),
        option('sell-service', 'Sell a service', 'Establish trust and capture leads.'),
        option('showcase-work', 'Showcase work', 'Highlight projects and invite inquiries.'),
      ],
    ),
    question(
      'website.scope',
      'How much content should it include?',
      'Choose the smallest useful information architecture.',
      'focused-landing',
      [
        option('focused-landing', 'Focused landing page', 'Hero, proof, benefits, and a primary call to action.'),
        option('rich-single-page', 'Rich single page', 'Full story, features, proof, FAQ, and call to action.'),
        option('small-multi-page', 'Small multi-page site', 'Home plus two or three supporting pages.'),
      ],
    ),
    question(
      'website.character',
      'Pick a visual character',
      'Set the overall visual tone.',
      'refined-tech',
      [
        option('refined-tech', 'Refined tech', 'Crisp, modern, and confident.'),
        option('editorial-bold', 'Editorial bold', 'Expressive type and strong contrast.'),
        option('warm-human', 'Warm human', 'Approachable, tactile, and optimistic.'),
      ],
    ),
  ],
  'product-prototype': [
    question(
      'prototype.platform',
      'Which platform should the prototype target?',
      'Choose the primary interaction environment.',
      'web',
      [
        option('web', 'Web app', 'Desktop-first responsive browser experience.'),
        option('mobile', 'Mobile app', 'Touch-first phone experience.'),
        option('cross-platform', 'Cross-platform', 'A responsive flow that demonstrates both.'),
      ],
    ),
    question(
      'prototype.scope',
      'How much of the product should be interactive?',
      'Choose the smallest testable journey.',
      'core-flow',
      [
        option('core-flow', 'One core flow', 'A focused happy path with its important states.'),
        option('connected-flows', 'Connected flows', 'Two or three related journeys.'),
        option('product-shell', 'Product shell', 'Navigation and the key product areas.'),
      ],
    ),
    question(
      'prototype.fidelity',
      'What fidelity should the prototype use?',
      'Choose how polished the first version should feel.',
      'polished',
      [
        option('wireframe', 'Structured wireframe', 'Prioritize information architecture and flow.'),
        option('polished', 'Polished product UI', 'Use production-minded layout and visual hierarchy.'),
        option('conceptual', 'Exploratory concept', 'Push a distinctive interaction direction.'),
      ],
    ),
  ],
  presentation: [
    question(
      'presentation.purpose',
      'What is the presentation for?',
      'Choose the audience outcome.',
      'persuade',
      [
        option('persuade', 'Persuade', 'Win support for an idea, proposal, or product.'),
        option('inform', 'Inform', 'Explain findings, plans, or progress clearly.'),
        option('teach', 'Teach', 'Help the audience understand and apply a concept.'),
      ],
    ),
    question(
      'presentation.length',
      'How long should the deck be?',
      'Choose a useful narrative depth.',
      'standard',
      [
        option('short', 'Short: 5–7 slides', 'A concise executive narrative.'),
        option('standard', 'Standard: 8–12 slides', 'A complete story with evidence.'),
        option('detailed', 'Detailed: 13–18 slides', 'A deeper walkthrough with supporting material.'),
      ],
    ),
    question(
      'presentation.character',
      'Pick a visual character',
      'Set the deck’s presentation style.',
      'editorial',
      [
        option('editorial', 'Editorial', 'Strong typography and paced storytelling.'),
        option('executive', 'Executive', 'Restrained, clear, and evidence-led.'),
        option('visual', 'Visual showcase', 'Large visuals with minimal supporting copy.'),
      ],
    ),
  ],
  document: [
    question(
      'document.purpose',
      'What should the document accomplish?',
      'Choose its primary job.',
      'proposal',
      [
        option('proposal', 'Make a proposal', 'Frame the problem, recommendation, and next steps.'),
        option('specification', 'Document a specification', 'Define requirements, decisions, and acceptance.'),
        option('guide', 'Create a guide', 'Teach a repeatable process or body of knowledge.'),
      ],
    ),
    question(
      'document.depth',
      'How detailed should it be?',
      'Choose the expected reading depth.',
      'working',
      [
        option('brief', 'Executive brief', 'A short decision-ready summary.'),
        option('working', 'Working document', 'Enough detail for collaboration and execution.'),
        option('reference', 'Reference document', 'Comprehensive coverage and supporting detail.'),
      ],
    ),
    question(
      'document.tone',
      'Choose the writing tone',
      'Set the document’s voice.',
      'clear-professional',
      [
        option('clear-professional', 'Clear professional', 'Direct, structured, and approachable.'),
        option('formal', 'Formal', 'Precise and policy-minded.'),
        option('conversational', 'Conversational', 'Friendly and easy to scan.'),
      ],
    ),
  ],
  image: [
    question(
      'image.purpose',
      'What is the image for?',
      'Choose the delivery context.',
      'campaign',
      [
        option('campaign', 'Campaign visual', 'A high-impact marketing image.'),
        option('editorial', 'Editorial illustration', 'A conceptual image that supports a story.'),
        option('product', 'Product visual', 'Showcase a product, feature, or interface.'),
      ],
    ),
    question(
      'image.ratio',
      'Choose an aspect ratio',
      'Match the intended placement.',
      'landscape',
      [
        option('landscape', 'Landscape 16:9', 'Best for banners and presentations.'),
        option('square', 'Square 1:1', 'Best for flexible social placement.'),
        option('portrait', 'Portrait 4:5', 'Best for mobile feeds and posters.'),
      ],
    ),
    question(
      'image.style',
      'Pick an image style',
      'Set the visual medium.',
      'graphic',
      [
        option('graphic', 'Graphic design', 'Designed shapes, type, and intentional composition.'),
        option('photographic', 'Photographic', 'Naturalistic light, space, and material.'),
        option('illustrative', 'Illustrative', 'Expressive drawn or rendered imagery.'),
      ],
    ),
  ],
  video: [
    question(
      'video.purpose',
      'What should the video do?',
      'Choose the viewer outcome.',
      'promote',
      [
        option('promote', 'Promote', 'Create interest and a clear call to action.'),
        option('explain', 'Explain', 'Walk through a product or concept.'),
        option('atmosphere', 'Set a mood', 'Create a visual atmosphere or brand moment.'),
      ],
    ),
    question(
      'video.duration',
      'Choose a target duration',
      'Keep the story appropriate for its channel.',
      'short',
      [
        option('micro', '6–10 seconds', 'A compact loop or attention hook.'),
        option('short', '15–30 seconds', 'A complete short-form story.'),
        option('medium', '45–60 seconds', 'Room for explanation and progression.'),
      ],
    ),
    question(
      'video.ratio',
      'Choose an aspect ratio',
      'Match the main playback surface.',
      'landscape',
      [
        option('landscape', 'Landscape 16:9', 'Presentations, websites, and video platforms.'),
        option('vertical', 'Vertical 9:16', 'Mobile stories, shorts, and reels.'),
        option('square', 'Square 1:1', 'Flexible social distribution.'),
      ],
    ),
  ],
  audio: [
    question(
      'audio.purpose',
      'What kind of audio should this be?',
      'Choose the intended use.',
      'music',
      [
        option('music', 'Background music', 'A complete musical bed for content or a product.'),
        option('voice', 'Voice narration', 'Spoken delivery of supplied content.'),
        option('sound', 'Sound design', 'An effect, ident, or atmospheric soundscape.'),
      ],
    ),
    question(
      'audio.duration',
      'Choose a target duration',
      'Match the audio to its use.',
      'short',
      [
        option('sting', '5–10 seconds', 'A short ident or transition.'),
        option('short', '15–30 seconds', 'A compact content or campaign asset.'),
        option('extended', '60–90 seconds', 'A developed cue or narration.'),
      ],
    ),
    question(
      'audio.mood',
      'Pick an audio mood',
      'Set the emotional direction.',
      'optimistic',
      [
        option('optimistic', 'Optimistic', 'Bright, energetic, and forward-looking.'),
        option('calm', 'Calm', 'Measured, spacious, and reassuring.'),
        option('dramatic', 'Dramatic', 'Tense, cinematic, and high contrast.'),
      ],
    ),
  ],
  'design-system': [
    question(
      'design-system.scope',
      'What should the design system cover?',
      'Choose the initial product surface.',
      'product-ui',
      [
        option('product-ui', 'Product UI', 'Foundations and reusable application components.'),
        option('marketing', 'Marketing surfaces', 'Brand-led web and campaign patterns.'),
        option('unified', 'Unified brand and product', 'One system spanning product and marketing.'),
      ],
    ),
    question(
      'design-system.maturity',
      'What is the starting point?',
      'Choose how much existing brand direction to preserve.',
      'evolve',
      [
        option('new', 'Start fresh', 'Establish a new visual and interaction foundation.'),
        option('evolve', 'Evolve an existing brand', 'Translate current cues into a coherent system.'),
        option('formalize', 'Formalize an existing UI', 'Extract and normalize patterns already in use.'),
      ],
    ),
    question(
      'design-system.depth',
      'How deep should the first version go?',
      'Choose the deliverable coverage.',
      'core',
      [
        option('foundations', 'Foundations', 'Color, type, spacing, elevation, and accessibility.'),
        option('core', 'Foundations + core components', 'Add the most reusable controls and states.'),
        option('comprehensive', 'Comprehensive starter system', 'Add patterns, templates, and governance.'),
      ],
    ),
  ],
});

export function validateOpenDesignBriefCatalog(
  catalog: OpenDesignBriefCatalog,
): void {
  for (const [artifactType, questions] of Object.entries(catalog)) {
    if (questions.length > 5) {
      throw new Error(`${artifactType} Brief must define at most 5 questions.`);
    }
    const questionIds = new Set<string>();
    for (const question of questions) {
      if (questionIds.has(question.id)) {
        throw new Error(`${artifactType} Brief has duplicate question id: ${question.id}.`);
      }
      questionIds.add(question.id);
      const optionIds = new Set<string>();
      for (const candidate of question.options) {
        if (optionIds.has(candidate.id)) {
          throw new Error(`${question.id} has duplicate option id: ${candidate.id}.`);
        }
        optionIds.add(candidate.id);
      }
      if (!optionIds.has(question.defaultOptionId)) {
        throw new Error(`${question.id} has an invalid default option id.`);
      }
      if (question.allowCustom !== false) {
        throw new Error(`${question.id} must remain choice-only.`);
      }
    }
  }
}

validateOpenDesignBriefCatalog(openDesignBriefCatalog);

function normalizedAnswer(
  question: OpenDesignBriefQuestion,
  value: unknown,
): readonly string[] | null {
  const answer = typeof value === 'string'
    ? [value]
    : Array.isArray(value) && value.every((entry) => typeof entry === 'string')
      ? value
      : null;
  if (!answer || answer.length !== 1) return null;
  return question.options.some((candidate) => candidate.id === answer[0])
    ? Object.freeze([...answer])
    : null;
}

function answerSummary(
  artifactType: OpenDesignBriefArtifactType,
  answers: OpenDesignBriefAnswers,
): string {
  const lines = openDesignBriefCatalog[artifactType]
    .map((item) => {
      const selected = answers[item.id]?.[0];
      const label = item.options.find((candidate) => candidate.id === selected)?.label;
      return label ? `${item.label}: ${label}` : null;
    })
    .filter((line): line is string => Boolean(line));
  return lines.length > 0 ? lines.join('\n') : 'No Brief decisions have been confirmed yet.';
}

export function collectOpenDesignBrief(
  input: CollectOpenDesignBriefInput,
): OpenDesignBriefDecision {
  const definitions = openDesignBriefCatalog[input.artifactType];
  const source = input.knownAnswers ?? {};
  const answers: Record<string, readonly string[]> = {};

  for (const item of definitions) {
    const accepted = normalizedAnswer(item, source[item.id]);
    if (accepted) answers[item.id] = accepted;
  }

  if (input.skip) {
    for (const item of definitions) {
      answers[item.id] ??= Object.freeze([item.defaultOptionId]);
    }
  }

  const questions = definitions.filter((item) => answers[item.id] === undefined);
  const immutableAnswers = Object.freeze({ ...answers });
  return Object.freeze({
    artifactType: input.artifactType,
    decisionSource: 'open-design-shared-brief-v1',
    questions: Object.freeze([...questions]),
    answers: immutableAnswers,
    summary: answerSummary(input.artifactType, immutableAnswers),
    complete: questions.length === 0,
  });
}

export function summarizeOpenDesignBrief(
  artifactType: OpenDesignBriefArtifactType,
  answers: OpenDesignBriefAnswers,
): string {
  return answerSummary(artifactType, answers);
}

export function formatOpenDesignBriefForCli(
  brief: OpenDesignBriefDecision,
  displayArtifactType: string = brief.artifactType,
): string {
  const lines = [
    'OpenDesign brief',
    `Artifact: ${displayArtifactType}`,
  ];
  if (brief.questions.length > 0) {
    lines.push(`Choose ${brief.questions.length} decision${brief.questions.length === 1 ? '' : 's'}:`);
    for (const item of brief.questions) {
      lines.push(
        `- ${item.id}: ${item.label}`,
        ...item.options.map((candidate) => (
          `  - ${candidate.id}${candidate.id === item.defaultOptionId ? ' (recommended)' : ''}: ${candidate.label}`
        )),
      );
    }
  } else {
    lines.push('Ready to confirm.');
  }
  if (Object.keys(brief.answers).length > 0) {
    lines.push('Current choices:', brief.summary);
  }
  return lines.join('\n');
}
