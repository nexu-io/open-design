// @vitest-environment jsdom
/**
 * 组件 21 · 待发送附件(第 60–64 格)—— 托盘的行为断言。
 *
 * 钉住的是**可用性后果**,不是类名(见 `components/chat/AGENTS.md` §5):
 *  · #60 静止时不摆「×」,但它必须在 DOM 里(hover / focus 才显形是 CSS 的事);
 *    卡本身不再是「打开文件」按钮,图卡上不挂文件名;
 *  · #61 上传的那几秒卡就得在,而且它**不能**跟着这条消息发出去 —— 没有 path;
 *  · #63 失败的那一张各自留在托盘里,各自能重试、各自能移除;
 *  · #64 一行放不下时出翻页箭头(判据复用组件 2 那份纯函数)。
 *
 * 上传链路整条用 `uploadProjectFiles` 的 mock 顶掉:这里要证的是「逐文件」这件事
 * 本身 —— 一个文件一个请求、失败落到具体那张卡上,而不是 HTTP 细节。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChatComposer } from '../../../src/components/ChatComposer';
import { uploadProjectFiles } from '../../../src/providers/registry';

vi.mock('../../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../../src/providers/registry')>(
    '../../../src/providers/registry',
  );
  return { ...actual, uploadProjectFiles: vi.fn() };
});

const mockedUpload = vi.mocked(uploadProjectFiles);

/** 一个永远不 resolve 的上传,用来把界面钉在「上传中」那一帧。 */
function neverResolves() {
  return new Promise<never>(() => {});
}

function renderComposer(onSend = vi.fn()) {
  render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={onSend}
      onStop={vi.fn()}
    />,
  );
  return onSend;
}

