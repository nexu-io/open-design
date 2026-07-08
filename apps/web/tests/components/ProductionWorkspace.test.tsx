// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProductionWorkspace } from '../../src/components/production/ProductionWorkspace';

describe('ProductionWorkspace', () => {
  it('renders the five production lanes and a beginner-friendly voiceover action', () => {
    render(
      <ProductionWorkspace
        projectId="project-1"
        projectName="Science Explainer"
        metadata={{
          kind: 'video',
          workflowMode: 'production',
          taskCardId: 'science-explainer',
          voiceTone: 'professional',
          voiceProfileId: 'rachel-default',
        } as never}
        projectFiles={[]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Script' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Voice' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Storyboard' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assets' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Output' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate voiceover' })).toBeInTheDocument();
    expect(screen.getByText('Science explainer')).toBeInTheDocument();
    expect(screen.getByText('Beginner-friendly empty state: break the script into shots when you need more control.'))
      .toBeInTheDocument();
  });
});
