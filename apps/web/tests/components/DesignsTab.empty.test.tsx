// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignsTab } from '../../src/components/DesignsTab';
import { fetchLiveArtifacts, fetchProjectFiles } from '../../src/providers/registry';

const designsWorkspaceState = vi.hoisted(() => ({
	loading: false,
  context: {
    workspaceId: 'workspace-designs',
    workspaceType: 'team',
    workspaceMemberId: 'member-designs',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    permissions: {},
  },
}));

vi.mock('../../src/providers/registry', () => ({
  deleteLiveArtifact: vi.fn(),
  fetchLiveArtifacts: vi.fn(async () => []),
  fetchProjectFiles: vi.fn(async () => []),
  liveArtifactPreviewUrl: (projectId: string, artifactId: string) =>
    `/api/projects/${projectId}/live-artifacts/${artifactId}/preview`,
  projectFileUrl: (
    projectId: string,
    fileName: string,
    workspaceContext?: { workspaceId: string; workspaceMemberId: string } | null,
  ) => {
    const base = `/api/projects/${projectId}/files/${fileName}`;
    return workspaceContext
      ? `${base}?workspaceId=${workspaceContext.workspaceId}&workspaceMemberId=${workspaceContext.workspaceMemberId}`
      : base;
  },
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    context: designsWorkspaceState.context,
		loading: designsWorkspaceState.loading,
    failure: null,
    refresh: vi.fn(),
  }),
}));

