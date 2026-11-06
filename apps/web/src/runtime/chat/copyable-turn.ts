/**
 * 这一轮**有没有东西可复制**,以及复制的是什么。
 *
 * 原来的判据只有一条:`message.content` 有没有字。而一轮被手动中止、模型只来得及
 * 想、一个字都没答出来的时候,`content` 是空的 —— 推理走的是 `events`,从来不进
 * `content`(`ProjectView` 的 `textBuffer`:`kind === 'text'` 才 `appendContent`,
 * `kind === 'thinking'` 只落 `events`)。于是屏幕上明明摆着一格「思考过程」,
 * 底下那行却连复制按钮都没有。用户 2026-08-27 真机指认:
 * 「thought 也算能复制的吧? 为啥下面中止时没有复制按钮..」
 */
import type { ExecutionShell, ShellItem } from './contract';

/**
 * @param content 这一轮的回答正文(`message.content`)
 * @param shells  这一轮建出来的执行记录 —— 推理原文在里面
 * @returns 要复制的文本;**真的什么都没有时是 `undefined`**,那时候不出按钮
 *
 * 回落顺序是「回答优先」:正文有字就原样给正文(这一条一个字都没变),
 * 正文一个字都没有时才退回推理原文。
 *
 * 为什么「两样都没有」这一档必须留着:claude 经 daemon 送出的 thinking **全是空串**
 * (真实录制 1786 帧无一有字),那种轮次壳里那一行只报「在想」、没有任何文字。
 * 给它一颗按下去复制空串的按钮,比没有按钮更糟。
 */
export function copyableTurnText(
  content: string | null | undefined,
  shells: readonly ExecutionShell[],
): string | undefined {
  const answer = typeof content === 'string' ? content : '';
  if (answer.trim().length > 0) return answer;
  const thoughts = collectThinking(shells).join('\n\n').trim();
  return thoughts.length > 0 ? thoughts : undefined;
}

/** 推理落在两处:壳自己的条目,以及每条 todo 抽屉里的条目(有清单时推理进 todo) */
function collectThinking(shells: readonly ExecutionShell[]): string[] {
  const out: string[] = [];
  const walk = (items: readonly ShellItem[]): void => {
    for (const item of items) {
      if (item.kind === 'text') {
        if (item.thinking && item.text.trim()) out.push(item.text.trim());
        continue;
      }
      if (item.kind === 'todo') walk(item.segment.items);
    }
  };
  for (const shell of shells) walk(shell.items);
  return out;
}
