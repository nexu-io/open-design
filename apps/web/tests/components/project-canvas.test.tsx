// @vitest-environment jsdom
//
// #8230 自由画布 v1 —— ProjectCanvas 接线红→绿测试。
//
// 画布是 React Flow 皮的 tldraw 观感面：把项目里已产出的 artifact 作为节点摆上
// 板、自由对比。RFC 拍板策略是「快照优先、仅聚焦节点升活」——所以未聚焦节点只
// 渲染轻量占位，点中某节点才把它升级成真正的沙箱预览（renderArtifact）。撤销/
// 重做走 canvas-model 的画布级命令栈，范围只到外壳（增删/移动/缩放/层级）。
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProjectCanvasState } from '@open-design/contracts';
import type { ProjectFile } from '../../src/types';
import {
  PROJECT_CANVAS_ARTIFACT_DRAG_MIME,
  ProjectCanvas,
} from '../../src/components/canvas/ProjectCanvas';
import { I18nProvider } from '../../src/i18n';

afterEach(() => {
  cleanup();
});

function artifactFile(name: string): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 100,
    mtime: 1_700_000_000,
    kind: 'html',
    mime: 'text/html',
  };
}

function stateWith(...refs: string[]): ProjectCanvasState {
  return {
    nodes: refs.map((ref, index) => ({
      id: `node-${index + 1}`,
      ref,
      x: index * 40,
      y: index * 40,
      w: 480,
      h: 360,
      z: index + 1,
    })),
  };
}

function renderCanvas(overrides: Partial<React.ComponentProps<typeof ProjectCanvas>> = {}) {
  const onStateChange = vi.fn();
  const renderArtifact = vi.fn((file: ProjectFile) => (
    <div data-testid="live-artifact" data-file={file.name}>
      {file.name} live
    </div>
  ));
  const props: React.ComponentProps<typeof ProjectCanvas> = {
    state: stateWith('a.html', 'b.html'),
    onStateChange,
    files: [artifactFile('a.html'), artifactFile('b.html')],
    renderArtifact,
    ...overrides,
  };
  render(
    <I18nProvider>
      <ProjectCanvas {...props} />
    </I18nProvider>,
  );
  return { onStateChange, renderArtifact, props };
}

