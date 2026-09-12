// @vitest-environment jsdom
/**
 * W93 验证用红测 —— OPEND-2585 **已修的那一半**
 * 「批量上传文件进入项目后缺少加载反馈」
 *
 * 从首页带着一批附件按下发送,项目页开出来之前先过一屏「准备中」。视频里那一屏
 * 只有一句提示词、一个「准备中」,附件一张都看不见 —— 用户读到的是「什么都没发生」。
 *
 * 文件本来就在这个 tab 里(选文件时拿到的 `File` 对象),画出来一个请求都不用发。
 * 这条钉的就是这件事:准备中那一屏必须当场把附件画出来。
 *
 * 「长时间空白」的另一半在 `w93-2585-upload-blocks-project-view.test.tsx`,那条在
 * HEAD 上仍然是红的。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '../../src/i18n';
import { ProjectCreationPendingView } from '../../src/components/ProjectCreationPendingView';
import type { Project } from '../../src/types';

afterEach(cleanup);

const PROJECT = {
  id: 'p-2585',
  name: '我上传了多少个文件',
  skillId: null,
  designSystemId: null,
  createdAt: 1_756_000_000_000,
  updatedAt: 1_756_000_000_000,
} as unknown as Project;

/** 视频里那一批:5 张图 + 1 个文档 */
const STAGED = [
  new File([new Uint8Array(320)], '暗青色石板.png', { type: 'image/png' }),
  new File([new Uint8Array(210)], '蓝色的风.png', { type: 'image/png' }),
  new File([new Uint8Array(252)], '蓝色格栅纸.png', { type: 'image/png' }),
  new File([new Uint8Array(4_500)], '菠萝蜜_jac.jpeg', { type: 'image/jpeg' }),
  new File([new Uint8Array(4_700)], '梨花.png', { type: 'image/png' }),
  new File([new Uint8Array(1_400)], '苹果耳机.txt', { type: 'text/plain' }),
];

function renderPending() {
  return render(
    <I18nProvider initial="zh-CN">
      <ProjectCreationPendingView
        project={PROJECT}
        prompt="我上传了多少个文件"
        files={STAGED}
        agentId="claude"
      />
    </I18nProvider>,
  );
}

describe('OPEND-2585 · 准备中那一屏的加载反馈', () => {
  it('先证量法看得见:这一屏确实渲染出来了,提示词也在', () => {
    const { getByTestId } = renderPending();
    expect(getByTestId('project-creation-pending-view')).toBeTruthy();
    expect(getByTestId('project-creation-pending-view').textContent)
      .toContain('我上传了多少个文件');
  });

  it('用户刚选的那批附件当场就在屏幕上,不等上传', () => {
    const { getByTestId } = renderPending();
    const row = getByTestId('pending-attachment-row');
    // 一个附件一张卡,一张不少
    expect(row.children).toHaveLength(STAGED.length);
    // 图片走本地字节(object URL),不是 `/api/projects/:id/raw` —— 上传还没开始
    const imgs = [...row.querySelectorAll('img')];
    expect(imgs).toHaveLength(5);
    for (const img of imgs) {
      expect(img.getAttribute('src') ?? '').toMatch(/^(blob:|data:)/);
    }
    // 非图片那张画出文件名
    expect(row.textContent).toContain('苹果耳机');
  });
});
