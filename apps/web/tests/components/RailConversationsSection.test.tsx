// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { Conversation, Project } from '../../src/types';
import { RailConversationsSection } from '../../src/components/entry-nav-rail/RailConversationsSection';
import type { RailConversationModel } from '../../src/components/entry-nav-rail/RailConversationTree';

const { listConversations, patchConversation, deleteConversation } = vi.hoisted(() => ({
  listConversations: vi.fn(), patchConversation: vi.fn(), deleteConversation: vi.fn(),
}));
vi.mock('../../src/state/projects', () => ({ listConversations, patchConversation, deleteConversation }));
vi.mock('../../src/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const projects = [{ id: 'p1', name: 'Project one' }, { id: 'p2', name: 'Project two' }] as Project[];
// Conversation title buttons only; each row also carries a ⋮ menu trigger.
const rowButtons = () => within(screen.getByRole('list')).getAllByRole('button').filter(button => !button.hasAttribute('aria-haspopup'));
const chat = (id: string, title: string, updatedAt: number) => ({ id, title, createdAt: updatedAt, updatedAt }) as Conversation;
beforeEach(() => { localStorage.clear(); listConversations.mockReset(); listConversations.mockResolvedValue([]); });
afterEach(cleanup);

it('shows actual saved conversations newest first and opens the exact conversation', async () => {
  listConversations.mockImplementation(async (id: string) => id === 'p1'
    ? [chat('c1', 'Older chat', 1)] : [chat('c2', 'Newest chat', 2)]);
  const onOpenConversation = vi.fn();
  render(<RailConversationsSection projects={projects} onOpenConversation={onOpenConversation} />);
  await screen.findByRole('button', { name: 'Newest chat' });
  expect(rowButtons().map(button => button.textContent)).toEqual(['Newest chat', 'Older chat']);
  expect(screen.queryByText('Project one')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Older chat' }));
  expect(onOpenConversation).toHaveBeenCalledWith('p1', 'c1');
});

it('opens the section and immediately shows newly created chats from the live model', async () => {
  localStorage.setItem('od.entry.railRecentOpen', 'false');
  const model: RailConversationModel = {
    projectId: 'p1', conversations: [chat('c1', 'Current', 1)], activeConversationId: 'c1',
    creating: false, onCreate: vi.fn(), onSelect: vi.fn(),
  };
  const { rerender } = render(<RailConversationsSection projects={projects} model={model} />);
  rerender(<RailConversationsSection projects={projects} model={{ ...model, activeConversationId: 'c2', conversations: [...model.conversations, chat('c2', 'New chat', 2)] }} />);
  expect(screen.getByRole('button', { name: 'New chat' }).getAttribute('aria-current')).toBe('page');
  fireEvent.click(screen.getByRole('button', { name: 'Current' }));
  expect(model.onSelect).toHaveBeenCalledWith('c1');
  await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(1));
  expect(listConversations.mock.calls[0]?.[0]).toBe('p2');
});

it('loads only when expanded and supports retry after a failed read', async () => {
  localStorage.setItem('od.entry.railRecentOpen', 'false');
  listConversations.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([chat('c1', 'Recovered', 1)]);
  render(<RailConversationsSection projects={[projects[0]!]} />);
  expect(listConversations).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('entry-nav-conversations-toggle'));
  fireEvent.click(await screen.findByRole('button', { name: 'preview.retry' }));
  await screen.findByRole('button', { name: 'Recovered' });
});

it('keeps the selected older conversation visible in the compact list', async () => {
  const model: RailConversationModel = {
    projectId: 'p1', conversations: Array.from({ length: 14 }, (_, i) => chat(`c${i}`, `Chat ${i}`, i + 1)),
    activeConversationId: 'c0', creating: false, onCreate: vi.fn(), onSelect: vi.fn(),
  };
  render(<RailConversationsSection projects={[projects[0]!]} model={model} />);
  expect(screen.getByRole('button', { name: 'Chat 0' }).getAttribute('aria-current')).toBe('page');
  expect(rowButtons()).toHaveLength(12);
  await waitFor(() => expect(screen.queryByText('common.loading')).toBeNull());
});

it('discards a delayed result from a previous workspace', async () => {
  let finish!: (items: Conversation[]) => void;
  listConversations.mockImplementationOnce(() => new Promise<Conversation[]>(resolve => { finish = resolve; }))
    .mockResolvedValue([chat('c2', 'New workspace chat', 2)]);
  const context = { workspaceId: 'ws1', workspaceMemberId: 'member' } as WorkspaceCollabContext;
  const { rerender } = render(<RailConversationsSection projects={[projects[0]!]} context={context} />);
  rerender(<RailConversationsSection projects={[projects[0]!]} context={{ ...context, workspaceId: 'ws2' }} />);
  await screen.findByRole('button', { name: 'New workspace chat' });
  await act(async () => { finish([chat('c1', 'Old workspace chat', 1)]); });
  expect(screen.queryByText('Old workspace chat')).toBeNull();
  expect(listConversations.mock.calls[1]?.[1].workspaceContext.workspaceId).toBe('ws2');
});

