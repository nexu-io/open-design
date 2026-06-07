// @vitest-environment jsdom
//
// Regression for #3274. The automation project picker rendered long project
// names verbatim with no truncate styling, so a single long name blew up
// each row's height and made the dropdown messy to scan. The fix adds the
// single-line truncate-with-ellipsis CSS triad to `.automation-popover__label`
// and threads each project's full name through to the row's `title`
// attribute so the native hover tooltip still surfaces it. The CSS half
// is verified by code review (jsdom does not apply stylesheets); this
// test locks in the DOM contract — every existing-project row must carry
// `title=<full name>` so the tooltip exists even when the visible label
// is clipped.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Routine } from '@open-design/contracts';

import { NewAutomationModal } from '../../src/components/NewAutomationModal';
import { I18nProvider } from '../../src/i18n';
import { listPlugins } from '../../src/state/projects';
import { fetchMcpServers } from '../../src/state/mcp';

vi.mock('../../src/state/projects', () => ({
  listPlugins: vi.fn(),
}));

vi.mock('../../src/state/mcp', () => ({
  fetchMcpServers: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(listPlugins).mockResolvedValue([]);
  vi.mocked(fetchMcpServers).mockResolvedValue({ servers: [], templates: [] });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('NewAutomationModal project picker', () => {
  it('exposes each project\'s full name as the row title so truncated labels still surface via tooltip (#3274)', () => {
    const longName = 'A very long project name that would otherwise wrap onto several lines inside the automation picker';
    render(
      <NewAutomationModal
        open
        templates={[]}
        projects={[
          { id: 'p-1', name: longName },
          { id: 'p-2', name: 'Short' },
        ]}
        skills={[]}
        connectors={[]}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );

    // Open the project popover. It is the only PillButton on the row that
    // toggles `popover === 'project'`; the visible label is the current
    // selection ("New project each run" by default) but the button still
    // shows the project icon, which we use as a stable accessible cue.
    const projectButton =
      screen.getByRole('button', { name: /New project each run/i });
    fireEvent.click(projectButton);

    // Both project rows render, each with `title=<full name>` on the
    // button so the native tooltip preserves the full project name even
    // when the visible label is clipped by the ellipsis CSS.
    const longRow = screen.getByRole('button', { name: longName });
    expect(longRow.getAttribute('title')).toBe(longName);
    const shortRow = screen.getByRole('button', { name: 'Short' });
    expect(shortRow.getAttribute('title')).toBe('Short');

    // PopoverItems with fixed in-product copy ("New project each run")
    // intentionally do NOT carry a tooltip; the truncate optimisation
    // is project-name-specific.
    const fixedRows = screen.getAllByRole('button', {
      name: /New project each run/i,
    });
    // The first match is the PillButton trigger we just clicked; the
    // second is the PopoverItem inside the open popover.
    expect(fixedRows.length).toBeGreaterThanOrEqual(2);
    const popoverFixedRow = fixedRows.at(-1);
    expect(popoverFixedRow?.getAttribute('title')).toBeNull();
  });

  it('localizes the project picker and schedule summary in Simplified Chinese', () => {
    const routine: Routine = {
      id: 'routine-1',
      name: 'Review weekly',
      prompt: 'Run scheduled work.',
      schedule: {
        kind: 'weekly',
        weekday: 2,
        time: '13:30',
        timezone: 'Asia/Shanghai',
      },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      enabled: true,
      nextRunAt: null,
      lastRun: null,
      createdAt: 1000,
      updatedAt: 1000,
    };

    render(
      <I18nProvider initial="zh-CN">
        <NewAutomationModal
          open
          initial={{ routine }}
          templates={[]}
          projects={[{ id: 'p-1', name: '增长项目' }]}
          skills={[]}
          connectors={[]}
          onClose={() => undefined}
          onSaved={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '每次运行新建项目' }));
    expect(screen.getByText('每次运行都会启动一个全新的项目和对话。')).toBeTruthy();
    expect(screen.getByText('已有项目')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '星期二 13:30 · 上海' }));
    expect(screen.getByRole('tab', { name: '每周' })).toBeTruthy();
    expect(screen.getByText('时间')).toBeTruthy();
    expect(screen.getByText('时区')).toBeTruthy();
    expect(screen.getByRole('option', { name: '上海' })).toBeTruthy();
  });
});
