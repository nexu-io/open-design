// @vitest-environment jsdom

import { cleanup, render, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRunStatusResponse } from '@open-design/contracts';

import type { PetTaskCenter } from '../../src/components/pet/PetOverlay';
import type { Project } from '../../src/types';

const taskCenterProbe = vi.fn<(center: PetTaskCenter) => void>();
const listProjects = vi.fn<() => Promise<Project[]>>();
const listProjectRuns = vi.fn<() => Promise<ChatRunStatusResponse[]>>();

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: ({ taskCenter }: { taskCenter: PetTaskCenter }) => {
    taskCenterProbe(taskCenter);
    return null;
  },
}));

vi.mock('@open-design/host', () => ({
  setHostPetVisible: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  listProjects: (...args: unknown[]) => listProjects(...(args as [])),
}));

vi.mock('../../src/providers/daemon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/daemon')>();
  return {
    ...actual,
    listProjectRuns: (...args: unknown[]) => listProjectRuns(...(args as [])),
  };
});

import { RUNS_CHANGED_EVENT } from '../../src/providers/daemon';
import { DesktopPetSurface } from '../../src/components/pet/DesktopPetSurface';

const project: Project = {
  id: 'p1',
  name: 'Landing Page',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
};

const runningRun: ChatRunStatusResponse = {
  id: 'run-1',
  projectId: 'p1',
  conversationId: null,
  assistantMessageId: null,
  agentId: null,
  status: 'running',
  createdAt: 1,
  updatedAt: 2,
};

function latestCenter(): PetTaskCenter {
  const calls = taskCenterProbe.mock.calls;
  return calls[calls.length - 1]![0];
}

describe('DesktopPetSurface keep-last-good', () => {
  beforeEach(() => {
    localStorage.setItem(
      'open-design:config',
      JSON.stringify({ pet: { enabled: true, adopted: true, petId: 'mochi' } }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
    taskCenterProbe.mockClear();
    listProjects.mockReset();
    listProjectRuns.mockReset();
  });

  // A transport failure is not an authoritative empty task center: the pet
  // keeps showing the last successfully-read runs instead of blanking.
  it('keeps the last-good task center when a later runs read fails', async () => {
    listProjects.mockResolvedValue([project]);
    listProjectRuns.mockResolvedValue([runningRun]);

    render(<DesktopPetSurface />);

    await waitFor(() => {
      expect(latestCenter().running).toEqual([
        { projectId: 'p1', projectName: 'Landing Page', status: 'running', count: 1 },
      ]);
    });

    listProjectRuns.mockRejectedValue(new Error('daemon unreachable'));
    await act(async () => {
      window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
    });

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        '[pet] run list refresh failed; keeping last-good',
        expect.any(Error),
      );
    });
    expect(latestCenter().running).toEqual([
      { projectId: 'p1', projectName: 'Landing Page', status: 'running', count: 1 },
    ]);
  });

  it('keeps last-good project names when the projects leg fails', async () => {
    listProjects.mockResolvedValue([project]);
    listProjectRuns.mockResolvedValue([runningRun]);

    render(<DesktopPetSurface />);

    await waitFor(() => {
      expect(latestCenter().running[0]?.projectName).toBe('Landing Page');
    });

    listProjects.mockRejectedValue(new Error('projects 500'));
    listProjectRuns.mockResolvedValue([
      { ...runningRun, id: 'run-2', status: 'queued' },
    ]);
    await act(async () => {
      window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
    });

    // Fresh runs adopt the failed leg's last-good project names — the
    // project list is not reset to [] (which would drop the row entirely
    // because the run's projectId no longer resolves to a name).
    await waitFor(() => {
      expect(latestCenter().queued).toEqual([
        { projectId: 'p1', projectName: 'Landing Page', status: 'queued', count: 1 },
      ]);
    });
  });
});
