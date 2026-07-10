// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductionWorkspace } from '../../src/components/production/ProductionWorkspace';
import { DEFAULT_CONFIG } from '../../src/state/config';

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(async (_cfg, _system, history, _signal, handlers) => {
    const prompt = String((history as Array<{ content?: string }>)[0]?.content ?? '');
    const kind = prompt.includes('"task": "voice"')
      ? 'voice'
      : prompt.includes('"task": "storyboard"')
        ? 'storyboard'
        : 'draft';
    const payload =
      kind === 'draft'
        ? {
            segments: [
              {
                id: 'hook',
                label: 'Hook',
                paragraph: 'Open with the question the viewer cares about.',
                narration: 'Guide host (professional) 旁白：Open with the question the viewer cares about.',
                shot: '鏡頭：Open with the question the viewer cares about.',
                assets: '素材：Use a bold title card and one sample image.',
                output: '成片：Open with the question the viewer cares about.',
                voiceProfileId: 'guide-host',
              },
              {
                id: 'body',
                label: 'Body',
                paragraph: 'Show one concrete example and explain the key step.',
                narration: 'Guide host (professional) 旁白：Show one concrete example and explain the key step.',
                shot: '鏡頭：Show one concrete example and explain the key step.',
                assets: '素材：Use a demo screen and supporting illustration.',
                output: '成片：Show one concrete example and explain the key step.',
                voiceProfileId: 'guide-host',
              },
            ],
          }
        : kind === 'voice'
          ? {
              segments: [
                {
                  id: 'hook',
                  label: 'Hook',
                  narration: 'Energetic presenter (professional) 旁白：Hook rewrite from OpenRouter.',
                  voiceProfileId: 'energetic-presenter',
                },
              ],
            }
          : {
              segments: [
                {
                  id: 'hook',
                  label: 'Hook',
                  shot: '鏡頭：Hook rewrite from OpenRouter.',
                },
              ],
            };
    handlers.onDelta(JSON.stringify(payload));
    handlers.onDone(JSON.stringify(payload));
  }),
}));

afterEach(() => {
  cleanup();
});

const openRouterConfig = {
  ...DEFAULT_CONFIG,
  mode: 'api' as const,
  apiProtocol: 'openai' as const,
  apiKey: 'test-openrouter-key',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-3.7-sonnet',
};

function renderWorkspace() {
  return render(
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
      config={openRouterConfig}
    />,
  );
}

describe('ProductionWorkspace', () => {
  it('renders the five production lanes and voice profile cards', () => {
    renderWorkspace();

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
    renderWorkspace();

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
    renderWorkspace();

    expect(screen.queryByTestId('production-canvas-edge-script-assets')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start outgoing link from Script' }));
    expect(screen.getByTestId('production-canvas-status')).toHaveTextContent('Connecting from Script');

    fireEvent.click(screen.getByRole('button', { name: 'Complete link to Assets' }));

    expect(screen.getByTestId('production-canvas-edge-script-assets')).toBeInTheDocument();
    expect(screen.getByTestId('production-canvas-status')).toHaveTextContent('No active connection');
  });

  it('syncs the voice and storyboard panels when a paragraph changes', () => {
    renderWorkspace();

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
    renderWorkspace();

    fireEvent.change(screen.getByRole('combobox', { name: 'Hook 角色綁定' }), {
      target: { value: 'energetic-presenter' },
    });

    expect(screen.getByTestId('production-voice-profile-card-energetic-presenter')).toHaveTextContent('1 lanes');
    expect(screen.getByRole('textbox', { name: 'Hook 旁白' })).toHaveValue(
      'Energetic presenter (professional) 旁白：Hook: explain the core idea in one line.',
    );
  });

  it('can add and remove script segments', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '新增分段' }));

    expect(screen.getByRole('textbox', { name: '第 4 段 段落' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '第 4 段 旁白' })).toHaveValue('Guide host (professional) 旁白：請輸入段落');
    expect(screen.getByRole('textbox', { name: '第 4 段 鏡頭' })).toHaveValue('鏡頭：請輸入段落');

    fireEvent.click(screen.getByRole('button', { name: '第 4 段 刪除分段' }));

    expect(screen.queryByRole('textbox', { name: '第 4 段 段落' })).not.toBeInTheDocument();
  });

  it('applies generated draft results from OpenRouter', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));

    expect(await screen.findByText('Draft updated from OpenRouter.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Hook 段落' })).toHaveValue('Open with the question the viewer cares about.');
    expect(screen.getByRole('textbox', { name: 'Body 素材' })).toHaveValue('素材：Use a demo screen and supporting illustration.');
  });

  it('applies generated voice results from OpenRouter', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Generate voice' }));

    expect(await screen.findByText('Voice lanes updated from OpenRouter.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Hook 旁白' })).toHaveValue(
      'Energetic presenter (professional) 旁白：Hook rewrite from OpenRouter.',
    );
    expect(screen.getByRole('combobox', { name: 'Hook 角色綁定' })).toHaveValue('energetic-presenter');
  });

  it('applies generated storyboard results from OpenRouter', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Generate storyboard' }));

    expect(await screen.findByText('Storyboard lanes updated from OpenRouter.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Hook 鏡頭' })).toHaveValue('鏡頭：Hook rewrite from OpenRouter.');
  });
});
