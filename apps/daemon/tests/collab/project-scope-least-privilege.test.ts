// OPEND-2720 拆弹:**「创建者可写 / 非创建者只读」这个模型,今天全靠
// `resolveLocalProjectWorkspaceScope` 里那一行写死的 `role: 'member'` 撑着,
// 而它零测试保护。**
//
// 链路(2026-09-07 逐段核实):
//
//   1. `resolveLocalProjectWorkspaceScope` 产出项目 scope 的上下文,`role`
//      是一个最小权限占位 —— 那个函数的文档注释第一句就是「without
//      consulting the membership directory」,它根本不知道真实角色。
//   2. web 把这份上下文当作项目请求的工作区身份,`workspaceProjectHeaders`
//      把 `role` 原样放进 `x-od-workspace-role`
//      (`apps/web/src/collab/workspace-identity.ts`)。
//   3. daemon 的写闸门从那个头读回来,算
//      `privileged = role === 'owner' || role === 'admin'`、
//      `canMutate = !frozen && canWriteSyncedFiles && active && (privileged || selfCreated)`
//      (`collab/workspace-resource-mutation.ts`)。
//
// 占位是 member ⟹ `privileged === false` ⟹ `canMutate` 退化成 `selfCreated`。
// **这就是只读模型的实现方式。**
//
// 于是那一行看起来像「明显该修的硬编码」:下一个人把它改成解析出的真实角色,
// 工作区 owner 就对工作区里**每一个**项目可写(包括不是他创建的),只读区分
// 静默消失,而 CI 全绿 —— 因为在这条测试存在之前,没有任何东西钉住它。
//
// 用户 2026-09-07 原话:「单个 project 的创建者和非创建者, 进入 project 会有
// 非 readonly 和 readonly 之分的, 这个要注意,不能破坏这个, 并且这个身份模型
// 判断应该是要非常迅速的, 不能等半天错误的身份模型再显示正确的」。
//
// 所以这里钉两件事:
//   ① 这条 scope 永远不发出 owner/admin 标准,非创建者因此只读;
//   ② 这个判定是**纯本地同步**的,不等任何网络。
//
// 付款入口那条链另有解法:身份不从这里取,而是在
// `packages/contracts/src/api/collab.ts` 的 `workspaceBillingAuthorityContext`
// 里和权威上下文调和,且只调和 role、绝不换工作区。

import { describe, expect, it, vi } from 'vitest';

import { resolveLocalProjectWorkspaceScope } from '../../src/collab/project-workspace-scope.js';
import {
  workspaceResourceAccess,
  workspaceResourceContextFromVerified,
  type WorkspaceResourceAccessInput,
} from '../../src/collab/workspace-resource-mutation.js';

const WORKSPACE = 'workspace-team';
const CREATOR = 'creator-member';
const OTHER_MEMBER = 'workspace-owner-member';

/** 某个成员创建、并共享给团队的那一行 `workspace_projects`。 */
const sharedProjectRow: WorkspaceResourceAccessInput = {
  workspaceId: WORKSPACE,
  visibility: 'team',
  resourceState: 'active',
  createdByWorkspaceMemberId: CREATOR,
};

/**
 * 走完整条链:scope → 上下文 → 请求头形状 → 写闸门。
 *
 * `workspaceResourceContextFromVerified` 就是 daemon 自己把一份
 * `WorkspaceCollabContext` 折成头部形状的那个函数,所以这里量的是产品真正
 * 走的那条路,不是重新拼一份等价物。
 */
function accessForRequestingMember(workspaceMemberId: string) {
  const scope = resolveLocalProjectWorkspaceScope({
    projectId: 'project-team',
    binding: sharedProjectRow,
    requestWorkspaceMemberId: workspaceMemberId,
    requestWorkspaceType: 'team',
  });
  if (scope.kind !== 'team') throw new Error(`expected a team scope, got ${scope.kind}`);
  return workspaceResourceAccess(
    sharedProjectRow,
    workspaceResourceContextFromVerified(scope.context),
  );
}

