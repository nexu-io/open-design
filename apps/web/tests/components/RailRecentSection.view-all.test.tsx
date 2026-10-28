// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types';
import { I18nProvider } from '../../src/i18n';
import { RailRecentSection } from '../../src/components/EntryNavRail';
import type { RailConversationModel } from '../../src/components/entry-nav-rail/RailConversationTree';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  localStorage.removeItem('od.entry.railPersonalOpen');
});

it('keeps Projects collapsed when opening or switching conversations', () => {
  localStorage.setItem('od.entry.railPersonalOpen', 'false');
  const model: RailConversationModel = {
    projectId: 'p1', conversations: [], activeConversationId: 'c1',
    creating: false, onCreate: vi.fn(), onSelect: vi.fn(),
  };
  const view = (current: RailConversationModel) => <I18nProvider initial="en">
    <RailRecentSection section="personal" projects={[]} label="Projects" conversationModel={current} />
  </I18nProvider>;
  const { rerender, unmount } = render(view(model));
  const heading = () => screen.getByRole('button', { name: 'Projects' });
  expect(heading().getAttribute('aria-expanded')).toBe('false');
  rerender(view({ ...model, projectId: 'p2', activeConversationId: 'c2' }));
  expect(heading().getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(heading());
  rerender(view({ ...model, activeConversationId: 'c3' }));
  expect(heading().getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(heading());
  unmount();
  render(view({ ...model, activeConversationId: 'c4' }));
  expect(heading().getAttribute('aria-expanded')).toBe('false');
});

it('brings newly revealed projects into view when View all expands the scrollable list', () => {
  localStorage.setItem('od.entry.railPersonalOpen', 'true');
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  const projects = Array.from({ length: 13 }, (_, index) => ({
    id: `project-${index}`,
    name: `Project ${index}`,
    createdAt: 13 - index,
    updatedAt: 13 - index,
  })) as Project[];

  render(<I18nProvider initial="en">
    <RailRecentSection section="personal" scrollable projects={projects} label="All projects" />
  </I18nProvider>);

  const lastRow = screen.getByText('Project 12').closest('li');
  expect(lastRow?.hidden).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'View all' }));
  expect(lastRow?.hidden).toBe(false);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  expect(scrollIntoView.mock.instances).toContain(lastRow);
});
