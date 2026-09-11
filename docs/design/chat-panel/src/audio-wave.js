// 音频条:真的能播。
// ------------------------------------------------------------
// 没有音频文件,走的是一个按真实时间推进的计时器 —— 稿子里这一条要交代的是
// 【播起来是什么样】:秒数在走、已播那截在长、波形在起伏。这三件事都不需要
// 真的有声音,而放一个假的进度条(比如两秒跑完 48 秒)反倒会把"这段有多长"
// 说错,那正是这一条最该说准的信息。
//
// 停在末尾不自动回零:一段听完了就是听完了,它该停在那儿等你决定 ——
// 自己跳回 0:00 会让人以为没播过。再点一次从头开始。
// 例外是稿子里那一格自动播的演示(data-play):它得一直是「播放中」,所以循环。

const TICK = 200;   // 刷新间隔:秒数一秒一跳,200ms 足够跟上,又不至于每帧重排

const REDUCE = typeof matchMedia !== 'undefined'
  ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** 0:48 —— 和上游 formatDuration 一样,分钟不补零、秒补两位。 */
function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function mount(host) {
  if (host.dataset.audMounted) return;
  host.dataset.audMounted = '1';

  const dur = Number(host.dataset.dur) || 48;
  const bars = [...host.querySelectorAll('.wave > i')];
  const now = host.querySelector('.aud-now');
  const btn = host.querySelector('.aud-b');
  const loop = host.hasAttribute('data-play');   // 稿子里的演示格:听完从头再来
  let at = Number(host.dataset.at) || 0;
  let playing = false, timer = 0, last = 0, onScreen = true, lit = -1;

  const paint = () => {
    now.textContent = clock(at);
    // 柱子只在【该亮的根数变了】的时候动:每 200ms 无脑刷 28 个 class,
    // 一屏上两条就是每秒 280 次无谓的样式写入。
    const n = Math.round(at / dur * bars.length);
    if (n === lit) return;
    lit = n;
    bars.forEach((bar, i) => bar.classList.toggle('is-on', i < n));
  };

  const stop = () => {
    playing = false;
    clearInterval(timer);
    delete host.dataset.playing;
    btn.setAttribute('aria-label', '播放');
  };

  const start = () => {
    if (playing) return;
    if (at >= dur) { at = 0; }          // 听完了再点 = 从头
    playing = true;
    host.dataset.playing = '1';
    btn.setAttribute('aria-label', '暂停');
    last = performance.now();
    timer = setInterval(() => {
      const t = performance.now();
      at += (t - last) / 1000;
      last = t;
      if (at >= dur) {
        // 演示那一格(data-play)听完回到开头接着放:它的标题写着「播放中」,
        // 停在末尾之后那一格就名不副实了 —— 稿子上的状态格得一直是它说的那个状态。
        // 手动点开的那条不循环,该停就停(见上)。
        if (loop) { at = 0; paint(); return; }
        at = dur; paint(); stop(); return;
      }
      paint();
    }, TICK);
  };

  btn.addEventListener('click', () => (playing ? stop() : start()));

  paint();

  // 自动播的那一格(稿子里演示「播放中」的那条)。没人看的时候不空转 ——
  // 和这份稿子里别的循环同一条规矩。
  // 关掉动效的人不自动播:进度停在起点那一帧,手动点仍然能播 ——
  // 秒数和已播那截是信息,不是动效,只有波形起伏那一下由 CSS 的 reduce 段关掉。
  if (host.hasAttribute('data-play') && !(REDUCE && REDUCE.matches)) {
    const sync = () => {
      if (onScreen && document.visibilityState !== 'hidden') start(); else stop();
    };
    if (typeof IntersectionObserver !== 'undefined') {
      new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(host);
    } else {
      sync();
    }
    document.addEventListener('visibilitychange', sync);
  }
}

[...document.querySelectorAll('[data-audio]')].forEach(mount);
