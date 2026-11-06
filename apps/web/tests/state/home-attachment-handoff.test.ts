// @vitest-environment jsdom
/**
 * OPEND-2585 · Home → 项目那批附件在传的那几秒,谁负责它们的本地缩略图。
 *
 * 项目页现在不等上传就开出来了,于是「本地占位」和「服务端路径」第一次同时存在。
 * 这条钉的是两件必须成立的事:
 *   1. 每一个 `URL.createObjectURL` 最后都被撤掉 —— 一批传十几个文件,漏一个就
 *      漏一整个会话;
 *   2. 占位卡不活得比真路径长 —— 哪个文件传完,哪张卡当场下台。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  beginHomeAttachmentUploads,
  dismissHomeAttachmentUpload,
  dismissedHomeAttachmentOrders,
  endHomeAttachmentUploads,
  homeAttachmentUploadsFor,
  homeAttachmentUploadsPending,
  resetHomeAttachmentUploads,
  settleHomeAttachmentUpload,
  subscribeHomeAttachmentUploads,
} from '../../src/state/home-attachment-handoff';

const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  created.length = 0;
  revoked.length = 0;
  let seq = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => {
      seq += 1;
      const url = `blob:od-test/${seq}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revoked.push(url);
    }),
  });
});

afterEach(() => {
  resetHomeAttachmentUploads();
  vi.unstubAllGlobals();
});

const batch = () => [
  new File(['a'], 'shot-0.png', { type: 'image/png' }),
  new File(['b'], 'shot-1.png', { type: 'image/png' }),
  new File(['c'], 'brief.txt', { type: 'text/plain' }),
];

describe('OPEND-2585 · Home 附件握手', () => {
  it('先证量法看得见:图片确实各拿到一个本地地址,文档不拿', () => {
    beginHomeAttachmentUploads('p1', batch());
    const cards = homeAttachmentUploadsFor('p1');
    expect(cards).toHaveLength(3);
    // 两张图各一个 object URL,文档卡没有画面所以不占一个。
    expect(created).toHaveLength(2);
    expect(cards.map((card) => card.previewUrl ?? null)).toEqual([
      'blob:od-test/1',
      'blob:od-test/2',
      null,
    ]);
    expect(cards.map((card) => card.order)).toEqual([0, 1, 2]);
    expect(homeAttachmentUploadsPending('p1')).toBe(true);
  });

  it('哪个文件传完,哪张卡当场下台,它的本地地址同时撤掉', () => {
    beginHomeAttachmentUploads('p1', batch());
    settleHomeAttachmentUpload('p1', 0);

    expect(homeAttachmentUploadsFor('p1').map((card) => card.name)).toEqual([
      'shot-1.png',
      'brief.txt',
    ]);
    // 真路径一到,占位就没了 —— 不能让 blob 活得比它长。
    expect(revoked).toEqual(['blob:od-test/1']);
  });

  it('收摊时把剩下的全撤掉:传失败、抛异常的那些不能留着漏内存', () => {
    beginHomeAttachmentUploads('p1', batch());
    settleHomeAttachmentUpload('p1', 0);
    // 剩下两个当作上传失败/整段抛异常,直接收摊。
    endHomeAttachmentUploads('p1');

    expect(homeAttachmentUploadsFor('p1')).toHaveLength(0);
    expect(homeAttachmentUploadsPending('p1')).toBe(false);
    expect([...revoked].sort()).toEqual([...created].sort());
    // 收两次不该出事,也不该重复撤。
    endHomeAttachmentUploads('p1');
    expect(revoked).toHaveLength(created.length);
  });

  it('重新开一批会先把上一批收干净,不留下上一批的地址', () => {
    beginHomeAttachmentUploads('p1', batch());
    const firstBatch = [...created];
    beginHomeAttachmentUploads('p1', batch());

    expect(homeAttachmentUploadsFor('p1')).toHaveLength(3);
    expect(revoked).toEqual(firstBatch);
  });

  it('人在传的过程中把卡「×」掉:卡走了,地址撤了,order 记下来不进首条消息', () => {
    beginHomeAttachmentUploads('p1', batch());
    const [, second] = homeAttachmentUploadsFor('p1');

    dismissHomeAttachmentUpload('p1', second!.id);

    expect(homeAttachmentUploadsFor('p1').map((card) => card.name)).toEqual([
      'shot-0.png',
      'brief.txt',
    ]);
    expect(revoked).toEqual(['blob:od-test/2']);
    expect([...dismissedHomeAttachmentOrders('p1')]).toEqual([1]);
  });

  it('两个项目各管各的', () => {
    beginHomeAttachmentUploads('p1', batch());
    beginHomeAttachmentUploads('p2', batch());
    endHomeAttachmentUploads('p1');

    expect(homeAttachmentUploadsFor('p1')).toHaveLength(0);
    expect(homeAttachmentUploadsFor('p2')).toHaveLength(3);
  });

  it('订阅者在每次变动后都被叫醒,快照身份不变就不该乱重画', () => {
    const seen: number[] = [];
    const unsubscribe = subscribeHomeAttachmentUploads(() => {
      seen.push(homeAttachmentUploadsFor('p1').length);
    });

    const before = homeAttachmentUploadsFor('p1');
    expect(homeAttachmentUploadsFor('p1')).toBe(before); // 空快照身份稳定

    beginHomeAttachmentUploads('p1', batch());
    settleHomeAttachmentUpload('p1', 1);
    endHomeAttachmentUploads('p1');
    unsubscribe();
    beginHomeAttachmentUploads('p1', batch());

    // 退订之后不再收到通知。
    expect(seen).toEqual([3, 2, 0]);
  });
});
