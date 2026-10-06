/**
 * 音频产物(设计稿组件 24 · 第 43 / 44 格)。
 *
 * 一条胶囊:图标 + 已播时长 + 波形 + 总时长,右边一颗播放键、一颗下载。
 * 播放中已播那截的竖条换成实色(第 44 格)。
 *
 * 建这个之前 chat 面板里**零音频 UI** —— 产品唯一的播放器是 `FileViewer` 的原生
 * `<audio controls>`,而且 `artifactCardKind()` 对 `.mp3` / `.wav` 直接返回 null,
 * 音频根本进不了产物卡。这一层只负责画与播;要让它出现在产物列表里,
 * 还要放开那个准入判断(记在 T41)。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../Icon';
import { ChatPlayIcon } from './primitives/icons';
import { useT } from '../../i18n';
import { fallbackWave, formatClock, playedBars } from '../../runtime/chat/audio-wave';
import styles from './AudioArtifact.module.css';

export interface AudioArtifactProps {
  src: string;
  name: string;
  /** 总时长(秒)。拿不到就等 `loadedmetadata` */
  durationSec?: number;
  /** 真采样。没有就按时长生成一条稳定的伪采样(契约里还没有波形数据,T17) */
  samples?: number[];
  /**
   * 竖条数量。稿子那一条 406px 宽的卡是 **28** 条(`--i:0` … `--i:27`,数过)。
   * 这个数不是随便取的:3px 柱 + 3px 间距,28 条正好铺满 `.wave` 那一段净宽;
   * 给多了会被 `overflow: hidden` 从右边裁掉,波形看着像被切了一刀。
   */
  bars?: number;
  onDownload?: () => void;
  /** 陈列页 / 测试用:直接摆出播放中的样子,不真的播 */
  previewCurrentSec?: number;
  previewPlaying?: boolean;
}

export function AudioArtifact({
  src,
  name,
  durationSec,
  samples,
  bars = 28,
  onDownload,
  previewCurrentSec,
  previewPlaying,
}: AudioArtifactProps): ReactElement {
  const t = useT();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [current, setCurrent] = useState(previewCurrentSec ?? 0);
  const [playing, setPlaying] = useState(previewPlaying ?? false);

  const wave = useMemo(
    () => (samples && samples.length > 0 ? samples.slice(0, bars) : fallbackWave(duration || 30, bars)),
    [samples, bars, duration],
  );
  const lit = playedBars(current, duration, wave.length);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onMeta = () => setDuration(el.duration || 0);
    const onTime = () => setCurrent(el.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onPause);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onPause);
    };
  }, []);

  return (
    <div className={styles.aud} data-testid="chat-audio-artifact" data-playing={playing ? '' : undefined}>
      <div className={styles.inner}>
        <span className={styles.icon}>
          <Icon name="volume" size={15} />
        </span>
        <span className={styles.time}>{formatClock(current)}</span>
        <span className={styles.wave} aria-hidden>
          {wave.map((h, i) => (
            <i
              key={i}
              className={i < lit ? styles.on : undefined}
              /*
               * `--h` 是这根柱子多高(采样值),`--i` 是它排第几根。
               * 后者只为起伏那条动画服务:CSS 用 `calc(var(--i) * 18ms)` 把每根
               * 的起点错开。不写它的话整排柱子会齐步走 —— 看着像一整块在呼吸,
               * 不像一条波形。稿子的静态 DOM 里两个变量也是并排写在 style 上的。
               */
              style={{ ['--h' as string]: String(h), ['--i' as string]: String(i) }}
            />
          ))}
        </span>
        <span className={`${styles.time} ${styles.timeEnd}`}>{formatClock(duration)}</span>
        {/*
         * 播放键在白行【里面】(稿子的 `.aud-b` 是 `.aud-in` 的最后一个孩子)。
         * 它操作的是这段音频本身 —— 播 / 停,属于内容;挂到白行外面会让白行
         * 右端凭空短一截,而那一截是外层灰底。
         * 下面那颗下载键相反:它拿的是整条附件,不是音频里的某一段,所以留在外面
         * (稿子那个位置是「×」,2026-08-27 裁决换成下载原件)。
         */}
        <button
          type="button"
          className={styles.play}
          onClick={toggle}
          aria-label={playing ? t('chat.audio.pause') : t('chat.audio.play')}
        >
          {playing ? (
            <Icon name="pause" size={12} />
          ) : (
            <span className={styles.playGlyph}>
              <ChatPlayIcon size={12} />
            </span>
          )}
        </button>
      </div>
      <button type="button" className={styles.download} onClick={onDownload} aria-label={t('chat.audio.download', { name })}>
        <Icon name="download" size={14} />
      </button>
      {/* 真正出声的那一个。波形是画的,进度靠它的 timeupdate 驱动 */}
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: 'none' }} />
    </div>
  );
}
