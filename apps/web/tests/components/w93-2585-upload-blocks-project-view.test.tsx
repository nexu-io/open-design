// @vitest-environment jsdom
/**
 * W93 验证用红测 —— OPEND-2585 **没修的那一半**
 * 「批量上传文件进入项目后缺少加载反馈」
 *
 * 已修的那一半在 `w93-2585-pending-surface-attachments.test.tsx`:准备中那一屏
 * 当场把附件画出来了。这一条钉的是**等待本身**。
 *
 * 真机上量到的是十九秒:准备中那一屏一直挂到最后一个文件传完才让位。原因是
 * 项目页首帧要同步读服务端路径(`sessionStorage['od:auto-send-attachments:*']`),
 * 那份东西只有等全部上传结束才写得出来,于是 App 把交接闸门压在上传之后 ——
 * 上传多久,人就对着一屏不能动的画面看多久。
 *
 * 判据只有一条:**首帧不等上传**。所以这里的上传 promise 一个都不 resolve。
 * jsdom 里 promise 快得看不出阻塞,只有「永远不回来的上传」才照得出这件事。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { App } from '../../src/App';
import type { AppConfig, Project } from '../../src/types';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
  loadConfig,
  mergeDaemonConfig,
  saveConfig,
  syncComposioConfigToDaemon,
  syncConfigToDaemon,
} from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
  replaceProjectWorkingDir,
  uploadProjectFiles,
} from '../../src/providers/registry';
import {
  createProject,
  getProject,
  listProjects,
  listTemplates,
  patchProject,
} from '../../src/state/projects';
import {
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { resetProjectDisplaySnapshots } from '../../src/state/project-display-cache';

/** 视频里那一批的规模:六个文件一起挑,一起传。 */
const STAGED_FILE_COUNT = 6;

vi.mock('../../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn(() => ({ connected: false })),
}));

vi.mock('../../src/components/IframeKeepAlivePool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/components/IframeKeepAlivePool')>()),
  useIframeKeepAlivePool: () => ({
    attach: vi.fn(),
    release: vi.fn(),
    evict: vi.fn(),
    evictProject: vi.fn(),
    evictMatching: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    revision: vi.fn(() => 0),
  }),
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    onCreateProject,
  }: {
    onCreateProject: (input: unknown) => boolean | Promise<boolean>;
  }) => (
    <main>
      <div data-testid="entry-home-surface" />
      <button
        type="button"
        onClick={() => {
          void Promise.resolve(
            onCreateProject({
              name: 'Batch upload project',
              skillId: null,
              designSystemId: null,
              pendingPrompt: '我上传了多少个文件',
              autoSendFirstMessage: true,
              metadata: { kind: 'prototype' },
              pendingFiles: Array.from(
                { length: STAGED_FILE_COUNT },
                (_unused, index) =>
                  new File([`shot-${index}`], `shot-${index}.png`, { type: 'image/png' }),
              ),
            }),
          ).catch(() => {});
        }}
      >
        Send from home with attachments
      </button>
    </main>
  ),
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: ({ project }: { project: Project }) => (
    <main data-testid="project-view">
      <span data-testid="project-title">{project.name}</span>
    </main>
  ),
}));

vi.mock('../../src/components/WorkspaceTabsBar', () => ({
  WorkspaceTabsBar: () => null,
  openWorkspaceTab: () => {},
  removeWorkspaceProjectTabs: () => {},
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: () => null,
  switchApiProtocolConfig: (config: AppConfig) => config,
  updateCurrentApiProtocolConfig: (config: AppConfig) => config,
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    daemonIsLive: vi.fn(),
    fetchAgentsStream: vi.fn(),
    fetchAppVersionInfo: vi.fn(),
    fetchDesignSystems: vi.fn(),
    fetchDesignTemplates: vi.fn(),
    fetchPromptTemplates: vi.fn(),
    fetchSkills: vi.fn(),
    replaceProjectWorkingDir: vi.fn(),
    uploadProjectFiles: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    createProject: vi.fn(),
    getProject: vi.fn(),
    listProjects: vi.fn(),
    listTemplates: vi.fn(),
    patchProject: vi.fn(),
  };
});

vi.mock('../../src/state/config', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/config')>(
    '../../src/state/config',
  );
  return {
    ...actual,
    fetchDaemonConfig: vi.fn().mockResolvedValue({}),
    fetchComposioConfigFromDaemon: vi.fn().mockResolvedValue(null),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
  };
});

const mockedDaemonIsLive = vi.mocked(daemonIsLive);
const mockedFetchAgentsStream = vi.mocked(fetchAgentsStream);
const mockedFetchAppVersionInfo = vi.mocked(fetchAppVersionInfo);
const mockedFetchDesignSystems = vi.mocked(fetchDesignSystems);
const mockedFetchDesignTemplates = vi.mocked(fetchDesignTemplates);
const mockedFetchPromptTemplates = vi.mocked(fetchPromptTemplates);
const mockedFetchSkills = vi.mocked(fetchSkills);
const mockedUploadProjectFiles = vi.mocked(uploadProjectFiles);
const mockedReplaceProjectWorkingDir = vi.mocked(replaceProjectWorkingDir);
const mockedCreateProject = vi.mocked(createProject);
const mockedGetProject = vi.mocked(getProject);
const mockedListProjects = vi.mocked(listProjects);
const mockedListTemplates = vi.mocked(listTemplates);
const mockedPatchProject = vi.mocked(patchProject);
const mockedFetchDaemonConfig = vi.mocked(fetchDaemonConfig);
const mockedFetchComposioConfigFromDaemon = vi.mocked(fetchComposioConfigFromDaemon);
const mockedLoadConfig = vi.mocked(loadConfig);
const mockedMergeDaemonConfig = vi.mocked(mergeDaemonConfig);
const mockedSaveConfig = vi.mocked(saveConfig);
const mockedSyncComposioConfigToDaemon = vi.mocked(syncComposioConfigToDaemon);
const mockedSyncConfigToDaemon = vi.mocked(syncConfigToDaemon);

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  privacyDecisionAt: 1778244000000,
  mediaProviders: {},
  composio: {},
  agentModels: {},
  agentCliEnv: {},
};