describe('DesignsTab empty state', () => {
  beforeAll(() => {
    if (window.localStorage) return;
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
  });

  beforeEach(() => {
		designsWorkspaceState.loading = false;
    window.localStorage.clear();
    vi.mocked(fetchLiveArtifacts).mockReset().mockResolvedValue([]);
    vi.mocked(fetchProjectFiles).mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a premium empty state when projects list is completely empty', () => {
    const onNewProject = vi.fn();
    render(
      <DesignsTab
        projects={[]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onNewProject={onNewProject}
      />,
    );

    // Verify Title (from 'designs.emptyNoProjects' translation: 'No projects yet.')
    expect(screen.getByText('No projects yet.')).toBeTruthy();


    // Verify CTA Button is present
    const ctaButton = screen.getByRole('button', { name: 'New project' });
    expect(ctaButton).toBeTruthy();

    // Verify clicking the CTA Button invokes the onNewProject callback
    fireEvent.click(ctaButton);
    expect(onNewProject).toHaveBeenCalledTimes(1);
  });

  it('does not render CTA button when onNewProject is not provided', () => {
    render(
      <DesignsTab
        projects={[]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    // Verify Title is present
    expect(screen.getByText('No projects yet.')).toBeTruthy();

    // Verify CTA Button is NOT present
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull();
  });

  it('scopes browser-owned project cover URLs to the exact Workspace identity', () => {
    const { container } = render(
      <DesignsTab
        projects={[
          {
            id: 'project-cover',
            name: 'Cover project',
            skillId: null,
            designSystemId: null,
            createdAt: 1,
            updatedAt: 2,
            status: { value: 'not_started' },
            metadata: { kind: 'image', entryFile: 'cover.png' },
          },
        ]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    const src = container.querySelector('.design-card-thumb img')?.getAttribute('src');
    expect(src).toContain('workspaceId=workspace-designs');
    expect(src).toContain('workspaceMemberId=member-designs');
  });

  it('renders No projects match your search when projects exist but query filters them out', () => {
    render(
      <DesignsTab
        projects={[
          {
            id: 'project-1',
            name: 'Landing refresh',
            skillId: null,
            designSystemId: null,
            createdAt: 1,
            updatedAt: 2,
            status: { value: 'not_started' },
          },
        ]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    // Filter projects using query search so filtered count is 0, but projects.length is 1
    const searchInput = screen.getByPlaceholderText('Search…');
    fireEvent.change(searchInput, { target: { value: 'Non-existent project query' } });

    // Verify 'No projects match your search.' is present
    expect(screen.getByText('No projects match your search.')).toBeTruthy();
    expect(screen.queryByText('No projects yet.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull();
  });

  it('does not scan while hidden and aborts both background scan types when deactivated', async () => {
    let liveSignal: AbortSignal | undefined;
    let filesSignal: AbortSignal | undefined;
    vi.mocked(fetchLiveArtifacts).mockImplementation((_projectId, options) => {
      liveSignal = options?.signal;
      return new Promise((resolve) => {
        options?.signal?.addEventListener('abort', () => resolve([]), { once: true });
      });
    });
    vi.mocked(fetchProjectFiles).mockImplementation((_projectId, options) => {
      filesSignal = options?.signal;
      return new Promise((resolve) => {
        options?.signal?.addEventListener('abort', () => resolve([]), { once: true });
      });
    });
    const project = {
      id: 'project-reopen',
      name: 'Reopen project',
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 2,
      status: { value: 'not_started' as const },
    };
    const props = {
      projects: [project],
      skills: [],
      designSystems: [],
      onOpen: vi.fn(),
      onOpenLiveArtifact: vi.fn(),
      onDelete: vi.fn(),
      onRename: vi.fn(),
    };
    const { rerender } = render(<DesignsTab {...props} isActive={false} />);

    expect(fetchLiveArtifacts).not.toHaveBeenCalled();
    expect(fetchProjectFiles).not.toHaveBeenCalled();

    rerender(<DesignsTab {...props} isActive />);
    await vi.waitFor(() => {
      expect(fetchLiveArtifacts).toHaveBeenCalledTimes(1);
      expect(fetchProjectFiles).toHaveBeenCalledTimes(1);
    });
    expect(fetchProjectFiles).toHaveBeenCalledWith(
      'project-reopen',
      expect.objectContaining({
        workspaceContext: expect.objectContaining({
          workspaceId: 'workspace-designs',
          workspaceMemberId: 'member-designs',
        }),
      }),
    );
    expect(liveSignal).toBeDefined();
    expect(filesSignal).toBeDefined();

    rerender(<DesignsTab {...props} isActive={false} />);

    expect(liveSignal?.aborted).toBe(true);
    expect(filesSignal?.aborted).toBe(true);
  });

	it('waits for the Workspace authority before reading project metadata', async () => {
		designsWorkspaceState.loading = true;
		const project = {
			id: 'project-authority-loading',
			name: 'Authority loading',
			skillId: null,
			designSystemId: null,
			createdAt: 1,
			updatedAt: 2,
			status: { value: 'not_started' as const },
		};
		const props = {
			projects: [project],
			skills: [],
			designSystems: [],
			onOpen: vi.fn(),
			onOpenLiveArtifact: vi.fn(),
			onDelete: vi.fn(),
			onRename: vi.fn(),
		};
		const { rerender } = render(<DesignsTab {...props} />);

		expect(fetchLiveArtifacts).not.toHaveBeenCalled();
		expect(fetchProjectFiles).not.toHaveBeenCalled();

		designsWorkspaceState.loading = false;
		rerender(<DesignsTab {...props} />);
		await vi.waitFor(() => {
			expect(fetchLiveArtifacts).toHaveBeenCalledTimes(1);
			expect(fetchProjectFiles).toHaveBeenCalledTimes(1);
		});
	});

	it('bounds project cover file reads to two concurrent requests', async () => {
		let active = 0;
		let maxActive = 0;
		const releases: Array<() => void> = [];
		vi.mocked(fetchProjectFiles).mockImplementation(
			() =>
				new Promise((resolve) => {
					active += 1;
					maxActive = Math.max(maxActive, active);
					releases.push(() => {
						active -= 1;
						resolve([]);
					});
				}),
		);
		const projects = Array.from({ length: 5 }, (_, index) => ({
			id: `project-concurrency-${index}`,
			name: `Project ${index}`,
			skillId: null,
			designSystemId: null,
			createdAt: 1,
			updatedAt: 2,
			status: { value: 'not_started' as const },
		}));
		render(
			<DesignsTab
				projects={projects}
				skills={[]}
				designSystems={[]}
				onOpen={vi.fn()}
				onOpenLiveArtifact={vi.fn()}
				onDelete={vi.fn()}
				onRename={vi.fn()}
			/>,
		);

		await vi.waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(2));
		expect(maxActive).toBe(2);
		await act(async () => {
			releases.splice(0, 2).forEach((release) => release());
		});
		await vi.waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(4));
		expect(maxActive).toBe(2);
		await act(async () => {
			releases.splice(0, 2).forEach((release) => release());
		});
		await vi.waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(5));
		expect(maxActive).toBe(2);
		await act(async () => {
			releases.splice(0).forEach((release) => release());
		});
	});

	it('reuses a resolved project cover decision across remounts', async () => {
		const project = {
			id: 'project-cached-cover',
			name: 'Cached cover',
			skillId: null,
			designSystemId: null,
			createdAt: 1,
			updatedAt: 2,
			status: { value: 'not_started' as const },
		};
		const props = {
			projects: [project],
			skills: [],
			designSystems: [],
			onOpen: vi.fn(),
			onOpenLiveArtifact: vi.fn(),
			onDelete: vi.fn(),
			onRename: vi.fn(),
		};
		const first = render(<DesignsTab {...props} />);
		await vi.waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(1));
		first.unmount();

		render(<DesignsTab {...props} />);
		await act(async () => {
			await Promise.resolve();
		});
		expect(fetchProjectFiles).toHaveBeenCalledTimes(1);
	});
});
