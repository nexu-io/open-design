// @vitest-environment jsdom
/**
 * 「Default design router」不该出现在输入框上方(OPEND-2412)。
 *
 * 首页自由输入、以及「用这套设计系统创建」都会给这一发绑上 `od-default` 这枚
 * **兜底路由**(`packages/contracts/src/plugins/scenario-defaults.ts`)。它不是用户
 * 挑的插件,只是「这一发还没选场景」的内部说法 —— 摆成一枚可见芯片,读起来就像
 * 用户自己挂了个叫 “Default design router” 的东西,而且还给了一颗移除按钮。
 *
 * 产品裁决:**界面不展示,底层照旧**。所以这一组是成对的:
 *   · 上半:界面上一个字都不许露;
 *   · 下半(反向守卫):`meta.appliedPluginSnapshot` **仍然**带着 `od-default` ——
 *     落库、重试、daemon 侧的 snapshot 绑定全靠它。少了下半这条,
 *     以后有人会顺手把 `activeAppliedPlugin` 一起删掉,而那是静默的功能回退。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID } from '@open-design/contracts';
import type { AppliedPluginSnapshot } from '@open-design/contracts';

import { ChatComposer, type ChatComposerHandle } from '../../src/components/ChatComposer';
import { flushMounts, typeAndSettle } from '../helpers/lexical-composer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DEFAULT_ROUTER_TITLE = 'Default design router';

function snapshot(pluginId: string, pluginTitle: string): AppliedPluginSnapshot {
  return {
    snapshotId: `snap-${pluginId}`,
    pluginId,
    pluginVersion: '1.0.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: [],
    capabilitiesRequired: [],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    pluginTitle,
    status: 'fresh',
  } as unknown as AppliedPluginSnapshot;
}

async function renderWithAppliedPlugin(applied: AppliedPluginSnapshot) {
  const onSend = vi.fn();
  const composerRef = createRef<ChatComposerHandle>();
  render(
    <ChatComposer
      ref={composerRef}
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={onSend}
      onStop={vi.fn()}
    />,
  );
  await flushMounts();
  act(() => {
    composerRef.current?.restoreDraft({
      text: '把首屏文案改短一点',
      meta: {
        appliedPluginSnapshot: applied,
        appliedPluginSnapshotId: applied.snapshotId,
      },
    });
  });
  await flushMounts();
  return { onSend };
}

describe('兜底路由不摆上台面', () => {
  it('od-default 不出现在已挂载的运行上下文里', async () => {
    await renderWithAppliedPlugin(snapshot(DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID, DEFAULT_ROUTER_TITLE));

    expect(screen.queryByText(DEFAULT_ROUTER_TITLE)).toBeNull();
    // 芯片自己、以及它那颗移除按钮(aria-label 里也带标题)都不许留下痕迹。
    expect(document.querySelector('[data-staged-kind="plugin"]')).toBeNull();
    expect(document.body.textContent ?? '').not.toContain(DEFAULT_ROUTER_TITLE);
    // 没有别的上下文时,那一排整体不该出现 —— 只藏芯片会留下一条空行。
    expect(screen.queryByTestId('staged-contexts')).toBeNull();
  });

  it('用户真的挑过的插件照旧显示 —— 藏的是兜底路由,不是这条能力', async () => {
    await renderWithAppliedPlugin(snapshot('my-export', 'My Export'));

    expect(screen.getByTestId('staged-contexts')).toBeTruthy();
    expect(document.querySelector('[data-staged-kind="plugin"]')).not.toBeNull();
    expect(screen.getByText('My Export')).toBeTruthy();
  });
});

describe('底层照旧', () => {
  it('发送时 meta 仍然带着 od-default 的 snapshot(落库 / 重试靠它)', async () => {
    const { onSend } = await renderWithAppliedPlugin(
      snapshot(DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID, DEFAULT_ROUTER_TITLE),
    );

    await typeAndSettle('把首屏文案改短一点');
    fireEvent.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(onSend).toHaveBeenCalled());

    const meta = onSend.mock.calls[0]?.[3] as
      | { appliedPluginSnapshot?: AppliedPluginSnapshot; appliedPluginSnapshotId?: string | null }
      | undefined;
    expect(meta?.appliedPluginSnapshot?.pluginId).toBe(DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID);
    expect(meta?.appliedPluginSnapshotId).toBe(`snap-${DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID}`);
  });
});
