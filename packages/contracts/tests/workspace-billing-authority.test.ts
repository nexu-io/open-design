// OPEND-2720 — 红测:**付款入口不许问一个「我不解析身份」的上下文要身份。**
//
// 真机(本地 vela 全栈 + 真 Chrome,2026-09-07 六格矩阵)测到的现象:同一个
// 工作区、同一个 member id,daemon 两个端点互相矛盾 ——
//
//   GET /api/workspace/context            → role=owner,  canManageBilling=true
//   GET /api/projects/:id/workspace-scope → role=member, canManageBilling=false
//
// 后者不是查出来的:`apps/daemon/src/collab/project-workspace-scope.ts` 的
// `resolveLocalProjectWorkspaceScope()` 文档注释第一句就写着「**without
// consulting the membership directory**」,它填的 `role: 'member'` 是一个**最小
// 权限占位**,不是这个人的真实角色(`workspaceName` 直接拿 workspaceId 当名字
// 是同一个破绽)。
//
// 那个占位是**承重结构**,不许改:daemon 的写闸门
// (`collab/workspace-resource-mutation.ts` 的 `workspaceResourceAccess`)按
// `privileged = role === 'owner' || 'admin'` 算 `canMutate = privileged ||
// selfCreated`。占位一旦变成真实的 owner,工作区所有者就对**工作区里每一个
// 项目**可写,「创建者可写 / 非创建者只读」当场消失。那条不变量另有守卫钉在
// `apps/daemon/tests/collab/project-scope-least-privilege.test.ts`。
//
// 所以要修的不是它,而是**它被拿去回答付款权限**这件事。这个模块提供那唯一
// 一处调和:身份(workspaceId / workspaceType / workspaceMemberId)永远是项目
// scope 的,**一个字都不许从环境里那个恰好选中的工作区取**;只有「这个人是
// 谁」这一位从权威上下文采纳,而且要求两边指的是同一个工作区的同一个成员。

import { describe, expect, it } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  canReachWorkspaceBillingEntrance,
  workspaceBillingAuthorityContext,
  type CollabMemberRole,
  type WorkspaceCollabContext,
  type WorkspaceLifecycleState,
  type WorkspaceMemberStatus,
  type WorkspaceType,
} from '../src/api/collab';

const WORKSPACE = 'ac43mfba3blvfvfmeie1euti';
const MEMBER = 'dn87ohicuyq4o839pgi37op4';
const SETTINGS_URL = `https://open-design.ai/amr/settings?workspaceId=${WORKSPACE}`;

function context(overrides: {
  workspaceId?: string;
  workspaceType?: WorkspaceType;
  workspaceMemberId?: string;
  role: CollabMemberRole;
  memberStatus?: WorkspaceMemberStatus;
  lifecycleState?: WorkspaceLifecycleState;
  workspaceName?: string;
}): WorkspaceCollabContext {
  const role = overrides.role;
  const lifecycleState = overrides.lifecycleState ?? 'active';
  const memberStatus = overrides.memberStatus ?? 'active';
  const workspaceType = overrides.workspaceType ?? 'team';
  const workspaceId = overrides.workspaceId ?? WORKSPACE;
  const base: WorkspaceCollabContext = {
    workspaceId,
    workspaceType,
    workspaceMemberId: overrides.workspaceMemberId ?? MEMBER,
    role,
    memberStatus,
    lifecycleState,
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 0, usedSeats: 0 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState, memberStatus }),
    workspaceSettingsUrl: SETTINGS_URL,
    workspaceName: overrides.workspaceName ?? workspaceId,
  };
  return workspaceType === 'team' ? { ...base, teamId: workspaceId } : base;
}

/**
 * daemon 真实产出的那一份:`resolveLocalProjectWorkspaceScope` 走
 * `workspaceContextFromDirectoryItem({ ..., workspaceName: workspaceId,
 * role: 'member' })` 拼出来的上下文。两处破绽都保留在夹具里 —— 名字就是 id,
 * 角色写死成 member。
 */
function synthesisedProjectScopeContext(
  overrides: Partial<Parameters<typeof context>[0]> = {},
): WorkspaceCollabContext {
  return context({ role: 'member', ...overrides });
}

/** `GET /api/workspace/context` 那一份:目录行里这个人的真实角色。 */
function authoritativeContext(
  overrides: Partial<Parameters<typeof context>[0]> = {},
): WorkspaceCollabContext {
  return context({ role: 'owner', workspaceName: 'Max Team', ...overrides });
}

