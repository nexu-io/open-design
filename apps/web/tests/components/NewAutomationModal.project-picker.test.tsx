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
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewAutomationModal } from '../../src/components/NewAutomationModal';
import { listPlugins } from '../../src/state/projects';
import { fetchMcpServers } from '../../src/state/mcp';

vi.mock('../../src/state/projects', () => ({
  listPlugins: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/state/mcp', () => ({
  fetchMcpServers: vi.fn().mockResolvedValue({ servers: [], templates: [] }),
}));

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
});
