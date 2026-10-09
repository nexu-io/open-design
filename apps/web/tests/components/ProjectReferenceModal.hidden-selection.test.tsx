// @vitest-environment jsdom

// Regression for a hidden auto-selected project being submittable.
//
// The Reference-another-project dialog auto-configures its first row as the
// selection. Its search box filters `visibleProjects`, but the selection set
// and the Confirm action were derived from the full `projects` collection, so
// a query that hides the selected row left Confirm enabled and pressing it
// submitted a project the user can no longer see. (Issue #7836.)
//
// The contract under test: a project hidden by the active search cannot be
// submitted. The submitted set is the selection intersected with the visible
// list; clear the query and the selection is back.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types';

const listProjects = vi.fn();
const getProjectDetail = vi.fn();

vi.mock('../../src/state/projects', () => ({
  listProjects: (...args: unknown[]) => listProjects(...args),
  getProjectDetail: (...args: unknown[]) => getProjectDetail(...args),
}));

vi.mock('../../src/providers/registry', () => ({
  dirExists: async () => true,
}));

import { ProjectReferenceModal } from '../../src/components/ProjectReferenceModal';

function project(id: string, name: string): Project {
  return {
    id,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: 0,
    updatedAt: 0,
    metadata: { kind: 'prototype', baseDir: `/projects/${id}` },
  };
}

const alpha = project('alpha', 'Alpha Studio');
const beta = project('beta', 'Beta Lab');

async function openDialog(): Promise<HTMLButtonElement> {
  const confirm = await screen.findByRole('button', { name: 'Reference project' });
  await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
  return confirm as HTMLButtonElement;
}

beforeEach(() => {
  listProjects.mockReset();
  getProjectDetail.mockReset();
  listProjects.mockResolvedValue([alpha, beta]);
  getProjectDetail.mockImplementation(async (id: string) => ({
    project: id === alpha.id ? alpha : beta,
    resolvedDir: `/projects/${id}`,
  }));
});

afterEach(cleanup);

describe('ProjectReferenceModal — a hidden selection cannot be confirmed', () => {
  it('disables Confirm when the auto-selected project is filtered out of the list', async () => {
    render(<ProjectReferenceModal onClose={() => {}} onSelect={() => {}} />);
    const confirm = await openDialog();

    // A query matching ONLY the other project hides the selected row.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'beta' } });
    expect(screen.queryByText('Alpha Studio')).toBeNull();

    await waitFor(() => expect(confirm.disabled).toBe(true));
  });

  it('does not submit a hidden project when Confirm is pressed', async () => {
    const onSelect = vi.fn();
    render(<ProjectReferenceModal onClose={() => {}} onSelect={onSelect} />);
    const confirm = await openDialog();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'beta' } });
    fireEvent.click(confirm);

    // Let any stray async submit land before asserting none did.
    await Promise.resolve();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('submits the visible selection, not the hidden one, and restores it when the query clears', async () => {
    const onSelect = vi.fn();
    render(<ProjectReferenceModal onClose={() => {}} onSelect={onSelect} />);
    const confirm = await openDialog();

    // Filter to Beta alone: it is not selected, so Confirm goes disabled.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'beta' } });
    await waitFor(() => expect(confirm.disabled).toBe(true));

    // Select it; Confirm submits Beta rather than the now-hidden Alpha.
    fireEvent.click(screen.getByRole('option', { name: /Beta Lab/ }));
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(
      (onSelect.mock.calls[0]![0] as Array<{ project: Project }>).map((s) => s.project.id),
    ).toEqual(['beta']);

    // Clearing the query brings the hidden auto-selection back into play.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    await waitFor(() => expect(confirm.disabled).toBe(false));
    expect(screen.getByText('Alpha Studio')).toBeTruthy();
  });
});
