import { useEffect, useState, type ReactNode } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { projectFileUrl } from '../providers/registry';
import type { ProjectFile } from '../types';
import {
  THUMBNAIL_OVERSCAN_MARGIN,
  useArtifactCardLoadSlot,
  useArtifactCardRetention,
  useThumbnailLoadSlot,
} from '../lib/thumbnail-load-gate';
import { useInView } from './plugins-home/useInView';

export type ProjectCoverKind = 'html' | 'image' | 'video' | 'logo';

export interface ProjectCoverOverride {
  kind: ProjectCoverKind;
  name: string;
  mtime?: number;
}

export function coverFromProjectFile(
  file: ProjectFile,
  kind: ProjectCoverKind = file.kind as ProjectCoverKind,
): ProjectCoverOverride | null {
  if (kind !== 'html' && kind !== 'image' && kind !== 'video' && kind !== 'logo') return null;
  return { kind, name: file.path ?? file.name, mtime: file.mtime };
}

export function selectProjectFileCover(files: ProjectFile[]): ProjectCoverOverride | null {
  const html =
    files.find((file) => (file.path ?? file.name) === 'index.html') ??
    files
      .filter((file) => file.kind === 'html')
      .sort((a, b) => b.mtime - a.mtime)[0];
  if (html) return coverFromProjectFile(html, 'html');

  const image = files
    .filter((file) => file.kind === 'image')
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (image) return coverFromProjectFile(image, 'image');

  const video = files
    .filter((file) => file.kind === 'video')
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (video) return coverFromProjectFile(video, 'video');

  return null;
}

