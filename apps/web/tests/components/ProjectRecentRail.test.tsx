// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectRecentRail } from '../../src/components/ProjectRecentRail';
import { ENTRY_RAIL_TOGGLE_EVENT, RAIL_OPEN_STORAGE_KEY, takeNewProjectRequest } from '../../src/components/entryRailBridge';
vi.mock('../../src/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('../../src/components/EntryNavRail', () => ({ RailRecentSection: ({ onOpen, section, afterList }: { onOpen: (id: string) => void; section?: string; afterList?: React.ReactNode }) => <><button onClick={() => onOpen('recent-project')}>{section === 'personal' ? 'All projects' : 'Recent project'}</button>{afterList}</> }));
beforeEach(() => { localStorage.clear(); takeNewProjectRequest(); });
afterEach(cleanup);
it('preserves the expanded recent column and opens projects from it', () => {
  localStorage.setItem(RAIL_OPEN_STORAGE_KEY, 'true');
  localStorage.setItem('od.entry.railWidth', '280');
  const onOpen = vi.fn();
  render(<ProjectRecentRail projects={[]} context={null} onOpen={onOpen} onRename={vi.fn()} onDelete={vi.fn()} />);
  expect(screen.getByRole('complementary').style.width).toBe('280px');
  expect(screen.getByText('All projects')).toBeTruthy();
  fireEvent.click(screen.getByText('All projects'));
  expect(onOpen).toHaveBeenCalledWith('recent-project');
  act(() => window.dispatchEvent(new Event(ENTRY_RAIL_TOGGLE_EVENT)));
  expect(screen.queryByText('All projects')).toBeNull();
  expect(screen.getByRole('button', { name: 'entry.navExpand' })).toBeTruthy();
  expect(localStorage.getItem(RAIL_OPEN_STORAGE_KEY)).toBe('false');
});

function pointer(target: HTMLElement, type: string, clientX: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(target, event);
}

it('collapses when dragged past the minimum and restores the pre-drag width', () => {
  localStorage.setItem(RAIL_OPEN_STORAGE_KEY, 'true');
  localStorage.setItem('od.entry.railWidth', '280');
  render(<ProjectRecentRail projects={[]} context={null} onOpen={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);
  const separator = screen.getByRole('separator');
  separator.setPointerCapture = vi.fn();
  separator.hasPointerCapture = () => true;
  separator.releasePointerCapture = vi.fn();
  pointer(separator, 'pointerdown', 332);
  pointer(separator, 'pointermove', 252);
  expect(screen.getByRole('complementary').style.width).toBe('200px');
  pointer(separator, 'pointermove', 200);
  expect(screen.getByRole('complementary').style.width).toBe('0px');
  expect(screen.queryByRole('separator')).toBeNull();
  expect(screen.queryByText('All projects')).toBeNull();
  expect(localStorage.getItem(RAIL_OPEN_STORAGE_KEY)).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'entry.navExpand' }));
  expect(screen.getByRole('complementary').style.width).toBe('280px');
  expect(localStorage.getItem('od.entry.railWidth')).toBe('280');
});

it('keeps normal resizing available and persists its width', () => {
  localStorage.setItem(RAIL_OPEN_STORAGE_KEY, 'true');
  localStorage.setItem('od.entry.railWidth', '280');
  render(<ProjectRecentRail projects={[]} context={null} onOpen={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);
  const separator = screen.getByRole('separator');
  separator.setPointerCapture = vi.fn();
  separator.hasPointerCapture = () => true;
  separator.releasePointerCapture = vi.fn();
  pointer(separator, 'pointerdown', 332);
  pointer(separator, 'pointermove', 372);
  pointer(separator, 'pointerup', 372);
  expect(screen.getByRole('complementary').style.width).toBe('320px');
  expect(localStorage.getItem('od.entry.railWidth')).toBe('320');
});

it('keeps the controls host outside the scrolling project list and restores it after reopening', () => {
  localStorage.setItem(RAIL_OPEN_STORAGE_KEY, 'true');
  const controlsHostRef = vi.fn();
  render(<ProjectRecentRail controlsHostRef={controlsHostRef} projects={[]} context={null} onOpen={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);
  const footer = screen.getByTestId('project-rail-footer');
  expect(footer.closest('.entry-nav-rail__group')).toBeNull();
  expect(footer.parentElement?.className).toBe('entry-nav-rail__panel');
  expect(controlsHostRef).toHaveBeenLastCalledWith(footer);
  act(() => window.dispatchEvent(new Event(ENTRY_RAIL_TOGGLE_EVENT)));
  expect(controlsHostRef).toHaveBeenLastCalledWith(null);
  act(() => window.dispatchEvent(new Event(ENTRY_RAIL_TOGGLE_EVENT)));
  expect(controlsHostRef).toHaveBeenLastCalledWith(screen.getByTestId('project-rail-footer'));
});


it('returns to the home composer even while the current conversation is loading', () => {
  localStorage.setItem(RAIL_OPEN_STORAGE_KEY, 'true');
  const onNewConversation = vi.fn();
  render(<ProjectRecentRail projects={[]} context={null} onOpen={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} onNewConversation={onNewConversation} />);
  fireEvent.click(screen.getByRole('button', { name: 'entry.newConversation' }));
  expect(onNewConversation).toHaveBeenCalledTimes(1);
});

it('places New project after New conversation and hands off to the creation dialog', () => {
  localStorage.setItem(RAIL_OPEN_STORAGE_KEY, 'true');
  window.history.replaceState(null, '', '/projects/p1/conversations/c1/files/index.html');
  const onNewConversation = vi.fn();
  render(<ProjectRecentRail projects={[]} context={null} onOpen={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} onNewConversation={onNewConversation} />);
  const newConversation = screen.getByRole('button', { name: 'entry.newConversation' });
  const newProject = screen.getByRole('button', { name: 'entry.navNewProject' });
  expect(newConversation.nextElementSibling).toBe(newProject);
  fireEvent.click(newProject);
  expect(window.location.pathname).toBe('/');
  expect(takeNewProjectRequest()).toBe(true);
  expect(takeNewProjectRequest()).toBe(false);
  expect(onNewConversation).not.toHaveBeenCalled();
});

it('navigates home instead of creating another conversation in the current project', () => {
  localStorage.setItem(RAIL_OPEN_STORAGE_KEY, 'true');
  window.history.replaceState(null, '', '/projects/p1/conversations/c1/files/index.html');
  const onCreate = vi.fn();
  render(<ProjectRecentRail projects={[]} context={null} onOpen={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()}
    conversationModel={{ projectId: 'p1', conversations: [], activeConversationId: 'c1', creating: true, onCreate, onSelect: vi.fn() }} />);
  fireEvent.click(screen.getByRole('button', { name: 'entry.newConversation' }));
  expect(window.location.pathname).toBe('/');
  expect(onCreate).not.toHaveBeenCalled();
});
