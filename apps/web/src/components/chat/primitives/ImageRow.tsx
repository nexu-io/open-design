/**
 * 生图行 —— 组件 12。
 *
 * ⚠️ 这里原来写着「执行记录里**唯一**『没跑完也要显形』的一行(D3 的例外)」。
 * **D3 已作废**(产品 2026-09-02,OPEND-2419:「调用时不管成功没,都要立刻渲染」;
 * 实现见 `e8bd2a726d`,规格 `chat-panel-next.md:419` 已标注)——现在**每一行**都是
 * 调用发出去就落行,生图行不再是例外。
 *
 * 它仍然特殊的地方只剩一条:**格子数是先验的**。要出几张从命令里数得出来
 * (`media generate` 出现几次就是几张),所以第一张还没回来时就知道摆几个格子,
 * 「出一张落一张」才成立。别的工具调用没有这种先验,进行中那一档只能画一行,
 * 画不出「还剩几个」。
 *
 * 三种样子的切换时机是设计同学定的(D34):
 *   还没出完      球 + 「N/M」+ 一排大格,没出的格是占位
 *   全出完、没失败 收成一行 + 小缩略图条 + 耗时
 *   出完了有失败   仍是大格,失败那格给「重试」,**不收行** —— 收了就没地方放重试
 *
 * 失败那格自己还分两态,由「这一轮还活着吗」决定 —— 见 `retryHandlerFor`。
 */
import type { ReactElement } from 'react';
import { VisuallyHidden } from '@open-design/components';
import { useT } from '../../../i18n';
import type { ImageRow as ImageRowData } from '../../../runtime/chat/contract';
import { formatElapsed } from '../../../runtime/chat/format';
import { PixelLiquid } from '../../PixelLiquid';
import { AudioIcon, FailIcon, ImageIcon, RetryIcon, VideoIcon } from './icons';
import { StatusMark } from './StatusMark';
import styles from './record.module.css';

/**
 * 这一行按哪一类媒体说话(OPEND-2625)。
 *
 * 三件事都得跟着 `row.surface` 换,少换一件就有一半在说谎:
 *   `batch` / `count`  文案与计数单位 —— 「生成配套插图 · 1 张」摆在一段音频上,
 *                      用户根本无从判断刚才在生成什么
 *   `icon`             行首那一格
 *   `preview: 'image'` 这一格能不能真的用 `<img>` 装
 *
 * 最后一条是**破图的来源**:`<img src="…/line.mp3">` 浏览器加载不动,给出来的
 * 是一枚碎图标 —— 读起来像「生成失败了」,而那次生成其实是成功的。
 * 音频 / 视频这一格改画字形:它如实说「这里有一段音频 / 视频」,不假装有一帧画面。
 * (真正的音频播放器是 `AudioArtifact`,那是打开产物之后的事,不是记录行的活。)
 */
type MediaSurface = ImageRowData['surface'];

interface SurfaceCopy {
  batch: 'chat.record.imageBatch' | 'chat.record.audioBatch' | 'chat.record.videoBatch';
  count: 'chat.record.imageCount' | 'chat.record.audioCount' | 'chat.record.videoCount';
  pendingNote: 'chat.record.imagePending' | 'chat.record.audioPending' | 'chat.record.videoPending';
  view: 'chat.record.viewImage' | 'chat.record.viewAudio' | 'chat.record.viewVideo';
  icon: () => ReactElement;
  preview: 'image' | 'glyph';
}

const SURFACE_COPY: Record<MediaSurface, SurfaceCopy> = {
  image: {
    batch: 'chat.record.imageBatch',
    count: 'chat.record.imageCount',
    pendingNote: 'chat.record.imagePending',
    view: 'chat.record.viewImage',
    icon: ImageIcon,
    preview: 'image',
  },
  audio: {
    batch: 'chat.record.audioBatch',
    count: 'chat.record.audioCount',
    pendingNote: 'chat.record.audioPending',
    view: 'chat.record.viewAudio',
    icon: AudioIcon,
    preview: 'glyph',
  },
  video: {
    batch: 'chat.record.videoBatch',
    count: 'chat.record.videoCount',
    pendingNote: 'chat.record.videoPending',
    view: 'chat.record.viewVideo',
    icon: VideoIcon,
    preview: 'glyph',
  },
};

