/**
 * "Files this turn" disclosure pinned to the top of an assistant message.
 *
 * The first four files stay visible so artifacts are presented as results,
 * not hidden inside execution history. Every result set keeps the same framed
 * surface so even a single artifact reads as a primary deliverable. A single
 * artifact is still rendered as one direct row without a redundant group
 * header; larger batches collapse only the rows after the fourth. Openable
 * artifacts use the whole row as the target instead of repeating an Open
 * button on every line.
 *
 * The component is read-only over `events` — derivation lives in
 * `runtime/file-ops.ts` so the same logic is reachable from tests and
 * future surfaces (sidebar, log export, etc.) without coupling to
 * AssistantMessage's render shape.
 */
import { useId, useState } from 'react';
import { VisuallyHidden } from '@open-design/components';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { projectFileUrl } from '../providers/registry';
import { useProjectCollabContext } from '../collab/collab-context';
import { artifactKind, type ArtifactKind } from '../runtime/chat/format';
import {
  countArtifactFileOps,
  type FileOpEntry,
  type FileOpKind,
} from '../runtime/file-ops';
import { artifactExportNeedsFormatChoice } from '../runtime/chat/artifact-export';
import { indexArtifactRefs } from '../runtime/chat/artifact-refs';
import { Icon, type IconName } from './Icon';
import { PixelLiquid } from './PixelLiquid';
import { RemixIcon } from './RemixIcon';
import { HtmlProjectCoverFrame } from './project-cover';
import { AudioArtifact } from './chat/AudioArtifact';
import { ARTIFACT_ANCHOR_ATTR, artifactAnchorId } from './chat/AnchoredMenuShell';

interface Props {
  entries: FileOpEntry[];
  /** Names that exist in the project folder. When set, the open button
   *  only shows for entries whose basename is in the set. Pass undefined
   *  to opt out of the existence check (button always shown). */
  projectFileNames?: Set<string> | undefined;
  /**
   * 打开一份产物 —— **只交文件名**。
   *
   * 打开的永远是工作区里那份最新的,不管卡面画的是哪一轮的快照(用户 2026-09-02:
   * 「html 和图片都是,产物缩略是快照,但跳过去产物永远指向最新的」)。
   */
  onRequestOpenFile?: ((name: string) => void) | undefined;
  /** Enables the design's artifact cards (component 14, grids 30-33). The
   *  thumbnail and the export href are both project-scoped URLs, so without a
   *  project id every entry keeps rendering as a text row. */
  projectId?: string | undefined;
  /**
   * D28 "publish" —— **只对 HTML 产物出现**。
   *
   * 卡上不画菜单:它把「哪份产物 + 锚在哪枚按钮上」交出去,由预览区把**它本来
   * 那块分享菜单**开在这枚按钮旁边(产品 2026-08-27:「为啥不直接复用现在那个
   * 分享弹窗??」)。`anchorId` 能在文档里查回那枚按钮 —— 菜单是几百毫秒之后
   * (文件打开、viewer 挂好)才出现的,冻结一个矩形会错位。
   */
  onPublish?: ((name: string, anchorId: string) => void) | undefined;
  /**
   * D28 "export" —— **只对多格式产物调用**,同样只交锚点,菜单由预览区开
   * (产品 2026-08-27:「导出这个样式也不对呢, 为啥不直接复用?」)。
   *
   * 单格式产物(md / 图片 / 视频 / 其它)在卡上直接下载原件,压根不惊动预览区
   * (`runtime/chat/artifact-export.ts`)。
   */
  onExport?: ((name: string, anchorId: string) => void) | undefined;
  /** 这一轮还在跑吗 —— 决定产物卡能不能是「还在写」的 loading 态(见 cardItems) */
  turnIsLive?: boolean;
  /**
   * 这条消息的产物**版本身份**(daemon 投影的 `ChatMessage.artifactRefs`)。
   *
   * 它决定两件事,按产物类型分两套(设计文档 §4):
   *  · HTML / 原型 / slide / 文档 → 卡面读**当轮静态首屏截图**,点击仍开**最新**;
   *  · 图片 → 卡面、点击、导出统统认**那一轮的不可变真图快照**。
   *
   * 拿不到(旧会话、截图失败、配额满)就整个不传,卡自己走降级支 ——
   * HTML 降级成 live iframe 显示最新,图片降级成当前同名文件,两条都不出占位。
   *
   * 收 `unknown`:线上 DTO 在 `packages/contracts`,和 daemon 侧同批次落地;
   * 而且落地之后旧消息里仍然可能没有这个字段。收敛在
   * `runtime/chat/artifact-refs.ts`,那里守着「只信 ready」这条语义。
   */
  artifactRefs?: unknown;
}

