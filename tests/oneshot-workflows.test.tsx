import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OneShotWorkflows } from '../src/components/OneShotWorkflows';
import {
  listSavedBlueprints,
  saveWorkflowBlueprint,
  setSavedBlueprintCollection,
} from '../src/state/blueprints';
import { createInspirationBoard, createInspirationPin } from '../src/state/inspiration';
import type { DesignSystemSummary, Project, SkillSummary } from '../src/types';

function skill(id: string, mode: SkillSummary['mode']): SkillSummary {
  return {
    id,
    name: id,
    description: `${id} skill`,
    triggers: [],
    mode,
    platform: 'desktop',
    scenario: null,
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    featured: null,
    fidelity: null,
    speakerNotes: null,
    animations: null,
    hasBody: true,
    examplePrompt: '',
  };
}

function designSystem(id: string): DesignSystemSummary {
  return {
    id,
    title: id,
    category: 'Product',
    summary: `${id} design system`,
    swatches: [],
  };
}

function project(id: string, name: string): Project {
  return {
    id,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: 1000,
    updatedAt: 3000,
    metadata: {
      kind: 'prototype',
      workflowTitle: 'Dashboard Mockup',
      workflowCategory: 'Product prototype',
      workflowOutcome: 'Operational UI concept',
    },
  };
}