export function projectCoverUrl(
  projectId: string,
  name: string,
  version?: number,
  workspaceContext?: WorkspaceCollabContext | null,
): string {
  const url = projectFileUrl(projectId, name, workspaceContext);
  if (!Number.isFinite(version) || version === undefined || version <= 0) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(String(Math.trunc(version)))}`;
}

type CoverProbeOutcome = { ok: true } | { ok: false; reason: string };

/**
 * 一个地址**同一瞬间**只探一次。
 *
 * 这不是缓存 —— map 里放的是「还在飞的那个 promise」,settle 就删掉,下一次挂载
 * 照样重新探。所以文件被删掉、被换掉之后,内存里不会留下一个陈旧的「可用」结论。
 * 它合并的只是**同一刻打向同一个地址的同一个请求**。
 *
 * 为什么需要:同一份产物会在多轮回答里各出一张卡 —— 2026-09-02 实测一个会话里
 * 4 张卡指向同一个 `slow-thinking-one-pager.html`,4 张卡同时挂载,就朝同一个地址
 * 打了 4 次一模一样的 HEAD(那次页面上对这个文件一共 10 条请求,这里占 4 条)。
 *
 * 合并之后不再 abort:一个等待者卸载不能把别的卡的探测一起掐掉,而这条请求本身
 * 只有响应头(实测 300 字节),让它跑完比维护一套引用计数便宜得多。调用方仍然靠
 * `disposed` 挡住卸载后 setState。
 */
const inFlightCoverProbes = new Map<string, Promise<CoverProbeOutcome>>();

function probeCoverOnce(src: string): Promise<CoverProbeOutcome> {
  const existing = inFlightCoverProbes.get(src);
  if (existing) return existing;
  const probe: Promise<CoverProbeOutcome> = fetch(src, { method: 'HEAD', cache: 'no-store' })
    .then((response): CoverProbeOutcome =>
      response.ok || response.status === 304
        ? { ok: true }
        : {
            ok: false,
            reason: `HTML cover unavailable (${response.status} ${response.statusText})`,
          },
    )
    .catch(
      (err): CoverProbeOutcome => ({
        ok: false,
        reason: `failed to verify HTML cover: ${err instanceof Error ? err.message : String(err)}`,
      }),
    )
    .finally(() => {
      inFlightCoverProbes.delete(src);
    });
  inFlightCoverProbes.set(src, probe);
  return probe;
}

/**
 * 还没画出任何东西的 iframe 不该压在加载态上面。
 *
 * `.artifact-card-frame` / `.thumb-iframe` 都是绝对定位,会盖住同一个盒子里在流
 * 内的占位,所以「先别显示」只能靠 `visibility` —— `display: none` 会连带影响
 * `loading="lazy"` 的可见性判定,而这里要的恰恰是**照常加载、先不显示**。
 */
const HIDDEN_UNTIL_LOADED = { visibility: 'hidden' } as const;

/**
 * 「**此刻**在不在视口里」—— 产物卡回收策略要的那个实时信号。
 *
 * 为什么不复用 `useInView`,两条都必须成立:
 *
 * ① 它默认 `once: true`,一进视口就 `disconnect()`,`inView` 从此锁死在 true。
 *    那正是「iframe 永不卸载」的来源,拿它当不了「离开视口」的信号。
 * ② 它只在自己挂载时读一次 `ref.current`,而**这个组件的 DOM 节点是会换掉的**:
 *    加载态是一个 `<span>`,加载完之后只剩 `<iframe>`,那个 span 已经不在文档里。
 *    一个指着脱离文档的节点的观察器会永远报「不可见」—— 等于每张卡一加载完就
 *    立刻被判出局。
 *
 * 所以这里观察的是**宿主节点的父元素**,在产物卡里就是 `.artifact-card-thumb`
 * 那个 16:10 的缩略图盒子:它在整张卡的生命周期里不会换,几何又正好等于卡面。
 *
 * 初值取 `true`(而不是 false):IntersectionObserver 在开始观察时一定会先派发
 * 一条当前状态的记录,所以最迟一帧之内就会被纠正过来。反过来从 false 起步的话,
 * 「已经进视口所以挂了 iframe」和「观察器还没回调」之间会有一小段全员判定为
 * 不可见的窗口,一屏卡会被误卸再立刻挂回来。**宁可多留一帧,不许误卸。**
 */
function useHostVisible(
  enabled: boolean,
  hostRef: { readonly current: Element | null },
): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const node = hostRef.current;
    const host = node?.parentElement ?? node;
    if (!host) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((records) => {
      for (const record of records) setVisible(record.isIntersecting);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [enabled, hostRef]);

  return visible;
}

export function HtmlProjectCoverFrame({
  src,
  initial,
  iframeClassName,
  glyphClassName,
  diagnostic,
  pendingContent,
  ungated = false,
}: {
  src: string | undefined;
  initial: string;
  iframeClassName: string;
  glyphClassName: string;
  diagnostic: string;
  /**
   * 「封面还在路上」时放什么。不传就沿用 `initial`(首字母)—— 首页项目网格是
   * 几十张卡,不能一人一块画布,所以那边一直是首字母 + 底色。
   *
   * 传了的地方(产物卡)要满足两条:数量有界,且它就是当前路由的前台内容。
   * **只在「还没加载出来」时用**,加载失败落回 `initial`:失败不是 loading,
   * 拿一个还在流动的东西去演一个永远不会来的封面,是在骗人。
   */
  pendingContent?: ReactNode;
  /**
   * 走**前台泳道**,而不是首页网格那条背景泳道。**只给「前台主内容」用**。
   *
   * ⚠️ 名字里的 "ungated" 只是说**不受背景那道闸约束** —— 它照样有并发预算
   * (`ARTIFACT_CARD_LOAD_BUDGET`),只是换了一条不会被挂起的泳道。
   *
   * 为什么要换泳道而不是继承:背景那道闸是为首页项目网格建的,几十张卡各开一个
   * iframe 打本地 daemon,会把连接池占满,所以 `App.tsx` 里写着
   * `if (route.kind === 'project') suspendThumbnailLoads()` —— 一进项目就挂起,
   * 背景封面别跟前台抢。可聊天就活在项目路由里,回答里的产物卡**自己就是用户要看
   * 的东西**;让它继承那条挂起,结果是永远拿不到 slot、卡面永远一块灰。
   *
   * 但「不让位」不等于「不限量」:2026-09-02 实测一条 assistant 消息最多产出
   * 28 张卡(13 张 html),900px 视口下不滚动就能一次起飞 16 个文档,而 daemon 的
   * raw 路由是 `Cache-Control: no-cache`,同一个文件的 N 张卡照样打 N 次往返。
   * 所以这条泳道有自己的一份预算,理由写在 `ARTIFACT_CARD_LOAD_BUDGET` 上。
   *
   * 传这个的地方要满足一条:它就是当前路由的前台内容。
   */
  ungated?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [verified, setVerified] = useState(false);
  /**
   * 文档真的 load 完了没有 —— **不是**「HEAD 探通了没有」。
   *
   * 这两件事今天差得很远:HEAD 实测几十毫秒就回来,而 iframe 里那份文档要多久
   * 画出第一个像素,取决于它自己 `<head>` 里那些外链。2026-09-02 现场那份产物挂
   * 着一条 render-blocking 的 `<script src="https://cdn.tailwindcss.com">`,那个
   * 域名在这台机器上打不通(curl 70s 超时、零字节),解析器就一直卡在那儿 ——
   * 卡面于是空白了 6~59 秒。
   */
  const [loaded, setLoaded] = useState(false);
  // Cover work is deferred until the card is near the viewport, and the
  // iframe document load itself is budgeted by the shared thumbnail gate so a
  // large grid cannot saturate the daemon connection pool (Batch A §4.2).
  const { ref: inViewRef, inView } = useInView<HTMLSpanElement>({
    rootMargin: THUMBNAIL_OVERSCAN_MARGIN,
  });

  /*
   * 谁参与回收:**聊天里的产物卡**,两个条件都要。
   *
   * · `ungated` —— 就是前台泳道那批,也就是 `ARTIFACT_CARD_RETAIN_BUFFER` 那条
   *   注释里算的那个人群。首页/设计页的项目网格不参与:那条泳道自己有「进项目
   *   就整体挂起」,再叠一层回收只会互相打架。
   * · `pendingContent != null` —— 卸下来之后**得有一张正常卡面可放**。产物卡放的
   *   是像素液体(产品 2026-08-26);而项目网格没有加载态可放,它的 CSS 本来就把
   *   首字母藏了,卸掉就是一块空灰 —— 那是产品 2026-09-02 明确否掉的形状。
   *   所以这条不是保险丝,是准入条件。
   */
  const recyclable = ungated && pendingContent != null;
  const hostVisible = useHostVisible(recyclable, inViewRef);
  const retained = useArtifactCardRetention(recyclable, hostVisible);
  /*
   * 该不该挂着 iframe。`inView` 只说「进过视口」(它一进就锁死),`retained` 说
   * 「LRU 缓冲区还留着它吗」。回收就发生在后者翻成 false 的那一刻:iframe 卸掉、
   * 卡面回到加载态;滚回来时 `retained` 再翻回 true,重新验一遍、重新排队、重新挂。
   */
  const live = inView && retained;

  useEffect(() => {
    if (!src || !live) {
      setFailed(false);
      setVerified(false);
      setLoaded(false);
      return;
    }

    let disposed = false;

    setFailed(false);
    setVerified(false);
    setLoaded(false);

    void probeCoverOnce(src).then((outcome) => {
      if (disposed) return;
      if (outcome.ok) {
        setVerified(true);
        return;
      }
      console.warn(`[project-cover] ${outcome.reason}:`, diagnostic);
      setFailed(true);
    });

    return () => {
      disposed = true;
    };
  }, [src, diagnostic, live]);

  /*
   * 两条泳道都无条件挂 hook(顺序稳定),但同一刻只有一条在要槽位。
   * 前台那条不响应 `suspendThumbnailLoads()`,背景那条响应 —— 这正是当初
   * 「有预算」和「会被挂起」被捆在一起时唯一解不开的那个结。
   */
  const wantsSlot = Boolean(src) && live && verified && !failed;
  const backgroundSlot = useThumbnailLoadSlot(!ungated && wantsSlot);
  const foregroundSlot = useArtifactCardLoadSlot(ungated && wantsSlot);
  const { canLoad, settle } = ungated ? foregroundSlot : backgroundSlot;

  if (!src || failed) {
    return (
      <span ref={inViewRef} className={glyphClassName}>
        {initial}
      </span>
    );
  }

  /*
   * 「挂上 iframe」和「画出来了」之间那一段,卡面放什么。
   *
   * 只有**给了 `pendingContent` 的调用方**才留住加载态:`pendingContent` 的契约
   * 就是「还没加载出来时放什么」,没给的调用方(首页/设计页的项目网格)在这一段
   * 只有首字母可放,而那两个网格的 CSS 本来就把首字母藏了
   * (`.project-thumb-html .project-thumb-glyph { display: none }`),留住它等于
   * 什么都不放。所以网格保持今天的行为,改的只有产物卡。
   */
  const keepsPendingFaceUntilLoaded = pendingContent != null;
  const pendingFace = (
    <span
      ref={inViewRef}
      className={pendingContent ? `${glyphClassName} is-loading` : glyphClassName}
    >
      {pendingContent ?? initial}
    </span>
  );

  /*
   * 排队等槽位的那一段和「还没验完」是同一件事:**还没加载出来**。所以两者
   * 落在同一张脸上 —— 产物卡是像素液体,项目网格是它本来的首字母 + 底色。
   * 不出占位、不出「预览不可用」(产品 2026-09-02 否掉)。
   */
  if (!verified || !canLoad) return pendingFace;

  const holdingPendingFace = keepsPendingFaceUntilLoaded && !loaded;

  return (
    <>
      {/*
       * 文档还没 load 完之前,卡面留在**加载态**,而不是把一个一个像素都还没画的
       * iframe 亮出来 —— 那块 `background: var(--bg-panel)` 就是用户报的「产物卡片
       * 长时间空白」(2026-09-02 实测 6~21 秒,用户那次 59 秒)。
       *
       * iframe 照常挂载、照常加载,只是先不显示。降级的**产品行为没有动**:这里
       * 放的仍然是那张显示最新 html 的 live iframe,没有占位文案、没有「预览不可
       * 用」、没有灰块 —— 加载态本来就是产品选的像素液体。变的只是「什么时候算加
       * 载完」,从 HEAD 探通(几十毫秒)挪到文档真的 load,也就是 `pendingContent`
       * 自己的注释一直写着的那条:「只在「还没加载出来」时用」。
       */}
      {holdingPendingFace ? pendingFace : null}
      <iframe
        className={iframeClassName}
        src={src}
        title=""
        loading="lazy"
        sandbox="allow-scripts"
        tabIndex={-1}
        style={holdingPendingFace ? HIDDEN_UNTIL_LOADED : undefined}
        onLoad={() => {
          settle();
          setLoaded(true);
        }}
        onError={() => {
          settle();
          console.warn('[project-cover] failed to load HTML cover:', diagnostic);
          setFailed(true);
        }}
      />
    </>
  );
}
