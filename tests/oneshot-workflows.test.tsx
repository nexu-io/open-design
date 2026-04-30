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
    expect(screen.getAllByRole('button', { name: /start/i })).toHaveLength(6);
    expect(screen.getByText('BSA Proposal + SOW')).toBeInTheDocument();
    expect(screen.getByText('OneShot Cover Run')).toBeInTheDocument();
    expect(screen.getByText('6 workflow packs')).toBeInTheDocument();
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
        metadata: { kind: 'template', animations: false },
        pendingPrompt: expect.stringContaining('CoverVisionOS standard'),
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
