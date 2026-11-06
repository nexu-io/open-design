// Comment relay eligibility across workspace type × project visibility.
// Shared projects relay in both personal and team workspaces. Private projects
// without an active public-file publication remain local in either workspace.
// The fixture uses the production context/scope helpers, real SQLite, routes,
// and durable outbox; only the external cloud client and fresh directory are mocked.
// Public-file publication coverage lives in opend-3855-comment-relay-scope.test.ts.

import http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  CollabCloudComment,
  WorkspaceCollabContext,
} from '@open-design/contracts';

import {
  closeDatabase,
  deletePreviewComment,
  ensureProjectCommentAnchorConversation,
  ensureWorkspaceProject,
  getConversation,
  getPreviewComment,
  getProjectCommentAnchorConversationId,
  getProjectPreviewComment,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertConversation,
  insertProject,
  listPreviewComments,
  listProjectPreviewComments,
  mergeSyncedPreviewComment,
  openDatabase,
  reorderPreviewComment,
  updatePreviewCommentAnchor,
  updatePreviewCommentStatus,
  updateProject,
  updateWorkspaceProject,
  upsertPreviewComment,
} from '../src/db.js';
import {
  enforceWorkspaceResourceMutation,
  resolveOptionalLocalWorkspaceRequestAuthority,
} from '../src/collab/workspace-resource-mutation.js';
import { createCollabCloudService } from '../src/collab/collab-cloud-service.js';
import { resolveLocalProjectCommentWorkspaceContext } from '../src/collab/project-comment-workspace-context.js';
import { commentRelayScope, personalCommentRelayFilePaths } from '../src/collab/comment-relay-scope.js';
import { createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import {
  commentRelayLocalBindingMatches,
  createCommentRelayOutboxStore,
} from '../src/collab/comment-relay-outbox.js';
import { registerProjectCommentRoutes } from '../src/routes/project/comments.js';
import type { CollabCloudClient } from '../src/integrations/collab-cloud.js';

// ---------------------------------------------------------------------------
// 矩阵的两个维度,以及它们今天在 daemon 里的物理表示
// ---------------------------------------------------------------------------
//
// 「项目类型」 = 这个项目绑定到哪个工作区(`workspace_projects.workspace_id`)。
//   个人项目 → 用户自己的个人工作区;团队项目 → 一个团队工作区。
//   请求头 `x-od-workspace-type` 如实声明这一点。
//
// 「分享状态」在本矩阵中仅指项目 visibility，不是公开链接发布状态。
// 四格都没有公开文件 publication，避免把公开文件通道混入团队项目通道。

const WORKSPACE_PERSONAL = 'ws-personal-alice';
const WORKSPACE_TEAM = 'ws-team-acme';
const ME = 'member-me';

interface Cell {
  /** `it()` 标题里用的那一格的名字。 */
  label: string;
  projectId: string;
  /** 可路由的普通会话(评论 HTTP 路由用)。 */
  conversationId: string;
  workspaceId: string;
  visibility: 'personal' | 'team';
  /** 调用方如实声明的工作区类型。 */
  headerWorkspaceType: 'personal' | 'team';
}

const PERSONAL_UNSHARED: Cell = {
  label: '个人项目 · 未分享',
  projectId: 'p-personal-unshared',
  conversationId: 'conv-personal-unshared',
  workspaceId: WORKSPACE_PERSONAL,
  visibility: 'personal',
  headerWorkspaceType: 'personal',
};
const PERSONAL_SHARED: Cell = {
  label: '个人项目 · 分享中',
  projectId: 'p-personal-shared',
  conversationId: 'conv-personal-shared',
  workspaceId: WORKSPACE_PERSONAL,
  visibility: 'team',
  headerWorkspaceType: 'personal',
};
const TEAM_UNSHARED: Cell = {
  label: '团队项目 · 未分享',
  projectId: 'p-team-unshared',
  conversationId: 'conv-team-unshared',
  workspaceId: WORKSPACE_TEAM,
  visibility: 'personal',
  headerWorkspaceType: 'team',
};
const TEAM_SHARED: Cell = {
  label: '团队项目 · 分享中',
  projectId: 'p-team-shared',
  conversationId: 'conv-team-shared',
  workspaceId: WORKSPACE_TEAM,
  visibility: 'team',
  headerWorkspaceType: 'team',
};

const ALL_CELLS = [
  PERSONAL_UNSHARED,
  PERSONAL_SHARED,
  TEAM_UNSHARED,
  TEAM_SHARED,
] as const;

const COMMENT_TARGET = {
  filePath: 'index.html',
  elementId: 'hero',
  selector: '[data-od-id="hero"]',
  label: 'h1.hero',
  text: 'Hero',
  htmlHint: '<h1>',
  position: { x: 0, y: 0, width: 0, height: 0 },
};

function headers(cell: Cell): Record<string, string> {
  return {
    'x-od-workspace-id': cell.workspaceId,
    'x-od-workspace-member-id': ME,
    'x-od-workspace-type': cell.headerWorkspaceType,
    'x-od-workspace-role': 'member',
  };
}

function jsonHeaders(cell: Cell): Record<string, string> {
  return { 'Content-Type': 'application/json', ...headers(cell) };
}

function sendApiError(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

type LocalBinding = {
  workspaceId?: string | null;
  visibility?: string | null;
  resourceState?: string | null;
  createdByWorkspaceMemberId?: string | null;
};

/** Keep request identity intact; project visibility is evaluated separately. */
function resolveCommentWorkspaceContext(
  db: ReturnType<typeof openDatabase>,
  req: unknown,
  projectId: string,
) {
  const binding = getWorkspaceProjectByProjectId(db, projectId) as LocalBinding | undefined;
  return resolveLocalProjectCommentWorkspaceContext({
    binding,
    revoked: false,
    local: resolveOptionalLocalWorkspaceRequestAuthority(req),
  });
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let server: http.Server | null = null;
let tempDir: string | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

interface RelayLog {
  pushes: Array<{ teamId: string; projectId: string; comment: CollabCloudComment }>;
  pulls: Array<{ teamId: string; projectId: string; sinceSeq: number }>;
}

async function startHarness() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-sync-eligibility-'));
  const db = openDatabase(tempDir);
  const publications = createSqlitePublicFilePublicationStore(db);
  const resolveRelayScope = (projectId: string, filePath: string, context: WorkspaceCollabContext | null) =>
    commentRelayScope({ binding: getWorkspaceProjectByProjectId(db, projectId), context, projectId, filePath, publications });
  const now = Date.now();

  for (const cell of ALL_CELLS) {
    insertProject(db, {
      id: cell.projectId,
      name: cell.projectId,
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: cell.conversationId,
      projectId: cell.projectId,
      title: 'Chat',
      createdAt: now,
      updatedAt: now,
    });
    // 云端拉回来的评论必须落在项目的「评论锚点会话」上
    // (server.ts:4432-4433 用 `getProjectCommentAnchorConversationId` 作为
    // `resolveLocalConversationId`)。没有锚点 = 下行必然 no-op,那会让下面
    // 4 格下行全部因为同一个无关原因变成「不同步」,矩阵就失去意义。
    ensureProjectCommentAnchorConversation(db, cell.projectId, now);
    ensureWorkspaceProject(db, {
      projectId: cell.projectId,
      workspaceId: cell.workspaceId,
      visibility: cell.visibility,
      createdByWorkspaceMemberId: ME,
    });
  }

  const relay: RelayLog = { pushes: [], pulls: [] };
  // 「云端」上已经存在、等着被拉下来的评论,按 projectId 分组。
  const remoteComments = new Map<string, CollabCloudComment[]>();
  let nextSeq = 0;

  const client = {
    isConfigured: () => true,
    async registerMember() {
      return { memberId: ME, displayName: ME, role: 'member' as const };
    },
    async listMembers() {
      return [];
    },
    async pushComment(
      teamId: string,
      projectId: string,
      comment: CollabCloudComment,
    ) {
      relay.pushes.push({ teamId, projectId, comment });
      nextSeq += 1;
      return { seq: nextSeq };
    },
    async pullComments(teamId: string, projectId: string, sinceSeq: number) {
      relay.pulls.push({ teamId, projectId, sinceSeq });
      return {
        comments: remoteComments.get(projectId) ?? [],
        latestSeq: (remoteComments.get(projectId) ?? []).reduce(
          (max, c) => Math.max(max, c.seq),
          sinceSeq,
        ),
        notModified: false,
        etag: null,
      };
    },
  } as unknown as CollabCloudClient;

  // 生产 wiring 的镜像 —— 逐项对着 apps/daemon/src/server.ts:4379-4420 抄的
  // **依赖装配**(不是逻辑):`resolveLocalProjectRelayBinding` 是 server.ts:4382-4392,
  // `validateCommentRelayProjectBinding` 是 server.ts:4393-4397(真函数
  // `commentRelayLocalBindingMatches`)。
  const collabCloud = createCollabCloudService({
    client,
    commentOutbox: createCommentRelayOutboxStore(db),
    // Match current server wiring: workspace type identifies the caller;
    // persisted visibility/publication facts decide relay eligibility.
    isMemberSyncProjectShared: (projectId) => {
      const binding = getWorkspaceProjectByProjectId(db, projectId);
      return binding?.visibility === 'team' && binding.resourceState !== 'deleted';
    },
    commentRelayScope: resolveRelayScope,
    listPersonalCommentRelayFilePaths: (projectId, context) => personalCommentRelayFilePaths({
      binding: getWorkspaceProjectByProjectId(db, projectId),
      context,
      projectId,
      publications,
    }),
    resolveLocalProjectRelayBinding: (projectId) => {
      const binding = getWorkspaceProjectByProjectId(db, projectId) as
        | LocalBinding
        | undefined;
      const workspaceId = binding?.workspaceId?.trim() ?? '';
      const ownerMemberId = binding?.createdByWorkspaceMemberId?.trim() || null;
      if (
        !workspaceId
        || binding?.visibility !== 'team'
        || binding?.resourceState === 'deleted'
      ) return null;
      return { workspaceId, ownerMemberId };
    },
    validateCommentRelayProjectBinding: (record) =>
      commentRelayLocalBindingMatches(
        record,
        getWorkspaceProjectByProjectId(db, record.projectId) as LocalBinding,
      ),
    // 生产用成员目录换一份新鲜权威(server.ts:4398-4412);这里用一个必定成功的
    // 桩,这样「出队时还会不会被拦」完全由 binding/catalog 决定,而不是被身份
    // 解析噪声盖住。
    resolveCommentRelayWorkspaceContext: async (identity) =>
      teamContextFor(identity.workspaceId, identity.teamId),
    // 「云端目录里这个项目还在不在、owner 是谁」(server.ts:4413-4419)。
    listRemoteProjectRelayBindings: async (context) =>
      ALL_CELLS
        .filter(
          (cell) =>
            cell.visibility === 'team' && cell.workspaceId === context.workspaceId,
        )
        .map((cell) => ({ projectId: cell.projectId, ownerMemberId: ME })),
    resolveRemoteProjectOwnerMemberId: async (projectId) =>
      ALL_CELLS.some((cell) => cell.projectId === projectId && cell.visibility === 'team')
        ? ME
        : null,
    // 后台轮询在本文件里保持沉默:下行一律由 GET 评论列表触发,断言才是确定的。
    listProjectIds: () => [],
    resolveProjectWorkspaceContext: async (projectId) => {
      const binding = getWorkspaceProjectByProjectId(db, projectId) as
        | LocalBinding
        | undefined;
      if (!binding?.workspaceId || binding.visibility !== 'team') return null;
      return teamContextFor(binding.workspaceId, binding.workspaceId);
    },
    resolveLocalConversationId: (projectId) =>
      getProjectCommentAnchorConversationId(db, projectId),
    mergeComment: ({ projectId, conversationId, comment }) =>
      mergeSyncedPreviewComment(db, projectId, conversationId, comment),
  });

  // 生产的 hub push 脏标记集合(server.ts:8698-8740 消费它)。
  const dirtyCommentProjects = new Set<string>();

  const app = express();
  app.use(express.json());
  registerProjectCommentRoutes(app, {
    db,
    isCommentRelayEligible: (projectId, filePath, context) =>
      resolveRelayScope(projectId, filePath, context) !== null,
    projectStore: {
      updateProject,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
    } as any,
    conversations: {
      getConversation,
      listPreviewComments,
      listProjectPreviewComments,
      upsertPreviewComment,
      getPreviewComment,
      getProjectPreviewComment,
      updatePreviewCommentStatus,
      updatePreviewCommentAnchor,
      deletePreviewComment,
      reorderPreviewComment,
    } as any,
    sendApiError,
    enforceWorkspaceProjectMutation: async (
      req,
      res,
      sendError,
      getWp,
      getWpByProjectId,
      dbArg,
      projectId,
      capability,
    ) =>
      enforceWorkspaceResourceMutation(
        'project',
        req,
        res,
        sendError,
        getWp,
        getWpByProjectId,
        dbArg,
        projectId,
        capability,
      ),
    resolveWorkspaceContext: async (req, projectId) =>
      resolveCommentWorkspaceContext(db, req, projectId),
    resolveReadWorkspaceContext: async (req, projectId) =>
      resolveCommentWorkspaceContext(db, req, projectId),
    resolveFreshWorkspaceContext: async (req, projectId) =>
      resolveCommentWorkspaceContext(db, req, projectId),
    // server.ts:8698-8740 的形状:消费脏标记 → 验新鲜权威 → pullProject;
    // 任何一步失败就把脏标记放回去。
    onCommentsRead: async (projectId, leasedContext, resolveFresh) => {
      if (!dirtyCommentProjects.delete(projectId)) return;
      if (!leasedContext) {
        dirtyCommentProjects.add(projectId);
        return;
      }
      try {
        const fresh = await resolveFresh();
        if (!fresh.ok || !fresh.context) {
          dirtyCommentProjects.add(projectId);
          return;
        }
        if (
          fresh.context.workspaceId !== leasedContext.workspaceId
          || fresh.context.workspaceMemberId !== leasedContext.workspaceMemberId
        ) {
          dirtyCommentProjects.add(projectId);
          return;
        }
        if (!await collabCloud.pullProject(projectId, fresh.context)) {
          dirtyCommentProjects.add(projectId);
        }
      } catch {
        dirtyCommentProjects.add(projectId);
      }
    },
    // server.ts:8752-8775 的形状。
    onCommentCreated: (comment, context) =>
      context ? collabCloud.enqueueComment(comment, context) : undefined,
    onCommentUpdated: (comment, context) =>
      context ? collabCloud.enqueueComment(comment, context) : undefined,
    onCommentDeleted: (comment, context) =>
      context ? collabCloud.enqueueCommentDeletion(comment, context) : undefined,  });

  const created = http.createServer(app);
  server = created;
  await new Promise<void>((resolve) => created.listen(0, resolve));
  const address = created.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    db,
    relay,
    dirtyCommentProjects,
    collabCloud,
    /** 在「云端」放一条评论,等着某一格的下行去拉。 */
    seedRemoteComment(cell: Cell, id: string, note: string) {
      nextSeq += 1;
      const comment: CollabCloudComment = {
        id,
        projectId: cell.projectId,
        conversationId: 'conv-on-another-daemon',
        memberId: 'member-someone-else',
        seq: nextSeq,
        note,
        filePath: COMMENT_TARGET.filePath,
        elementId: COMMENT_TARGET.elementId,
        selector: COMMENT_TARGET.selector,
        label: COMMENT_TARGET.label,
        text: COMMENT_TARGET.text,
        htmlHint: COMMENT_TARGET.htmlHint,
        position: COMMENT_TARGET.position,
        status: 'open',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const bucket = remoteComments.get(cell.projectId);
      if (bucket) bucket.push(comment);
      else remoteComments.set(cell.projectId, [comment]);
      return comment;
    },
  };
}

function teamContextFor(workspaceId: string, teamId: string): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId: ME,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 0,
      usedSeats: 0,
      availableSeats: 0,
      isSeatFull: false,
    },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: false,
      canManageSharedResources: false,
    },
    teamId,
  } as WorkspaceCollabContext;
}

