// @vitest-environment jsdom
/**
 * OPEND-2585 · 首页挑的那批文件,在项目页开出来之后画在哪。
 *
 * 项目页不再等上传,于是有几秒钟「文件在传、项目已经开着」。稿子里这一态早就
 * 有画法 —— 待发送托盘里的「在传中」卡片 —— 只是以前只有项目内挑的文件走得到
 * 那里。这条钉的是:寄放进来的那批卡确实画得出来、确实按用户挑的顺序排、
 * 并且**不算 payload**(它们还没有服务端路径,发不出去)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ChatComposer } from '../../src/components/ChatComposer';
import type { PendingUpload } from '../../src/runtime/chat/staged-attachment';
import { flushMounts } from '../helpers/lexical-composer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const HOME_BATCH: PendingUpload[] = [
  {
    id: 'home-upload:p1:0',
    name: 'shot-0.png',
    kind: 'image',
    size: 12,
    order: 0,
    state: 'uploading',
    previewUrl: 'blob:od-test/1',
  },
  {
    id: 'home-upload:p1:1',
    name: 'brief.txt',
    kind: 'file',
    size: 40,
    order: 1,
    state: 'uploading',
  },
];

function renderComposer(overrides: Record<string, unknown> = {}) {
  return render(
    <ChatComposer
      projectId="p1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'p1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      {...overrides}
    />,
  );
}

describe('OPEND-2585 · 寄放在 composer 托盘里的首页附件', () => {
  it('先证量法看得见:不给这批卡时托盘根本不出现', async () => {
    renderComposer();
    await flushMounts();
    expect(screen.queryByTestId('staged-attachments')).toBeNull();
  });

  it('上传还没结束就画出来了,图走本地地址,文档走文件名', async () => {
    renderComposer({ externalPendingUploads: HOME_BATCH });
    await flushMounts();

    const tray = screen.getByTestId('staged-attachments');
    expect(tray.children).toHaveLength(2);
    // 图卡的缩略图是本地字节,不是 `/api/projects/:id/raw` —— 上传还在飞。
    const img = tray.querySelector('img');
    expect(img?.getAttribute('src')).toBe('blob:od-test/1');
    // 文档卡没有画面,名字是它唯一的身份。
    expect(tray.textContent).toContain('brief');
    // 「在传中」的处理和项目内挑的文件同一套。
    expect(tray.querySelectorAll('.is-up')).toHaveLength(2);
  });

  it('它们不算 payload:没有服务端路径,发送键仍然是灰的', async () => {
    renderComposer({ externalPendingUploads: HOME_BATCH });
    await flushMounts();

    expect((screen.getByTestId('chat-send') as HTMLButtonElement).disabled).toBe(true);
  });

  it('「×」还给寄放它的人处理,composer 不去动别人的文件', async () => {
    const onRemoveExternalPendingUpload = vi.fn();
    renderComposer({
      externalPendingUploads: HOME_BATCH,
      onRemoveExternalPendingUpload,
    });
    await flushMounts();

    const remove = screen.getByTestId('staged-attachments').querySelector('.msg-att-del');
    fireEvent.click(remove!);
    expect(onRemoveExternalPendingUpload).toHaveBeenCalledWith('home-upload:p1:0');
  });
});
