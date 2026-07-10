// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProductionWorkspace } from '../../src/components/production/ProductionWorkspace';

afterEach(() => {
  cleanup();
});

describe('ProductionWorkspace', () => {
  it('renders the five production lanes and voice profile cards', () => {
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

    expect(screen.getByRole('heading', { name: '段落' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '旁白' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '鏡頭' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '素材' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '成片' })).toBeInTheDocument();
    expect(screen.getByText('Science explainer')).toBeInTheDocument();
    expect(screen.getByTestId('production-voice-profile-cards')).toBeInTheDocument();
    expect(screen.getByTestId('production-voice-profile-card-guide-host')).toHaveTextContent('Guide host');
    expect(screen.getByTestId('production-voice-preview')).toHaveTextContent('Voice flow (professional)');
    expect(screen.getByRole('textbox', { name: 'Hook 段落' })).toHaveValue('Hook: explain the core idea in one line.');
    expect(screen.getByRole('textbox', { name: 'Body 鏡頭' })).toHaveValue('鏡頭：Body: show the main example with one clear visual.');
    expect(screen.getByRole('button', { name: '新增分段' })).toBeInTheDocument();
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

  it('syncs the voice and storyboard panels when a paragraph changes', () => {
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

    fireEvent.change(screen.getByRole('textbox', { name: 'Hook 段落' }), {
      target: {
        value: 'Opening: frame the question.\nDemo: show the key step.\nEnding: leave the viewer with a clear next move.',
      },
    });

    expect(screen.getByTestId('production-voice-preview')).toHaveTextContent('Voice flow (professional)');
    expect(screen.getByRole('textbox', { name: 'Hook 旁白' })).toHaveValue(
      'Guide host (professional) 旁白：Opening: frame the question.\nDemo: show the key step.\nEnding: leave the viewer with a clear next move.',
    );
    expect(screen.getByRole('textbox', { name: 'Hook 鏡頭' })).toHaveValue(
      '鏡頭：Opening: frame the question.\nDemo: show the key step.\nEnding: leave the viewer with a clear next move.',
    );
    expect(screen.getByRole('textbox', { name: 'Hook 素材' })).toHaveValue(
      '素材：Opening: frame the question.\nDemo: show the key step.\nEnding: leave the viewer with a clear next move.',
    );
    expect(screen.getByRole('textbox', { name: 'Hook 成片' })).toHaveValue(
      '成片：Opening: frame the question.\nDemo: show the key step.\nEnding: leave the viewer with a clear next move.',
    );
  });

  it('can bind a voice profile to a segment lane', () => {
    render(
      <ProductionWorkspace
        projectId="project-1"
        projectName="Science Explainer"
        metadata={{
          kind: 'video',
          workflowMode: 'production',
          taskCardId: 'science-explainer',
          voiceTone: 'professional',
          voiceProfileId: 'guide-host',
        } as never}
        projectFiles={[]}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Hook 角色綁定' }), {
      target: { value: 'energetic-presenter' },
    });

    expect(screen.getByTestId('production-voice-profile-card-energetic-presenter')).toHaveTextContent('1 lanes');
    expect(screen.getByRole('textbox', { name: 'Hook 旁白' })).toHaveValue(
      'Energetic presenter (professional) 旁白：Hook: explain the core idea in one line.',
    );
  });

  it('can add and remove script segments', () => {
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

    fireEvent.click(screen.getByRole('button', { name: '新增分段' }));

    expect(screen.getByRole('textbox', { name: '第 4 段 段落' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '第 4 段 旁白' })).toHaveValue('Guide host (professional) 旁白：請輸入段落');
    expect(screen.getByRole('textbox', { name: '第 4 段 鏡頭' })).toHaveValue('鏡頭：請輸入段落');

    fireEvent.click(screen.getByRole('button', { name: '第 4 段 刪除分段' }));

    expect(screen.queryByRole('textbox', { name: '第 4 段 段落' })).not.toBeInTheDocument();
  });
});
