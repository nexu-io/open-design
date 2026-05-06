import { cleanup, render, waitFor } from '@testing-library/react';
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let lastChatPaneProps: any | null = null;

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../apps/web/src/i18n', () => ({
  useT: () => ((key: string) => key) as any,
}));

vi.mock('../../apps/web/src/components/ChatPane', async () => {
  const mod = await vi.importActual<any>('../../apps/web/src/components/ChatPane');
  return {
    ...mod,
    ChatPane: (props: any) => {
      lastChatPaneProps = props;
      return null;
    },
  };
});

vi.mock('../../apps/web/src/components/AppChromeHeader', () => ({
  AppChromeHeader: () => null,
}));

vi.mock('../../apps/web/src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../apps/web/src/components/FileWorkspace', () => ({
  FileWorkspace: () => null,
}));

vi.mock('../../apps/web/src/router', () => ({
  navigate: () => {},
}));

vi.mock('../../apps/web/src/utils/notifications', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../apps/web/src/utils/notifications')>();
  return {
    ...actual,
    playSound: () => {},
    showCompletionNotification: async () => {},
  };
});

vi.mock('../../apps/web/src/providers/registry', () => ({
  fetchPreviewComments: async () => [],
  fetchDesignSystem: async () => null,
  fetchLiveArtifacts: async () => [],
  fetchProjectFiles: async () => [],
  fetchSkill: async () => null,
  patchPreviewCommentStatus: async () => true,
  upsertPreviewComment: async () => null,
  deletePreviewComment: async () => true,
  writeProjectTextFile: async () => null,
}));

vi.mock('../../apps/web/src/providers/project-events', () => ({
  useProjectFileEvents: () => ({ events: [] }),
}));

vi.mock('../../apps/web/src/state/projects', () => ({
  listConversations: async () => [{ id: 'conv-1', title: 'Conversation', createdAt: 0 }],
  createConversation: async () => ({ id: 'conv-1', title: 'Conversation', createdAt: 0 }),
  listMessages: async () => [],
  loadTabs: async () => ({ tabs: [], active: null }),
  saveTabs: async () => {},
  saveMessage: async () => {},
  patchConversation: async () => null,
  deleteConversation: async () => true,
  patchProject: async () => null,
  getTemplate: async () => null,
}));

vi.mock('../../apps/web/src/providers/daemon', () => ({
  fetchChatRunStatus: async () => null,
  listActiveChatRuns: async () => [],
  reattachDaemonRun: async () => {},
  streamViaDaemon: async ({ handlers, onRunCreated, onRunStatus }: any) => {
    onRunCreated?.('run-1');
    onRunStatus?.('running');
    handlers.onError(new Error('connection refused'));
  },
}));

async function loadProjectView() {
  const { ProjectView } = await import('../../apps/web/src/components/ProjectView');
  return ProjectView;
}

function baseProject() {
  return {
    id: 'proj-1',
    name: 'Project',
    createdAt: 0,
    updatedAt: 0,
    skillId: null,
    designSystemId: null,
    metadata: {} as any,
  };
}

describe('ProjectView daemon error persistence', () => {
  afterEach(() => cleanup());

  it('stores daemon failure details on the assistant message events', async () => {
    lastChatPaneProps = null;
    const ProjectView = await loadProjectView();

    render(
      <ProjectView
        project={baseProject()}
        routeFileName={null}
        config={
          {
            mode: 'daemon',
            agentId: 'claude',
            skillId: null,
            designSystemId: null,
            disabledSkills: [],
            disabledDesignSystems: [],
          } as any
        }
        agents={[{ id: 'claude', name: 'Claude', detected: true, version: '1.0.0', models: [] }] as any}
        skills={[]}
        designSystems={[]}
        daemonLive
        onModeChange={() => {}}
        onAgentChange={() => {}}
        onAgentModelChange={() => {}}
        onRefreshAgents={() => {}}
        onOpenSettings={() => {}}
        onBack={() => {}}
        onClearPendingPrompt={() => {}}
        onTouchProject={() => {}}
        onProjectChange={() => {}}
        onProjectsRefresh={() => {}}
      />,
    );

    await waitFor(() => {
      expect(lastChatPaneProps).not.toBeNull();
      expect(lastChatPaneProps!.messages).toHaveLength(0);
    });

    await act(async () => {
      await lastChatPaneProps!.onSend('hi', []);
    });

    await waitFor(() => {
      const assistant = (lastChatPaneProps!.messages as any[]).find((m: any) => m.role === 'assistant');
      expect(assistant).toBeTruthy();
      const events = assistant!.events ?? [];
      expect(
        events.some(
          (e: any) => e.kind === 'status' && e.label === 'error' && e.detail === 'connection refused',
        ),
      ).toBe(true);
    });
  });
});
