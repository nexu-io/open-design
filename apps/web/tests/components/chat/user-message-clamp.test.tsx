// @vitest-environment jsdom
/**
 * 组件 1 · 用户消息-文本(第 46 / 47 格):超长消息折到 6 行 + 「查看全部」。
 *
 * 这里要钉住的是一条规矩:**只在真的被截断时才出展开入口**。
 * 同一段话在宽一点的面板里可能六行就说完了 —— 那时候还挂一枚「…」,
 * 是在说一句不存在的下文。判断靠量 `scrollHeight - clientHeight`,
 * jsdom 不做布局,所以这里把这两个值直接摆出来。
 *
 * 第 47 格(hover)在稿子里没有任何匹配规则,与第 46 格无可见差异,
 * 所以两格当同一态做,不单独断言。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UserMessageImpl } from '../../../src/components/ChatPane';

/** 让下一次渲染里所有元素都「被截断 / 没被截断」。jsdom 两个值恒为 0。 */
function stubOverflow(cut: boolean): () => void {
  const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  const client = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => (cut ? 264 : 132),
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 132,
  });
  return () => {
    if (scroll) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scroll);
    if (client) Object.defineProperty(HTMLElement.prototype, 'clientHeight', client);
  };
}

const t = ((key: string) => key) as never;

const LONG = '把这一屏重做成能跑的原型,再加一个视觉风格一致的设置页,两页共用同一套间距和圆角。'.repeat(6);

function renderMessage(content: string) {
  return render(
    <UserMessageImpl
      message={{ id: 'm1', role: 'user', content, createdAt: Date.UTC(2026, 7, 20) } as never}
      projectId="p1"
      t={t}
      appliedContextItems={[]}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('用户气泡 · 超长折行', () => {
  it('真的被截断时才出「查看全部」和文末那枚「…」', () => {
    const restore = stubOverflow(true);
    try {
      renderMessage(LONG);
      expect(screen.getByTestId('user-text-view-all')).toBeTruthy();
      expect(screen.getByTestId('user-text-more')).toBeTruthy();
    } finally {
      restore();
    }
  });

  it('没被截断就一个入口都不出 —— 不说一句不存在的下文', () => {
    const restore = stubOverflow(false);
    try {
      renderMessage('把导出按钮做大一点');
      expect(screen.queryByTestId('user-text-view-all')).toBeNull();
      expect(screen.queryByTestId('user-text-more')).toBeNull();
    } finally {
      restore();
    }
  });

  it('点「查看全部」展开全文,展开后入口还在(可以再收回去)', () => {
    const restore = stubOverflow(true);
    try {
      renderMessage(LONG);
      const toggle = screen.getByTestId('user-text-view-all');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');

      fireEvent.click(toggle);
      expect(screen.getByTestId('user-text-view-all').getAttribute('aria-expanded')).toBe('true');
      // 文末那枚「…」是「这里被截断了」的记号,展开之后没有可截的了
      expect(screen.queryByTestId('user-text-more')).toBeNull();
      // 全文仍在 DOM 里,只是不再被 clamp 住
      expect(screen.getByText(LONG)).toBeTruthy();

      fireEvent.click(screen.getByTestId('user-text-view-all'));
      expect(screen.getByTestId('user-text-view-all').getAttribute('aria-expanded')).toBe('false');
      expect(screen.getByTestId('user-text-more')).toBeTruthy();
    } finally {
      restore();
    }
  });

  it('文末那枚「…」自己也能展开', () => {
    const restore = stubOverflow(true);
    try {
      renderMessage(LONG);
      fireEvent.click(screen.getByTestId('user-text-more'));
      expect(screen.getByTestId('user-text-view-all').getAttribute('aria-expanded')).toBe('true');
    } finally {
      restore();
    }
  });
});

describe('用户消息 · 时间与附件', () => {
  it('发送时间渲染成 HH:mm(数据一直都在,只是以前没渲染)', () => {
    const restore = stubOverflow(false);
    try {
      const at = new Date(2026, 7, 20, 14, 31).getTime();
      render(
        <UserMessageImpl
          message={{ id: 'm1', role: 'user', content: '把导出按钮做大一点', createdAt: at } as never}
          projectId="p1"
          t={t}
          appliedContextItems={[]}
        />,
      );
      expect(screen.getByText('14:31')).toBeTruthy();
    } finally {
      restore();
    }
  });

  it('图卡不挂文件名也不挂序号;文档卡挂名字 —— 名字是它唯一的身份', () => {
    const restore = stubOverflow(false);
    try {
      render(
        <UserMessageImpl
          message={{
            id: 'm1',
            role: 'user',
            content: '照这两张图做',
            createdAt: 1,
            attachments: [
              { path: 'uploads/首页.png', name: '首页.png', kind: 'image', order: 1 },
              { path: 'uploads/清单.md', name: '清单.md', kind: 'file', size: 12 * 1024, order: 2 },
            ],
          } as never}
          projectId="p1"
          projectFileNames={new Set(['首页.png', '清单.md'])}
          onRequestOpenFile={vi.fn()}
          t={t}
          appliedContextItems={[]}
        />,
      );
      const row = screen.getByTestId('user-attachment-row');
      const cards = Array.from(row.querySelectorAll('button'));
      expect(cards).toHaveLength(2);
      // 图卡:只有缩略图,卡面上一个字都没有(名字与序号徽标都不挂,名字只进 aria-label)
      const imageCard = cards[0] as HTMLButtonElement;
      expect(imageCard.querySelector('img')).toBeTruthy();
      expect((imageCard.textContent ?? '').trim()).toBe('');
      expect(imageCard.getAttribute('aria-label')).toContain('chat.openFile');
      // 文档卡:名字 + 体积
      expect(row.textContent).toContain('清单');
      expect(row.textContent).toContain('.md');
      expect(row.textContent).toContain('12 KB');
    } finally {
      restore();
    }
  });

  it('项目文件列表暂未刷新时，显式点击附件仍请求打开', () => {
    const restore = stubOverflow(false);
    try {
      const onRequestOpenFile = vi.fn();
      render(
        <UserMessageImpl
          message={{
            id: 'm1',
            role: 'user',
            content: '看这个',
            createdAt: 1,
            attachments: [{ path: 'uploads/走查.md', name: '走查.md', kind: 'file', order: 1 }],
          } as never}
          projectId="p1"
          projectFileNames={new Set()}
          onRequestOpenFile={onRequestOpenFile}
          t={t}
          appliedContextItems={[]}
        />,
      );
      const card = screen.getByTestId('user-attachment-row').querySelector('button');
      expect((card as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(card as HTMLButtonElement);
      expect(onRequestOpenFile).toHaveBeenCalledWith('走查.md');
    } finally {
      restore();
    }
  });
});