describe('ProjectCanvas surface', () => {
  it('renders one node per canvas node carrying its artifact ref', () => {
    renderCanvas();
    const nodes = screen.getAllByTestId('rf-node');
    expect(nodes).toHaveLength(2);
    expect(nodes.map((node) => node.getAttribute('data-node-ref'))).toEqual([
      'a.html',
      'b.html',
    ]);
    // Edges/handles are off for v1 — the surface is a comparison board.
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('shows an empty-canvas hint when there are no nodes', () => {
    renderCanvas({ state: { nodes: [] } });
    expect(screen.getByTestId('project-canvas-empty')).toBeInTheDocument();
    expect(screen.queryAllByTestId('rf-node')).toHaveLength(0);
  });

  it('adds an available project artifact from the canvas toolbar', () => {
    const { onStateChange } = renderCanvas({
      state: stateWith('a.html'),
      files: [artifactFile('a.html'), artifactFile('b.html')],
    });

    fireEvent.click(screen.getByTestId('canvas-add-artifact'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'b.html' }));

    const next = onStateChange.mock.calls.at(-1)?.[0] as ProjectCanvasState;
    expect(next.nodes.map((node) => node.ref)).toEqual(['a.html', 'b.html']);
    expect(next.nodes[1]).toMatchObject({ id: 'node-2', x: 32, y: 32, z: 2 });
  });

  it('adds a dragged project artifact at the canvas drop position', () => {
    const { onStateChange } = renderCanvas({
      state: { nodes: [] },
      files: [artifactFile('a.html')],
    });
    const dataTransfer = {
      dropEffect: 'none',
      getData: vi.fn((type: string) =>
        type === PROJECT_CANVAS_ARTIFACT_DRAG_MIME ? 'a.html' : '',
      ),
      setData: vi.fn(),
      types: [PROJECT_CANVAS_ARTIFACT_DRAG_MIME],
    };

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(dropEvent, {
      clientX: { value: 240 },
      clientY: { value: 180 },
      dataTransfer: { value: dataTransfer },
    });
    fireEvent(screen.getByTestId('react-flow'), dropEvent);

    const next = onStateChange.mock.calls.at(-1)?.[0] as ProjectCanvasState;
    expect(next.nodes[0]).toMatchObject({ ref: 'a.html', x: 240, y: 180 });
  });

  it('restores and persists the canvas viewport', () => {
    const { onStateChange } = renderCanvas({
      state: {
        ...stateWith('a.html'),
        viewport: { x: -120, y: 48, zoom: 0.75 },
      },
    });

    expect(screen.getByTestId('react-flow')).toHaveAttribute(
      'data-default-viewport',
      JSON.stringify({ x: -120, y: 48, zoom: 0.75 }),
    );

    fireEvent.click(screen.getByTestId('rf-move-end'));

    const next = onStateChange.mock.calls.at(-1)?.[0] as ProjectCanvasState;
    expect(next.viewport).toEqual({ x: -80, y: 24, zoom: 0.6 });
    expect(next.nodes.map((node) => node.ref)).toEqual(['a.html']);
  });

  it('keeps unfocused nodes as lightweight snapshots and does not mount a live viewer', () => {
    const { renderArtifact } = renderCanvas();
    expect(screen.getAllByTestId('canvas-node-snapshot')).toHaveLength(2);
    expect(screen.queryByTestId('live-artifact')).toBeNull();
    expect(renderArtifact).not.toHaveBeenCalled();
  });

  it('upgrades only the focused node to the live sandboxed viewer', () => {
    const { renderArtifact } = renderCanvas();
    const firstNode = screen.getAllByTestId('rf-node')[0]!;
    fireEvent.click(firstNode);

    const live = screen.getByTestId('live-artifact');
    expect(live).toHaveAttribute('data-file', 'a.html');
    // Only the focused node is live; the other stays a snapshot.
    expect(screen.getAllByTestId('canvas-node-snapshot')).toHaveLength(1);
    expect(renderArtifact).toHaveBeenCalledTimes(1);
    expect(renderArtifact.mock.calls[0]?.[0]).toMatchObject({ name: 'a.html' });
  });

  it('removes a node through its toolbar and commits the smaller layout', () => {
    const { onStateChange } = renderCanvas();
    const firstNode = screen.getAllByTestId('rf-node')[0]!;
    // Selecting the node surfaces its toolbar (same as React Flow's default).
    fireEvent.click(firstNode);
    const toolbar = within(firstNode).getByTestId('rf-node-toolbar');
    fireEvent.click(within(toolbar).getByTestId('canvas-node-remove'));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    const next = onStateChange.mock.calls[0]![0] as ProjectCanvasState;
    expect(next.nodes.map((node) => node.ref)).toEqual(['b.html']);
  });

  it('resizes a node through its resizer and commits the new size', () => {
    const { onStateChange } = renderCanvas();
    const firstNode = screen.getAllByTestId('rf-node')[0]!;
    fireEvent.click(firstNode);
    fireEvent.click(within(firstNode).getByTestId('rf-node-resizer'));

    // Focus mounts the live viewer, then the resize commits — assert on the last call.
    const next = onStateChange.mock.calls.at(-1)?.[0] as ProjectCanvasState;
    expect(next.nodes[0]).toMatchObject({ id: 'node-1', w: 640, h: 480 });
  });

  it('undoes the last canvas-level edit through the command stack', () => {
    const { onStateChange } = renderCanvas();
    const firstNode = screen.getAllByTestId('rf-node')[0]!;
    fireEvent.click(firstNode);
    const toolbar = within(firstNode).getByTestId('rf-node-toolbar');
    fireEvent.click(within(toolbar).getByTestId('canvas-node-remove'));
    expect((onStateChange.mock.calls.at(-1)?.[0] as ProjectCanvasState).nodes).toHaveLength(1);

    fireEvent.click(screen.getByTestId('canvas-undo'));
    const restored = onStateChange.mock.calls.at(-1)?.[0] as ProjectCanvasState;
    expect(restored.nodes.map((node) => node.ref)).toEqual(['a.html', 'b.html']);
  });

  it('disables undo until there is history', () => {
    renderCanvas();
    expect(screen.getByTestId('canvas-undo')).toBeDisabled();
    expect(screen.getByTestId('canvas-redo')).toBeDisabled();
  });
});
