// @vitest-environment jsdom
/**
 * 红测(W2):音频产出要能进产物卡,用设计稿组件 24 那条胶囊画。
 *
 * 之前记在 `chat-panel-feedback.md` 里的理由是**错的** —— 那条写着「卡在数据层:
 * 契约里没有波形与时长,要产品+后端立项」。可 `AudioArtifact` 从建起来那天就
 * **不依赖契约**:`durationSec` 拿不到就等 `loadedmetadata`,`samples` 没有就按
 * 时长生成一条稳定的伪采样 —— 这两条都写在它自己的 docblock 里。
 *
 * 真正卡住的只有一处准入:`artifactCardKind()` 对 `.mp3` 返回 null,音频根本进不了
 * 产物列表。组件自己的注释也是这么说的:「要让它出现在产物列表里,还要放开那个
 * 准入判断」。
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileOpsSummary, artifactCardKind } from '../../src/components/FileOpsSummary';
import type { FileOpEntry } from '../../src/runtime/file-ops';

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (k: string) => k }),
  useT: () => ((k: string) => k),
}));

afterEach(() => cleanup());

const entry = (path: string): FileOpEntry =>
  ({ path, ops: ['write'], status: 'done' } as unknown as FileOpEntry);

describe('W2 · 音频产出进得了产物卡', () => {
  it('keeps audio out of the thumbnail-card family', () => {
    /*
     * 用户 2026-08-27 当场指认:「音频产物外面不要套大卡片了啊,只有一个音频的
     * 横的这个就行了呀」。套进产物卡壳里会得到一个 252px 高的空方框,卡壳自带的
     * 〔导出〕浮层还会压住右端的总时长 —— 所以音频**不是**一种卡面。
     */
    expect(artifactCardKind('theme.mp3')).toBeNull();
    expect(artifactCardKind('voice.wav')).toBeNull();
  });

  it('renders a bare capsule with no card shell around it', () => {
    const { container } = render(
      <FileOpsSummary
        entries={[entry('theme.mp3')]}
        projectId="proj-1"
        onRequestOpenFile={vi.fn()}
      />,
    );
    const audio = container.querySelector('[data-testid="file-ops-audio"]');
    expect(audio, '音频压根没画出来').toBeTruthy();
    expect(audio?.querySelector('audio'), '没有用组件 24 那条胶囊画').toBeTruthy();
    // 关键:**不许**有产物卡的壳
    expect(
      container.querySelector('[data-artifact-card]'),
      '又把它套回大卡片里了',
    ).toBeNull();
    // 也不许同时又在下面的文本行里出现一次
    expect(container.textContent?.match(/theme\.mp3/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