export interface ImageRowProps {
  row: ImageRowData;
  /** 重试第 n 张(从 0 数)。不给就只画不点 —— 与工具行的「失败」按钮同一条约定 */
  onRetry?: (row: ImageRowData, index: number) => void;
  /** 点缩略图看大图 */
  onOpenImage?: (path: string, index: number) => void;
  /** Resolve a project-relative output name to its authenticated preview URL. */
  imageSrc?: (path: string) => string;
  /**
   * 这一轮还在跑吗 —— 决定两件事:**还没回来的格子**画成哪一档标记,
   * 以及**失败的格子**给不给动手重试(见 `retryHandlerFor`)。
   *
   * `row.pending` 说的是「还有格子没回来」,不是「还在生成」。取消 / 失败之后那几张
   * 确实没回来,但轮次已经停了,再转下去就读成「还在生成」(和 `ToolRow` 同一个 bug)。
   * 默认 false:拿不到上下文时宁可画中性灰,也不要一颗停不下来的球。
   */
  running?: boolean;
}

export function ImageRow({ row, onRetry, onOpenImage, imageSrc, running = false }: ImageRowProps): ReactElement {
  const t = useT();
  const settled = !row.pending && row.done + row.failed >= row.total;
  /* 这一行说哪一类媒体的话 —— 见 `SURFACE_COPY` 的说明 */
  const copy = SURFACE_COPY[row.surface] ?? SURFACE_COPY.image;
  const SurfaceIcon = copy.icon;
  /**
   * 一个已出产物的格子里画什么。
   *
   * 图片才走 `<img>`;音频 / 视频画字形 —— **不许**把非图片的路径塞进 `src`
   * (那正是真机上那枚破图)。拿不到 `imageSrc`(静态镜像、陈列页)时同样退回
   * 空占位,和从前一致。
   */
  const preview = (path: string | undefined): ReactElement => {
    if (copy.preview === 'glyph') {
      return <span className={`${styles.mini} ${styles.glyph}`}><SurfaceIcon /></span>;
    }
    return path && imageSrc
      ? <img className={styles.mini} src={imageSrc(path)} alt="" loading="lazy" />
      : <span className={styles.mini} />;
  };

  /* 全出完且一张没砸:收成一行 */
  if (settled && row.failed === 0) {
    return (
      <div className={styles.tool}>
        <span className={styles.icon}><SurfaceIcon /></span>
        <span className={styles.name}>
          {t(copy.batch)} · {t(copy.count, { count: row.total })}
        </span>
        <span className={styles.strip}>
          {Array.from({ length: row.total }, (_, i) => {
            const path = row.thumbs[i];
            const label = t(copy.view, { index: i + 1 });
            return (
              /* 稿子 `729fa43ce7` 的 `src/components.css:2533-2534` 把理由写死了:
                 「.th 是 button 不是 span:有 hover、有键盘焦点、**有 tip**。
                 26×34 已经小到看不出内容了,tip 是它唯一能自报家门的方式」。
                 —— `aria-label` 只有读屏听得到,用眼睛的人反而没有,所以这里
                 两条都给:带序号的那句给读屏,常量「查看大图」给气泡
                 (`src/body-components.html:1041` `data-tip="查看大图"`)。
                 ⚠️ 「查看大图」只对图片成立 —— 一段音频没有「大图」可看,气泡照搬
                 就是又一句替 agent 编的话。音视频的气泡直接用那句带序号的说明。 */
              <button
                key={i}
                type="button"
                className={`${styles.th} od-tooltip`}
                aria-label={label}
                data-tooltip={copy.preview === 'image' ? t('chat.record.viewLarge') : label}
                onClick={path && onOpenImage ? () => onOpenImage(path, i) : undefined}
              >
                {preview(path)}
              </button>
            );
          })}
        </span>
        {formatElapsed(row.elapsedMs) ? <span className={styles.meta}>{formatElapsed(row.elapsedMs)}</span> : null}
      </div>
    );
  }

  /* 还在出,或者出完了有失败:大格形态 */
  return (
    <>
      <div className={styles.tool}>
        {row.pending
          ? <StatusMark status={running ? 'running' : 'pending'} />
          : <span className={styles.icon}><SurfaceIcon /></span>}
        <span className={styles.name}>{t(copy.batch)}</span>
        <span className={`${styles.meta} ${styles.num}`}>{row.done}/{row.total}</span>
        {/*
          * 耗时(**有意偏离设计稿**,产品 2026-09-03)。稿子给大格这一档只画了
          * 「球 + 『生成配套插图 2/4』+ 一排大格」,耗时要等收成一行那一档才出现。
          * 2026-09-02 那次「进行中的行也报耗时」的裁决当时只覆盖思考中 / 工具行 /
          * 步骤行(见 `ToolRow.tsx` 文件头),生图行漏在外面 —— 而它恰恰是最慢的
          * 一类动作,几分钟里这一行上一个数字都没有。产品 2026-09-03 口述补齐范围:
          * 「工具调用最好都有显示的逐渐增长的计时,**尽可能所有都有**,包括 thinking,
          * 这样用户能感受到当前哪里卡住了」。
          *
          * 秒数不在这一层算,也没有新起定时器:`build-turn-blocks` 用轮次共用的
          * `liveEndMs` 算进 `row.elapsedMs`,这里照旧只画。拿不到就整个不画 ——
          * 不用 `0.0s` 顶上(§2.2b)。
          * ⚠️ 不许挂 `aria-live`:挂了读屏会每秒念一遍。
          */}
        {formatElapsed(row.elapsedMs)
          ? <span className={styles.meta}>{formatElapsed(row.elapsedMs)}</span>
          : null}
      </div>
      <div className={styles.imgs}>
        {Array.from({ length: row.total }, (_, i) => {
          const cell = row.cells?.[i];
          const status = cell?.status ?? (i < row.done
            ? 'done'
            : i < row.done + row.failed ? 'failed' : 'pending');
          if (status === 'done') {
            const path = cell?.path ?? row.thumbs[i];
            return (
              <button
                key={i}
                type="button"
                className={styles.shot}
                data-image-cell="done"
                aria-label={t(copy.view, { index: i + 1 })}
                onClick={path && onOpenImage ? () => onOpenImage(path, i) : undefined}
              >
                {preview(path)}
              </button>
            );
          }
          if (status === 'failed') {
            const retry = retryHandlerFor(running, onRetry);
            return (
              <span
                key={i}
                className={`${styles.shot} ${styles.fail}`}
                data-image-cell="failed"
                data-fail-state={retry ? 'retryable' : 'locked'}
              >
                {retry
                  ? (
                    <button type="button" className={styles.retry} onClick={() => retry(row, i)}>
                      <RetryIcon />{t('chat.record.retry')}
                    </button>
                  )
                  : (
                    <span className={styles.failNote}>
                      <FailIcon />{t('chat.record.failed')}
                    </span>
                  )}
              </span>
            );
          }
          /* 还没出来的格子:设计稿的「像素液体」。这一格什么都还没有,底下没有图
             可以糊,所以液体不指向任何一张具体的图 —— 它只说「这里在动、东西还在长」。
             静止的灰块说不出这句话,产品 2026-08-26 明令不许再用。 */
          return (
            <span key={i} className={`${styles.shot} ${styles.load}`} data-image-cell="loading">
              <PixelLiquid />
              <VisuallyHidden role="status">{t(copy.pendingNote)}</VisuallyHidden>
            </span>
          );
        })}
      </div>
    </>
  );
}