describe('workspaceBillingAuthorityContext — 谁在付钱这一位', () => {
  // 矩阵 B 格。团队工作区的真实 owner,被项目 scope 那个占位降级成 member,
  // 于是 `canReachWorkspaceBillingEntrance` 在 team 上判他没有账单权限,
  // 弹窗变成「请联系团队所有者充值」—— 而他自己就是所有者,那张弹窗上一个
  // 升级入口都没有。
  it('团队 owner 被 scope 的占位降级后,要能从权威上下文取回账单权限', () => {
    const scoped = synthesisedProjectScopeContext();
    expect(canReachWorkspaceBillingEntrance(scoped)).toBe(false);

    const resolved = workspaceBillingAuthorityContext(scoped, authoritativeContext());

    expect(resolved?.role).toBe('owner');
    expect(resolved?.permissions.canManageBilling).toBe(true);
    expect(resolved?.permissions.canManageAutoRecharge).toBe(true);
    expect(canReachWorkspaceBillingEntrance(resolved!)).toBe(true);
  });

  // 这条是 `ProjectView.tsx:2290-2296` 那道防线的可执行形式:
  // 「Settled unavailable/forbidden states produce no run identity and
  //  therefore no preflight context; they must never fall through to the
  //  Personal wallet.」
  //
  // 没有项目 scope 就是**没有付款上下文**。环境里恰好选中的那个个人工作区
  // 不是替身 —— 它正是那句注释在防的东西。
  it('没有项目 scope 时不许拿环境里那个个人工作区顶上', () => {
    const ambientPersonalOwner = authoritativeContext({
      workspaceId: 'personal-workspace',
      workspaceType: 'personal',
      workspaceMemberId: 'personal-member',
    });

    expect(workspaceBillingAuthorityContext(null, ambientPersonalOwner)).toBeNull();
    expect(workspaceBillingAuthorityContext(undefined, ambientPersonalOwner)).toBeNull();
  });

  it('权威上下文指的是另一个工作区时,原样保留 scope', () => {
    const scoped = synthesisedProjectScopeContext();
    const otherWorkspace = authoritativeContext({ workspaceId: 'another-workspace' });

    expect(workspaceBillingAuthorityContext(scoped, otherWorkspace)).toBe(scoped);
  });

  it('权威上下文指的是另一个成员时,原样保留 scope', () => {
    const scoped = synthesisedProjectScopeContext();
    const otherMember = authoritativeContext({ workspaceMemberId: 'someone-else' });

    expect(workspaceBillingAuthorityContext(scoped, otherMember)).toBe(scoped);
  });

  // 同一个 id 在个人档和团队档下不是同一个钱包。类型不一致说明这两份上下文
  // 描述的根本不是一件事,不许合。
  it('工作区类型不一致时,原样保留 scope', () => {
    const scoped = synthesisedProjectScopeContext();
    const personalFlavoured = authoritativeContext({ workspaceType: 'personal' });

    expect(workspaceBillingAuthorityContext(scoped, personalFlavoured)).toBe(scoped);
  });

  it('权威上下文缺席时,原样保留 scope', () => {
    const scoped = synthesisedProjectScopeContext();

    expect(workspaceBillingAuthorityContext(scoped, null)).toBe(scoped);
    expect(workspaceBillingAuthorityContext(scoped, undefined)).toBe(scoped);
  });

  // 产品裁决 2026-09-07:「能看到也无所谓吧,不用特殊判断? 目前还没有踢人
  // 这个入口」。**权威上下文自己的 memberStatus 不参与判断。**
  //
  // 它只可能在「目录说这个人已被移出、而项目 scope 仍然为他解析出来了」这一
  // 组合上改变结果,而产品没有移出成员的入口,这个组合无从发生 —— 那道判断是
  // 一条走不到的分支。真正承重的那位在下一条:权限位一律由 **scope 自己的**
  // memberStatus 重算,所以「已被移出」如果哪天真的发生,也是 scope 报出来、
  // 由 scope 关掉权限,不靠这里补一刀。
  it('权威上下文自己的 memberStatus 不参与判断:角色照采纳', () => {
    const scoped = synthesisedProjectScopeContext();
    const removedOwner = authoritativeContext({ memberStatus: 'removed' });

    const resolved = workspaceBillingAuthorityContext(scoped, removedOwner);

    expect(resolved?.role).toBe('owner');
    expect(resolved?.memberStatus).toBe('active');
    expect(resolved?.permissions.canManageBilling).toBe(true);
  });

  // 承重的那一位:权限位只认 **scope 自己的** memberStatus。这条和「采纳角色
  // 不许解冻」是同一道防线的两半 —— 生命周期一半,成员状态一半;采纳角色不许
  // 把 scope 报出来的关闭状态重新打开。
  it('采纳角色不许复活已关闭的成员:权限位仍由 scope 自己的 memberStatus 决定', () => {
    const closed = synthesisedProjectScopeContext({ memberStatus: 'removed' });

    const resolved = workspaceBillingAuthorityContext(closed, authoritativeContext());

    expect(resolved?.role).toBe('owner');
    expect(resolved?.memberStatus).toBe('removed');
    // `canManageBilling` 是 `readable && isOwner`,而 `readable` 要求成员在职。
    expect(resolved?.permissions.canManageBilling).toBe(false);
    expect(resolved?.permissions.canWriteSyncedFiles).toBe(false);
    expect(canReachWorkspaceBillingEntrance(resolved!)).toBe(false);
  });

  // 冻结是**项目 scope 自己**报的状态(binding.resourceState === 'frozen' →
  // lifecycleState 'locked'),不是工作区目录报的。采纳角色不许顺手把状态也
  // 换掉,否则一个冻结的项目会因为「你是 owner」重新变得可写。
  it('采纳角色不许解冻:写权限位仍由 scope 自己的生命周期决定', () => {
    const frozen = synthesisedProjectScopeContext({ lifecycleState: 'locked' });

    const resolved = workspaceBillingAuthorityContext(frozen, authoritativeContext());

    expect(resolved?.role).toBe('owner');
    expect(resolved?.lifecycleState).toBe('locked');
    // `canWriteSyncedFiles` / `canManageAutoRecharge` 都是 `writable && …`,
    // 而 `writable` 只认生命周期。
    expect(resolved?.permissions.canWriteSyncedFiles).toBe(false);
    expect(resolved?.permissions.canManageAutoRecharge).toBe(false);
    // 账单入口是 `readable && isOwner`,冻结的工作区仍然可读 —— 所以 owner
    // 还是拿得到那条「去解冻/去付款」的路。这正是两个位分开的意义。
    expect(resolved?.permissions.canManageBilling).toBe(true);
  });

  // 属性测试:**不存在任何一组输入,能让结果指向和 scope 不同的工作区。**
  // 这就是「绝不掉回个人钱包」那道防线的形式化表述 —— 掉回去的前提是身份被
  // 换掉,而身份在这里根本没有被换的入口。
  it('身份三位永远原样来自 scope,无论权威上下文说什么', () => {
    const scoped = synthesisedProjectScopeContext();
    const candidates: Array<WorkspaceCollabContext | null | undefined> = [
      null,
      undefined,
      authoritativeContext(),
      authoritativeContext({ role: 'admin' }),
      authoritativeContext({ workspaceId: 'personal-workspace', workspaceType: 'personal' }),
      authoritativeContext({ workspaceMemberId: 'someone-else' }),
      authoritativeContext({ workspaceType: 'personal' }),
      authoritativeContext({ memberStatus: 'removed' }),
      authoritativeContext({ lifecycleState: 'locked' }),
    ];

    for (const candidate of candidates) {
      const resolved = workspaceBillingAuthorityContext(scoped, candidate);
      expect(resolved).not.toBeNull();
      expect(resolved!.workspaceId).toBe(scoped.workspaceId);
      expect(resolved!.workspaceType).toBe(scoped.workspaceType);
      expect(resolved!.workspaceMemberId).toBe(scoped.workspaceMemberId);
    }
  });

  // admin 不是 owner。契约的 `buildWorkspacePermissions` 只给 owner 账单权限,
  // 采纳角色之后这条不许被放宽。
  it('采纳 admin 角色不会顺手发出账单权限', () => {
    const scoped = synthesisedProjectScopeContext();

    const resolved = workspaceBillingAuthorityContext(
      scoped,
      authoritativeContext({ role: 'admin' }),
    );

    expect(resolved?.role).toBe('admin');
    expect(resolved?.permissions.canManageBilling).toBe(false);
    expect(canReachWorkspaceBillingEntrance(resolved!)).toBe(false);
  });
});