type ArtifactOpKind = Extract<FileOpKind, 'write' | 'edit'>;

const OP_LABEL_KEY: Record<ArtifactOpKind, keyof Dict> = {
  write: 'tool.write',
  edit: 'tool.edit',
};

const ARTIFACT_OP_ICON: Record<ArtifactOpKind, IconName> = {
  write: 'file-code',
  edit: 'pencil',
};

const COLLAPSE_AFTER_ENTRY_COUNT = 4;


/**
 * 把原件直接拉到本地 —— 单格式产物那一档的「导出」。
 *
 * 卡上的〔导出〕本身就是一枚 `<a download>`,不需要这个;这里是给音频胶囊
 * 那枚下载键用的,它在组件 24 里是一枚 `<button>`。
 */
function downloadProjectFile(href: string, name: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function FileOpsSummary({
  entries,
  projectFileNames,
  onRequestOpenFile,
  projectId,
  onPublish,
  onExport,
  turnIsLive = false,
  artifactRefs,
}: Props) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  // 音频胶囊要自己拼文件 URL(它不走 `ArtifactCard`,拿不到那里的上下文)
  const { workspaceContext } = useProjectCollabContext();

  if (entries.length === 0) return null;

  /*
   * Component 14(grids 30-33)。
   *
   * 准入用 `producedArtifactCardKind`,**不是** `artifactCardKind` —— 两者的差别
   * 就是 md / csv / 源码那一档:前者给它们一张 `doc` 卡,后者把它们丢回文本行。
   * 这里原来用的是后者,而「没有工具行」那条回退支用的是前者,于是同一份
   * `plan.md` 在有工具行的轮次里是一行灰字、在没有的轮次里是一张卡 —— 同一个
   * 面板两副长相。2026-08-26 用户对着灰列表拍过板:「变成上面卡片形式才对」,
   * 所以两边一起按卡走。
   *
   * 删除掉的文件仍然不出卡(在这一行之前就被筛掉了):一张带预览的卡说的是
   * 「这份东西在这儿」,对一个已经不在的文件是假话。
   */
  // 产物的版本身份按**文件名**配对:卡片自己也是按名字去重的(见下面的 `cardItems`)。
  const refTargets = indexArtifactRefs(artifactRefs);
  const rawCardItems: ArtifactCardItem[] = projectId
    ? entries.flatMap((entry) => {
        if (entry.ops.includes('delete')) return [];
        if (artifactKind(entry.path) === 'audio') return [];
        const kind = producedArtifactCardKind(entry.path);
        /*
         * **轮次还在跑的时候才算「还在写」**。
         *
         * `entry.status === 'running'` 的判据是「有 `tool_use` 配不到 `tool_result`」。
         * 轮次结束之后这只说明那条 result **丢了**,不说明还在写 —— 挂着一张永远
         * 转下去的 loading 卡是在撒谎。分叉出来的会话里尤其明显:seeded 副本会
         * 被刻意丢掉 `runStatus`(那是**源会话**那次 run 的指针),于是没有任何东西
         * 宣布这一轮结束了,卡片就一直绿着。用户真机指认过。
         */
        return [
          {
            name: entry.path,
            kind,
            pending: turnIsLive && entry.status === 'running',
            ...(refTargets.get(entry.path) ?? {}),
          },
        ];
      })
    : [];
  // Historical runs can describe the same project-relative file through two
  // runtime paths (for example a recovered write plus the final produced-file
  // snapshot). A deliverable is still one card. Besides duplicating the UI,
  // passing both through gave React two identical `key={item.name}` values.
  const cardItems = Array.from(
    new Map(rawCardItems.map((item) => [item.name, item])).values(),
  );
  const cardNames = new Set(cardItems.map((item) => item.name));
  /*
   * 音频**不套卡壳**,自己就是一条横胶囊(设计稿组件 24)。用户 2026-08-27 当场
   * 指认过套壳的样子:「音频产物外面不要套大卡片了啊,只有一个音频的横的这个就行了呀」。
   * 所以它既不进 `cardItems`(那是缩略图那一族),也不留在下面的文本行里 ——
   * 一个文件只该出现一次。
   */
  const audioEntries = projectId
    ? entries.filter(
        (entry) => !entry.ops.includes('delete') && artifactKind(entry.path) === 'audio',
      )
    : [];
  const audioNames = new Set(audioEntries.map((entry) => entry.path));
  const rowEntries = cardNames.size || audioNames.size
    ? entries.filter((entry) => !cardNames.has(entry.path) && !audioNames.has(entry.path))
    : entries;

  const cards = projectId && cardItems.length > 0 ? (
    <ArtifactCards
      items={cardItems}
      projectId={projectId}
      onOpen={onRequestOpenFile}
      onPublish={onPublish}
      onExport={onExport}
    />
  ) : null;
  const audioRows = projectId && audioEntries.length > 0 ? (
    <div className="file-ops-audio" data-testid="file-ops-audio">
      {audioEntries.map((entry) => (
        <AudioArtifact
          key={entry.path}
          src={projectFileUrl(projectId, entry.path, workspaceContext)}
          name={entry.path}
          /*
           * 音频是**单格式**产物 —— 没有第二种导法,所以那枚下载键直接把原件
           * 拉下来,不绕道预览区的导出菜单(它对 `.mp3` 根本不存在:
           * `downloadRequest` 只发给 `HtmlViewer`)。原来这里挂的是
           * `onExport(entry.path)`,点下去只会把文件在预览区打开,然后什么
           * 都不发生。
           */
          onDownload={() => downloadProjectFile(
            projectFileUrl(projectId, entry.path, workspaceContext),
            entry.path,
          )}
        />
      ))}
    </div>
  ) : null;

  // 全都进了卡片、没有剩下的行:仍然要挂 `file-ops-summary` 这个身份。
  // 它标的是「这一轮的产物面板」,不是「文本列表那种画法」——
  // 丢掉它,「一条消息只出一个产物面板」那条不变量就没人守得住了(P0 recvqaerXd82bE)。
  if (rowEntries.length === 0) {
    return cards || audioRows ? (
      <div className="file-ops-cards-only" data-testid="file-ops-summary">
        {cards}
        {audioRows}
      </div>
    ) : null;
  }

  // Keep the first four results immediately legible. Once a run touches more
  // files, only rows after the fourth start hidden; expanding reveals the
  // remainder without making the entire result set disappear by default.
  const isCollapsible = rowEntries.length > COLLAPSE_AFTER_ENTRY_COUNT;
  const hiddenEntryCount = Math.max(0, rowEntries.length - COLLAPSE_AFTER_ENTRY_COUNT);
  const visibleEntries = isCollapsible && !expanded
    ? rowEntries.slice(0, COLLAPSE_AFTER_ENTRY_COUNT)
    : rowEntries;

  // Count unique produced files (one row per file), not write operations — a
  // file touched several times must count once in a "Files from this turn"
  // header (#5909).
  const counts = countArtifactFileOps(rowEntries);
  const summaryParts: string[] = [];
  if (counts.write > 0) summaryParts.push(`${t('tool.write')} ${counts.write}`);
  if (counts.edit > 0) summaryParts.push(`${t('tool.edit')} ${counts.edit}`);

  const header = (
    <>
      <span className="file-ops-icon" aria-hidden>
        <Icon name="file" size={14} />
      </span>
      <span className="file-ops-label">{t('assistant.producedFiles')}</span>
      <span className="file-ops-summary-line">{summaryParts.join(' · ')}</span>
      {isCollapsible ? (
        <>
          <span className="file-ops-more">
            {expanded
              ? rowEntries.length
              : t('assistant.unfinishedMore', { n: hiddenEntryCount })}
          </span>
          <span className={`file-ops-chev${expanded ? ' is-expanded' : ''}`} aria-hidden>
            <Icon name="chevron-down" size={14} />
          </span>
        </>
      ) : null}
    </>
  );

  if (rowEntries.length === 1) {
    const onlyEntry = rowEntries[0];
    if (!onlyEntry) return cards || audioRows ? (<>{cards}{audioRows}</>) : null;
    return (
      <>
        {cards}
        {audioRows}
        <div
          className="file-ops"
          data-testid="file-ops-summary"
        >
          <ul className="file-ops-list file-ops-list--single" role="list">
            <FileOpRow
              entry={onlyEntry}
              projectFileNames={projectFileNames}
              onRequestOpenFile={onRequestOpenFile}
            />
          </ul>
        </div>
      </>
    );
  }

  return (
    <>
    {cards}
    {audioRows}
    <div
      className="file-ops"
      data-testid="file-ops-summary"
    >
      <div className="file-ops-head">
        {isCollapsible ? (
          <button
            type="button"
            className="file-ops-toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            data-testid="file-ops-toggle"
          >
            {header}
          </button>
        ) : (
          <div
            className="file-ops-toggle file-ops-toggle--static"
            data-testid="file-ops-toggle"
          >
            {header}
          </div>
        )}
      </div>
      <ul className="file-ops-list" role="list">
        {visibleEntries.map((entry) => (
          <FileOpRow
            key={entry.fullPath}
            entry={entry}
            projectFileNames={projectFileNames}
            onRequestOpenFile={onRequestOpenFile}
          />
        ))}
      </ul>
    </div>
    </>
  );
}

