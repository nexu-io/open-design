/**
 * 执行记录里的文件名:**哪一个才允许做成「打开」的入口**(纯函数,无 JSX / 无 DOM)。
 *
 * ── 产品裁决(2026-08-27)────────────────────────────────────────────
 * 「这些文件不要变成可点击的.. 因为读的不一定是我们项目文件夹下的文件....」
 * 截图里是三行 `读取 template.html` / `读取 checklist.md` / `读取 layouts.md`。
 *
 * ── 在这之前是怎么判的:没判 ──────────────────────────────────────
 * `AssistantMessage` 无条件把 `onRequestOpenFile` 递给每一张执行记录壳,
 * `ToolRow` 又无条件递给每一个有 `file` 的行,`FileButton` 则**永远**吐一颗
 * `<button>`。项目文件清单(`projectFileNames`)压根没走到这一层 —— 它只喂给
 * 正文里的 markdown 链接。所以判据既不是「名字在项目文件清单里」,也不是别的什么,
 * 是**一个判据都没有**。
 *
 * ── 为什么不是「路径在项目根之内就放行」──────────────────────────
 * 绝对路径**到得了**前端:`tool-kind.ts` 的 `fileOf()` 直接取 agent 的
 * `file_path` / `filePath` / `path` 入参,claude 的 Read/Write/Edit 给的就是绝对路径;
 * 项目根也到得了(`GET /api/projects/:id` 的 `resolvedDir`,一路传到 `ChatPane`)。
 * 所以包含关系是**判得出来**的 —— 但它**判不开产品报的这一例**:
 *
 *   daemon 开跑前把当前技能拷进 `<项目 cwd>/.od-skills/<folder>/`
 *   (`apps/daemon/src/cwd-aliases.ts`),也就是说技能资源**就在项目根里面**。
 *   单纯的包含检查会说「这是自己的文件」,截图里那三行照旧可点。
 *
 * 而它们又打不开:`listFiles()`(`apps/daemon/src/projects.ts`)跳过点开头的条目,
 * `.od-skills/**` 永远不在项目文件清单里,右侧工作区没有这一格。
 * 剩下唯一能把它们摘出去的信号是「名字在不在项目文件清单里」—— 而按**名字**去匹配
 * 正是产品担心的那种更糟的错法:别处读到的 `checklist.md` 会开出项目里的同名文件。
 *
 * 所以规则按**操作**分,不按路径分:
 *
 *   读        一律不做链接。agent 可以读任何地方的任何东西,这一档没有可靠的边界。
 *   写 / 改   仍然可点,但要**正面证明**这个路径属于当前项目 —— 沿用正文 markdown
 *             链接那同一个判官 `resolveChatFileLink`(它只从 `resolvedDir` 的前缀
 *             正面取证,取不到就返回 null,绝不靠同名去猜)。
 *
 * 交出去的是**项目相对路径**,不是 agent 给的那个绝对路径:打开回调
 * (`requestOpenFile` → `FileWorkspace`)按项目相对文件名匹配,递绝对路径开不出来。
 */
import { resolveChatFileLink } from '../in-project-link';
import type { ToolRow } from './contract';

/** 判「这个路径是不是当前项目的」需要的三样,全部来自 `ChatPane` 已有的 props */
export interface RecordFileScope {
  projectId?: string | null;
  /** 项目文件清单;只用于相对路径的兜底匹配,绝对路径不靠它 */
  projectFileNames?: ReadonlySet<string>;
  /** daemon 算出来的项目工作目录(`GET /api/projects/:id` 的 `resolvedDir`) */
  projectResolvedDir?: string | null;
}

/** 写 / 改之外的行,文件名一律只是文字 */
const LINKABLE_TOOLS = new Set(['write', 'edit']);

/**
 * 这一行的文件名该不该做成「打开」的入口。
 *
 * @returns 该打开的**项目相对路径**;不该做链接时返回 `null`。
 */
export function openableRecordFilePath(
  row: ToolRow,
  scope: RecordFileScope | undefined,
): string | null {
  if (!row.file) return null;
  // 读:不留例外。留例外就等于回到「按名字猜」—— 判「读的这个是不是项目里那个」
  // 和判「别处那个同名文件是不是项目里那个」用的是同一套信号,分不开。
  if (!LINKABLE_TOOLS.has(row.tool)) return null;

  /*
   * 绝对路径**只认项目根前缀这一条正面证据**,所以这里故意不把文件清单递进去。
   *
   * `resolveChatFileLink` 在拿不到前缀证据时会退到 `matchKnownProjectFilePath`,
   * 那一条是**按文件名尾段**匹配的:`/tmp/别处/checklist.md` 只要项目里也有一个
   * `checklist.md` 就会被判成自己的文件,点开的是**另一个同名文件**。
   * 这正是产品点名的更糟的那一种错。清单留给相对路径 —— 相对路径本来就以项目
   * 工作目录为根,不存在「别处的同名文件」这回事。
   */
  const absolute = /^([A-Za-z]:[\\/]|[\\/])/.test(row.file.path);
  const target = resolveChatFileLink(
    row.file.path,
    absolute ? undefined : scope?.projectFileNames,
    scope?.projectId,
    scope?.projectResolvedDir,
  );
  // 只认当前项目那一档:执行记录的打开动作走右侧工作区,跳到别的项目不是这颗按钮的事
  if (target?.kind !== 'workspace-file') return null;
  // 点开头的目录 / 文件工作区本来就不列(`listFiles()` 跳过它们),
  // 链过去是个打不开的承诺 —— `.od-skills/` 正是这一类。
  if (target.filePath.split('/').some((segment) => segment.startsWith('.'))) return null;
  return target.filePath;
}
