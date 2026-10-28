// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Conversation, Project } from '../../src/types';
import { RailNewConversation, RailProjectFolder, type RailConversationModel } from '../../src/components/entry-nav-rail/RailConversationTree';
const { listConversations, createConversation } = vi.hoisted(() => ({ listConversations: vi.fn(), createConversation: vi.fn() }));
vi.mock('../../src/state/projects', () => ({ listConversations, createConversation }));
vi.mock('../../src/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('../../src/components/entry-nav-rail/RailRecentRow', () => ({
  NewConversationMark: () => null,
  RailRecentRow: ({ project, expanded, onOpen, onNewConversation }: { project: Project; expanded: boolean; onOpen: () => void; onNewConversation?: () => void }) => <>
    <button aria-expanded={expanded} onClick={onOpen}>{project.name}</button>
    {onNewConversation ? <button data-testid="folder-new-conversation" onClick={onNewConversation}>new</button> : null}
  </>,
}));
const project = { id: 'p1', name: 'Project folder' } as Project;
const conversations = [{ id: 'c1', title: 'First conversation', createdAt: 1 }, { id: 'c2', title: 'Second conversation', createdAt: 2 }] as Conversation[];
afterEach(cleanup);
beforeEach(() => { listConversations.mockReset(); listConversations.mockResolvedValue(conversations); });

it('expands a folder without navigation, then opens conversation leaves', async () => {
  const onOpenConversation = vi.fn();
  const context = { workspaceId: 'ws1' } as import('@open-design/contracts').WorkspaceCollabContext;
  render(<RailProjectFolder project={project} context={context} onOpenConversation={onOpenConversation} />);
  expect(listConversations).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Project folder' }));
  const child = await screen.findByRole('button', { name: 'First conversation' });
  expect(onOpenConversation).not.toHaveBeenCalled();
  expect(listConversations).toHaveBeenCalledWith('p1', { workspaceContext: context, throwOnError: true });
  fireEvent.click(child);
  expect(onOpenConversation).toHaveBeenCalledWith('p1', 'c1');
  expect(child.hasAttribute('aria-expanded')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Project folder' }));
  expect(screen.getByRole('button', { name: 'Project folder' }).getAttribute('aria-expanded')).toBe('false');
});

it('shows a newly created conversation immediately under its project and selects it', () => {
  const model: RailConversationModel = { projectId: 'p1', conversations: [conversations[0]!], activeConversationId: 'c1', creating: false, onCreate: vi.fn(), onSelect: vi.fn() };
  const { rerender } = render(<RailProjectFolder project={project} model={model} />);
  rerender(<RailProjectFolder project={project} model={{ ...model, conversations, activeConversationId: 'c2' }} />);
  const first = screen.getByRole('button', { name: 'First conversation' });
  const second = screen.getByRole('button', { name: 'Second conversation' });
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(second.getAttribute('aria-current')).toBe('page');
  fireEvent.click(first);
  expect(model.onSelect).toHaveBeenCalledWith('c1');
  expect(listConversations).not.toHaveBeenCalled();
});

it('allows retrying a failed conversation read', async () => {
  listConversations.mockRejectedValueOnce(new Error('offline'));
  render(<RailProjectFolder project={project} />);
  fireEvent.click(screen.getByRole('button', { name: 'Project folder' }));
  fireEvent.click(await screen.findByRole('button', { name: 'preview.retry' }));
  await screen.findByRole('button', { name: 'First conversation' });
  await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(2));
});