/**
 * **失败格什么时候才真的能重试** —— 拿到处理器就摆按钮,拿不到就只画状态。
 *
 * 两个条件都得成立,少一个都会摆出一枚点了没反应的假按钮:
 *
 *   `!running`   这一轮已经停了。OPEND-2544 挡的是**并发**:agent 自己还在切
 *                provider 重试的时候,用户再手动重试一张,两边打架。轮次一停,
 *                那个对手就不存在了。注意判据是「还活着吗」,**不是「成功了吗」**
 *                —— 取消 / 跑挂之后同样该给重试(整批不想要了但这一张还想要,
 *                是取消之后最常见的下一步)。仓库既有的接线也正是这一档:
 *                `AssistantMessage` 传的 `isTerminalRunStatus()` 含 `canceled`
 *                和 `failed`。
 *   `onRetry`    宿主接了重发这一路动作。陈列页、纯静态镜像都没有。
 *
 * 返回处理器而不是 boolean,是为了让调用点拿到**收窄过**的函数:
 * `retry && <button onClick={() => retry(...)}>` 不需要再补一次 `?.`,
 * 也就不会出现「条件判了 A、调用的是 B」这种漂移。
 */
function retryHandlerFor(
  running: boolean,
  onRetry: ImageRowProps['onRetry'],
): NonNullable<ImageRowProps['onRetry']> | undefined {
  return running ? undefined : onRetry;
}
