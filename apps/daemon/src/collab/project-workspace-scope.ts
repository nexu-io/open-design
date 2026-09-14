import type {
  ProjectVisibility,
  ProjectWorkspaceScope,
  WorkspaceType,
} from '@open-design/contracts';
import {
  workspaceContextFromDirectoryItem,
} from './vela-workspace-context.js';

interface ProjectWorkspaceBinding {
  workspaceId?: unknown;
  visibility?: unknown;
  workspaceVisibility?: unknown;
  resourceState?: unknown;
  createdByWorkspaceMemberId?: unknown;
}

/**
 * Resolve the browser/runtime scope of a local project without consulting the
 * membership directory. Persisted binding is authoritative for the Workspace
 * id; a complete request or the daemon's already-learned type supplies the
 * Personal/Team presentation hint. Unknown historical private bindings fall
 * back to Personal until the account directory catches up.
 */
export function resolveLocalProjectWorkspaceScope(input: {
  projectId: string;
  binding: ProjectWorkspaceBinding | null | undefined;
  requestWorkspaceMemberId?: string | null;
  requestWorkspaceType?: WorkspaceType | null;
  knownWorkspaceType?: WorkspaceType | null;
  configuredEnv?: Record<string, string>;
}): ProjectWorkspaceScope {
  const projectId = input.projectId.trim();
  const workspaceId = typeof input.binding?.workspaceId === 'string'
    ? input.binding.workspaceId.trim()
    : '';
  if (!workspaceId) {
    return {
      kind: 'unbound',
      projectId,
      workspaceId: null,
      context: null,
    };
  }
  const visibility: ProjectVisibility = (
    input.binding?.visibility === 'team'
    || input.binding?.workspaceVisibility === 'team'
  )
    ? 'team'
    : 'personal';
  const workspaceType = input.requestWorkspaceType
    ?? input.knownWorkspaceType
    ?? (visibility === 'team' ? 'team' : 'personal');
  const persistedMemberId = typeof input.binding?.createdByWorkspaceMemberId === 'string'
    ? input.binding.createdByWorkspaceMemberId.trim()
    : '';
  const workspaceMemberId = input.requestWorkspaceMemberId?.trim()
    || persistedMemberId
    || 'local-user';
  const context = workspaceContextFromDirectoryItem({
    workspaceId,
    workspaceName: workspaceId,
    workspaceType,
    workspaceMemberId,
    /*
     * ⚠️ 这个 'member' 是承重的,不是「还没接上真实角色」的占位符。别修它。
     *
     * 它和 `workspace-resource-mutation.ts` 的 `workspaceResourceAccess` 咬合:
     *
     *     privileged = role === 'owner' || role === 'admin'
     *     canMutate  = … && (privileged || selfCreated)
     *
     * role 停在 'member' ⟹ `privileged` 恒为 false ⟹ `canMutate` 退化成
     * `selfCreated`。**「创建者可写 / 非创建者只读」这条产品规则就是这么实现的**
     * (用户 2026-09-07 明确要求不许破坏)。把这里换成真实角色,工作区 owner
     * 会对工作区里每一个项目都可写,包括不是他建的 —— 只读态当场消失,而且
     * 静默:没有任何测试会红。
     *
     * 也别把这条路径改成去查目录 / 等 `/api/workspace/context`。本函数的契约
     * 就是本行文档注释写的「without consulting the membership directory」:
     * 只读态在首屏渲染路径上,用户的原话是「不能等半天错误的身份模型再显示
     * 正确的」。任何让它变成网络依赖、或者先渲染错的再纠正的改动,都是回退。
     *
     * 那这个上下文的 role 就是不准的 —— 对。所以它**只能用来判写权限,不能
     * 用来判身份**。付款入口(余额弹窗走哪支、升级 URL 算什么)曾经误用它,
     * 导致团队 owner 在项目页被降级成 member、拿到一张没有升级按钮的「请联系
     * 团队所有者充值」;那条链已经改为另取权威工作区身份,见
     * `packages/contracts/src/api/collab.ts` 的账单入口判定。
     */
    role: 'member',
    memberStatus: 'active',
    lifecycleState: input.binding?.resourceState === 'frozen'
      ? 'locked'
      : 'active',
  }, input.configuredEnv);
  if (workspaceType === 'team') {
    return {
      kind: 'team',
      projectId,
      workspaceId,
      visibility,
      context: { ...context, workspaceType: 'team' },
    };
  }
  return {
    kind: 'personal',
    projectId,
    workspaceId,
    visibility,
    context: { ...context, workspaceType: 'personal' },
  };
}
