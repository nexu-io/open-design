// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MotionEditorFrame, MotionStudioHost } from './MotionStudioHost';
import { WorkspaceMenuButton } from './WorkspaceFrame';
import { StudioHeader } from '../components/StudioHeader';
import { useMotionHistoryOperation } from './MotionHistoryState';

const state = vi.hoisted(() => ({
  renderQueue: { isRendering: false, ffmpegMissing: false },
  open: vi.fn(), export: vi.fn(), setTab: vi.fn(), setCollapsed: vi.fn(),
  undo: vi.fn(), redo: vi.fn(), create: vi.fn(), home: vi.fn(), rename: vi.fn(),
}));
vi.mock('../contexts/StudioContext', () => ({ useStudioShellContext: () => ({
  projectId: 'demo', renderQueue: state.renderQueue, waitForPendingDomEditSaves: async () => {},
}), useStudioShellContextOptional: () => ({
  editHistory: { canUndo: true, canRedo: true }, handleUndo: state.undo, handleRedo: state.redo,
}) }));
vi.mock('../contexts/PanelLayoutContext', () => ({ usePanelLayoutContext: () => ({
  rightCollapsed: false, setRightCollapsed: state.setCollapsed, setRightPanelTab: state.setTab,
}) }));
vi.mock('../components/dock/Dock', () => ({ Dock: { WindowMenu: () => <button>Window</button>, Panel: () => null } }));
vi.mock('../utils/studioTelemetry', () => ({ trackStudioEvent: vi.fn() }));
vi.mock('./useWorkspace', () => ({ useWorkspace: () => ({
  status: { projectId: 'demo' }, projects: [{ id: 'demo', title: 'Demo' }, { id: 'second', title: 'Second' }],
  busy: false, error: '', clearError: vi.fn(), open: state.open, openSession: state.open, startSession: state.create, create: state.create, home: state.home, rename: state.rename,
}) }));
vi.mock('./ConnectionDialog', () => ({ ConnectionDialog: ({ open, section, busy, onOpen }: { open: boolean; section: string; busy: boolean; onOpen: (id: string) => void }) =>
  open ? <div role="dialog" aria-label="MCP connections" data-section={section}>
    <button disabled={busy} onClick={() => onOpen('product-promo')}>Open Product Promo</button>
  </div> : null }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.renderQueue.isRendering = false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
function HistoryOperationState({ busy }: { busy: boolean }) {
  const { setBusy } = useMotionHistoryOperation();
  React.useEffect(() => setBusy(busy), [busy, setBusy]);
  return null;
}
function render(historyBusy = false) {
  act(() => root.render(<MotionStudioHost><HistoryOperationState busy={historyBusy} /><MotionEditorFrame><WorkspaceMenuButton /><StudioHeader captureFrameHref="/frame.png" captureFrameFilename="frame.png"
    handleCaptureFrameClick={vi.fn()} refreshCaptureFrameTime={vi.fn()} inspectorButtonActive={false}
    inspectorPanelActive={false} onExport={state.export} /></MotionEditorFrame></MotionStudioHost>));
}
const button = (text: string) => [...container.querySelectorAll('button')].find(el => el.textContent === text)!;

it('shares project sessions outside the native editor while Export keeps the native callback', () => {
  render();
  const header = container.querySelector('.motion-studio-header')!;
  const project = container.querySelector<HTMLButtonElement>('.motion-session[title="Second"]')!;
  expect(header.contains(project)).toBe(false);
  expect(container.querySelector('.motion-session[aria-current="page"]')?.textContent).toContain('Demo');
  for (const text of ['模板库', '预览', '布局', '历史', '导出']) expect(header.contains(button(text))).toBe(true);
  expect(container.querySelector('.motion-workspace-topbar')).toBeNull();
  expect(container.querySelector('.motion-sidebar-nav')?.textContent).toContain('连接 Agent');
  expect(container.querySelector('.motion-sidebar-settings [aria-label="模型设置"]')).not.toBeNull();
  expect(container.querySelector('.motion-sidebar-settings [aria-label="语言"]')).not.toBeNull();
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="撤销"]')!.click());
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="重做"]')!.click());
  expect(state.undo).toHaveBeenCalledOnce();
  expect(state.redo).toHaveBeenCalledOnce();
  act(() => button('导出').click());
  expect(state.setTab).toHaveBeenCalledWith('renders');
  expect(state.setCollapsed).toHaveBeenCalledWith(false);
  expect(state.export).toHaveBeenCalledOnce();
  act(() => project.click());
  expect(state.open).toHaveBeenCalledWith('second');
  act(() => button('连接 Agent').click());
  expect(container.querySelector('[role="dialog"][aria-label="MCP connections"]')).not.toBeNull();
  expect(container.querySelector('[role="dialog"]')!.getAttribute('data-section')).toBe('setup');
  act(() => button('模板库').click());
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(container.querySelector('[role="dialog"]')!.getAttribute('data-section')).toBe('templates');
  act(() => button('Open Product Promo').click());
  expect(state.create).toHaveBeenCalledWith(undefined, 'product-promo');
});

it('prevents project replacement during a native render without disabling MCP access', () => {
  state.renderQueue.isRendering = true;
  render();
  expect(container.querySelector<HTMLButtonElement>('.motion-session')!.disabled).toBe(true);
  expect(button('新建会话').disabled).toBe(true);
  expect(button('首页').disabled).toBe(true);
  expect(button('模板库').disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[data-testid="header-export"]')!.disabled).toBe(true);
  expect(button('连接 Agent').disabled).toBe(false);
  expect(container.textContent).toContain('正在渲染…');
  act(() => button('连接 Agent').click());
  expect(button('Open Product Promo').disabled).toBe(true);
});

it('prevents switching projects or issuing competing header undo while a version operation is running', () => {
  render(true);
  expect(container.querySelector<HTMLButtonElement>('.motion-session')!.disabled).toBe(true);
  expect(button('新建会话').disabled).toBe(true);
  expect(button('首页').disabled).toBe(true);
  expect(button('模板库').disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="撤销"]')!.disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="重做"]')!.disabled).toBe(true);
  expect(container.textContent).toContain('正在处理版本…');
});

it('creates a session, returns home and searches the same persistent project list', () => {
  render();
  act(() => button('新建会话').click());
  expect(state.create).toHaveBeenCalledOnce();
  act(() => button('首页').click());
  expect(state.home).toHaveBeenCalledOnce();
  const search = container.querySelector<HTMLInputElement>('[aria-label="搜索会话"]')!;
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'Second'); search.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(container.querySelectorAll('.motion-session')).toHaveLength(1);
  expect(container.querySelector('.motion-session')?.textContent).toContain('Second');
  act(() => container.querySelector<HTMLButtonElement>('.motion-workspace-menu')!.click());
  expect(localStorage.getItem('motion.workspace.sidebar.v1')).toBe('collapsed');
  expect(container.querySelector('.motion-workspace')?.getAttribute('data-collapsed')).toBe('true');
});