it('uses the supplied new-conversation action and disables it while creating', () => {
  const onClick = vi.fn();
  const { rerender } = render(<RailNewConversation onClick={onClick} />);
  fireEvent.click(screen.getByRole('button', { name: 'entry.newConversation' }));
  expect(onClick).toHaveBeenCalledTimes(1);
  rerender(<RailNewConversation onClick={onClick} disabled />);
  fireEvent.click(screen.getByRole('button', { name: 'entry.newConversation' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('inserts a new conversation directly below the current conversation, without a third level', () => {
  const fresh = { id: 'c3', title: 'New conversation', createdAt: 3 } as Conversation;
  const model: RailConversationModel = { projectId: 'p1', conversations: [...conversations, fresh], activeConversationId: 'c3', creating: false, onCreate: vi.fn(), onSelect: vi.fn(), newConversationPlacement: { id: 'c3', afterId: 'c1' } };
  render(<RailProjectFolder project={project} model={model} />);
  expect(screen.getAllByRole('button').filter(button => !button.dataset.testid).map(button => button.textContent)).toEqual(['Project folder', 'First conversation', 'New conversation', 'Second conversation']);
  expect(screen.getAllByRole('list')).toHaveLength(1);
});


it('keeps loaded conversation rows mounted while reopening a folder', async () => {
  const { rerender } = render(<RailProjectFolder project={project} />);
  fireEvent.click(screen.getByRole('button', { name: 'Project folder' }));
  const child = await screen.findByRole('button', { name: 'First conversation' });
  fireEvent.click(screen.getByRole('button', { name: 'Project folder' }));
  listConversations.mockImplementation(() => new Promise(() => {}));
  fireEvent.click(screen.getByRole('button', { name: 'Project folder' }));
  expect(screen.getByRole('button', { name: 'First conversation' })).toBe(child);
  expect(screen.queryByText('common.loading')).toBeNull();
  // Cached rows must never leak into another workspace.
  rerender(<RailProjectFolder project={project} context={{ workspaceId: 'other' } as import('@open-design/contracts').WorkspaceCollabContext} />);
  expect(screen.queryByRole('button', { name: 'First conversation' })).toBeNull();
});

it('keeps the outgoing project conversations visible while switching projects', () => {
  const model: RailConversationModel = { projectId: 'p1', conversations, activeConversationId: 'c1', creating: false, onCreate: vi.fn(), onSelect: vi.fn() };
  const { rerender } = render(<RailProjectFolder project={project} model={model} />);
  const child = screen.getByRole('button', { name: 'First conversation' });
  listConversations.mockImplementation(() => new Promise(() => {}));
  rerender(<RailProjectFolder project={project} model={null} />);
  expect(screen.getByRole('button', { name: 'First conversation' })).toBe(child);
  expect(screen.queryByText('common.loading')).toBeNull();
});

it('keeps cached children when the newly selected project publishes its loading model', async () => {
  const { rerender } = render(<RailProjectFolder project={project} />);
  fireEvent.click(screen.getByRole('button', { name: 'Project folder' }));
  const child = await screen.findByRole('button', { name: 'First conversation' });
  const model: RailConversationModel = { projectId: 'p1', conversations: [], conversationsLoading: true, activeConversationId: 'c1', creating: false, onCreate: vi.fn(), onSelect: vi.fn() };
  rerender(<RailProjectFolder project={project} model={model} />);
  expect(screen.getByRole('button', { name: 'First conversation' })).toBe(child);
  expect(child.getAttribute('aria-current')).toBe('page');
  rerender(<RailProjectFolder project={project} model={{ ...model, conversationsLoading: false, conversations }} />);
  expect(screen.getByRole('button', { name: 'First conversation' })).toBe(child);
  // An authoritative empty result must still remove deleted conversations.
  rerender(<RailProjectFolder project={project} model={{ ...model, conversationsLoading: false }} />);
  expect(screen.queryByRole('button', { name: 'First conversation' })).toBeNull();
});

it('starts a new conversation from the folder hover action', async () => {
  listConversations.mockResolvedValue([]);
  createConversation.mockResolvedValue({ id: 'fresh', title: null, createdAt: 3 });
  const onOpenConversation = vi.fn();
  render(<RailProjectFolder project={project} onOpenConversation={onOpenConversation} />);
  fireEvent.click(screen.getByTestId('folder-new-conversation'));
  await waitFor(() => expect(onOpenConversation).toHaveBeenCalledWith('p1', 'fresh'));
  expect(createConversation).toHaveBeenCalledWith('p1', undefined, { workspaceContext: undefined });

  const onCreate = vi.fn(async () => {});
  cleanup();
  render(<RailProjectFolder project={project} model={{ projectId: 'p1', conversations: [], activeConversationId: null, creating: false, onCreate, onSelect: vi.fn() }} />);
  fireEvent.click(screen.getByTestId('folder-new-conversation'));
  expect(onCreate).toHaveBeenCalledTimes(1);
});
