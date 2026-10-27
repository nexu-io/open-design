import { describe, expect, it } from 'vitest';

import {
  canDeleteComment,
  canEditComment,
  canSendCommentToAgent,
  commentAuthoredByViewer,
  viewerIsProjectOwner,
  type CommentAuthorityComment,
  type CommentAuthorityContext,
} from '../../src/comments/comment-authority';

/**
 * 阶段 0 · Z8 —— 缺陷 2 / 3 的红测试。
 *
 * 这两条缺陷都不是决策，是**照画布实现也不会发现的既有缺陷**，且都落在
 * 「个人项目分享之后」这条现有测试完全没覆盖的路径上。
 *
 * ⚠️ **下面 `describe.each` 之外、标了「🔴 今天是红的」的用例，现在必须是红的。**
 * 它们描述的是修完之后应有的行为。**把它们改绿的唯一正当方式是改
 * `comment-authority.ts` 的实现**；改断言、跳过、或删掉，等于把缺陷藏回去。
 *
 * 与之并列的「今天已经是绿的」那组是**回归网**：修缺陷时不许把它们弄红。
 */

const OWNER: CommentAuthorityContext = {
  viewerMemberId: 'member-me',
  collabEnabled: true,
  isProjectOwner: true,
};

/** 个人项目：没有团队协作，collab 状态轮询根本不跑。 */
const PERSONAL: CommentAuthorityContext = {
  viewerMemberId: null,
  collabEnabled: false,
  // 个人项目上 `collab.isOwner` 恒为 false —— 这正是缺陷 3。
  isProjectOwner: false,
};

const TEAM_MEMBER: CommentAuthorityContext = {
  viewerMemberId: 'member-me',
  collabEnabled: true,
  isProjectOwner: false,
};

const externalComment: CommentAuthorityComment = {
  authorKind: 'user',
  // 分享页作者在本工作区没有成员身份，所以这里必然是空的。
  authorMemberId: undefined,
};

const legacyComment: CommentAuthorityComment = {
  // 老行：没有 authorKind，也没有 authorMemberId。
};

const myComment: CommentAuthorityComment = {
  authorKind: 'member',
  authorMemberId: 'member-me',
};

const otherMemberComment: CommentAuthorityComment = {
  authorKind: 'member',
  authorMemberId: 'member-someone-else',
};

describe('评论归属 · 今天已经是绿的（回归网，修缺陷时不许弄红）', () => {
  it('创建流程里的草稿属于当前查看者', () => {
    expect(commentAuthoredByViewer(null, TEAM_MEMBER)).toBe(true);
    expect(commentAuthoredByViewer(undefined, PERSONAL)).toBe(true);
  });

  it('自己写的评论是自己的', () => {
    expect(commentAuthoredByViewer(myComment, TEAM_MEMBER)).toBe(true);
  });

  it('别的成员写的评论不是自己的', () => {
    expect(commentAuthoredByViewer(otherMemberComment, TEAM_MEMBER)).toBe(false);
  });

  it('团队项目里的无作者老行只有 Owner 能动', () => {
    expect(commentAuthoredByViewer(legacyComment, TEAM_MEMBER)).toBe(false);
    expect(commentAuthoredByViewer(legacyComment, OWNER)).toBe(true);
  });

  it('只有作者本人能编辑；Owner 也不能编辑别人的正文', () => {
    expect(canEditComment(otherMemberComment, OWNER)).toBe(false);
    expect(canEditComment(myComment, TEAM_MEMBER)).toBe(true);
  });

  it('Owner 能删除、能发给 Agent，即使不是作者', () => {
    expect(canDeleteComment(otherMemberComment, OWNER)).toBe(true);
    expect(canSendCommentToAgent(otherMemberComment, OWNER)).toBe(true);
  });
});

describe('🔴 缺陷 2 · 外部评论被当成 Owner 自己的（今天是红的）', () => {
  /**
   * 分享页写的评论没有 `authorMemberId`，于是掉进「无作者」分支。
   * 个人项目上 `collabEnabled` 为 false ⇒ `!collabEnabled` 为 true
   * ⇒ 该分支答「是你的」。**而「正在分享中的个人项目」正是分享功能造出来的那个场景。**
   *
   * 缺的那个区分是 `authorKind === 'user'`：`authorMemberId` 为空过去只意味着
   * 「老行 / 非团队行」，现在还意味着「本工作区之外的人写的」。这两者不能共用一个分支。
   */
  it('个人项目分享后，外部评论不是自己的', () => {
    expect(commentAuthoredByViewer(externalComment, PERSONAL)).toBe(false);
  });

  it('团队项目里的外部评论同样不是自己的', () => {
    expect(commentAuthoredByViewer(externalComment, OWNER)).toBe(false);
    expect(commentAuthoredByViewer(externalComment, TEAM_MEMBER)).toBe(false);
  });

  it('任何人都不能编辑外部评论的正文（OP2 正文只读）', () => {
    expect(canEditComment(externalComment, PERSONAL)).toBe(false);
    expect(canEditComment(externalComment, OWNER)).toBe(false);
  });

  it('外部评论与无作者老行必须走不同分支，不能同命运', () => {
    // 同一个上下文下，老行仍按历史行为算「自己的」，外部评论不算。
    expect(commentAuthoredByViewer(legacyComment, PERSONAL)).toBe(true);
    expect(commentAuthoredByViewer(externalComment, PERSONAL)).toBe(false);
  });
});

describe('🔴 缺陷 3 · 个人项目的 Owner 判定恒为假（今天是红的）', () => {
  /**
   * `collab.isOwner` 由 collab 状态轮询解析，而个人项目**不跑那个轮询**。
   * 于是个人项目唯一的那个 Owner 被判成「不是 Owner」，
   * 分享之后自己项目上的删除 / 发给 Agent 入口**永远不出现**。
   *
   * 个人项目只有一个写者，查看者就是它的 Owner；这个判定需要一条个人项目的分支，
   * 而不是整个交给 collab 决定。
   */
  it('个人项目的查看者就是它的 Owner', () => {
    expect(viewerIsProjectOwner(PERSONAL)).toBe(true);
  });

  /**
   * ⚠️ 下面这两条**今天是绿的，但绿得不对**，而且**修完缺陷 2 之后会变红**。
   *
   * `canDeleteComment = commentAuthoredByViewer || viewerIsProjectOwner`。
   * 今天前一半因为缺陷 2 错误地返回 true，所以整体是 true —— 对的结果，错的理由。
   * 一旦缺陷 2 修好，前一半变 false，这两条就只能靠 `viewerIsProjectOwner` 撑，
   * 而那正是缺陷 3 坏掉的地方。
   *
   * **所以缺陷 2 和 3 必须一起修，分开修会让这两条中途变红。**
   * 中途变红不是回归，是互锁暴露出来了；不要因此回退缺陷 2 的修复。
   */
  it('个人项目分享后，Owner 能删除外部评论（OP 组的核心动作）', () => {
    expect(canDeleteComment(externalComment, PERSONAL)).toBe(true);
  });

  it('个人项目分享后，Owner 能把外部评论发给 Agent', () => {
    expect(canSendCommentToAgent(externalComment, PERSONAL)).toBe(true);
  });

  it('团队项目里的非 Owner 成员仍然不是 Owner（不许把判定放宽过头）', () => {
    expect(viewerIsProjectOwner(TEAM_MEMBER)).toBe(false);
    expect(canDeleteComment(otherMemberComment, TEAM_MEMBER)).toBe(false);
  });
});
