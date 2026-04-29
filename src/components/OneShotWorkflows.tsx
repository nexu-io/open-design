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

export function OneShotWorkflows({
  skills,
  designSystems,
  defaultDesignSystemId,
  onCreateProject,
}: Props) {
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
      metadata: workflow.metadata,
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

        <div className="oneshot-workflow-grid">
          {WORKFLOWS.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              onLaunch={() => launchWorkflow(workflow)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function WorkflowCard({
  workflow,
  onLaunch,
}: {
  workflow: WorkflowDefinition;
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
