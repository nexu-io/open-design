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
                narration: '專業講解者 (professional) 旁白：Open with the question the viewer cares about.',
                shot: '鏡頭：Open with the question the viewer cares about.',
                assets: '素材：Use a bold title card and one sample image.',
                output: '成片：Open with the question the viewer cares about.',
                voiceProfileId: 'guide-host',
              },
              {
                id: 'body',
                label: 'Body',
                paragraph: 'Show one concrete example and explain the key step.',
                narration: '專業講解者 (professional) 旁白：Show one concrete example and explain the key step.',
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
                  narration: '年輕聲線 (young) 旁白：Hook rewrite from OpenRouter.',
                  voiceProfileId: 'young-voice',
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
  window.localStorage.clear();
  vi.unstubAllGlobals();
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
    expect(screen.getByTestId('production-voice-profile-card-guide-host')).toHaveTextContent('專業講解者');
    expect(screen.getByTestId('production-voice-profile-card-young-voice')).toHaveTextContent('年輕聲線');
    expect(screen.getByTestId('production-voice-preview')).toHaveTextContent('Voice flow (professional)');
    expect(screen.getByRole('textbox', { name: 'Hook 段落' })).toHaveValue('Hook: explain the core idea in one line.');
    expect(screen.getByRole('textbox', { name: 'Body 鏡頭' })).toHaveValue('鏡頭：Body: show the main example with one clear visual.');
    expect(screen.getByText('0 media jobs queued for FAL.ai: 0 image, 0 video, 0 plan-only 3D.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增分段' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '規劃圖片隊列' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '規劃影片隊列' })).toBeInTheDocument();
  });

  it('renders a draggable canvas board for the production cards', () => {
    renderWorkspace();

    const board = screen.getByTestId('production-canvas-board');
    const scriptNode = screen.getByTestId('production-canvas-node-script');
    const firstEdge = screen.getByTestId('production-canvas-edge-script-voice');
    const threeDNode = screen.getByTestId('production-canvas-node-threeD');

    expect(board).toBeInTheDocument();
    expect(firstEdge).toBeInTheDocument();
    expect(threeDNode).toBeInTheDocument();
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

  it('can add, rename, link, and delete a custom canvas node', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '新增節點' }));

    expect(screen.getByTestId('production-canvas-node-custom-1')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Node 1 說明' }), {
      target: { value: 'Describe the planning step in one sentence.' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Node 1 標題' }), {
      target: { value: 'Planning' },
    });

    expect(screen.getByRole('textbox', { name: 'Planning 標題' })).toHaveValue('Planning');
    expect(screen.getByRole('textbox', { name: 'Planning 說明' })).toHaveValue(
      'Describe the planning step in one sentence.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start outgoing link from Planning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete link to Output' }));

    expect(screen.getByTestId('production-canvas-edge-custom-1-output')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '移除 Planning 到 Output 的連線' }));
    expect(screen.queryByTestId('production-canvas-edge-custom-1-output')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '刪除 Planning 節點' }));
    expect(screen.queryByTestId('production-canvas-node-custom-1')).not.toBeInTheDocument();
  });

  it('restores canvas edits from localStorage', () => {
    window.localStorage.setItem(
      'open-design:production-canvas:project-1',
      JSON.stringify({
        version: 1,
        nextNodeNumber: 2,
        nodes: [
          { id: 'script', title: 'Script', description: 'Base script', x: 36, y: 44 },
          { id: 'voice', title: 'Voice', description: 'Base voice', x: 280, y: 24 },
          { id: 'storyboard', title: 'Storyboard', description: 'Base storyboard', x: 548, y: 86 },
          { id: 'threeD', title: '3D', description: 'Base 3D', x: 802, y: 128 },
          { id: 'assets', title: 'Assets', description: 'Base assets', x: 1052, y: 26 },
          { id: 'output', title: 'Output', description: 'Base output', x: 1320, y: 66 },
          {
            id: 'custom-1',
            title: 'Planning',
            description: 'Describe the planning step in one sentence.',
            x: 120,
            y: 220,
          },
        ],
        edges: [
          { from: 'script', to: 'voice' },
          { from: 'voice', to: 'storyboard' },
          { from: 'storyboard', to: 'threeD' },
          { from: 'threeD', to: 'assets' },
          { from: 'storyboard', to: 'assets' },
          { from: 'assets', to: 'output' },
          { from: 'custom-1', to: 'output' },
        ],
      }),
    );

    renderWorkspace();

    expect(screen.getByRole('textbox', { name: 'Planning 標題' })).toHaveValue('Planning');
    expect(screen.getByRole('textbox', { name: 'Planning 說明' })).toHaveValue(
      'Describe the planning step in one sentence.',
    );
    expect(screen.getByTestId('production-canvas-edge-custom-1-output')).toBeInTheDocument();
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
      '專業講解者 (professional) 旁白：Hook: explain the core idea in one line.',
    );
    expect(screen.getByRole('textbox', { name: 'Hook 鏡頭' })).toHaveValue(
      '鏡頭：Hook: explain the core idea in one line.',
    );
    expect(screen.getByRole('textbox', { name: 'Hook 素材' })).toHaveValue(
      '素材：Hook: explain the core idea in one line.',
    );
    expect(screen.getByRole('textbox', { name: 'Hook 成片' })).toHaveValue(
      '成片：Hook: explain the core idea in one line.',
    );
    expect(screen.getByTestId('hook-narration-status')).toHaveTextContent('stale');
    expect(screen.getByTestId('hook-shot-status')).toHaveTextContent('stale');
    expect(screen.getByTestId('hook-assets-status')).toHaveTextContent('stale');
    expect(screen.getByTestId('hook-output-status')).toHaveTextContent('stale');
  });

  it('can regenerate a stale downstream lane back into sync', () => {
    renderWorkspace();

    fireEvent.change(screen.getByRole('textbox', { name: 'Hook 段落' }), {
      target: { value: 'A fresh script paragraph.' },
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Rebuild from script' })[0]!);

    expect(screen.getByRole('textbox', { name: 'Hook 旁白' })).toHaveValue(
      '專業講解者 (professional) 旁白：A fresh script paragraph.',
    );
    expect(screen.getByTestId('hook-narration-status')).toHaveTextContent('in sync');
  });

  it('can bind a voice profile to a segment lane', () => {
    renderWorkspace();

    fireEvent.change(screen.getByRole('combobox', { name: 'Hook 角色綁定' }), {
      target: { value: 'young-voice' },
    });

    expect(screen.getByTestId('production-voice-profile-card-young-voice')).toHaveTextContent('1 lanes');
    expect(screen.getByRole('textbox', { name: 'Hook 旁白' })).toHaveValue(
      '年輕聲線 (professional) 旁白：Hook: explain the core idea in one line.',
    );
  });

  it('can add and remove script segments', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '新增分段' }));

    expect(screen.getByRole('textbox', { name: '第 4 段 段落' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '第 4 段 旁白' })).toHaveValue('專業講解者 (professional) 旁白：請輸入段落');
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
      '年輕聲線 (young) 旁白：Hook rewrite from OpenRouter.',
    );
    expect(screen.getByRole('combobox', { name: 'Hook 角色綁定' })).toHaveValue('young-voice');
  });

  it('applies generated storyboard results from OpenRouter', async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Generate storyboard' }));

    expect(await screen.findByText('Storyboard lanes updated from OpenRouter.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Hook 鏡頭' })).toHaveValue('鏡頭：Hook rewrite from OpenRouter.');
    expect(screen.getByText('3 media jobs queued for FAL.ai: 3 image, 0 video, 0 plan-only 3D.')).toBeInTheDocument();
    expect(screen.getByTestId('production-media-job-list')).toBeInTheDocument();
  });

  it('syncs queued FAL.ai jobs through the daemon media routes', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('/media/generate')) {
        const taskId = href.includes('project-1') ? `task-${Math.random().toString(36).slice(2, 8)}` : 'task-unknown';
        return new Response(JSON.stringify({ taskId, status: 'queued', startedAt: 111 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          taskId: 'task-hook',
          status: 'done',
          startedAt: 111,
          endedAt: 222,
          progress: ['daemon accepted the job'],
          nextSince: 1,
          file: { name: 'render.mp4' },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock as never);

    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Generate storyboard' }));
    await screen.findByText('3 media jobs queued for FAL.ai: 3 image, 0 video, 0 plan-only 3D.');
    fireEvent.click(screen.getByRole('button', { name: 'Sync FAL.ai queue' }));

    expect(await screen.findByText('FAL.ai jobs synced from the daemon.')).toBeInTheDocument();
    expect(screen.getAllByText(/task task-/)).toHaveLength(3);
    expect(screen.getAllByText('daemon accepted the job')).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('shows plan-only 3D jobs without offering daemon submission', () => {
    window.localStorage.setItem(
      'open-design:production-workspace:project-1',
      JSON.stringify({
        version: 2,
        nextSegmentNumber: 4,
        segments: [
          {
            id: 'hook',
            label: 'Hook',
            paragraph: 'Open with a product hero shot.',
            narration: '專業講解者 (professional) 旁白：Open with a product hero shot.',
            shot: '鏡頭：Open with a product hero shot.',
            assets: '素材：Use a clean hero render.',
            output: '成片：Open with a product hero shot.',
            voiceProfileId: 'guide-host',
          },
        ],
        syncState: {
          hook: {
            narration: 'in-sync',
            shot: 'in-sync',
            assets: 'in-sync',
            output: 'in-sync',
          },
        },
        mediaJobs: [
          {
            id: 'job-3d-hook-1',
            segmentId: 'hook',
            kind: '3d',
            status: 'queued',
            provider: 'blender',
            model: 'blender/plan-only',
            prompt: '3D prompt for Hook: Open with a product hero shot.',
            referenceAssetIds: ['hero-reference'],
            resultAssetIds: [],
            progress: ['queued locally as a 3D plan'],
            planOnly: true,
            plan: {
              engine: 'blender',
              purpose: 'product',
              sceneSummary: 'Open with a product hero shot.',
              camera: {
                angle: 'three-quarter',
                framing: 'medium',
                movement: 'orbit',
              },
              styleNotes: ['Keep the scene glossy but editable.'],
              objectNotes: ['Segment: Hook'],
              outputIntent: 'turntable',
              referenceAssetIds: ['hero-reference'],
              planOnly: true,
            },
            file: null,
          },
        ],
      }),
    );

    renderWorkspace();

    expect(screen.getByText('1 media jobs queued for FAL.ai: 0 image, 0 video, 1 plan-only 3D.')).toBeInTheDocument();
    expect(screen.getByText('plan-only 3D / blender / turntable / three-quarter')).toBeInTheDocument();
    expect(screen.getByText('3D is intentionally plan-only until we confirm a supported FAL daemon surface.')).toBeInTheDocument();
  });

  it('restores a saved production workspace snapshot from localStorage', () => {
    window.localStorage.setItem(
      'open-design:production-workspace:project-1',
      JSON.stringify({
        version: 1,
        nextSegmentNumber: 9,
        segments: [
          {
            id: 'hook',
            label: 'Hook',
            paragraph: 'Saved paragraph',
            narration: '專業講解者 (professional) 旁白：Saved paragraph',
            shot: '鏡頭：Saved paragraph',
            assets: '素材：Saved paragraph',
            output: '成片：Saved paragraph',
            voiceProfileId: 'guide-host',
          },
        ],
        syncState: {
          hook: {
            narration: 'stale',
            shot: 'stale',
            assets: 'stale',
            output: 'stale',
          },
        },
        mediaJobs: [
          {
            id: 'job-hook',
            segmentId: 'hook',
            kind: 'image',
            status: 'queued',
            provider: 'fal',
            model: 'fal/flux-pro',
            prompt: 'Saved prompt',
            referenceAssetIds: [],
            resultAssetIds: [],
            progress: ['restored from storage'],
            taskId: 'task-restore',
            startedAt: 123,
            endedAt: null,
            file: null,
          },
        ],
      }),
    );

    renderWorkspace();

    expect(screen.getByRole('textbox', { name: 'Hook 段落' })).toHaveValue('Saved paragraph');
    expect(screen.getByText('1 media jobs queued for FAL.ai: 1 image, 0 video, 0 plan-only 3D.')).toBeInTheDocument();
    expect(screen.getByText('task task-restore')).toBeInTheDocument();
    expect(screen.getByText('restored from storage')).toBeInTheDocument();
  });
});
