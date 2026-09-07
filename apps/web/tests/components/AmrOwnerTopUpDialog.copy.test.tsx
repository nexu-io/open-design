// @vitest-environment jsdom
/**
 * T56 / T57(产品口述 2026-09-06):「找所有者充值」弹窗改成产品文档第四节的
 * **正式文案**,并且**只留一颗按钮**。
 *
 * 产品原话:「不要保留,严格按产品稿,不要私自发挥」——「复制请求」那颗主按钮
 * 及其复制逻辑整个删掉。
 *
 * ⚠️ 这条测试**推翻**了 `ProjectView.amr-balance-branches.test.tsx` 里那条
 * 「成员的弹窗上不能只有一颗『暂不需要』」(§6.Y 死胡同的出口)。删掉复制按钮
 * 之后这一档回到**单出口**,产品知情并明确要求。
 *
 * 文案的两个变体(T57,产品已批):Owner 名字拿得到就插名字,拿不到就换成
 * 角色名 —— **只换插值那一处,其余逐字不动**。
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AmrOwnerTopUpDialog } from '../../src/components/chat/AmrOwnerTopUpDialog';
import { I18nProvider } from '../../src/i18n';

function renderDialog(props: { ownerName?: string | null } = {}) {
  return render(
    <I18nProvider>
      <AmrOwnerTopUpDialog inline onClose={() => {}} {...props} />
    </I18nProvider>,
  );
}

/**
 * 按**整段可读文本**找那句话,而不是 `getByText(字符串)`。
 *
 * ⚠️ 断言的字符**一个都没动** —— 变的只有量法。原因:2026-09-07 产品稿把
 * Owner 名字单独加粗一档(`.owner-name { font-weight: 700 }`),那一段于是成了
 * 自己的 `<strong>`,整句被拆成三个节点。而 `getByText` 默认的 `getNodeText`
 * **只拼元素的直接文本子节点**,`<strong>` 里的名字会被漏掉 —— 同一句话原样
 * 渲染在屏幕上,断言却报「找不到」。
 *
 * 换成读 `textContent` 之后这条守卫反而更紧:它现在同时挡住「文案被改」和
 * 「文案被拆坏(多出空格 / 少一段 / 顺序反了)」两类退化。
 */
function textOf(text: string) {
  return screen.getByText(
    (_content, element) =>
      element?.tagName === 'P' && element.textContent === text,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  // 产品稿是中文原件,判据就钉在中文上;其余 18 个 locale 是它的忠实翻译。
  window.localStorage.setItem('open-design:locale', 'zh-CN');
  window.localStorage.setItem('open-design:locale-source', 'manual');
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('AmrOwnerTopUpDialog 的正式文案', () => {
  it('标题逐字照产品稿', () => {
    renderDialog();
    expect(screen.getByText('请联系团队所有者充值')).toBeTruthy();
  });

  it('拿得到 Owner 名字时把名字插进去', () => {
    renderDialog({ ownerName: '张三' });
    expect(
      textOf('当前仅团队所有者可以为团队充值，请联系「张三」完成充值后再继续使用。'),
    ).toBeTruthy();
  });

  /**
   * 现在走的就是这一条:契约里唯一的 owner 名是 `CollabProject.ownerDisplayName`
   * (项目级,注释逐字 "STUB: the real name source is B's member roster"),
   * `WorkspaceCollabContext` 上根本没有工作区 owner 名。
   */
  it.each([undefined, null, '', '   '])(
    '拿不到名字(%s)时换成角色名,其余逐字不动',
    (ownerName) => {
      renderDialog({ ownerName: ownerName as string | null | undefined });
      expect(
        textOf('当前仅团队所有者可以为团队充值，请联系团队所有者完成充值后再继续使用。'),
      ).toBeTruthy();
    },
  );
});

describe('AmrOwnerTopUpDialog 只有一颗按钮', () => {
  it('「复制请求」整颗不在了', () => {
    renderDialog();
    expect(screen.queryByTestId('amr-balance-owner-copy')).toBeNull();
    expect(screen.queryByText('复制请求')).toBeNull();
    expect(screen.queryByText('已复制')).toBeNull();
  });

  /**
   * 单出口是这次裁决的**代价**,所以正面钉住它:弹窗里除了标题行那颗关闭图标
   * 之外,动作区**只有「知道了」这一颗**。
   */
  it('动作区只剩「知道了」', () => {
    const { container } = renderDialog();
    const dialog = screen.getByTestId('amr-balance-owner-dialog');
    const actionLabels = [...dialog.querySelectorAll('button')]
      .map((button) => button.textContent?.trim() ?? '')
      .filter((label) => label.length > 0);
    expect(actionLabels).toEqual(['知道了']);
    // 那句「可以直接发给所有者的话」是复制机制的载荷,一并撤掉。
    expect(container.textContent).not.toContain('Open Design 控制台');
  });
});