const freshProject: Project = {
  id: 'project-batch-upload',
  name: 'Batch upload project',
  skillId: null,
  designSystemId: null,
  createdAt: 1778244000000,
  updatedAt: 1778244000000,
  metadata: { kind: 'prototype' },
};

/**
 * 上传永远不回来。真机上那十九秒就是这段时间,只不过真机上它最终会结束 ——
 * 结不结束不该改变「首帧在不在」这件事。
 */
function heldUploads() {
  const releases: Array<() => void> = [];
  mockedUploadProjectFiles.mockImplementation(
    (_projectId, files) =>
      new Promise((resolve) => {
        releases.push(() =>
          resolve({
            uploaded: (files as File[]).map((file) => ({
              path: `attachments/${file.name}`,
              name: file.name,
              kind: 'image' as const,
              size: file.size,
            })),
            failed: [],
          }),
        );
      }),
  );
  return {
    releases,
    async releaseAll() {
      // 并发是 4,所以要放两轮才排空六个。
      for (let round = 0; round < STAGED_FILE_COUNT; round += 1) {
        const batch = releases.splice(0);
        if (batch.length === 0) break;
        await act(async () => {
          for (const release of batch) release();
          await Promise.resolve();
        });
      }
    },
  };
}

/** 项目 id 是客户端自己发的(乐观创建),所以只能从请求里取回来。 */
let createdProjectId: string | null = null;

function autoSendAttachmentsKey(): string {
  return `od:auto-send-attachments:${createdProjectId ?? 'unknown'}`;
}

async function sendFromHomeWithAttachments() {
  render(<App />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Send from home with attachments' }),
  );
  await waitFor(() => expect(createdProjectId).toBeTruthy());
}

describe('OPEND-2585 · 首帧不等上传', () => {
  beforeEach(() => {
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    resetProjectDisplaySnapshots();
    window.history.replaceState(null, '', '/');
    window.sessionStorage.clear();
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgentsStream.mockResolvedValue([]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignTemplates.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedListTemplates.mockResolvedValue([]);
    mockedListProjects.mockResolvedValue([]);
    mockedFetchDaemonConfig.mockResolvedValue({});
    mockedFetchComposioConfigFromDaemon.mockResolvedValue(null);
    mockedMergeDaemonConfig.mockImplementation((local) => local);
    mockedLoadConfig.mockReturnValue({ ...baseConfig });
    mockedGetProject.mockResolvedValue(null);
    mockedPatchProject.mockResolvedValue(freshProject);
    mockedReplaceProjectWorkingDir.mockResolvedValue(undefined as never);
    mockedUploadProjectFiles.mockResolvedValue({ uploaded: [], failed: [] });
    createdProjectId = null;
    mockedCreateProject.mockImplementation(async (input) => {
      createdProjectId = (input as typeof input & { id?: string }).id ?? freshProject.id;
      return {
        project: { ...freshProject, id: createdProjectId },
        conversationId: 'conv-batch-upload',
      };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    resetProjectDisplaySnapshots();
    resetCoalescedGet();
  });

  it('先证量法看得见:上传确实在飞,握手也确实还没完成', async () => {
    const uploads = heldUploads();
    await sendFromHomeWithAttachments();

    // 上传真的开始了 —— 夹具里确实有「在传的文件」,不是一批空附件。
    await waitFor(() => {
      expect(mockedUploadProjectFiles).toHaveBeenCalledTimes(4);
    });
    // 而且服务端路径这会儿一份都拿不到:这正是首帧原来在等的东西。
    expect(window.sessionStorage.getItem(autoSendAttachmentsKey())).toBeNull();
    expect(uploads.releases).toHaveLength(4);
  });

  it('上传一个都没回来,项目页也已经在屏幕上了', async () => {
    heldUploads();
    await sendFromHomeWithAttachments();

    await waitFor(() => {
      expect(mockedUploadProjectFiles).toHaveBeenCalled();
    });

    // 十九秒那一屏的判据:项目在,准备中那一屏已经让位,而上传一个都还没回来。
    await screen.findByTestId('project-view');
    expect(screen.queryByTestId('project-creation-pending-view')).toBeNull();
    expect(window.sessionStorage.getItem(autoSendAttachmentsKey())).toBeNull();
  });

  it('上传落地之后,首条消息带的还是服务端路径', async () => {
    const uploads = heldUploads();
    await sendFromHomeWithAttachments();

    await screen.findByTestId('project-view');
    await uploads.releaseAll();

    await waitFor(() => {
      expect(mockedUploadProjectFiles).toHaveBeenCalledTimes(STAGED_FILE_COUNT);
    });
    await waitFor(() => {
      const raw = window.sessionStorage.getItem(autoSendAttachmentsKey());
      expect(raw).toBeTruthy();
      const staged = JSON.parse(raw ?? '[]') as Array<{ path: string }>;
      // 六张卡全部换成了服务端路径,顺序仍是用户挑文件的顺序。
      expect(staged.map((item) => item.path)).toEqual(
        Array.from({ length: STAGED_FILE_COUNT }, (_u, index) => `attachments/shot-${index}.png`),
      );
    });
  });
});