describe('OneShotWorkflows', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders the production workflow launcher', () => {
    render(
      <OneShotWorkflows
        skills={[skill('simple-deck', 'deck')]}
        designSystems={[designSystem('linear-app')]}
        defaultDesignSystemId="default"
        onCreateProject={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'OneShot Design' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /start/i })).toHaveLength(7);
    expect(screen.getByText('iOS 26 App Prototype')).toBeInTheDocument();
    expect(screen.getByText('BSA Proposal + SOW')).toBeInTheDocument();
    expect(screen.getByText('OneShot Cover Run')).toBeInTheDocument();
    expect(screen.getByText('7 workflow packs')).toBeInTheDocument();
    expect(screen.getByText('HTML + PNG + Markdown')).toBeInTheDocument();
    expect(screen.getByText('CoverVisionOS handoff')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search workflows, exports, gates, or outcomes')).toBeInTheDocument();
  });

  it('seeds a workflow project with matched skill, design system, metadata, and prompt', () => {
    const onCreateProject = vi.fn();

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template'), skill('pm-spec', 'template')]}
        designSystems={[designSystem('warm-editorial')]}
        defaultDesignSystemId="default"
        onCreateProject={onCreateProject}
      />,
    );

    const coverCard = screen.getByText('OneShot Cover Run').closest('.oneshot-card');
    expect(coverCard).not.toBeNull();
    fireEvent.click((coverCard as HTMLElement).querySelector('button') as HTMLButtonElement);

    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'OneShot Cover Run',
        skillId: 'digital-eguide',
        designSystemId: 'warm-editorial',
        metadata: expect.objectContaining({
          kind: 'template',
          animations: false,
          workflowId: 'oneshot-cover-run',
          workflowTitle: 'OneShot Cover Run',
          workflowCategory: 'Book cover production',
          workflowOutcome: 'CoverVisionOS run packet',
          workflowCheckpoints: ['Genre fit', 'Art direction', 'Typography', 'Print specs'],
          workflowExports: ['Run packet', 'PDF', 'Markdown', 'ZIP'],
          workflowExportPackage: [
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
          workflowScorecard: [
            'Genre signal',
            'Scroll-stop power',
            'Typography plan',
            'Author/title hierarchy',
            'Originality',
            'Rights/disclosure risk',
            'Print readiness',
          ],
          workflowHandoff: {
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
        }),
        pendingPrompt: expect.stringContaining('CoverVisionOS standard'),
      }),
    );
  });

  it('seeds the iOS 26 workflow with the Liquid Glass design system', () => {
    const onCreateProject = vi.fn();

    render(
      <OneShotWorkflows
        skills={[skill('mobile-app', 'prototype')]}
        designSystems={[designSystem('ios-26-liquid-glass')]}
        defaultDesignSystemId="default"
        onCreateProject={onCreateProject}
      />,
    );

    const iosCard = screen.getByText('iOS 26 App Prototype').closest('.oneshot-card');
    expect(iosCard).not.toBeNull();
    fireEvent.click((iosCard as HTMLElement).querySelector('button') as HTMLButtonElement);

    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'iOS 26 App Prototype',
        skillId: 'mobile-app',
        designSystemId: 'ios-26-liquid-glass',
        metadata: expect.objectContaining({
          kind: 'prototype',
          fidelity: 'high-fidelity',
          workflowId: 'ios-26-app-prototype',
          workflowTitle: 'iOS 26 App Prototype',
          workflowCategory: 'Mobile app',
          workflowOutcome: 'Liquid Glass iPhone concept',
          workflowCheckpoints: ['Layer model', 'Glass tiers', 'Safe areas', 'Accessibility'],
          workflowExports: ['HTML', 'PNG', 'Prototype brief'],
          workflowExportPackage: [
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
          workflowScorecard: [
            'iOS fit',
            'Glass tier discipline',
            'Hierarchy',
            'Contrast',
            'Accessibility',
            'Interaction readiness',
            'Export readiness',
          ],
        }),
        pendingPrompt: expect.stringContaining('iOS 26 Liquid Glass'),
      }),
    );
  });

  it('attaches a selected inspiration board to a workflow launch', () => {
    const onCreateProject = vi.fn();
    const board = createInspirationBoard({
      title: 'Launch reference board',
      description: 'Reference lock for a premium product workflow.',
      tags: ['premium'],
    });
    createInspirationPin({
      boardId: board.id,
      title: 'Glass launch panel',
      sourceUrl: 'local/glass-panel.html',
      note: 'Use the layered hierarchy and restrained controls.',
      usageNote: 'Internal reference only.',
      tags: ['glass'],
    });

    render(
      <OneShotWorkflows
        skills={[skill('mobile-app', 'prototype')]}
        designSystems={[designSystem('ios-26-liquid-glass')]}
        defaultDesignSystemId="default"
        onCreateProject={onCreateProject}
      />,
    );

    fireEvent.change(screen.getByLabelText('Reference board'), {
      target: { value: board.id },
    });

    const iosCard = screen.getByText('iOS 26 App Prototype').closest('.oneshot-card');
    expect(iosCard).not.toBeNull();
    fireEvent.click((iosCard as HTMLElement).querySelector('button') as HTMLButtonElement);

    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          workflowReferenceBoardId: board.id,
          workflowReferenceBoardTitle: 'Launch reference board',
          workflowReferencePinCount: 1,
        }),
        pendingPrompt: expect.stringContaining('Reference lock:'),
      }),
    );
    expect(onCreateProject.mock.calls[0]?.[0]?.pendingPrompt).toContain(
      'Use the OneShot inspiration board: Launch reference board.',
    );
    expect(onCreateProject.mock.calls[0]?.[0]?.pendingPrompt).toContain('Source: local/glass-panel.html');
  });

  it('filters workflows by search and category', () => {
    render(
      <OneShotWorkflows
        skills={[skill('simple-deck', 'deck')]}
        designSystems={[designSystem('linear-app')]}
        defaultDesignSystemId="default"
        onCreateProject={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText('Search workflows, exports, gates, or outcomes'),
      { target: { value: 'cover' } },
    );

    expect(screen.getByText('OneShot Cover Run')).toBeInTheDocument();
    expect(screen.queryByText('Roofing Pitch Deck')).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText('Search workflows, exports, gates, or outcomes'),
      { target: { value: '' } },
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Sales deck' }));

    expect(screen.getByText('Roofing Pitch Deck')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Mockup')).not.toBeInTheDocument();
  });

  it('starts a project from a saved blueprint', () => {
    const onCreateProject = vi.fn();
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
        workflowCategory: 'Book cover production',
        workflowOutcome: 'CoverVisionOS run packet',
        workflowCheckpoints: ['Genre fit'],
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template')]}
        designSystems={[designSystem('warm-editorial')]}
        defaultDesignSystemId="default"
        onCreateProject={onCreateProject}
      />,
    );

    expect(screen.getByLabelText('Saved blueprints')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^OneShot Cover Run/i }));

    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'OneShot Cover Run',
        skillId: 'digital-eguide',
        designSystemId: 'warm-editorial',
        pendingPrompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
        metadata: expect.objectContaining({
          workflowId: 'oneshot-cover-run',
          workflowTitle: 'OneShot Cover Run',
        }),
      }),
    );
  });

  it('searches blueprints, boards, and projects from the unified library', () => {
    const onCreateProject = vi.fn();
    const onOpenProject = vi.fn();
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
        workflowCategory: 'Book cover production',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });
    const board = createInspirationBoard({
      title: 'Cover moodboard',
      description: 'Publishing references for a cover.',
      tags: ['cover'],
    });
    createInspirationPin({
      boardId: board.id,
      title: 'Cover source',
      sourceUrl: 'local/cover-source.html',
      note: 'Use the title hierarchy.',
      tags: ['typography'],
    });

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template')]}
        designSystems={[designSystem('warm-editorial')]}
        defaultDesignSystemId="default"
        projects={[project('project-1', 'Project archive')]}
        onCreateProject={onCreateProject}
        onOpenProject={onOpenProject}
      />,
    );

    expect(screen.getByLabelText('OneShot library search')).toBeInTheDocument();
    expect(screen.getByText('1 blueprints')).toBeInTheDocument();
    expect(screen.getByText('3 boards')).toBeInTheDocument();
    expect(screen.getByText('1 projects')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search blueprints, boards, and projects'), {
      target: { value: 'archive' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Project archive' }));
    expect(onOpenProject).toHaveBeenCalledWith('project-1');

    fireEvent.change(screen.getByPlaceholderText('Search blueprints, boards, and projects'), {
      target: { value: 'moodboard' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create brief from Cover moodboard' }));
    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cover moodboard reference brief',
        metadata: expect.objectContaining({
          workflowReferenceBoardId: board.id,
          workflowReferenceBoardTitle: 'Cover moodboard',
          workflowReferencePinCount: 1,
        }),
        pendingPrompt: expect.stringContaining('Source: local/cover-source.html'),
      }),
    );

    onCreateProject.mockClear();
    fireEvent.change(screen.getByPlaceholderText('Search blueprints, boards, and projects'), {
      target: { value: 'blueprint' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start OneShot Cover Run' }));
    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'OneShot Cover Run',
        skillId: 'digital-eguide',
        designSystemId: 'warm-editorial',
      }),
    );
  });

  it('groups saved blueprints by workflow category and pinned status', () => {
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
        workflowCategory: 'Book cover production',
        workflowOutcome: 'CoverVisionOS run packet',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });
    saveWorkflowBlueprint({
      metadata: {
        kind: 'prototype',
        workflowId: 'dashboard-mockup',
        workflowTitle: 'Dashboard Mockup',
        workflowCategory: 'Product prototype',
        workflowOutcome: 'Operational UI concept',
      },
      prompt: 'Use the OneShot workflow blueprint: Dashboard Mockup.',
      skillId: 'dashboard',
      designSystemId: 'linear-app',
    });

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template'), skill('dashboard', 'prototype')]}
        designSystems={[designSystem('warm-editorial'), designSystem('linear-app')]}
        defaultDesignSystemId="default"
        onCreateProject={vi.fn()}
      />,
    );

    const groups = within(screen.getByRole('tablist', { name: 'Saved blueprint groups' }));
    expect(groups.getByRole('tab', { name: 'All saved' })).toHaveAttribute('aria-selected', 'true');
    expect(groups.getByRole('tab', { name: 'Book cover production' })).toBeInTheDocument();
    expect(groups.getByRole('tab', { name: 'Product prototype' })).toBeInTheDocument();
    expect(groups.queryByRole('tab', { name: 'Pinned' })).not.toBeInTheDocument();

    fireEvent.click(groups.getByRole('tab', { name: 'Book cover production' }));

    expect(screen.getByRole('button', { name: /^OneShot Cover Run/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Dashboard Mockup/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pin OneShot Cover Run blueprint' }));
    fireEvent.click(groups.getByRole('tab', { name: 'Pinned' }));

    expect(screen.getByRole('button', { name: /^OneShot Cover Run/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Dashboard Mockup/i })).not.toBeInTheDocument();
  });

  it('renames a saved blueprint', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Custom Cover Packet');
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template')]}
        designSystems={[designSystem('warm-editorial')]}
        defaultDesignSystemId="default"
        onCreateProject={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename OneShot Cover Run blueprint' }));

    expect(window.prompt).toHaveBeenCalledWith('Rename saved blueprint', 'OneShot Cover Run');
    expect(listSavedBlueprints()[0]?.name).toBe('Custom Cover Packet');
    expect(screen.getAllByText('Custom Cover Packet').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: /^OneShot Cover Run/i }),
    ).not.toBeInTheDocument();
  });

  it('groups saved blueprints by custom collection', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Client Launch');
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
        workflowCategory: 'Book cover production',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });
    saveWorkflowBlueprint({
      metadata: {
        kind: 'prototype',
        workflowId: 'dashboard-mockup',
        workflowTitle: 'Dashboard Mockup',
        workflowCategory: 'Product prototype',
      },
      prompt: 'Use the OneShot workflow blueprint: Dashboard Mockup.',
      skillId: 'dashboard',
      designSystemId: 'linear-app',
    });

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template'), skill('dashboard', 'prototype')]}
        designSystems={[designSystem('warm-editorial'), designSystem('linear-app')]}
        defaultDesignSystemId="default"
        onCreateProject={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set OneShot Cover Run blueprint collection' }));

    expect(window.prompt).toHaveBeenCalledWith('Set blueprint collection', '');
    expect(listSavedBlueprints().find((item) => item.name === 'OneShot Cover Run')?.collection).toBe('Client Launch');
    expect(screen.getByText('Client Launch')).toBeInTheDocument();

    const groups = within(screen.getByRole('tablist', { name: 'Saved blueprint groups' }));
    fireEvent.click(groups.getByRole('tab', { name: 'Collection: Client Launch' }));

    expect(screen.getByRole('button', { name: /^OneShot Cover Run/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Dashboard Mockup/i })).not.toBeInTheDocument();
  });

  it('preserves a saved blueprint collection when the blueprint is saved again', () => {
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });
    const id = listSavedBlueprints()[0]?.id;
    expect(id).toBeTruthy();
    setSavedBlueprintCollection(id as string, 'Launch Shelf');

    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
      },
      prompt: 'Use the updated OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });

    expect(listSavedBlueprints()).toHaveLength(1);
    expect(listSavedBlueprints()[0]).toEqual(
      expect.objectContaining({
        prompt: 'Use the updated OneShot workflow blueprint: OneShot Cover Run.',
        collection: 'Launch Shelf',
      }),
    );
  });

  it('keeps a saved blueprint name when rename is blank', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('   ');
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template')]}
        designSystems={[designSystem('warm-editorial')]}
        defaultDesignSystemId="default"
        onCreateProject={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename OneShot Cover Run blueprint' }));

    expect(listSavedBlueprints()[0]?.name).toBe('OneShot Cover Run');
    expect(
      screen.getByRole('button', { name: /^OneShot Cover Run/i }),
    ).toBeInTheDocument();
  });

  it('moves a saved blueprint to the top of the library', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(3000);
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });
    saveWorkflowBlueprint({
      metadata: {
        kind: 'prototype',
        workflowId: 'dashboard-mockup',
        workflowTitle: 'Dashboard Mockup',
      },
      prompt: 'Use the OneShot workflow blueprint: Dashboard Mockup.',
      skillId: 'dashboard',
      designSystemId: 'linear-app',
    });

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template'), skill('dashboard', 'prototype')]}
        designSystems={[designSystem('warm-editorial'), designSystem('linear-app')]}
        defaultDesignSystemId="default"
        onCreateProject={vi.fn()}
      />,
    );

    expect(listSavedBlueprints()[0]?.name).toBe('Dashboard Mockup');

    fireEvent.click(screen.getByRole('button', { name: 'Move OneShot Cover Run blueprint to top' }));

    expect(listSavedBlueprints()[0]?.name).toBe('OneShot Cover Run');
  });

  it('pins and unpins a saved blueprint above recent items', () => {
    const dateNow = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2000);
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });
    saveWorkflowBlueprint({
      metadata: {
        kind: 'prototype',
        workflowId: 'dashboard-mockup',
        workflowTitle: 'Dashboard Mockup',
      },
      prompt: 'Use the OneShot workflow blueprint: Dashboard Mockup.',
      skillId: 'dashboard',
      designSystemId: 'linear-app',
    });
    dateNow.mockRestore();

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template'), skill('dashboard', 'prototype')]}
        designSystems={[designSystem('warm-editorial'), designSystem('linear-app')]}
        defaultDesignSystemId="default"
        onCreateProject={vi.fn()}
      />,
    );

    expect(listSavedBlueprints()[0]?.name).toBe('Dashboard Mockup');

    fireEvent.click(screen.getByRole('button', { name: 'Pin OneShot Cover Run blueprint' }));

    expect(listSavedBlueprints()[0]).toEqual(
      expect.objectContaining({ name: 'OneShot Cover Run', pinnedAt: expect.any(Number) }),
    );
    expect(screen.getAllByText('Pinned').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Unpin OneShot Cover Run blueprint' }),
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Unpin OneShot Cover Run blueprint' }));

    expect(listSavedBlueprints()[0]?.name).toBe('Dashboard Mockup');
    expect(listSavedBlueprints().find((item) => item.name === 'OneShot Cover Run')?.pinnedAt).toBeUndefined();
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument();
  });

  it('keeps a workflow blueprint pinned when it is saved again', () => {
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template')]}
        designSystems={[designSystem('warm-editorial')]}
        defaultDesignSystemId="default"
        onCreateProject={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pin OneShot Cover Run blueprint' }));
    const pinnedAt = listSavedBlueprints()[0]?.pinnedAt;
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
      },
      prompt: 'Use the updated OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });

    expect(listSavedBlueprints()).toHaveLength(1);
    expect(listSavedBlueprints()[0]).toEqual(
      expect.objectContaining({
        prompt: 'Use the updated OneShot workflow blueprint: OneShot Cover Run.',
        pinnedAt,
      }),
    );
  });

  it('deletes a saved blueprint after confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template')]}
        designSystems={[designSystem('warm-editorial')]}
        defaultDesignSystemId="default"
        onCreateProject={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete OneShot Cover Run blueprint' }));

    expect(window.confirm).toHaveBeenCalledWith('Delete the saved "OneShot Cover Run" blueprint?');
    expect(listSavedBlueprints()).toHaveLength(0);
    expect(screen.queryByLabelText('Saved blueprints')).not.toBeInTheDocument();
  });

  it('keeps a saved blueprint when deletion is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    saveWorkflowBlueprint({
      metadata: {
        kind: 'template',
        workflowId: 'oneshot-cover-run',
        workflowTitle: 'OneShot Cover Run',
      },
      prompt: 'Use the OneShot workflow blueprint: OneShot Cover Run.',
      skillId: 'digital-eguide',
      designSystemId: 'warm-editorial',
    });

    render(
      <OneShotWorkflows
        skills={[skill('digital-eguide', 'template')]}
        designSystems={[designSystem('warm-editorial')]}
        defaultDesignSystemId="default"
        onCreateProject={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete OneShot Cover Run blueprint' }));

    expect(listSavedBlueprints()).toHaveLength(1);
    expect(screen.getByLabelText('Saved blueprints')).toBeInTheDocument();
  });
});