describe('项目 scope 的最小权限占位是只读模型的承重结构', () => {
  it('非创建者进入别人建的项目:只读', () => {
    const access = accessForRequestingMember(OTHER_MEMBER);

    expect(access.privileged).toBe(false);
    expect(access.selfCreated).toBe(false);
    expect(access.canMutate).toBe(false);
    expect(access.disabledReason).toBe('permission_denied');
  });

  it('创建者本人进入:可写', () => {
    const access = accessForRequestingMember(CREATOR);

    expect(access.selfCreated).toBe(true);
    expect(access.canMutate).toBe(true);
    expect(access.disabledReason).toBeUndefined();
  });

  // **判据能不能看见缺陷。** 上面那条「非创建者只读」是被 role 占位偶然保证的;
  // 把占位换成真实的 owner,同一条闸门立刻放行 —— 这一步证明第一条测试不是
  // 恒真的,它咬住的正是那个占位。
  it('占位一旦变成真实的 owner,同一条闸门就会放行非创建者(所以它不许被「修好」)', () => {
    const scope = resolveLocalProjectWorkspaceScope({
      projectId: 'project-team',
      binding: sharedProjectRow,
      requestWorkspaceMemberId: OTHER_MEMBER,
      requestWorkspaceType: 'team',
    });
    if (scope.kind !== 'team') throw new Error('expected a team scope');

    const asWorkspaceOwner = workspaceResourceAccess(sharedProjectRow, {
      ...workspaceResourceContextFromVerified(scope.context),
      role: 'owner',
    });

    expect(asWorkspaceOwner.privileged).toBe(true);
    expect(asWorkspaceOwner.canMutate).toBe(true);
  });

  it('无论请求怎么声称,这条 scope 都不发出 owner/admin 标准', () => {
    const bindings: Array<Parameters<typeof resolveLocalProjectWorkspaceScope>[0]> = [
      { projectId: 'p', binding: sharedProjectRow },
      { projectId: 'p', binding: sharedProjectRow, requestWorkspaceMemberId: CREATOR },
      { projectId: 'p', binding: sharedProjectRow, requestWorkspaceType: 'team' },
      { projectId: 'p', binding: sharedProjectRow, requestWorkspaceType: 'personal' },
      { projectId: 'p', binding: sharedProjectRow, knownWorkspaceType: 'team' },
      {
        projectId: 'p',
        binding: { ...sharedProjectRow, visibility: 'personal' },
        requestWorkspaceMemberId: OTHER_MEMBER,
      },
      {
        projectId: 'p',
        binding: { ...sharedProjectRow, resourceState: 'frozen' },
        requestWorkspaceMemberId: OTHER_MEMBER,
      },
    ];

    for (const input of bindings) {
      const scope = resolveLocalProjectWorkspaceScope(input);
      // Every fixture above carries a workspace id, so the resolver owes us a
      // scope that CARRIES a context. `unbound` and `unavailable` are the two
      // context-less variants of `ProjectWorkspaceScope`; excluding only
      // `unbound` leaves `unavailable`, whose `context` is also `null`. Assert
      // the property the assertions actually need instead of a proxy for it.
      const { context } = scope;
      if (context == null) {
        throw new Error(`fixture should stay bound with a context, got ${scope.kind}`);
      }
      expect(context.role).toBe('member');
      expect(context.permissions.canManageMembers).toBe(false);
      expect(context.permissions.canManageSharedResources).toBe(false);
    }
  });

  // 用户的第二条约束:「不能等半天错误的身份模型再显示正确的」。这条判定必须
  // 是本机同步的 —— 网络一断也照样立刻给出同一个答案。
  it('只读判定不依赖任何网络请求', () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('readonly resolution must not reach the network');
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const access = accessForRequestingMember(OTHER_MEMBER);
      expect(access.canMutate).toBe(false);
      expect(accessForRequestingMember(CREATOR).canMutate).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