type Harness = Awaited<ReturnType<typeof startHarness>>;

/** 在一格里写一条评论,然后把出队队列排干。返回这条评论上行到了哪一步。 */
async function writeCommentAndDrain(
  harness: Harness,
  cell: Cell,
  note: string,
): Promise<{ status: number; commentId: string | null }> {
  const response = await fetch(
    `${harness.baseUrl}/api/projects/${cell.projectId}/conversations/${cell.conversationId}/comments`,
    {
      method: 'POST',
      headers: jsonHeaders(cell),
      body: JSON.stringify({ target: COMMENT_TARGET, note }),
    },
  );
  const payload = response.status === 200
    ? (await response.json()) as { comment: { id: string } | null }
    : null;
  // 入队是同步、和本地写入同一个 SQLite 事务的(comments.ts:464-476);
  // 真正发网络请求的 flush 是异步的,这里显式排干,断言才不依赖时序。
  await harness.collabCloud.flushPendingComments();
  return { status: response.status, commentId: payload?.comment?.id ?? null };
}

/** 模拟一次 hub 推送脏标记后的首次 GET,返回本地列表。 */
async function readCommentsAfterDirtyMark(
  harness: Harness,
  cell: Cell,
): Promise<{ status: number; comments: Array<{ id: string; note: string }> }> {
  harness.dirtyCommentProjects.add(cell.projectId);
  const response = await fetch(
    `${harness.baseUrl}/api/projects/${cell.projectId}/conversations/${cell.conversationId}/comments`,
    { headers: headers(cell) },
  );
  const payload = response.status === 200
    ? (await response.json()) as { comments: Array<{ id: string; note: string }> }
    : { comments: [] };
  return { status: response.status, comments: payload.comments };
}

