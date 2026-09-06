// Thinking 推理流:内容自己匀速往上走,到底了回到顶重来。
// 取自 hextaui 的 ai-thinking(useAutoScroll):它是 setInterval 每 5ms 把
// scrollTop 加 1，到底了归零。这里换成 rAF 推进:机制一样,但不再依赖
// setInterval 那个被浏览器夹到 ~4ms 的下限,也不会在掉帧时越走越慢。
// 速率没照抄,理由见下面那条。
//
// 它是【演示】:真实的 Thinking 是模型边吐边把内容顶上去,不会回到顶重来。
// 稿子里没有真的在吐字的模型,只能拿一段写死的推理循环滚 —— 要看的是这一块
// 的形态(固定高度、内容在走、上下渐隐),不是这段话本身。

// 上游是 1px / 5ms ≈ 200px/s —— 那是配着它那面上百段的字墙的,滚程几千 px。
// 这里的推理只有两百来 px 可滚,照抄那个速率会变成频闪。
//
// 也没有沿用"匀速爬"这个形态:匀速的字永远停在半路,眼睛跟着它走就读不完
// 一行,而这一块是给人扫一眼的。改成【一次走一行,2 秒一次】—— 走的那半秒
// 是过渡,剩下的一秒半停住,让一行字站定在那儿被读完。节奏也因此说得清:
// 每 2 秒换一行 = 每 2 秒它又想了一句。
// 一步的距离取【一行】而不是一整段:段有两三行不等,按段走就成了忽大忽小的
// 跳,而窗口只有 96px(≈5 行),一跳半屏就没了连续感。
const STEP_MS = 2000;   // 多久走一步
const MOVE_MS = 550;    // 这一步花多久走完,余下的时间停住
const FALLBACK_LINE = 18.6;  // 量不到行高时的兜底(12px × 1.55)

// ease-out cubic:起步快、落位慢,停下来的那一下不硬。
const ease = (t) => 1 - Math.pow(1 - t, 3);

const REDUCE = typeof matchMedia !== 'undefined'
  ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function stream(box) {
  let raf = 0;
  let last = 0;
  let from = 0;      // 这一步的起点
  let elapsed = 0;   // 这一步已经过去多久
  let running = false;
  let onScreen = true;

  // 行高按真正那段字量,不写死:字号改了这里跟着改,不用两处对。
  const lineOf = () => {
    const p = box.querySelector('.think');
    const lh = p ? parseFloat(getComputedStyle(p).lineHeight) : NaN;
    return lh > 0 ? lh : FALLBACK_LINE;
  };

  const frame = (now) => {
    if (!running) return;
    const dt = last ? Math.min(100, now - last) : 0; // 切回来时别一下跳一大截
    last = now;
    const max = box.scrollHeight - box.clientHeight;
    if (max > 0) {
      const step = lineOf();
      elapsed += dt;
      while (elapsed >= STEP_MS) {          // 掉帧掉过一整步时补上,不是慢放
        elapsed -= STEP_MS;
        from += step;
        if (from >= max) from = 0;          // 到底了回到顶重来,跟上游一样
      }
      const to = from + step >= max ? max : from + step;
      box.scrollTop = from + (to - from) * ease(Math.min(1, elapsed / MOVE_MS));
    }
    raf = requestAnimationFrame(frame);
  };

  const stop = () => { running = false; last = 0; cancelAnimationFrame(raf); };
  const play = () => {
    if (running || (REDUCE && REDUCE.matches)) return;
    running = true; last = 0;
    raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    if (onScreen && document.visibilityState !== 'hidden') play(); else stop();
  };

  // 折叠收起来的时候不用滚:内容不在视野里,滚了也没人看,
  // 而且收起再展开时该从头开始读,不是接着上次的位置。
  const fold = box.closest('details');
  if (fold) {
    fold.addEventListener('toggle', () => {
      if (fold.open) { from = 0; elapsed = 0; box.scrollTop = 0; sync(); } else stop();
    });
  }

  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(box);
  } else {
    sync();
  }
  document.addEventListener('visibilitychange', sync);
  if (REDUCE) REDUCE.addEventListener('change', () => { stop(); sync(); });
}

for (const box of document.querySelectorAll('.body.mod-stream > .stream-viewport')) stream(box);

// 「刚才按过 Tab」的标记 —— 折叠标题的焦点框只在这个标记在的时候出。
// 为什么不用 :focus-visible 自己判断:Chrome 把 <summary> 的鼠标点击也算成
// focus-visible,于是点一下收起推理就套上一圈蓝框。这里自己记一下输入方式,
// 键盘走过来照常显形,鼠标点的那一路不显。详见 thinking-stream.css 末尾。
const root = document.documentElement;
addEventListener('keydown', (e) => {
  if (e.key === 'Tab') root.dataset.kb = '1';
}, true);
addEventListener('pointerdown', () => { delete root.dataset.kb; }, true);
