// @vitest-environment jsdom
/**
 * 用户气泡与它下面那排静音动作(PR #7170 `components.css`)。
 *
 * 稿子改了两件事:气泡底压到 `#121212` / 正文 medium;时间戳、复制、反馈、fork
 * 统一收进 `#a3a3a3` 这一档,而且**hover 只换底、不换字色**。稿子自己写得很明白:
 * 「消息辅助信息专用色,不联动全局次级文字或已选中的反馈状态」——
 * 也就是说它是一枚**专用 token**,不是把 `--text-soft` 调一调。
 *
 * ## 为什么断言的是「最终落在元素上的那条声明」
 *
 * jsdom 会跑层叠、会继承自定义属性,但**不解析 `var()`**。所以这里问两件事:
 *   · 自定义属性的最终值(层叠算得出来)—— 证明是哪一条规则赢了;
 *   · 具体属性最终引用的是**哪个** token —— `color: var(--chat-message-muted-ink)`
 *     和 `color: var(--text-soft)` 是两条不同的声明,谁赢一目了然。
 * 真实像素另有无头 Chrome 量。这一层要挡的是「写了一条新规则,却被后面某处
 * 覆盖掉」——chat.css 里同一族选择器写两遍是这个文件的常态。
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHAT_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/styles/chat.css'),
  'utf-8',
);

const USER_MESSAGE = `
  <div class="msg user" id="msg">
    <div class="msg-stack">
      <div class="user-text-wrap">
        <div class="user-text" id="bubble"><span class="user-text-txt">照这两张图复刻。</span></div>
        <div class="user-actions">
          <span class="user-actions-time" id="time">10:24</span>
          <button class="ghost user-copy-btn" id="copy"></button>
        </div>
      </div>
    </div>
  </div>`;

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = CHAT_CSS;
  document.head.appendChild(style);
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '';
});

function mount(): void {
  document.body.innerHTML = USER_MESSAGE;
}

describe('用户气泡', () => {
  it('底色走一枚专用 token,值是稿子的 #121212', () => {
    mount();
    const bubble = document.getElementById('bubble')!;
    // 气泡底、hover 底、以及折行时盖住半个字的那道渐变必须永远同色,
    // 所以只留一个出处 —— 断言的就是那个出处最终算出来的值。
    expect(getComputedStyle(bubble).getPropertyValue('--chat-user-bubble-ground').trim())
      .toBe('#121212');
    expect(getComputedStyle(bubble).getPropertyValue('--bub-bg').trim())
      .toBe('var(--chat-user-bubble-ground)');
  });

  it('暗色下不能是那枚近黑 —— 白字压在近黑底上会看不见', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    mount();
    const bubble = document.getElementById('bubble')!;
    const ground = getComputedStyle(bubble).getPropertyValue('--chat-user-bubble-ground').trim();
    expect(ground).not.toBe('#121212');
    expect(ground).toBe('var(--text-strong)');
  });

  it('正文是 medium', () => {
    mount();
    expect(getComputedStyle(document.getElementById('bubble')!).fontWeight).toBe('500');
  });
});

describe('消息旁的静音动作层', () => {
  it('时间戳和复制共用同一枚静音 token', () => {
    mount();
    const time = document.getElementById('time')!;
    const copy = document.getElementById('copy')!;
    expect(getComputedStyle(time).color).toBe('var(--chat-message-muted-ink)');
    expect(getComputedStyle(copy).color).toBe('var(--chat-message-muted-ink)');
    expect(getComputedStyle(time).getPropertyValue('--chat-message-muted-ink').trim())
      .toBe('#a3a3a3');
  });

  it('fork 脚注也在这一档 —— 稿子把 token 定义在 `.msg-act, .fb, .fork-note` 上', () => {
    document.body.innerHTML = '<div class="fork-note" id="fork">从这里另起一个会话</div>';
    const fork = document.getElementById('fork')!;
    expect(getComputedStyle(fork).color).toBe('var(--chat-message-muted-ink)');
    expect(getComputedStyle(fork).getPropertyValue('--chat-message-muted-ink').trim())
      .toBe('#a3a3a3');
  });

  it('hover 只换底,不换字色 —— 换了就不是「一档静音色」了', () => {
    // `:hover` 在 jsdom 里不参与匹配,所以这一条只能问规则本身:
    // 静音层的 hover 规则里**不许**再出现一条 color。
    const hoverRule = /\.msg\.user \.user-copy-btn:hover\s*\{([^}]*)\}/.exec(CHAT_CSS);
    expect(hoverRule, '找不到复制键的 hover 规则').not.toBeNull();
    const body = hoverRule?.[1] ?? '';
    expect(body).toMatch(/background:/);
    expect(/(^|[;{\s])color\s*:/.test(body)).toBe(false);
  });

  /*
   * 这一层是**消息辅助信息专用**的。它绝不能顺着继承漫到助手页脚那排反馈上 ——
   * 赞/踩选中后是语义绿 / 红,被一档静音色盖掉就等于把「我选过了」这件事抹掉。
   * 反馈那一族的样式住在 `viewer/theater.css` / `viewer/composio.css`(不归这个文件),
   * 所以这里守的是**边界**:chat.css 里消费这枚 token 的选择器,一条都不许落在
   * 反馈 / fork 那一族上。
   */
  it('静音 token 不许漫到反馈上 —— 赞踩选中后是语义绿 / 红', () => {
    const consumers = [...CHAT_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /var\(--chat-message-muted-ink\)/.test(m[2] ?? ''))
      .map((m) => (m[1] ?? '').replace(/\s+/g, ' ').trim());
    expect(consumers.length).toBeGreaterThan(0);
    for (const selector of consumers) {
      expect(selector, `${selector} 不该消费消息静音色`).not.toMatch(
        /feedback|assistant-footer|thumb|is-ok|is-bad/i,
      );
    }
  });
});