// ---------------------------------------------------------------------------
// 6 格矩阵 —— 上行
// ---------------------------------------------------------------------------

describe('同步资格矩阵 · 上行(本地写 → 推云端)', () => {
  it('个人项目 · 未分享 · 上行 —— 不同步(本地保存成功,不入队、不推送)', async () => {
    const harness = await startHarness();
    const { status, commentId } = await writeCommentAndDrain(
      harness,
      PERSONAL_UNSHARED,
      '个人未分享的评论',
    );

    // 本地写入照常成功 —— 不同步不等于写不进去,这正是「静默」的来源。
    expect(status).toBe(200);
    expect(commentId).toBeTruthy();
    expect(
      listPreviewComments(harness.db, PERSONAL_UNSHARED.projectId, PERSONAL_UNSHARED.conversationId),
    ).toHaveLength(1);

    // No team visibility or active exact-file publication: the shared scope helper refuses relay.
    expect(harness.relay.pushes).toEqual([]);
  });

  it('个人项目 · 分享中 · 上行 —— 同步(入队并推送到云端)', async () => {
    const harness = await startHarness();
    const { status, commentId } = await writeCommentAndDrain(
      harness,
      PERSONAL_SHARED,
      '个人已分享的评论',
    );

    expect(status).toBe(200);
    expect(commentId).toBeTruthy();
    // Personal subscription workspaces use their own workspace id as the relay partition.
    expect(harness.relay.pushes).toEqual([
      expect.objectContaining({
        teamId: WORKSPACE_PERSONAL,
        projectId: PERSONAL_SHARED.projectId,
      }),
    ]);
    expect(harness.relay.pushes[0]?.comment.id).toBe(commentId);
  });

  it('团队项目 · 未分享 · 上行 —— 不同步(本地保存成功,不入队、不推送)', async () => {
    const harness = await startHarness();
    const { status, commentId } = await writeCommentAndDrain(
      harness,
      TEAM_UNSHARED,
      '团队工作区里没分享的项目评论',
    );

    expect(status).toBe(200);
    expect(commentId).toBeTruthy();
    expect(
      listPreviewComments(harness.db, TEAM_UNSHARED.projectId, TEAM_UNSHARED.conversationId),
    ).toHaveLength(1);
    // A team workspace alone cannot publish a private project's comments.
    expect(harness.relay.pushes).toEqual([]);
  });

  it('团队项目 · 分享中 · 上行 —— 同步(入队并推送到云端)', async () => {
    const harness = await startHarness();
    const { status, commentId } = await writeCommentAndDrain(
      harness,
      TEAM_SHARED,
      '团队已分享的评论',
    );

    expect(status).toBe(200);
    expect(harness.relay.pushes).toEqual([
      expect.objectContaining({
        teamId: WORKSPACE_TEAM,
        projectId: TEAM_SHARED.projectId,
      }),
    ]);
    expect(harness.relay.pushes[0]?.comment.id).toBe(commentId);
    // 作者是服务端盖的章(comments.ts:425 / 447-449),不是请求体里带的。
    expect(harness.relay.pushes[0]?.comment.memberId).toBe(ME);
  });
});

