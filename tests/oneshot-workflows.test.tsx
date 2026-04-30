import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OneShotWorkflows } from '../src/components/OneShotWorkflows';
import { listSavedBlueprints, saveWorkflowBlueprint } from '../src/state/blueprints';
import type { DesignSystemSummary, SkillSummary } from '../src/types';

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
    expect(screen.getByText('Custom Cover Packet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^OneShot Cover Run/i }),
    ).not.toBeInTheDocument();
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
