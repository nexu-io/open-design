import { useEffect, useMemo, useState } from 'react';
import type { CreateInput } from './NewProjectPanel';
import type {
  DesignSystemSummary,
  InspirationBoard,
  InspirationPin,
  ProjectMetadata,
  SavedWorkflowBlueprint,
  SkillSummary,
  WorkflowExportPackageItem,
  WorkflowHandoff,
} from '../types';
import {
  deleteSavedBlueprint,
  listSavedBlueprints,
  promoteSavedBlueprint,
  renameSavedBlueprint,
  setSavedBlueprintCollection,
  setSavedBlueprintPinned,
} from '../state/blueprints';
import {
  buildInspirationPrompt,
  listInspirationBoards,
  listInspirationPins,
} from '../state/inspiration';
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
  exportPackage: WorkflowExportPackageItem[];
  scorecard: string[];
  handoff?: WorkflowHandoff;
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
    exportPackage: [
      {
        format: 'HTML',
        artifact: 'Interactive iPhone prototype',
        instructions: 'Ship a responsive HTML prototype that demonstrates the primary iOS 26 workflow and states.',
      },
      {
        format: 'PNG',
        artifact: 'Review capture',
        instructions: 'Prepare a clean still capture target for stakeholder review and visual QA.',
      },
      {
        format: 'Markdown',
        artifact: 'Prototype brief',
        instructions: 'Summarize screens, interaction states, accessibility notes, and export readiness.',
      },
    ],
    scorecard: [
      'iOS fit',
      'Glass tier discipline',
      'Hierarchy',
      'Contrast',
      'Accessibility',
      'Interaction readiness',
      'Export readiness',
    ],
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
    exportPackage: [
      {
        format: 'PPTX',
        artifact: 'Client proposal deck',
        instructions: 'Structure slides so they can be exported or rebuilt as an editable sales deck.',
      },
      {
        format: 'PDF',
        artifact: 'Proposal and SOW packet',
        instructions: 'Keep proposal, scope, assumptions, exclusions, and next steps ready for PDF handoff.',
      },
      {
        format: 'Markdown',
        artifact: 'Follow-up and owner checklist',
        instructions: 'Include reusable email copy, acceptance criteria, and decision checklist text.',
      },
    ],
    scorecard: [
      'Clarity',
      'Usefulness',
      'Conversion strength',
      'Factual risk',
      'Visual/export readiness',
      'Client-readiness',
    ],
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
    exportPackage: [
      {
        format: 'PPTX',
        artifact: 'Sales pitch deck',
        instructions: 'Organize the story as editable slides with speaker-ready talk tracks.',
      },
      {
        format: 'PDF',
        artifact: 'Shareable deck PDF',
        instructions: 'Preserve the same slide sequence, visual hierarchy, and owner decision flow for sharing.',
      },
      {
        format: 'HTML',
        artifact: 'Live deck prototype',
        instructions: 'Keep the HTML deck navigable, responsive, and ready for review before export.',
      },
    ],
    scorecard: [
      'Clarity',
      'Credibility',
      'Conversion',
      'Visual hierarchy',
      'Client-readiness',
    ],
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
    exports: ['Run packet', 'PDF', 'Markdown', 'ZIP'],
    exportPackage: [
      {
        format: 'Markdown',
        artifact: 'CoverVisionOS run packet',
        instructions: 'Capture intake, genre intelligence, art directions, prompts, QA, and handoff notes.',
      },
      {
        format: 'PDF',
        artifact: 'Production review packet',
        instructions: 'Prepare a client-readable packet for art direction, typography, and print-spec review.',
      },
      {
        format: 'ZIP',
        artifact: 'Layout handoff bundle',
        instructions: 'List the files, specs, prompt packet, and front/spine/back checklist needed for downstream production.',
      },
    ],
    scorecard: [
      'Genre signal',
      'Scroll-stop power',
      'Typography plan',
      'Author/title hierarchy',
      'Originality',
      'Rights/disclosure risk',
      'Print readiness',
    ],
    handoff: {
      system: 'CoverVisionOS',
      stages: [
        'Intake brief',
        'Genre intelligence',
        'Art direction shortlist',
        'Prompt packet',
        'Layout package',
        'Production specs',
        'ComfyUI workflow preparation',
        'Generation preflight',
      ],
      artifacts: [
        'layout_handoff.md',
        'layout_handoff_manifest.json',
        'production_specs.md',
        'preflight_report.json',
        'front-spine-back checklist',
      ],
      commands: [
        'shortlist',
        'layout-package',
        'production-specs',
        'prepare-workflow',
        'preflight',
      ],
    },
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
    exportPackage: [
      {
        format: 'HTML',
        artifact: 'Operational dashboard prototype',
        instructions: 'Ship an interactive dashboard surface with selected states and responsive behavior.',
      },
      {
        format: 'PNG',
        artifact: 'Executive review capture',
        instructions: 'Prepare a polished still view of the default dashboard state.',
      },
      {
        format: 'ZIP',
        artifact: 'Prototype handoff bundle',
        instructions: 'Keep source HTML, assets, notes, and export instructions ready to package together.',
      },
    ],
    scorecard: [
      'Scanability',
      'Hierarchy',
      'Information density',
      'Actionability',
      'Trust',
      'Mobile/desktop readiness',
    ],
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
    exportPackage: [
      {
        format: 'Markdown',
        artifact: 'Build-ready PRD',
        instructions: 'Produce a structured spec with requirements, risks, UX flow, and acceptance tests.',
      },
      {
        format: 'PDF',
        artifact: 'Stakeholder review version',
        instructions: 'Keep sections cleanly formatted for a readable PDF handoff.',
      },
      {
        format: 'Markdown',
        artifact: 'Prototype brief',
        instructions: 'Include the design/prototype prompt and implementation phases as reusable build input.',
      },
    ],
    scorecard: [
      'Completeness',
      'Ambiguity',
      'Feasibility',
      'Build-readiness',
    ],
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
    exportPackage: [
      {
        format: 'HTML',
        artifact: 'Motion-frame prototype',
        instructions: 'Create an animated HTML plan or frame sequence that can be reviewed in-browser.',
      },
      {
        format: 'Markdown',
        artifact: 'MP4 production brief',
        instructions: 'Specify duration, shot list, captions, narration, sound, and export notes.',
      },
      {
        format: 'Storyboard',
        artifact: 'Scene-by-scene storyboard',
        instructions: 'Describe each scene, visual beat, motion cue, and caption/narration moment.',
      },
    ],
    scorecard: [
      'Clarity',
      'Pacing',
      'Visual distinctiveness',
      'Production readiness',
    ],
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
  {
    id: 'ai-opportunity-intelligence',
    title: 'AI Opportunity Intelligence',
    category: 'Intelligence packet',
    outcome: 'Operational Atelier handoff',
    description:
      'Turn messy screenshots, Telegram exports, reports, and product ideas into an evidence-backed DESIGN.md, opportunity report, and Codex build brief.',
    skillCandidates: ['pm-spec', 'docs-page', 'web-prototype'],
    designSystemCandidates: ['linear-app', 'notion', 'default'],
    metadata: { kind: 'template', animations: false },
    checkpoints: ['Source evidence', 'Opportunity ranking', 'Design contract', 'Codex brief'],
    exports: ['DESIGN.md', 'Opportunity report', 'Codex brief'],
    exportPackage: [
      {
        format: 'Markdown',
        artifact: 'DESIGN.md',
        instructions: 'Extract the Operational Atelier design contract, visual direction, anti-patterns, tokens, and implementation rules.',
      },
      {
        format: 'Markdown',
        artifact: 'Opportunity intelligence report',
        instructions: 'Rank product ideas by evidence strength, speed to launch, asset fit, risk, and next build path.',
      },
      {
        format: 'Markdown',
        artifact: 'Codex build brief',
        instructions: 'Provide goal, source folder, output folder, requirements, constraints, verification commands, and file paths.',
      },
    ],
    scorecard: [
      'Evidence traceability',
      'Opportunity quality',
      'Design specificity',
      'Privacy posture',
      'Build-readiness',
    ],
    prompt: `Create an AI Opportunity Intelligence packet using the Operational Atelier design contract.

Source posture:
- Treat screenshots, Telegram exports, research links, local reports, and agent outputs as evidence.
- Preserve source paths and make every claim traceable.
- Keep humans in control: mark assumptions, risks, private material, and review gates.

Required output:
1. Evidence inventory: source folders, originals, thumbnails, supporting assets, flagged files, and import/run history.
2. Opportunity ranking: idea name, evidence links, speed to launch, revenue potential, defensibility, existing asset fit, and risk.
3. DESIGN.md: visual direction, typography, color tokens, component patterns, layout rules, motion rules, anti-patterns, and first-screen recommendation.
4. Codex build brief: goal, source folder, output folder, product thesis, requirements, constraints, verification commands, and exact file paths.
5. Quality scorecard for evidence traceability, opportunity quality, design specificity, privacy posture, and build-readiness.

Use the Operational Atelier style: command center, design studio, evidence room. Avoid generic AI chatbot framing, purple gradients, vague metrics, and unsupported claims.`,
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
const ALL_SAVED_BLUEPRINTS = 'All saved';
const PINNED_SAVED_BLUEPRINTS = 'Pinned';
const UNGROUPED_SAVED_BLUEPRINTS = 'Ungrouped';
const SAVED_COLLECTION_PREFIX = 'Collection: ';
const NO_REFERENCE_BOARD = 'none';

export function OneShotWorkflows({
  skills,
  designSystems,
  defaultDesignSystemId,
  onCreateProject,
}: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [savedBlueprintGroup, setSavedBlueprintGroup] = useState(ALL_SAVED_BLUEPRINTS);
  const [savedBlueprints, setSavedBlueprints] = useState<SavedWorkflowBlueprint[]>([]);
  const [inspirationBoards, setInspirationBoards] = useState<InspirationBoard[]>([]);
  const [inspirationPins, setInspirationPins] = useState<InspirationPin[]>([]);
  const [referenceBoardId, setReferenceBoardId] = useState(NO_REFERENCE_BOARD);

  useEffect(() => {
    function refreshSavedBlueprints() {
      setSavedBlueprints(listSavedBlueprints());
    }
    refreshSavedBlueprints();
    window.addEventListener('oneshot:blueprints-changed', refreshSavedBlueprints);
    window.addEventListener('storage', refreshSavedBlueprints);
    return () => {
      window.removeEventListener('oneshot:blueprints-changed', refreshSavedBlueprints);
      window.removeEventListener('storage', refreshSavedBlueprints);
    };
  }, []);

  useEffect(() => {
    function refreshInspiration() {
      setInspirationBoards(listInspirationBoards());
      setInspirationPins(listInspirationPins());
    }
    refreshInspiration();
    window.addEventListener('oneshot:inspiration-changed', refreshInspiration);
    window.addEventListener('storage', refreshInspiration);
    return () => {
      window.removeEventListener('oneshot:inspiration-changed', refreshInspiration);
      window.removeEventListener('storage', refreshInspiration);
    };
  }, []);

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

  const savedBlueprintGroups = useMemo(
    () => [
      ALL_SAVED_BLUEPRINTS,
      ...(savedBlueprints.some((blueprint) => blueprint.pinnedAt)
        ? [PINNED_SAVED_BLUEPRINTS]
        : []),
      ...Array.from(
        new Set(
          savedBlueprints
            .map((blueprint) => blueprint.collection)
            .filter((collection): collection is string => Boolean(collection)),
        ),
      ).map((collection) => `${SAVED_COLLECTION_PREFIX}${collection}`),
      ...Array.from(new Set(savedBlueprints.map(savedBlueprintGroupName))),
    ],
    [savedBlueprints],
  );

  const visibleSavedBlueprints = useMemo(() => {
    if (savedBlueprintGroup === ALL_SAVED_BLUEPRINTS) return savedBlueprints;
    if (savedBlueprintGroup === PINNED_SAVED_BLUEPRINTS) {
      return savedBlueprints.filter((blueprint) => blueprint.pinnedAt);
    }
    if (savedBlueprintGroup.startsWith(SAVED_COLLECTION_PREFIX)) {
      const collection = savedBlueprintGroup.slice(SAVED_COLLECTION_PREFIX.length);
      return savedBlueprints.filter((blueprint) => blueprint.collection === collection);
    }
    return savedBlueprints.filter(
      (blueprint) => savedBlueprintGroupName(blueprint) === savedBlueprintGroup,
    );
  }, [savedBlueprintGroup, savedBlueprints]);

  const selectedReferenceBoard = useMemo(
    () => inspirationBoards.find((board) => board.id === referenceBoardId) ?? null,
    [inspirationBoards, referenceBoardId],
  );

  const selectedReferencePins = useMemo(
    () =>
      selectedReferenceBoard
        ? inspirationPins.filter((pin) => pin.boardId === selectedReferenceBoard.id)
        : [],
    [inspirationPins, selectedReferenceBoard],
  );

  useEffect(() => {
    if (!savedBlueprintGroups.includes(savedBlueprintGroup)) {
      setSavedBlueprintGroup(ALL_SAVED_BLUEPRINTS);
    }
  }, [savedBlueprintGroup, savedBlueprintGroups]);

  useEffect(() => {
    if (referenceBoardId !== NO_REFERENCE_BOARD && !selectedReferenceBoard) {
      setReferenceBoardId(NO_REFERENCE_BOARD);
    }
  }, [referenceBoardId, selectedReferenceBoard]);

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
      metadata: metadataForWorkflow(workflow, selectedReferenceBoard, selectedReferencePins),
      pendingPrompt: promptForWorkflow(workflow, selectedReferenceBoard, selectedReferencePins),
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

      {savedBlueprints.length > 0 ? (
        <section className="oneshot-saved" aria-label="Saved blueprints">
          <div className="oneshot-saved-head">
            <span>
              <Icon name="history" size={14} />
              Saved blueprints
            </span>
            <div className="oneshot-saved-groups" role="tablist" aria-label="Saved blueprint groups">
              {savedBlueprintGroups.map((group) => (
                <button
                  key={group}
                  type="button"
                  role="tab"
                  aria-selected={savedBlueprintGroup === group}
                  className={savedBlueprintGroup === group ? 'active' : ''}
                  onClick={() => setSavedBlueprintGroup(group)}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>
          <div className="oneshot-saved-list">
            {visibleSavedBlueprints.slice(0, 4).map((blueprint) => (
              <article
                key={blueprint.id}
                className={`oneshot-saved-item${blueprint.pinnedAt ? ' pinned' : ''}`}
              >
                <button
                  type="button"
                  className="oneshot-saved-launch"
                  onClick={() => {
                    onCreateProject({
                      name: blueprint.name,
                      skillId: blueprint.skillId,
                      designSystemId: blueprint.designSystemId,
                      metadata: blueprint.metadata,
                      pendingPrompt: blueprint.prompt,
                    });
                  }}
                >
                  <span className="oneshot-saved-title">
                    <strong>{blueprint.name}</strong>
                    {blueprint.pinnedAt ? (
                      <span className="oneshot-saved-pin">Pinned</span>
                    ) : null}
                    {blueprint.collection ? (
                      <span className="oneshot-saved-pin collection">{blueprint.collection}</span>
                    ) : null}
                  </span>
                  <span className="oneshot-saved-meta">
                    {[blueprint.metadata.workflowCategory, blueprint.metadata.workflowOutcome]
                      .filter(Boolean)
                      .join(' - ') || 'Reusable workflow prompt'}
                  </span>
                </button>
                <div className="oneshot-saved-actions" aria-label={`${blueprint.name} blueprint actions`}>
                  <button
                    type="button"
                    className="oneshot-saved-action"
                    aria-pressed={Boolean(blueprint.pinnedAt)}
                    aria-label={`${blueprint.pinnedAt ? 'Unpin' : 'Pin'} ${blueprint.name} blueprint`}
                    title={`${blueprint.pinnedAt ? 'Unpin' : 'Pin'} ${blueprint.name} blueprint`}
                    onClick={() => setSavedBlueprintPinned(blueprint.id, !blueprint.pinnedAt)}
                  >
                    <Icon name="pin" size={12} />
                  </button>
                  <button
                    type="button"
                    className="oneshot-saved-action"
                    aria-label={`Move ${blueprint.name} blueprint to top`}
                    title={`Move ${blueprint.name} blueprint to top`}
                    onClick={() => promoteSavedBlueprint(blueprint.id)}
                  >
                    <Icon name="arrow-up" size={12} />
                  </button>
                  <button
                    type="button"
                    className="oneshot-saved-action"
                    aria-label={`Set ${blueprint.name} blueprint collection`}
                    title={`Set ${blueprint.name} blueprint collection`}
                    onClick={() => {
                      const nextCollection = window.prompt(
                        'Set blueprint collection',
                        blueprint.collection ?? '',
                      );
                      if (nextCollection === null) return;
                      setSavedBlueprintCollection(blueprint.id, nextCollection);
                    }}
                  >
                    <Icon name="folder" size={12} />
                  </button>
                  <button
                    type="button"
                    className="oneshot-saved-action"
                    aria-label={`Rename ${blueprint.name} blueprint`}
                    title={`Rename ${blueprint.name} blueprint`}
                    onClick={() => {
                      const nextName = window.prompt('Rename saved blueprint', blueprint.name);
                      const cleanedName = nextName?.trim();
                      if (!cleanedName || cleanedName === blueprint.name) return;
                      renameSavedBlueprint(blueprint.id, cleanedName);
                    }}
                  >
                    <Icon name="edit" size={12} />
                  </button>
                  <button
                    type="button"
                    className="oneshot-saved-action danger"
                    aria-label={`Delete ${blueprint.name} blueprint`}
                    title={`Delete ${blueprint.name} blueprint`}
                    onClick={() => {
                      if (!window.confirm(`Delete the saved "${blueprint.name}" blueprint?`)) return;
                      deleteSavedBlueprint(blueprint.id);
                    }}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

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
          {inspirationBoards.length > 0 ? (
            <label className="oneshot-reference-select">
              <span>Reference board</span>
              <select
                value={referenceBoardId}
                onChange={(event) => setReferenceBoardId(event.target.value)}
              >
                <option value={NO_REFERENCE_BOARD}>None</option>
                {inspirationBoards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
      <div className="oneshot-card-package" aria-label={`${workflow.title} export package`}>
        <Icon name="download" size={12} />
        <span>{workflow.exportPackage.map((item) => item.format).join(' + ')}</span>
      </div>
      {workflow.handoff ? (
        <div className="oneshot-card-handoff" aria-label={`${workflow.title} handoff`}>
          <Icon name="folder" size={12} />
          <span>{workflow.handoff.system} handoff</span>
        </div>
      ) : null}
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
    ...workflow.exportPackage.flatMap((item) => [
      item.format,
      item.artifact,
      item.instructions,
    ]),
    ...(workflow.handoff
      ? [
          workflow.handoff.system,
          ...workflow.handoff.stages,
          ...workflow.handoff.artifacts,
          ...(workflow.handoff.commands ?? []),
        ]
      : []),
    ...workflow.skillCandidates,
    ...workflow.designSystemCandidates,
    ...workflow.scorecard,
  ]
    .join(' ')
    .toLowerCase();
}

function savedBlueprintGroupName(blueprint: SavedWorkflowBlueprint) {
  return blueprint.metadata.workflowCategory ?? UNGROUPED_SAVED_BLUEPRINTS;
}

function metadataForWorkflow(
  workflow: WorkflowDefinition,
  referenceBoard: InspirationBoard | null,
  referencePins: InspirationPin[],
): ProjectMetadata {
  return {
    ...workflow.metadata,
    workflowId: workflow.id,
    workflowTitle: workflow.title,
    workflowCategory: workflow.category,
    workflowOutcome: workflow.outcome,
    workflowCheckpoints: workflow.checkpoints,
    workflowExports: workflow.exports,
    workflowExportPackage: workflow.exportPackage,
    workflowScorecard: workflow.scorecard,
    workflowHandoff: workflow.handoff,
    workflowReferenceBoardId: referenceBoard?.id,
    workflowReferenceBoardTitle: referenceBoard?.title,
    workflowReferencePinCount: referenceBoard ? referencePins.length : undefined,
  };
}

function promptForWorkflow(
  workflow: WorkflowDefinition,
  referenceBoard: InspirationBoard | null,
  referencePins: InspirationPin[],
) {
  if (!referenceBoard) return workflow.prompt;
  return [
    workflow.prompt,
    '',
    'Reference lock:',
    buildInspirationPrompt(referenceBoard, referencePins),
  ].join('\n');
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
