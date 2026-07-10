// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProductionWorkspace } from '../../src/components/production/ProductionWorkspace';

afterEach(() => {
  cleanup();
});

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

  it('renders a draggable canvas board for the production cards', () => {
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

    const board = screen.getByTestId('production-canvas-board');
    const scriptNode = screen.getByTestId('production-canvas-node-script');
    const firstEdge = screen.getByTestId('production-canvas-edge-script-voice');

    expect(board).toBeInTheDocument();
    expect(firstEdge).toBeInTheDocument();
    expect(scriptNode).toHaveStyle({ transform: 'translate(36px, 44px)' });

    fireEvent.pointerDown(scriptNode, { clientX: 72, clientY: 92 });
    fireEvent.pointerMove(window, { clientX: 172, clientY: 172 });
    fireEvent.pointerUp(window);

    expect(scriptNode).toHaveStyle({ transform: 'translate(136px, 124px)' });
  });

  it('can connect two cards into a new canvas edge', () => {
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

    expect(screen.queryByTestId('production-canvas-edge-script-assets')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start outgoing link from Script' }));
    expect(screen.getByTestId('production-canvas-status')).toHaveTextContent('Connecting from Script');

    fireEvent.click(screen.getByRole('button', { name: 'Complete link to Assets' }));

    expect(screen.getByTestId('production-canvas-edge-script-assets')).toBeInTheDocument();
    expect(screen.getByTestId('production-canvas-status')).toHaveTextContent('No active connection');
  });
});
