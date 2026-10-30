// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@open-design/host', () => ({
  isOpenDesignHostAvailable: () => true,
  pickAndImportHostProject: vi.fn(),
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    context: {
      lifecycleState: 'active',
      memberStatus: 'active',
      permissions: {
        canManageMembers: true,
        canManageSharedResources: true,
        canManageWorkspace: true,
        canShareProjects: true,
        canViewWorkspaceSettings: true,
        canWriteSyncedFiles: true,
      },
      role: 'owner',
      seat: {
        isSeatFull: false,
        occupiedSeats: 1,
        totalSeats: 5,
      },
      workspaceId: 'workspace-modal',
      workspaceMemberId: 'member-modal',
      workspaceName: 'Modal Workspace',
      workspaceType: 'team',
    },
    failure: null,
    loading: false,
  }),
}));

import { pickAndImportHostProject } from '@open-design/host';
import { NewProjectModal } from '../../src/components/NewProjectModal';
import { I18nProvider } from '../../src/i18n';
import type {
  DesignSystemSummary,
  SkillSummary,
} from '../../src/types';

const skills: SkillSummary[] = [
  {
    id: 'prototype-skill',
    name: 'Prototype',
    description: 'Build prototypes',
    mode: 'prototype',
    surface: 'web',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: ['prototype'],
    triggers: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Build a prototype.',
    aggregatesExamples: false,
  },
];

const designSystems: DesignSystemSummary[] = [
  {
    id: 'clay',
    title: 'Clay',
    summary: 'Friendly tactile product UI.',
    category: 'Product',
    swatches: ['#f4efe7', '#25211d'],
  },
];

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollIntoView = Element.prototype.scrollIntoView;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(pickAndImportHostProject).mockReset();
});

describe('NewProjectModal layout', () => {
  it('only shows the name and project actions, with initial focus on the name', () => {
    render(
      <NewProjectModal
        open
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId={null}
        templates={[]}
        promptTemplates={[]}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveFocus();
    const createButton = screen.getByTestId('create-project');
    expect(createButton).toBeDisabled();
    expect(createButton.parentElement?.contains(screen.getByRole('textbox'))).toBe(true);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByTestId('new-project-panel')).toBeNull();
    expect(screen.queryByText('Design system')).toBeNull();

  });

  it('keeps the modal open with a waiting state until project creation finishes', async () => {
    let resolveCreate!: (value: boolean) => void;
    const onCreate = vi.fn(
      () => new Promise<boolean>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const onClose = vi.fn();

    render(
      <NewProjectModal
        open
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId={null}
        templates={[]}
        promptTemplates={[]}
        onCreate={onCreate}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New project' } });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Loading…');
    expect((screen.getByTestId('create-project') as HTMLButtonElement).disabled).toBe(true);

    resolveCreate(true);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('forwards the desktop folder import response handler to the inner panel', async () => {
    const importResult = {
      conversationId: 'conversation-host',
      entryFile: 'src/App.tsx',
      ok: true,
      projectId: 'project-host',
    } as const;
    let resolveImport!: (value: typeof importResult) => void;
    vi.mocked(pickAndImportHostProject).mockImplementation(
      () => new Promise<typeof importResult>((resolve) => {
        resolveImport = resolve;
      }),
    );
    const onImportFolderResponse = vi.fn();

    render(
      <NewProjectModal
        open
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId={null}
        templates={[]}
        promptTemplates={[]}
        onCreate={() => {}}
        onImportFolderResponse={onImportFolderResponse}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open a file' }));

    await waitFor(() => {
      expect(pickAndImportHostProject).toHaveBeenCalledWith({
        skillId: null,
        workspaceContext: expect.objectContaining({
          workspaceId: 'workspace-modal',
          workspaceMemberId: 'member-modal',
        }),
      });
    });
    expect(screen.getByRole('button', { name: 'Opening…' })).toBeTruthy();

    resolveImport(importResult);

    await waitFor(() => {
      expect(onImportFolderResponse).toHaveBeenCalledWith(importResult);
    });
  });

  it('localizes the modal title and folder action in zh-CN', () => {
    render(
      <I18nProvider initial="zh-CN">
        <NewProjectModal
          open
          skills={skills}
          designSystems={designSystems}
          defaultDesignSystemId={null}
          templates={[]}
          promptTemplates={[]}
          onCreate={() => {}}
          onImportFolderResponse={() => {}}
          onClose={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole('dialog', { name: '新建项目' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '新建项目' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开文件' })).toBeTruthy();
    expect(screen.queryByText('New project')).toBeNull();
    expect(screen.queryByText('Open folder')).toBeNull();
  });
});

describe('NewProjectModal creation', () => {
  it('requires a name and rejects text beyond 24 characters with a warning', () => {
    const onCreate = vi.fn();
    render(<NewProjectModal open skills={skills} designSystems={[]} defaultDesignSystemId={null}
      templates={[]} promptTemplates={[]} onCreate={onCreate} onClose={() => {}} />);
    const input = screen.getByRole('textbox', { name: 'Project name' });
    const createButton = screen.getByTestId('create-project');

    fireEvent.change(input, { target: { value: '   ' } });
    expect(createButton).toBeDisabled();
    fireEvent.submit(createButton.closest('form')!);
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '字'.repeat(25) } });
    expect(input).toHaveValue('字'.repeat(24));
    expect(screen.getByRole('alert').textContent).toContain('24 characters');
    expect(createButton).toBeEnabled();

    fireEvent.change(input, { target: { value: '字'.repeat(23) } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('creates a named blank project without hidden type or design selections', async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<NewProjectModal open skills={skills} designSystems={designSystems}
      defaultDesignSystemId="clay" initialTab="deck" templates={[]} promptTemplates={[]}
      onCreate={onCreate} onClose={onClose} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Brand folder  ' } });
    fireEvent.submit(screen.getByTestId('create-project').closest('form')!);
    expect(onCreate).toHaveBeenCalledWith({
      name: 'Brand folder', skillId: null, designSystemId: null,
      metadata: { kind: 'other', nameSource: 'user' },
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('keeps the entered name available when creation fails', async () => {
    const onClose = vi.fn();
    render(<NewProjectModal open skills={skills} designSystems={[]} defaultDesignSystemId={null}
      templates={[]} promptTemplates={[]} onCreate={() => false} onClose={onClose} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByTestId('create-project'));
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox')).toHaveValue('Draft');
    expect(screen.getByTestId('create-project')).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
