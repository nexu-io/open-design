// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage, ProjectFile } from '../../src/types';

afterEach(cleanup);

const FILE_NAME = 'index.html';

function file(): ProjectFile {
  return {
    name: FILE_NAME,
    path: FILE_NAME,
    size: 4096,
    mtime: 1_700_000_005,
    kind: 'html',
    mime: 'text/html',
  } as ProjectFile;
}

function writeEvents(done: boolean): ChatMessage['events'] {
  return [
    {
      kind: 'tool_use',
      id: 'write-1',
      name: 'Write',
      input: { file_path: FILE_NAME },
    },
    ...(done
      ? [{ kind: 'tool_result', toolUseId: 'write-1', content: 'Wrote index.html', isError: false }]
      : []),
  ] as ChatMessage['events'];
}

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Building the page.',
    startedAt: 1_700_000_000,
    events: [],
    ...overrides,
  } as ChatMessage;
}

function renderMessage(value: ChatMessage, streaming: boolean) {
  return render(
    <AssistantMessage
      message={value}
      streaming={streaming}
      projectId="project-1"
      projectFiles={[file()]}
      isLast
    />,
  );
}

describe('artifact card registration without an optional artifact-focus marker', () => {
  it('registers a pending card from a live Write event', () => {
    renderMessage(
      message({ runStatus: 'running', events: writeEvents(false), producedFiles: undefined }),
      true,
    );

    expect(screen.getByTestId(`artifact-card-${FILE_NAME}`)).toBeTruthy();
    expect(document.querySelectorAll('[data-artifact-card]')).toHaveLength(1);
  });

  it('keeps the card when the Write reaches terminal success before producedFiles reconciliation', () => {
    renderMessage(
      message({
        runStatus: 'succeeded',
        endedAt: 1_700_000_005,
        events: writeEvents(true),
        producedFiles: undefined,
      }),
      false,
    );

    expect(screen.getByTestId(`artifact-card-${FILE_NAME}`)).toBeTruthy();
    expect(document.querySelectorAll('[data-artifact-card]')).toHaveLength(1);
  });

  /*
   * 这一条原来写的是「`producedFiles: []` 是权威的『这轮没产物』,即使声明了
   * 也不出卡」。那个前提在当前数据链上站不住,而且它本身就是 OPEND-2550 的病灶:
   *
   * `producedFiles` 由客户端做**文件名差集**算出(`ProjectView.computeProducedFiles`,
   * `next.filter(f => !before.has(f.name))`),空清单的常见成因与「没产物」无关 ——
   * 改的是已存在的文件(名字本来就在基线里)、算不出基线时五个落库点一律
   * `?? []` 把「不知道」写成「空」、以及文件列表读取与 daemon 退出赛跑时陈旧
   * 快照落库成空(那句竞态注释就在 `ProjectView.tsx` 里)。
   *
   * 所以这一档改成守真正的不变量:**空清单不是否决票**,写过就得出卡。
   */
  it('still shows the card when a completed write reconciles to an empty produced list (OPEND-2550)', () => {
    renderMessage(
      message({
        runStatus: 'succeeded',
        endedAt: 1_700_000_005,
        events: [
          ...(writeEvents(true) ?? []),
          { kind: 'artifact_focus', show: [FILE_NAME] },
        ] as ChatMessage['events'],
        producedFiles: [],
      }),
      false,
    );

    expect(screen.getByTestId(`artifact-card-${FILE_NAME}`)).toBeTruthy();
    expect(document.querySelectorAll('[data-artifact-card]')).toHaveLength(1);
  });

  /*
   * 「不出卡」的判据换成了唯一站得住的那个:**这一轮有没有 write/edit 工具行**。
   * 只读过一遍文件的回合,即使 agent 声明了卡、即使那个文件确实在项目里,
   * 也不许凭空造出一张产物卡 —— 否则声明本身就成了伪造产物的入口。
   */
  it('never manufactures a card from a declaration alone when the turn wrote nothing', () => {
    renderMessage(
      message({
        runStatus: 'succeeded',
        endedAt: 1_700_000_005,
        events: [
          {
            kind: 'tool_use',
            id: 'read-1',
            name: 'Read',
            input: { file_path: FILE_NAME },
          },
          { kind: 'tool_result', toolUseId: 'read-1', content: '<!doctype html>', isError: false },
          { kind: 'artifact_focus', show: [FILE_NAME] },
        ] as ChatMessage['events'],
        producedFiles: [],
      }),
      false,
    );

    expect(screen.queryByTestId(`artifact-card-${FILE_NAME}`)).toBeNull();
    expect(document.querySelectorAll('[data-artifact-card]')).toHaveLength(0);
  });

  it('replays the reconciled produced file exactly once after refresh', () => {
    renderMessage(
      message({
        runStatus: 'succeeded',
        endedAt: 1_700_000_005,
        events: writeEvents(true),
        producedFiles: [file()],
      }),
      false,
    );

    expect(screen.getByTestId(`artifact-card-${FILE_NAME}`)).toBeTruthy();
    expect(document.querySelectorAll('[data-artifact-card]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid="file-ops-summary"]')).toHaveLength(1);
  });
});