// ---------------------------------------------------------------------------
// 6 格矩阵 —— 下行
// ---------------------------------------------------------------------------

describe('同步资格矩阵 · 下行(云端拉 → 本地)', () => {
  it('个人项目 · 未分享 · 下行 —— 不同步(不发起拉取,脏标记原样退回)', async () => {
    const harness = await startHarness();
    harness.seedRemoteComment(PERSONAL_UNSHARED, 'remote-personal-unshared', '云端的评论');

    const { status, comments } = await readCommentsAfterDirtyMark(harness, PERSONAL_UNSHARED);

    expect(status).toBe(200);
    expect(comments).toEqual([]);
    // Neither a shared project nor a creator publication can authorize this pull.
    expect(harness.relay.pulls).toEqual([]);
    // 一次没兑现的脏标记必须留着,否则这条评论这辈子只有的这一个信号就丢了。
    expect(harness.dirtyCommentProjects.has(PERSONAL_UNSHARED.projectId)).toBe(true);
  });

  it('个人项目 · 分享中 · 下行 —— 同步(拉取并合并进本地列表)', async () => {
    const harness = await startHarness();
    harness.seedRemoteComment(PERSONAL_SHARED, 'remote-personal-shared', '云端的评论');

    const { status, comments } = await readCommentsAfterDirtyMark(harness, PERSONAL_SHARED);

    expect(status).toBe(200);
    // The remote partition remains the exact selected personal workspace.
    expect(harness.relay.pulls).toEqual([
      expect.objectContaining({
        teamId: WORKSPACE_PERSONAL,
        projectId: PERSONAL_SHARED.projectId,
      }),
    ]);
    // 拉回来的评论在**同一个响应**里就可见:comments.ts:388 是 await 的,
    // 而 comments.ts:396-401 走 `listProjectPreviewComments`(项目级,跨会话),
    // 所以落在锚点会话上的远端评论也会出现在这个普通会话的列表里。
    expect(comments).toEqual([
      expect.objectContaining({ id: 'remote-personal-shared', note: '云端的评论' }),
    ]);
    expect(harness.dirtyCommentProjects.has(PERSONAL_SHARED.projectId)).toBe(false);
  });

  it('团队项目 · 未分享 · 下行 —— 不同步(不发起拉取,脏标记原样退回)', async () => {
    const harness = await startHarness();
    harness.seedRemoteComment(TEAM_UNSHARED, 'remote-team-unshared', '云端的评论');

    const { status, comments } = await readCommentsAfterDirtyMark(harness, TEAM_UNSHARED);

    expect(status).toBe(200);
    expect(comments).toEqual([]);
    expect(harness.relay.pulls).toEqual([]);
    expect(harness.dirtyCommentProjects.has(TEAM_UNSHARED.projectId)).toBe(true);
  });

  it('团队项目 · 分享中 · 下行 —— 同步(拉取并合并进本地列表)', async () => {
    const harness = await startHarness();
    harness.seedRemoteComment(TEAM_SHARED, 'remote-team-shared', '云端的评论');

    const { status, comments } = await readCommentsAfterDirtyMark(harness, TEAM_SHARED);

    expect(status).toBe(200);
    expect(harness.relay.pulls).toEqual([
      expect.objectContaining({
        teamId: WORKSPACE_TEAM,
        projectId: TEAM_SHARED.projectId,
      }),
    ]);
    expect(comments).toEqual([
      expect.objectContaining({ id: 'remote-team-shared', note: '云端的评论' }),
    ]);
    expect(harness.dirtyCommentProjects.has(TEAM_SHARED.projectId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 矩阵的结构性结论
// ---------------------------------------------------------------------------

describe('同步资格矩阵 · 结构', () => {
  // 这一条是整张网里最重要的断言。它把「项目类型这一维今天到不了同步闸门
  // 面前」钉死:两个住在**不同种类工作区**里的项目,只要分享状态相同,上行
  // 行为就完全一样。A7 如果在 `commentRelayScope()` 里**引入**了项目类型
  // (例如「个人项目不许同步」),这一条会红 —— 那是有意改变,不是漏改。
  it('项目类型不影响上行:个人工作区与团队工作区,只要都在分享中,行为一致', async () => {
    const harness = await startHarness();
    await writeCommentAndDrain(harness, PERSONAL_SHARED, 'a');
    await writeCommentAndDrain(harness, TEAM_SHARED, 'b');

    expect(harness.relay.pushes.map((push) => push.projectId).sort()).toEqual(
      [PERSONAL_SHARED.projectId, TEAM_SHARED.projectId].sort(),
    );
  });

  it('项目类型不影响下行:个人工作区与团队工作区,只要都未分享,都不拉取', async () => {
    const harness = await startHarness();
    await readCommentsAfterDirtyMark(harness, PERSONAL_UNSHARED);
    await readCommentsAfterDirtyMark(harness, TEAM_UNSHARED);

    expect(harness.relay.pulls).toEqual([]);
  });

  // comments.ts:388 的 `ctx.onCommentsRead?.()` 是**无条件**触发的:它不看
  // 分享状态,也不看项目类型。真正的资格判断在回调内部(server.ts:8698-8740)
  // 和 `pullProject` 里。A7 如果把资格前移到路由、让这个 hook 变成有条件触发,
  // 脏标记的「消费一次」语义就会变 —— 这条断言就是那个提醒。
  it('GET 评论列表在任何一格都会触发下行 hook(资格判断在 hook 内部,不在路由)', async () => {
    const harness = await startHarness();
    const fired: string[] = [];
    for (const cell of ALL_CELLS) {
      harness.dirtyCommentProjects.add(cell.projectId);
      const response = await fetch(
        `${harness.baseUrl}/api/projects/${cell.projectId}/conversations/${cell.conversationId}/comments`,
        { headers: headers(cell) },
      );
      expect(response.status).toBe(200);
      // hook 跑过的证据:脏标记被消费掉了(能兑现的兑现,不能兑现的被放回)。
      if (!harness.dirtyCommentProjects.has(cell.projectId)) fired.push(cell.projectId);
    }
    // 只有两格「分享中」真的兑现了脏标记;另外两格 hook 同样跑了,但把标记放回。
    expect(fired.sort()).toEqual(
      [PERSONAL_SHARED.projectId, TEAM_SHARED.projectId].sort(),
    );
    expect(harness.dirtyCommentProjects.has(PERSONAL_UNSHARED.projectId)).toBe(true);
    expect(harness.dirtyCommentProjects.has(TEAM_UNSHARED.projectId)).toBe(true);
  });

  // `commentsAreProjectScoped`(comments.ts:165-188)**不是死代码** —— 有人
  // 曾误判过。它返回真布尔值,team 分支真的会走到,并且决定了列表是「项目级」
  // 还是「会话级」。把它删掉的直接后果:分享中的项目看不到落在锚点会话上的
  // 远端评论。
  it('commentsAreProjectScoped 活着:分享中走项目级列表,未分享走会话级列表', async () => {
    const harness = await startHarness();
    const now = Date.now();

    for (const cell of [PERSONAL_SHARED, TEAM_UNSHARED] as const) {
      insertConversation(harness.db, {
        id: `${cell.conversationId}-other`,
        projectId: cell.projectId,
        title: 'Another local chat',
        createdAt: now,
        updatedAt: now,
      });
      upsertPreviewComment(harness.db, cell.projectId, `${cell.conversationId}-other`, {
        id: `${cell.projectId}-elsewhere`,
        target: COMMENT_TARGET,
        note: '另一个会话下的评论',
      });
    }

    // 分享中 → 项目级:看得见别的会话下的评论。
    const shared = await fetch(
      `${harness.baseUrl}/api/projects/${PERSONAL_SHARED.projectId}/conversations/${PERSONAL_SHARED.conversationId}/comments`,
      { headers: headers(PERSONAL_SHARED) },
    );
    expect(shared.status).toBe(200);
    expect(((await shared.json()) as { comments: Array<{ id: string }> }).comments).toEqual([
      expect.objectContaining({ id: `${PERSONAL_SHARED.projectId}-elsewhere` }),
    ]);

    // 未分享 → 会话级:看不见。
    const unshared = await fetch(
      `${harness.baseUrl}/api/projects/${TEAM_UNSHARED.projectId}/conversations/${TEAM_UNSHARED.conversationId}/comments`,
      { headers: headers(TEAM_UNSHARED) },
    );
    expect(unshared.status).toBe(200);
    expect(((await unshared.json()) as { comments: unknown[] }).comments).toEqual([]);
  });

  // 上行还有第二道、发生在**出队时**的闸门(collab-cloud-service.ts:473-485
  // 调用 `validateCommentRelayProjectBinding`)。入队之后取消分享,这条已经
  // 排好队的评论必须被就地作废,而不是照推不误。A7 统一入口时容易只覆盖
  // 「入队前」那一次判断。
  it('入队后取消分享:出队时被本地 binding 拦下,评论不再推送', async () => {
    const harness = await startHarness();

    const response = await fetch(
      `${harness.baseUrl}/api/projects/${TEAM_SHARED.projectId}/conversations/${TEAM_SHARED.conversationId}/comments`,
      {
        method: 'POST',
        headers: jsonHeaders(TEAM_SHARED),
        body: JSON.stringify({ target: COMMENT_TARGET, note: '排队中就被取消分享' }),
      },
    );
    expect(response.status).toBe(200);
    expect(harness.relay.pushes).toEqual([]);

    // 取消分享(visibility 回到 personal),然后才排干队列。
    updateWorkspaceProject(harness.db, WORKSPACE_TEAM, TEAM_SHARED.projectId, {
      visibility: 'personal',
    });
    await harness.collabCloud.flushPendingComments();

    expect(harness.relay.pushes).toEqual([]);
  });

  // 本地行与「要上行」的意图在同一个 SQLite 事务里落盘(comments.ts:464-476)。
  // 这条钉的是那个事务确实覆盖了入队:分享中的一次 POST 返回之后,outbox 里
  // 立刻就有一行,不需要等任何异步。
  it('分享中的本地写入与上行入队是同一个事务:POST 返回时队列里已经有行', async () => {
    const harness = await startHarness();
    const response = await fetch(
      `${harness.baseUrl}/api/projects/${TEAM_SHARED.projectId}/conversations/${TEAM_SHARED.conversationId}/comments`,
      {
        method: 'POST',
        headers: jsonHeaders(TEAM_SHARED),
        body: JSON.stringify({ target: COMMENT_TARGET, note: '同事务入队' }),
      },
    );
    expect(response.status).toBe(200);
    const { comment } = (await response.json()) as { comment: { id: string } };

    const queued = harness.db
      .prepare('SELECT project_id AS projectId, comment_id AS commentId FROM comment_relay_outbox')
      .all() as Array<{ projectId: string; commentId: string }>;
    expect(queued).toEqual([
      { projectId: TEAM_SHARED.projectId, commentId: comment.id },
    ]);
  });

  // 未分享的一格里,连队列行都不该出现 —— 「不同步」在今天是**从不入队**,
  // 而不是「入队了但投不出去」。这两者对 A7 是不同的实现选择,所以钉清楚。
  it('未分享的一格从不入队(不是入队后投递失败)', async () => {
    const harness = await startHarness();
    await writeCommentAndDrain(harness, PERSONAL_UNSHARED, '未分享');
    await writeCommentAndDrain(harness, TEAM_UNSHARED, '未分享');

    const queued = harness.db
      .prepare('SELECT COUNT(*) AS count FROM comment_relay_outbox')
      .get() as { count: number };
    expect(queued.count).toBe(0);
  });
});

// The original September snapshot inferred workspace type from project visibility.
// Current production keeps request identity intact and supplies commentRelayScope
// plus isMemberSyncProjectShared; omitting those hooks exercises a legacy fallback
// rather than the workspace-isolated production relay.