it('keeps existing rows mounted while switching the live project and refreshing', async () => {
  const model: RailConversationModel = {
    projectId: 'p1', conversations: [chat('c1', 'Current chat', 1)], activeConversationId: 'c1',
    creating: false, onCreate: vi.fn(), onSelect: vi.fn(),
  };
  listConversations.mockResolvedValueOnce([chat('c2', 'Other chat', 2)]);
  const { rerender } = render(<RailConversationsSection projects={projects} model={model} />);
  const other = await screen.findByRole('button', { name: 'Other chat' });
  const current = screen.getByRole('button', { name: 'Current chat' });
  let finish!: (items: Conversation[]) => void;
  listConversations.mockImplementation(() => new Promise<Conversation[]>(resolve => { finish = resolve; }));
  rerender(<RailConversationsSection projects={projects} model={null} />);
  expect(screen.getByRole('button', { name: 'Current chat' })).toBe(current);
  expect(screen.getByRole('button', { name: 'Other chat' })).toBe(other);
  rerender(<RailConversationsSection projects={projects} model={{ ...model, projectId: 'p2', activeConversationId: 'c2', conversations: [], conversationsLoading: true }} />);
  expect(screen.getByRole('button', { name: 'Current chat' })).toBe(current);
  expect(screen.getByRole('button', { name: 'Other chat' })).toBe(other);
  rerender(<RailConversationsSection projects={projects} model={{ ...model, projectId: 'p2', activeConversationId: 'c2', conversations: [chat('c2', 'Other chat', 2)] }} />);
  expect(screen.getByRole('button', { name: 'Current chat' })).toBe(current);
  expect(screen.getByRole('button', { name: 'Other chat' })).toBe(other);
  expect(screen.queryByText('common.loading')).toBeNull();
  await act(async () => { finish([chat('c1', 'Current chat', 1)]); });
  expect(screen.getByRole('button', { name: 'Current chat' })).toBe(current);
});

it('retains cached rows when a background refresh fails, but removes them on a workspace change', async () => {
  listConversations.mockResolvedValueOnce([chat('c1', 'Saved chat', 1)]);
  const context = { workspaceId: 'ws1', workspaceMemberId: 'member' } as WorkspaceCollabContext;
  const { rerender } = render(<RailConversationsSection projects={[projects[0]!]} context={context} />);
  const saved = await screen.findByRole('button', { name: 'Saved chat' });
  listConversations.mockRejectedValue(new Error('offline'));
  fireEvent.click(screen.getByTestId('entry-nav-conversations-toggle'));
  fireEvent.click(screen.getByTestId('entry-nav-conversations-toggle'));
  await screen.findByRole('button', { name: 'preview.retry' });
  expect(screen.getByRole('button', { name: 'Saved chat' })).toBe(saved);
  rerender(<RailConversationsSection projects={[projects[0]!]} context={{ ...context, workspaceId: 'ws2' }} />);
  expect(screen.queryByRole('button', { name: 'Saved chat' })).toBeNull();
  await screen.findByRole('button', { name: 'preview.retry' });
});

it('renames and deletes a conversation from another project through its ⋮ menu', async () => {
  listConversations.mockImplementation(async (id: string) => id === 'p1' ? [chat('c1', 'Old title', 1)] : []);
  patchConversation.mockResolvedValue(chat('c1', 'New title', 1));
  deleteConversation.mockResolvedValue(true);
  render(<RailConversationsSection projects={projects} />);
  await screen.findByRole('button', { name: 'Old title' });
  fireEvent.click(screen.getByRole('button', { name: 'designs.menuMore' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'designs.menuRename' }));
  const input = screen.getByRole('textbox', { name: 'designs.menuRename' });
  fireEvent.change(input, { target: { value: 'New title' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByRole('button', { name: 'New title' });
  expect(patchConversation).toHaveBeenCalledWith('p1', 'c1', { title: 'New title' }, undefined);
  fireEvent.click(screen.getByRole('button', { name: 'designs.menuMore' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'designs.menuDelete' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'designs.renameSave' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'New title' })).toBeNull());
  expect(deleteConversation).toHaveBeenCalledWith('p1', 'c1', undefined);
});
