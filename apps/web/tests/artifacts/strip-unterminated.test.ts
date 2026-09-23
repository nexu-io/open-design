/**
 * 轮次**结束之后**遇到没闭合的 `<artifact …>`:整段原文不许倒进聊天。
 *
 * 真实回放里撞到过 —— 那一轮的 `<artifact type="text/html" …>` 只有开标签没有闭标签
 * (生成被截断),而剥离函数要求成对标签、拿不到闭标签就**整段不剥**,
 * 于是 1.4 万字符的 `<!doctype html><div class="field">…` 当纯文本渲染,一条消息拉出一万多像素。
 *
 * 流式期间**本来就是好的**(`splitStreamingArtifact` 会把没闭合的收进代码面板),
 * 坏的只有「跑完了但没闭合」这一档:那时不会再有内容进来,开标签之后的东西就是产物本身。
 *
 * 边界:代码块 / 行内代码里**照抄**的 `<artifact …>` 是讲解,不是协议标签,一个字都不许动。
 */
import { describe, expect, it } from 'vitest';
import { stripArtifact } from '../../src/artifacts/strip';

const HEAD = '原型已经保存到 relatorio-comite.html。\n\n';
const HUGE = '<!doctype html>\n<html lang="pt-BR">\n<head>\n' + '<div class="field">x</div>\n'.repeat(300);

describe('没闭合的 artifact', () => {
  it('跑完了还没闭合 → 从开标签一路吃到末尾,聊天里只剩正文', () => {
    const out = stripArtifact(`${HEAD}<artifact identifier="relatorio-comite" type="text/html" title="T">\n${HUGE}`);
    expect(out).toBe(HEAD.trim());
    expect(out).not.toContain('<!doctype html>');
    expect(out).not.toContain('<artifact');
  });

  it('闭合了照旧剥干净,后面的话留着', () => {
    const out = stripArtifact(`${HEAD}<artifact type="text/html" title="T">\n${HUGE}\n</artifact>\n\n还有一句收尾。`);
    expect(out).toContain('原型已经保存到');
    expect(out).toContain('还有一句收尾。');
    expect(out).not.toContain('<!doctype html>');
  });

  it('代码块里照抄的开标签不算数 —— 讲解不许被吃掉', () => {
    const doc = '协议长这样:\n\n```\n<artifact type="text/html" title="示例">\n<p>hi</p>\n```\n\n就这些。';
    expect(stripArtifact(doc)).toBe(doc.trim());
  });

  it('行内代码里的也不算数', () => {
    const doc = '开标签是 `<artifact type="text/html">`,记得闭合。';
    expect(stripArtifact(doc)).toBe(doc.trim());
  });
});