function FileOpRow({
  entry,
  projectFileNames,
  onRequestOpenFile,
}: {
  entry: FileOpEntry;
  projectFileNames?: Set<string> | undefined;
  onRequestOpenFile?: ((name: string) => void) | undefined;
}) {
  const t = useT();
  const canOpen =
    !!onRequestOpenFile &&
    !entry.ops.includes('delete') &&
    (projectFileNames ? projectFileNames.has(entry.path) : true);
  // Artifact rows describe the delivered file, not the execution history.
  // A file that was read and then edited therefore gets one Edit category;
  // read/run/error detail stays in the execution disclosure above.
  const artifactOp: ArtifactOpKind | null = entry.ops.includes('edit')
    ? 'edit'
    : entry.ops.includes('write')
      ? 'write'
      : null;
  const content = (
    <>
      {artifactOp ? (
        <span
          className={`file-ops-badge file-ops-badge--${artifactOp}`}
          title={t(OP_LABEL_KEY[artifactOp])}
          aria-hidden
        >
          <Icon name={ARTIFACT_OP_ICON[artifactOp]} size={13} />
        </span>
      ) : null}
      <code className="file-ops-row-path" title={entry.fullPath}>
        {entry.path}
      </code>
      {canOpen ? (
        <span className="file-ops-row-open-icon" aria-hidden>
          <Icon name="chevron-right" size={12} />
        </span>
      ) : null}
    </>
  );

  return (
    <li
      className="file-ops-row"
      data-testid={`file-ops-row-${entry.path}`}
    >
      {canOpen ? (
        <button
          type="button"
          className="file-ops-row-main file-ops-row-main--action"
          onClick={() => onRequestOpenFile?.(entry.path)}
          title={t('tool.openInTab', { name: entry.path })}
          data-testid={`file-ops-row-open-${entry.path}`}
        >
          {content}
        </button>
      ) : (
        <div className="file-ops-row-main">{content}</div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Component 14 — artifact cards (design matrix grids 30-33)
 * ------------------------------------------------------------------ */

/** Kinds that a 16:10 thumbnail can actually answer "is this the version I
 *  wanted?" for. `.md` / `.csv` are not primary artifacts (W12), and audio is
 *  component 24's own player, not a picture card. */
/**
 * 产物卡认哪几种。
 *
 * `doc` 是**稿子没画的那一档**:markdown / 文本这类没有预览图的产出。
 * 稿子第 30–33 格里每张产物卡都有一块缩略图位(非 HTML 那格也是),但它没考虑
 * 「拿不出缩略图」的产物 —— 产品里这类原来退化成一行灰列表
 * (用户 2026-08-26 真机指认「变成上面卡片形式才对」)。
 * 用同一张卡的骨架,缩略图位换成「图标 + 文件名」的封面。
 */
export type ArtifactCardKind = Extract<ArtifactKind, 'html' | 'image' | 'video'> | 'doc';

export interface ArtifactCardItem {
  /** Project-relative name; also the key passed to open / publish / export. */
  name: string;
  kind: ArtifactCardKind;
  /** D37: the run is still writing this file — grey breathing placeholder and
   *  no actions in the corner. The design sheet has no such state; product
   *  asked for it on 2026-08-21 so a turn does not sit silent and then pop an
   *  artifact out of nowhere. */
  pending?: boolean;
  /**
   * 这一轮的**静态封面**:HTML / 原型 / slide / 文档是首屏截图,视频是**首帧**
   * (用户 2026-09-02:「视频这个东西,那看起来视频还是要快照一下首帧的」)。
   *
   * 卡面读它 —— 于是历史消息里那张卡是**当时**的样子,不跟工作区最新版本漂移。
   * 拿不到就走降级支:HTML 用 live iframe 显示最新、视频让浏览器自己画当前文件的
   * 第一帧(见 `ArtifactCard`)。
   */
  coverUrl?: string;
  /**
   * 这一轮的**不可变真图快照**(图片)。卡面、点击、导出都认它。
   * 拿不到就读工作区当前同名文件 —— 旧会话就是这条,不出占位、不写「不可用」。
   */
  snapshotUrl?: string;
}

/*
 * 这里**没有**「点击目标」这种东西。
 *
 * 曾经有:图片卡会把 `{snapshotId, snapshotUrl}` 当第二个实参交给宿主,让它开
 * 一个只读的历史 tab。宿主的 `onRequestOpenFile` 只收一个参数,把它悄悄丢了 ——
 * 于是线上行为(点开最新)是**碰巧**对的。用户 2026-09-02 拍板点开永远是最新,
 * 所以整条拆掉:留着它,下一个人会把那个「被丢掉的参数」当 bug 接回去,正好做出
 * 被否掉的行为,而且 typecheck 不报、测试不红。
 *
 * 卡面那一半原样保留 —— 裁决的另一半是「产物缩略是快照」。
 */

/** 文档卡封面上那枚图标 —— 只按后缀分「代码 / 普通文件」两档,不另立一套映射 */
function docCardIcon(name: string): IconName {
  return /\.(ts|tsx|js|jsx|css|scss|json|py|rb|go|rs|java|sh|yml|yaml|toml)$/i.test(name)
    ? 'file-code'
    : 'file';
}

export function artifactCardKind(path: string): ArtifactCardKind | null {
  const kind = artifactKind(path);
  /*
   * 音频**不进这条**。它确实有自己的画法(设计稿组件 24 那条胶囊),但那是一条
   * 独立的横条,不是缩略图 —— 套进产物卡的壳里就会得到一个 252px 高的空方框、
   * 底下大片留白,卡壳自带的〔导出〕浮层还会压住右端的总时长(2026-08-27 用户
   * 当场指认:「音频产物外面不要套大卡片了啊,只有一个音频的横的这个就行了呀」)。
   * 音频走 `audioEntries` 那一支,直接画胶囊。
   */
  return kind === 'html' || kind === 'image' || kind === 'video' ? kind : null;
}

/**
 * **本轮产出**那一块的准入 —— 比上面这条宽:拿不出预览图的产出(md / txt / json …)
 * 也出卡,走 `doc` 档(用户 2026-08-26:「变成上面卡片形式才对」)。
 *
 * 为什么不把 `artifactCardKind` 直接改宽:它还管着**工具操作清单**那一列,
 * 那里有「删除」这种操作 —— 一个已经被删掉的文件当然不能摆成一张带预览的卡。
 * 两个问题不同,判据就该是两条。
 */
export function producedArtifactCardKind(path: string): ArtifactCardKind {
  return artifactCardKind(path) ?? 'doc';
}

/**
 * The card carries the picture and nothing else: no filename, no toolbar, no
 * "preview" button (the card *is* the preview entry) and no overflow menu.
 * Actions live in the top-right corner because the bottom strip of a UI
 * screenshot is still content, while the top-right corner is the emptiest part
 * of almost any interface capture (D28 / B19).
 */
export function ArtifactCards({
  items,
  projectId,
  onOpen,
  onPublish,
  onExport,
}: {
  items: ArtifactCardItem[];
  projectId: string;
  onOpen?: ((name: string) => void) | undefined;
  onPublish?: ((name: string, anchorId: string) => void) | undefined;
  onExport?: ((name: string, anchorId: string) => void) | undefined;
}) {
  const anchorScope = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (items.length === 0) return null;
  return (
    <div className="artifact-cards" data-testid="artifact-cards">
      {items.map((item) => (
        <ArtifactCard
          key={item.name}
          item={item}
          projectId={projectId}
          onOpen={onOpen}
          onPublish={onPublish}
          onExport={onExport}
          anchorScope={anchorScope}
        />
      ))}
    </div>
  );
}

function ArtifactCard({
  item,
  projectId,
  onOpen,
  onPublish,
  onExport,
  anchorScope,
}: {
  item: ArtifactCardItem;
  projectId: string;
  onOpen?: ((name: string) => void) | undefined;
  onPublish?: ((name: string, anchorId: string) => void) | undefined;
  onExport?: ((name: string, anchorId: string) => void) | undefined;
  anchorScope: string;
}) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  const src = projectFileUrl(projectId, item.name, workspaceContext);
  const pending = item.pending === true;
  /*
   * 图片:这一轮那张**不可变快照**才是这张卡的正文 —— 卡面、点击、导出三处都读它。
   * 没有快照(旧会话)就回落到工作区当前同名文件,而且**什么都不加**:不出占位、
   * 不写「历史图片不可用」(产品 2026-09-02 推翻了设计文档 §8 里那条占位文案)。
   */
  const mediaSrc = item.snapshotUrl ?? src;
  // Publish is an HTML-only affordance, so a `.png` card carries one button and
  // an `.html` card carries two. The row is flex/end aligned precisely so that
  // unevenness stays right-aligned instead of shifting the export button.
  const canPublish = !pending && item.kind === 'html' && !!onPublish;
  const needsFormatChoice = artifactExportNeedsFormatChoice(item.name);

  return (
    <div
      /* 每张卡自己的 testid 带文件名(见下面那行),所以数卡片要另给一个稳定钩子 */
      data-artifact-card=""
      className={`artifact-card${item.kind === 'video' ? ' artifact-card--video' : ''}${
        pending ? ' is-pending' : ''
      }`}
      data-kind={item.kind}
      data-testid={`artifact-card-${item.name}`}
    >
      <span className="artifact-card-thumb">
        {pending ? (
          /* 还在写:占位不是一块灰,是像素液体(产品 2026-08-26)。
             壳子仍是 `.artifact-card-mini`,竖片卡的 9/16 letterbox 才不会走样。 */
          <span className="artifact-card-mini is-loading">
            <PixelLiquid />
          </span>
        ) : item.coverUrl && item.kind !== 'video' ? (
          /*
           * **当轮的静态首屏截图**(HTML / 原型 / slide / 文档)。
           *
           * 视频**不走这一支**:它的封面挂在下面那个 `<video>` 的 `poster` 上。
           * 换成 `<img>` 会把视频卡的版式一起换掉,而版式这次不动
           * (用户 2026-09-02:「具体的视频产物卡片样式我再问问同事」)。
           *
           * 这是这张卡的正解:它冻结在这一轮,三天后回看这条消息,卡面还是当时
           * 那个样子。点击才去开工作区最新版本 —— 两者不一致是产品要的
           * (2026-09-02:「点击行为就是可能不一致的,预期内的」)。
           *
           * 截图按 1440×900 抓,和卡面 16:10 同比,所以走默认的 `cover`:铺满,
           * 不裁不留边。图片卡那条 `data-preview-fit="contain"` 是为了竖图完整
           * 显示,首屏截图不需要,挂上去反而会在卡里留两条空边。
           */
          <img
            className="artifact-card-media"
            src={item.coverUrl}
            alt=""
            loading="lazy"
          />
        ) : item.kind === 'html' ? (
          /*
           * **没有当轮快照时的降级支** —— 旧会话、截图失败、desktop renderer 不在、
           * 配额满,都走这里:live iframe 显示**最新** html。
           *
           * 产品 2026-09-02:「各种边界情况没有当轮的快照,才是我跟你说的用 live
           * iframe 最新 html 降级方式」。降级必须仍然是一张**正常卡面** ——
           * 不许换成占位或者「预览不可用」那种错误文案(「不允许退回不就一个错误
           * 文案显示在上面了?这感觉更奇怪呢」)。
           */
          <HtmlProjectCoverFrame
            src={src}
            initial=""
            iframeClassName="artifact-card-frame"
            glyphClassName="artifact-card-mini"
            /* 封面还在验、还没挂上 iframe 的那几百毫秒也是 loading —— 同样不许是灰的。
               只有产物卡传这个:首页项目网格是几十张卡,不能一人一块画布。 */
            pendingContent={<PixelLiquid />}
            diagnostic={`${projectId}:${item.name}`}
            /* 产物卡是这条回答的主角,不是背景封面 —— 走**前台泳道**:不受
               「进项目就挂起」约束(否则卡面永远是一块灰),但照样有自己的一份
               并发预算(`ARTIFACT_CARD_LOAD_BUDGET`)。一条消息最多实测过 28 张卡,
               全放开就是 N 个文档同时打 daemon(见 thumbnail-load-gate.ts) */
            ungated
          />
        ) : item.kind === 'doc' ? (
          /* 拿不出预览的产物:卡面写「图标 + 文件名」,不留一块空灰 */
          <span className="artifact-card-doc">
            <Icon name={docCardIcon(item.name)} size={22} />
            <span className="artifact-card-doc-name" title={item.name}>{item.name}</span>
          </span>
        ) : item.kind === 'video' ? (
          /*
           * `poster` 是**当轮的首帧**。没有它的时候浏览器自己去画 `src` 的第一帧
           * —— 画的是**工作区当前那份**,所以文件一被覆盖,老消息里那张卡的首帧
           * 就跟着变了(图片卡当初那个 bug 的视频版)。
           *
           * 元素仍然是 `<video>`:这次只接封面,不动版式。拿不到 poster 就是今天
           * 的行为,不出占位、不写失败文案(产品 2026-09-02)。
           */
          <video
            className="artifact-card-media"
            src={mediaSrc}
            poster={item.coverUrl}
            muted
            preload="metadata"
            playsInline
          />
        ) : (
          <img
            className="artifact-card-media"
            src={mediaSrc}
            alt=""
            loading="lazy"
            data-preview-fit="contain"
          />
        )}
      </span>
      {pending ? (
        <VisuallyHidden role="status">{t('chat.artifact.pending')}</VisuallyHidden>
      ) : null}
      {onOpen && !pending ? (
        <button
          type="button"
          className="artifact-card-open"
          /* 只交文件名:点开的永远是工作区最新那一份,卡面画的是哪一轮不影响它。 */
          onClick={() => onOpen(item.name)}
          aria-label={`${t('assistant.openFile')}: ${item.name}`}
          data-testid={`artifact-card-open-${item.name}`}
        />
      ) : null}
      {pending ? null : (
        <span className="artifact-card-acts">
          {canPublish && onPublish ? (
            <button
              type="button"
              className="artifact-card-act"
              aria-haspopup="menu"
              onClick={() => onPublish(item.name, artifactAnchorId('publish', item.name, anchorScope))}
              data-testid={`artifact-card-publish-${item.name}`}
              {...{ [ARTIFACT_ANCHOR_ATTR]: artifactAnchorId('publish', item.name, anchorScope) }}
            >
              {/* OPEND-2559 supersedes PR7170's text-only share treatment:
                  reuse the same semantic glyph as the right-side Share action,
                  scaled by the card action's 12px icon-box rule. */}
              <RemixIcon name="share-forward-line" size={12} />
              {t('chat.artifact.publish')}
            </button>
          ) : null}
          {needsFormatChoice && onExport ? (
            /* 多格式(今天等价于 HTML):把锚点交出去,由预览区把它本来那块
               导出菜单开在这枚按钮旁边 */
            <button
              type="button"
              className="artifact-card-act"
              aria-haspopup="menu"
              onClick={() => onExport(item.name, artifactAnchorId('export', item.name, anchorScope))}
              data-testid={`artifact-card-export-${item.name}`}
              {...{ [ARTIFACT_ANCHOR_ATTR]: artifactAnchorId('export', item.name, anchorScope) }}
            >
              <ArtifactExportIcon />
              {t('chat.artifact.export')}
            </button>
          ) : (
            /*
             * 单格式:**直接下载原件**,不弹任何东西(产品 2026-08-27)。
             * 这一支原来只在「调用方没给 onExport」时才走;给了 onExport 的时候
             * md / png / mp4 会走进预览区的导出菜单 —— 而那个菜单只发给
             * `HtmlViewer`,对这几类根本收不到,点下去只是把文件打开然后没下文。
             */
            /* 导出下的是**卡面上那一版**:图片有快照就导快照,没有才导当前文件。
               导出一个和卡面不同的版本,是在给人一份他没看见过的东西。 */
            <a
              className="artifact-card-act"
              href={mediaSrc}
              download={item.name}
              data-testid={`artifact-card-export-${item.name}`}
            >
              <ArtifactExportIcon />
              {t('chat.artifact.export')}
            </a>
          )}
        </span>
      )}
    </div>
  );
}

/*
 * 这枚圈中向下箭头逐字取自 `docs/design/chat-panel-next.html`,不走 `Icon`:
 * 它不在 `remix-icon-paths.ts` 那 152 个字形里。尺寸在 CSS 里(12px、
 * inline-start -1px),让圈和字看起来一样高(D39)。
 *
 * Export keeps PR7170's custom circled-down glyph. Share uses the shared
 * `share-forward-line` glyph above; the two actions intentionally retain
 * distinct semantics even though OPEND-2559 now requires both to have icons.
 */
function ArtifactExportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C17.52 2 22 6.48 22 12C22 17.52 17.52 22 12 22C6.48 22 2 17.52 2 12C2 6.48 6.48 2 12 2ZM12 20C16.42 20 20 16.42 20 12C20 7.58 16.42 4 12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20ZM13 12H16L12 16L8 12H11V8H13V12Z" />
    </svg>
  );
}
