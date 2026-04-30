import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OneShotWorkflows } from '../src/components/OneShotWorkflows';
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
  afterEach(() => cleanup());

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
          workflowExports: ['Run packet', 'PDF', 'Markdown'],
          workflowScorecard: [
            'Genre signal',
            'Scroll-stop power',
            'Typography plan',
            'Author/title hierarchy',
            'Originality',
            'Rights/disclosure risk',
            'Print readiness',
          ],
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
});
