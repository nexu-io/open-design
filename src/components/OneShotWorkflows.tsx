import { useMemo, useState } from 'react';
import type { CreateInput } from './NewProjectPanel';
import type {
  DesignSystemSummary,
  ProjectMetadata,
  SkillSummary,
} from '../types';
import { Icon } from './Icon';

type WorkflowKind = 'prototype' | 'deck' | 'template' | 'other';

interface WorkflowDefinition {
  id: string;
  title: string;
  category: string;
  outcome: string;
  description: string;
  skillCandidates: string[];
  designSystemCandidates: string[];
  metadata: ProjectMetadata;
  prompt: string;
  checkpoints: string[];
  exports: string[];
}

interface Props {
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  defaultDesignSystemId: string | null;
  onCreateProject: (input: CreateInput & { pendingPrompt?: string }) => void;
}

const WORKFLOWS: WorkflowDefinition[] = [
  {
    id: 'ios-26-app-prototype',
    title: 'iOS 26 App Prototype',
    category: 'Mobile app',
    outcome: 'Liquid Glass iPhone concept',
    description:
      'Turn an app idea into a high-fidelity iOS 26 Liquid Glass prototype with layered surfaces, tab chrome, widgets, sheets, and accessibility states.',
    skillCandidates: ['mobile-app', 'mobile-onboarding', 'web-prototype'],
    designSystemCandidates: ['ios-26-liquid-glass', 'apple', 'default'],
    metadata: { kind: 'prototype', fidelity: 'high-fidelity' },
    checkpoints: ['Layer model', 'Glass tiers', 'Safe areas', 'Accessibility'],
    exports: ['HTML', 'PNG', 'Prototype brief'],
    prompt: `Create a high-fidelity iOS 26 Liquid Glass mobile app prototype.

Use the iOS 26 Liquid Glass design system as the visual source of truth.

Required output:
1. Brief lock: app purpose, target user, core job, required screens, primary workflow, and missing facts.
2. iPhone-first prototype using safe areas, Dynamic Island awareness, SF-style typography, layered background/content, and floating Liquid Glass surfaces.
3. Use the four-layer model: background, glass, solid focus surface, and dynamic state.
4. Include at least one Chrome glass tab bar or navigation surface, Regular glass cards/widgets, and one Thick glass modal sheet or action panel.
5. Use design-systems/ios-26-liquid-glass/assets/reference-prototype.html as the concrete visual reference for glass tiers, app chrome, and reduced-brightness behavior.
6. Include a reduced-brightness or reduced-motion accessibility state in the design notes.
7. Run a quality scorecard for iOS fit, glass tier discipline, hierarchy, contrast, accessibility, interaction readiness, and export readiness.

Keep it professional, native-feeling, and specific. Do not use generic frosted-glass web cards or admin-dashboard density.`,
  },
  {
    id: 'bsa-proposal-sow',
    title: 'BSA Proposal + SOW',
    category: 'Business artifact',
    outcome: 'Client-ready proposal package',
    description:
      'Turn rough prospect notes into a roofing contractor proposal, implementation scope, pricing story, follow-up email, and deck outline.',
    skillCandidates: ['pm-spec', 'simple-deck', 'saas-landing'],
    designSystemCandidates: ['stripe', 'linear-app', 'vercel', 'default'],
    metadata: { kind: 'deck', speakerNotes: true },
    checkpoints: ['Brief lock', 'Offer fit', 'Scope clarity', 'Follow-up'],
    exports: ['PPTX', 'PDF', 'Markdown'],
    prompt: `Create a professional BSA Proposal + SOW package for a roofing contractor prospect.

Use a production workflow:
1. Start with a brief-lock section: prospect, audience, business problem, desired outcome, missing facts, and assumptions.
2. Produce a client-ready proposal outline with executive summary, pain points, recommended offer, implementation plan, timeline, deliverables, exclusions, risk notes, and next step.
3. Produce a practical SOW section with scope, responsibilities, milestones, acceptance criteria, and handoff requirements.
4. Produce a sales deck outline for storm-alert automation, missed-call capture, QuoteWake estimates, CRM follow-up, pricing tiers, and first 30-day onboarding.
5. Produce a follow-up email and owner decision checklist.
6. Run a quality scorecard before final: clarity, usefulness, conversion strength, factual risk, visual/export readiness, and client-readiness.

Keep it practical, revenue-focused, specific to local service businesses, and ready to export as PDF/PPTX/Markdown.`,
  },
  {
    id: 'roofing-pitch-deck',
    title: 'Roofing Pitch Deck',
    category: 'Sales deck',
    outcome: 'Storm-response sales story',
    description:
      'Create a polished pitch deck for contractors that explains alerts, missed-call capture, estimates, follow-up, and ROI.',
    skillCandidates: ['simple-deck', 'guizang-ppt', 'pricing-page'],
    designSystemCandidates: ['linear-app', 'stripe', 'vercel', 'default'],
    metadata: { kind: 'deck', speakerNotes: true },
    checkpoints: ['Hook', 'Proof', 'ROI', 'Owner decision'],
    exports: ['PPTX', 'PDF', 'HTML'],
    prompt: `Build a high-quality roofing contractor pitch deck for BoostSmartAI / QuoteWake.

Deck goal: explain how storm-alert automation, missed-call capture, QuoteWake estimates, CRM follow-up, pricing tiers, and first 30-day onboarding turn missed opportunities into booked work.

Required deck arc:
- Cover
- The missed-opportunity problem
- Why storm-response speed wins
- How BSA captures calls/texts/web leads
- QuoteWake estimate flow
- CRM follow-up and owner decision queue
- Proof / example operating day
- Pricing tiers
- 30-day onboarding plan
- Clear next step

Use speaker notes for sales talk tracks. Include a pre-export critique scorecard for clarity, credibility, conversion, visual hierarchy, and client-readiness.`,
  },
  {
    id: 'oneshot-cover-run',
    title: 'OneShot Cover Run',
    category: 'Book cover production',
    outcome: 'CoverVisionOS run packet',
    description:
      'Prepare a professional book-cover run: genre brief, comp board, art directions, prompt packet, QA gates, and print specs.',
    skillCandidates: ['digital-eguide', 'magazine-poster', 'pm-spec'],
    designSystemCandidates: ['warm-editorial', 'theverge', 'wired', 'default'],
    metadata: { kind: 'template', animations: false },
    checkpoints: ['Genre fit', 'Art direction', 'Typography', 'Print specs'],
    exports: ['Run packet', 'PDF', 'Markdown'],
    prompt: `Create a OneShot Cover production run packet using the CoverVisionOS standard.

This is for professional book-cover production, not a generic image prompt.

Required output:
1. Intake brief: title, author, genre, subgenre, audience, tone, comparable books, trim size, page count, platform targets, and missing facts.
2. Genre intelligence: shelf conventions, reader expectations, 70/30 familiarity rule, visual risks.
3. Three art directions with rationale, typography stance, color system, and cover composition.
4. Prompt packet for cover-art generation, including positive prompt, negative prompt, style constraints, and iteration notes.
5. Cover QA scorecard: genre signal, scroll-stop power, typography plan, author/title hierarchy, originality, rights/disclosure risk, print readiness.
6. Layout handoff checklist for front/spine/back and KDP/IngramSpark print-spec confirmation.

If exact book metadata is missing, create a clearly marked fill-in packet instead of hallucinating specifics.`,
  },
  {
    id: 'dashboard-mockup',
    title: 'Dashboard Mockup',
    category: 'Product prototype',
    outcome: 'Operational UI concept',
    description:
      'Design an owner/operator dashboard for proof of work, lead status, AI actions, decision queues, and business outcomes.',
    skillCandidates: ['dashboard', 'web-prototype', 'wireframe-sketch'],
    designSystemCandidates: ['linear-app', 'cursor', 'posthog', 'default'],
    metadata: { kind: 'prototype', fidelity: 'high-fidelity' },
    checkpoints: ['Information density', 'Decision flow', 'Audit trail', 'Responsiveness'],
    exports: ['HTML', 'PNG', 'ZIP'],
    prompt: `Design a high-fidelity owner/operator dashboard mockup.

Use case: a business owner needs to scan leads, missed calls, AI/BSA actions, proof of work, owner decisions, handoffs, and revenue outcomes.

Required UI:
- Dense but readable sidebar/navigation
- KPI strip for lead volume, response time, booked work, revenue impact
- Owner decision queue
- AI action log with proof and timestamps
- Lead/contact table or pipeline
- Trust/proof panel showing what automation did
- Detail drawer or selected-row state
- Responsive desktop-first layout

Before final, run a quality scorecard for scanability, hierarchy, information density, actionability, trust, and mobile/desktop readiness.`,
  },
  {
    id: 'prd-factory',
    title: 'PRD Factory',
    category: 'Product brief',
    outcome: 'Build-ready spec',
    description:
      'Turn a rough idea into a requirements doc, UX flow, acceptance tests, and implementation prompt.',
    skillCandidates: ['pm-spec', 'docs-page', 'web-prototype'],
    designSystemCandidates: ['linear-app', 'notion', 'default'],
    metadata: { kind: 'template', animations: false },
    checkpoints: ['Problem', 'Requirements', 'UX flow', 'Acceptance tests'],
    exports: ['Markdown', 'PDF', 'Prototype brief'],
    prompt: `Create a build-ready PRD from a rough idea.

Required sections:
- Problem statement
- Target user and jobs-to-be-done
- Goals and non-goals
- User workflow
- Functional requirements
- Data model sketch
- Edge cases and risks
- Acceptance tests
- Implementation phases
- Design/prototype prompt
- Quality scorecard for completeness, ambiguity, feasibility, and build-readiness

Ask only for missing facts that materially change the spec; otherwise make clear assumptions and label them.`,
  },
  {
    id: 'motion-explainer',
    title: 'Motion Explainer',
    category: 'Motion asset',
    outcome: 'Shot list + animated HTML brief',
    description:
      'Create a short launch/demo motion brief with scenes, narration, captions, style, and export notes.',
    skillCandidates: ['motion-frames', 'sprite-animation', 'social-carousel'],
    designSystemCandidates: ['runwayml', 'spotify', 'default'],
    metadata: { kind: 'prototype', fidelity: 'high-fidelity' },
    checkpoints: ['Narrative', 'Scene rhythm', 'Caption clarity', 'Export plan'],
    exports: ['HTML', 'MP4 brief', 'Storyboard'],
    prompt: `Create a professional motion explainer package.

Required output:
- 20-45 second concept
- audience and goal
- logline
- visual direction
- scene-by-scene shot list
- motion beats
- caption/narration script
- sound/music direction
- HTML motion-frame plan
- export plan for MP4/GIF/social cuts
- quality scorecard for clarity, pacing, visual distinctiveness, and production readiness

Keep the concept practical enough to execute in OneShotDesign/HTML motion or a downstream video tool.`,
  },
];

