// @vitest-environment jsdom
//
// OPEND-2606 — 「记忆开关已开启但对话提取实际未启用」
//
// 后台有两个开关:`enabled`(把已存的记忆折进系统提示 = 读)和
// `chatExtractionEnabled`(从新对话里沉淀新记忆 = 写)。守护进程的默认值是
// `{ enabled: true, chatExtractionEnabled: false }`(见
// apps/daemon/tests/memory-extraction-default-off.test.ts,PR #5708 有意为之)。
//
// 设置页只在页头画了一颗绿色总开关,而「写」的那颗藏在第二个页签
// (How it works)里。用户看到的是一颗绿灯,得到的却是「只读不写」。
// 这两条把「屏幕上的状态不许比后台更乐观」钉住:
//
//   ① 后台说写是关的,主视图就必须把那颗开关和它的状态摆出来 ——
//      不能用一颗绿灯代表全部能力都开着。
//   ② `GET /api/memory` 失败时不许编一份配置出来当真:原来的兜底返回
//      `{ enabled: true, chatExtractionEnabled: true }`,于是两颗开关全绿,
//      而守护进程那边可能两颗都是关的。这正是工单标题描述的那种谎。

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemorySection } from '../../src/components/MemorySection';
import { I18nProvider } from '../../src/i18n';

const originalFetch = globalThis.fetch;
const originalEventSource = globalThis.EventSource;

class StubEventSource {
  constructor(_url: string | URL) {}
  addEventListener() {}
  close() {}
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// The exact shape `GET /api/memory` returns for the reporter's daemon: read on,
// write off, 22 saved entries. Mirrors the config quoted in the ticket.
const REPORTED_LIST = {
  enabled: true,
  chatExtractionEnabled: false,
  profileEnabled: true,
  rewriteEnabled: true,
  verifyEnabled: true,
  rootDir: '/tmp/memory',
  index: '# Memory\n',
  entries: [],
  extraction: null,
};

function installFetch(handler: (url: string, init?: RequestInit) => Response) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(input.toString(), init)) as typeof fetch;
}

function renderMemorySection() {
  return render(
    <I18nProvider initial="en">
      <MemorySection />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  if (originalEventSource) {
    globalThis.EventSource = originalEventSource;
  } else {
    // @ts-expect-error jsdom shim cleanup
    delete globalThis.EventSource;
  }
  vi.restoreAllMocks();
});

describe('OPEND-2606 memory settings must not overstate what is on', () => {
  it('shows the chat-extraction switch and its off state on the memory view itself', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    installFetch((url) => {
      if (url === '/api/memory') return json(REPORTED_LIST);
      if (url === '/api/memory/extractions') return json({ extractions: [] });
      return json({}, 404);
    });

    renderMemorySection();

    // The master switch is on — that is the daemon's truth for reading.
    const master = await screen.findByRole('checkbox', {
      name: 'Enable memory injection',
    }) as HTMLInputElement;
    await waitFor(() => expect(master.checked).toBe(true));

    // …and on this same view, without hunting through a second tab, the
    // capability that is actually off has to be visible with its own state.
    const learn = await screen.findByRole('checkbox', {
      name: 'Learn from chats',
    }) as HTMLInputElement;
    expect(learn.checked).toBe(false);
  });

  it('does not paint the switches on when the config could not be read', async () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    installFetch((url) => {
      if (url === '/api/memory') return json({ error: 'boom' }, 500);
      if (url === '/api/memory/extractions') return json({ extractions: [] });
      return json({}, 404);
    });

    renderMemorySection();

    const master = await screen.findByRole('checkbox', {
      name: 'Enable memory injection',
    }) as HTMLInputElement;
    // A config we could not read is not a config that says "everything is on".
    await waitFor(() => expect(master.checked).toBe(false));
  });
});