function pickFiles(files: File[]) {
  fireEvent.change(screen.getByTestId('chat-file-input'), { target: { files } });
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' });
const txt = (name: string) => new File(['x'], name, { type: 'text/plain' });

const uploadedImage = (name: string) => ({
  uploaded: [{ path: `uploads/${name}`, name, kind: 'image' as const, size: 8 }],
  failed: [],
});

beforeEach(() => {
  // jsdom 没有 createObjectURL;托盘要能在没有它的环境里照样出卡。
  vi.stubGlobal('URL', Object.assign(Object.create(URL), URL, {
    createObjectURL: () => 'blob:local',
    revokeObjectURL: () => {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});


/**
 * 箭头**常驻在 DOM 里**,出没由壳上的 `is-prev` / `is-next` 决定
 * (稿子 `.att-wrap.is-prev > .att-nav.mod-prev` 就是这么写的;本仓也约定条件显示的
 * 元素保持挂载 —— React 卸载会把退场过渡整个跳过)。
 * 这几条用例要守的行为一个字没变:「一行放得下时两枚都不出」「停在行首只出往后那一枚」。
 * 只是判据从「在不在 DOM 里」换成「壳有没有把它打开」——
 * 藏起来的那颗是 `display: none`,既不显形也进不了 Tab 序,对读屏同样是不存在的。
 */
const navShown = (side: 'prev' | 'next'): boolean => {
  const wrap = document.querySelector('.composer-att-wrap');
  if (!wrap) throw new Error('找不到附件行的壳');
  return wrap.classList.contains(`is-${side}`);
};

describe('待发送附件托盘 · 逐文件上传', () => {
  it('一个文件一个请求 —— 失败才落得到具体那张卡上', async () => {
    mockedUpload.mockImplementation(async (_id, files) => {
      const file = files[0]!;
      return uploadedImage(file.name);
    });
    renderComposer();

    pickFiles([png('首页.png'), png('设置页.png'), png('列表页.png')]);

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(3));
    for (const call of mockedUpload.mock.calls) {
      expect(call[1]).toHaveLength(1);
    }
  });

  it('上传中就把卡摆出来,传完换成真附件 —— 顺序仍是挑文件的顺序', async () => {
    const gates: Array<() => void> = [];
    mockedUpload.mockImplementation(async (_id, files) => {
      const file = files[0]!;
      // 第一个文件最后才回来:并发上传时完成顺序和挑选顺序必然分叉。
      if (file.name === '首页.png') {
        await new Promise<void>((resolve) => gates.push(resolve));
      }
      return uploadedImage(file.name);
    });
    const onSend = renderComposer();

    pickFiles([png('首页.png'), png('设置页.png')]);

    // #61:上传的这几秒托盘里就有卡了(原来这里一张卡都没有)。
    await waitFor(() => {
      expect(screen.getByTestId('staged-attachments').querySelectorAll('.msg-att-img')).toHaveLength(2);
    });
    expect(onSend).not.toHaveBeenCalled();

    await act(async () => {
      gates.forEach((open) => open());
      await Promise.resolve();
    });

    await waitFor(() => {
      const labels = Array.from(
        screen.getByTestId('staged-attachments').querySelectorAll('button[title]'),
        (node) => node.getAttribute('title'),
      );
      // 先传完的那张没有插队到前面去。
      expect(labels).toEqual(['首页.png', '设置页.png']);
    });
  });

  it('还在传的那张卡发不出去 —— 它没有服务端路径', async () => {
    mockedUpload.mockImplementation(async (_id, files) => {
      const file = files[0]!;
      if (file.name === '慢的.png') return neverResolves();
      return uploadedImage(file.name);
    });
    const onSend = renderComposer();

    pickFiles([png('快的.png'), png('慢的.png')]);

    await waitFor(() => {
      expect(screen.getByTestId('staged-attachments').querySelectorAll('.msg-att-img')).toHaveLength(2);
    });
    fireEvent.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    // ⚠️ 这条同时钉住了一个【已知的现网 bug】的现状:上传期间发送键仍然可点,
    // 点下去在传的那个文件不跟着发。这一轮不修它(要另起红测 + 独立 PR,
    // 见规格 §4-A 末尾),这里只是把「发出去的到底是哪些」写死,
    // 免得后面改动悄悄把在传的半成品也塞进消息里。
    expect((onSend.mock.calls[0]?.[1] as Array<{ name: string }>).map((a) => a.name))
      .toEqual(['快的.png']);
  });

  it('失败的那一张留在托盘里、能单独重试,成功后变成可发送的附件', async () => {
    let attempts = 0;
    mockedUpload.mockImplementation(async (_id, files) => {
      const file = files[0]!;
      if (file.name === '规范.png') {
        attempts += 1;
        if (attempts === 1) return { uploaded: [], failed: [{ name: file.name }], error: 'storage offline' };
      }
      return uploadedImage(file.name);
    });
    const onSend = renderComposer();

    pickFiles([png('首页.png'), png('规范.png')]);

    // #63:失败卡上摆着「重试」,而不是只在下面出一行全局文字。
    const retry = await screen.findByTestId('staged-att-retry');
    expect(retry.getAttribute('title')).toBe('规范.png');
    expect(
      screen.getByTestId('staged-attachments').querySelectorAll('.msg-att-img'),
    ).toHaveLength(2);

    fireEvent.click(retry);

    await waitFor(() => expect(screen.queryByTestId('staged-att-retry')).toBeNull());
    fireEvent.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect((onSend.mock.calls[0]?.[1] as Array<{ name: string }>).map((a) => a.name))
      .toEqual(['首页.png', '规范.png']);
  });

  it('失败卡也能直接移除,移掉之后托盘就空了', async () => {
    mockedUpload.mockResolvedValue({ uploaded: [], failed: [{ name: '规范.png' }], error: 'nope' });
    renderComposer();

    pickFiles([png('规范.png')]);

    await screen.findByTestId('staged-att-retry');
    const tray = screen.getByTestId('staged-attachments');
    const remove = tray.querySelector('.msg-att-del') as HTMLButtonElement;
    expect(remove).toBeTruthy();
    fireEvent.click(remove);

    await waitFor(() => expect(screen.queryByTestId('staged-attachments')).toBeNull());
  });

  it('一个文件传崩了不影响同一批里其它文件', async () => {
    mockedUpload.mockImplementation(async (_id, files) => {
      const file = files[0]!;
      if (file.name === '坏的.png') throw new Error('boom');
      return uploadedImage(file.name);
    });
    const onSend = renderComposer();

    pickFiles([png('好的.png'), png('坏的.png')]);

    await screen.findByTestId('staged-att-retry');
    fireEvent.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect((onSend.mock.calls[0]?.[1] as Array<{ name: string }>).map((a) => a.name))
      .toEqual(['好的.png']);
  });
});

describe('待发送附件托盘 · 卡片形态', () => {
  it('#60 「×」始终在 DOM 里(静止时靠 CSS 收起来),卡本身不再是打开文件的按钮', async () => {
    mockedUpload.mockImplementation(async (_id, files) => uploadedImage(files[0]!.name));
    renderComposer();

    pickFiles([png('首页.png')]);

    const tray = await screen.findByTestId('staged-attachments');
    await waitFor(() => expect(tray.querySelector('.msg-att-img')).toBeTruthy());
    const card = tray.querySelector('.msg-att-img') as HTMLElement;
    // 稿子:外层从 button 变成 span,可点的只有里面的东西。
    expect(card.tagName).toBe('SPAN');
    expect(screen.getByRole('button', { name: 'Remove 首页.png' })).toBeTruthy();
    // 图卡上不挂文件名 —— 缩略图本身就是它的名字。
    expect(card.textContent).toBe('');
  });

  it('#62 文档卡和图卡在同一行里,名字拆成主名 + 永远完整的后缀', async () => {
    mockedUpload.mockImplementation(async (_id, files) => {
      const file = files[0]!;
      if (file.name.endsWith('.png')) return uploadedImage(file.name);
      return {
        uploaded: [{ path: `uploads/${file.name}`, name: file.name, kind: 'file' as const, size: 12 * 1024 }],
        failed: [],
      };
    });
    renderComposer();

    pickFiles([txt('商品卡组件规格说明终稿.md'), png('首页.png')]);

    const tray = await screen.findByTestId('staged-attachments');
    await waitFor(() => expect(tray.querySelectorAll('.msg-att-doc')).toHaveLength(1));
    expect(tray.querySelectorAll('.msg-att-img')).toHaveLength(1);
    const doc = tray.querySelector('.msg-att-doc') as HTMLElement;
    expect(doc.querySelector('.msg-att-ext')?.textContent).toBe('.md');
    expect(doc.querySelector('.msg-att-base')?.textContent).toBe('商品卡组件规格说明终稿');
    expect(doc.querySelector('.msg-att-meta')?.textContent).toBe('12 KB');
    // 文档卡也带自己的「×」,位置由 CSS 管(图卡 4px / 文档卡 5px)。
    expect(doc.querySelector('.msg-att-del')).toBeTruthy();
  });
});

describe('待发送附件托盘 · 一行横滚(#64)', () => {
  /** jsdom 不做布局,`scrollWidth / clientWidth` 恒为 0,直接把两个值摆出来。 */
  function stubRow(row: HTMLElement, box: { scrollWidth: number; clientWidth: number }) {
    Object.defineProperty(row, 'scrollWidth', { configurable: true, get: () => box.scrollWidth });
    Object.defineProperty(row, 'clientWidth', { configurable: true, get: () => box.clientWidth });
    let scrollLeft = 0;
    Object.defineProperty(row, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value;
      },
    });
  }

  async function trayWith(count: number) {
    mockedUpload.mockImplementation(async (_id, files) => uploadedImage(files[0]!.name));
    renderComposer();
    pickFiles(Array.from({ length: count }, (_, i) => png(`第${i + 1}张.png`)));
    const tray = await screen.findByTestId('staged-attachments');
    await waitFor(() => expect(tray.querySelectorAll('.msg-att-img')).toHaveLength(count));
    return tray;
  }

  it('一行放得下时两枚都不出 —— 常驻的箭头是在说一件不存在的事', async () => {
    const tray = await trayWith(3);
    stubRow(tray, { scrollWidth: 200, clientWidth: 406 });
    act(() => {
      fireEvent.scroll(tray);
    });
    expect(navShown('prev'), '往前那一枚不该出').toBe(false);
    expect(navShown('next'), '往后那一枚不该出').toBe(false);
  });

  it('停在行首:只出「往后」那一枚', async () => {
    const tray = await trayWith(6);
    stubRow(tray, { scrollWidth: 700, clientWidth: 406 });
    act(() => {
      fireEvent.scroll(tray);
    });
    expect(navShown('prev'), '往前那一枚不该出').toBe(false);
    expect(navShown('next'), '往后那一枚该出').toBe(true);
  });

  it('点一下真的滚出去,而且只滚八成宽 —— 留两成重叠好接上', async () => {
    const tray = await trayWith(6);
    stubRow(tray, { scrollWidth: 700, clientWidth: 406 });
    const scrollBy = vi.fn();
    (tray as unknown as { scrollBy: unknown }).scrollBy = scrollBy;
    act(() => {
      fireEvent.scroll(tray);
    });
    fireEvent.click(screen.getByTestId('staged-att-nav-next'));
    expect(scrollBy).toHaveBeenCalledWith({ left: 406 * 0.8, behavior: 'smooth' });
  });
});