const QUALITY_GATES = [
  'Brief lock',
  'Reference lock',
  'Draft artifact',
  'Critique score',
  'Polish pass',
  'Verified export',
];

const ALL_CATEGORIES = 'All workflows';

export function OneShotWorkflows({
  skills,
  designSystems,
  defaultDesignSystemId,
  onCreateProject,
}: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);

  const categories = useMemo(
    () => [
      ALL_CATEGORIES,
      ...Array.from(new Set(WORKFLOWS.map((workflow) => workflow.category))),
    ],
    [],
  );

  const visibleWorkflows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return WORKFLOWS.filter((workflow) => {
      const categoryMatch = category === ALL_CATEGORIES || workflow.category === category;
      if (!categoryMatch) return false;
      if (!needle) return true;
      return workflowSearchText(workflow).includes(needle);
    });
  }, [category, query]);

  function launchWorkflow(workflow: WorkflowDefinition) {
    const skillId = pickSkillId(workflow, skills);
    const designSystemId = pickDesignSystemId(
      workflow,
      designSystems,
      defaultDesignSystemId,
    );
    onCreateProject({
      name: workflow.title,
      skillId,
      designSystemId,
      metadata: metadataForWorkflow(workflow),
      pendingPrompt: workflow.prompt,
    });
  }

  return (
    <div className="oneshot-workflows">
      <section className="oneshot-hero">
        <div className="oneshot-hero-copy">
          <h1>OneShot Design</h1>
          <p>
            One prompt, structured brief, polished artifact, critique score,
            verified export, saved for reuse.
          </p>
          <div className="oneshot-hero-stats" aria-label="OneShot workflow stats">
            <span>{WORKFLOWS.length} workflow packs</span>
            <span>{QUALITY_GATES.length} quality gates</span>
            <span>English-only output</span>
          </div>
        </div>
        <div className="oneshot-hero-system" aria-label="OneShot production system">
          {QUALITY_GATES.map((gate, index) => (
            <span key={gate} className="oneshot-gate">
              <span>{String(index + 1).padStart(2, '0')}</span>
              {gate}
            </span>
          ))}
        </div>
      </section>

      <section className="oneshot-section">
        <div className="oneshot-section-head">
          <div>
            <h2>Professional workflow packs</h2>
            <p>
              Start from a production path instead of a blank chat. Each pack
              seeds the right skill, artifact type, quality gates, and export
              expectations.
            </p>
          </div>
          <div className="oneshot-stack-meter" aria-label="Stack roles">
            <span>Open Design shell</span>
            <span>OneShot engine</span>
            <span>CoverVision vertical</span>
            <span>ComfyUI backend</span>
          </div>
        </div>

        <div className="oneshot-toolbar" aria-label="Workflow filters">
          <label className="oneshot-search">
            <Icon name="search" size={14} />
            <span className="sr-only">Search workflows</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search workflows, exports, gates, or outcomes"
            />
          </label>
          <div className="oneshot-category-tabs" role="tablist" aria-label="Workflow categories">
            {categories.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={category === entry}
                className={category === entry ? 'active' : ''}
                onClick={() => setCategory(entry)}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>

        <div className="oneshot-workflow-grid">
          {visibleWorkflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              skillLabel={resolveSkillLabel(workflow, skills)}
              designSystemLabel={resolveDesignSystemLabel(
                workflow,
                designSystems,
                defaultDesignSystemId,
              )}
              onLaunch={() => launchWorkflow(workflow)}
            />
          ))}
        </div>
        {visibleWorkflows.length === 0 ? (
          <div className="oneshot-empty">
            No workflow packs match this search. Clear the filter or try a broader term.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function WorkflowCard({
  workflow,
  skillLabel,
  designSystemLabel,
  onLaunch,
}: {
  workflow: WorkflowDefinition;
  skillLabel: string;
  designSystemLabel: string;
  onLaunch: () => void;
}) {
  return (
    <article className="oneshot-card">
      <div className="oneshot-card-top">
        <span className="oneshot-card-category">{workflow.category}</span>
        <span className="oneshot-card-outcome">{workflow.outcome}</span>
      </div>
      <h3>{workflow.title}</h3>
      <p>{workflow.description}</p>
      <div className="oneshot-card-checks">
        {workflow.checkpoints.map((checkpoint) => (
          <span key={checkpoint}>{checkpoint}</span>
        ))}
      </div>
      <div className="oneshot-card-route" aria-label={`${workflow.title} routing`}>
        <span>
          <Icon name="sparkles" size={12} />
          {skillLabel}
        </span>
        <span>
          <Icon name="grid" size={12} />
          {designSystemLabel}
        </span>
      </div>
      <div className="oneshot-card-foot">
        <span>{workflow.exports.join(' / ')}</span>
        <button type="button" className="primary" onClick={onLaunch}>
          <Icon name="sparkles" size={13} />
          Start
        </button>
      </div>
    </article>
  );
}

function workflowSearchText(workflow: WorkflowDefinition) {
  return [
    workflow.title,
    workflow.category,
    workflow.outcome,
    workflow.description,
    ...workflow.checkpoints,
    ...workflow.exports,
    ...workflow.skillCandidates,
    ...workflow.designSystemCandidates,
  ]
    .join(' ')
    .toLowerCase();
}

function metadataForWorkflow(workflow: WorkflowDefinition): ProjectMetadata {
  return {
    ...workflow.metadata,
    workflowId: workflow.id,
    workflowTitle: workflow.title,
    workflowCategory: workflow.category,
    workflowOutcome: workflow.outcome,
    workflowCheckpoints: workflow.checkpoints,
    workflowExports: workflow.exports,
  };
}

function resolveSkillLabel(workflow: WorkflowDefinition, skills: SkillSummary[]) {
  const id = pickSkillId(workflow, skills);
  if (!id) return 'Skill auto-match';
  return skills.find((skill) => skill.id === id)?.name ?? id;
}

function resolveDesignSystemLabel(
  workflow: WorkflowDefinition,
  designSystems: DesignSystemSummary[],
  defaultDesignSystemId: string | null,
) {
  const id = pickDesignSystemId(workflow, designSystems, defaultDesignSystemId);
  if (!id) return 'No design system';
  return designSystems.find((system) => system.id === id)?.title ?? id;
}

function pickSkillId(workflow: WorkflowDefinition, skills: SkillSummary[]) {
  for (const id of workflow.skillCandidates) {
    if (skills.some((skill) => skill.id === id)) return id;
  }
  const fallbackKind = metadataKindToSkillMode(workflow.metadata.kind);
  return skills.find((skill) => skill.mode === fallbackKind)?.id ?? null;
}

function pickDesignSystemId(
  workflow: WorkflowDefinition,
  designSystems: DesignSystemSummary[],
  defaultDesignSystemId: string | null,
) {
  for (const id of workflow.designSystemCandidates) {
    if (designSystems.some((system) => system.id === id)) return id;
  }
  return defaultDesignSystemId;
}

function metadataKindToSkillMode(kind: WorkflowKind): SkillSummary['mode'] {
  if (kind === 'deck') return 'deck';
  if (kind === 'template') return 'template';
  return 'prototype';
}
