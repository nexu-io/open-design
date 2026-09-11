// Plan 卡的进度演示。
// ------------------------------------------------------------
// 这张卡在产品里【无操作】—— 它只报进度,不接受点击。所以演示不能做成
// 「点一下打个勾」:那会把一个只读的卡片说成可交互的。
// 但它要展示的恰恰是【状态之间的那一下】(勾描出来、划线拉开、计数滚一格、
// 全做完时头部换成绿勾),静态截图一帧都看不到。
// 折中:只有画廊里那张挂了 data-plan-demo 的卡会自己往前走,循环一遍再回到
// 起点;场景稿那张不挂,永远停在 2/4 —— 那是对话里的某一刻,不该动。

const TICK = 2400; // 每打一个勾之间的停顿:够看完描勾 + 划线,又不至于等
const HOLD = 3000; // 全做完之后多停一会儿,让「已完成」那一帧被看见

const REDUCE = typeof matchMedia !== 'undefined'
  ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** 计数里变的那一位:旧的往上走、新的从下面顶上来。 */
function setRoll(roll, next, animate) {
  if (roll.dataset.v === next) return;
  roll.dataset.v = next;

  const cur = roll.querySelector('span:not(.is-out)');
  // 不做动画时直接换字 —— 也走这条:reduced-motion 下 CSS 把 animation 关了,
  // animationend 永远不会来,靠事件收尾的那条路会把旧的一位永久留在 DOM 里。
  if (!animate || !cur) {
    roll.replaceChildren(Object.assign(document.createElement('span'), { textContent: next }));
    return;
  }

  cur.classList.add('is-out');
  cur.addEventListener('animationend', () => cur.remove(), { once: true });

  const incoming = document.createElement('span');
  incoming.className = 'is-in';
  incoming.textContent = next;
  incoming.addEventListener('animationend', () => incoming.classList.remove('is-in'), { once: true });
  roll.appendChild(incoming);
}

function drive(card) {
  const items = [...card.querySelectorAll('.steps li')];
  if (!items.length) return;

  const roll = card.querySelector('.h .roll');
  const titleEl = card.querySelector('.h b');
  const runTitle = titleEl ? titleEl.textContent : '';
  // 全做完了标题也得跟着改。头部图标换成绿勾、计数变绿,标题还写着「执行中」,
  // 三个地方两种说法 —— 看的人会先怀疑是不是卡住了。
  const doneTitle = card.dataset.planDoneTitle || runTitle;
  const total = items.length;
  const base = items.filter((li) => li.classList.contains('is-done')).length;

  let done = base;
  let timer = 0;
  let running = false;
  let onScreen = true;

  const paint = (animate) => {
    items.forEach((li, i) => {
      li.classList.toggle('is-done', i < done);
      li.classList.toggle('is-now', i === done && done < total);
    });
    const all = done === total;
    card.classList.toggle('is-all-done', all);
    if (titleEl) titleEl.textContent = all ? doneTitle : runTitle;
    if (roll) setRoll(roll, String(done), animate);
  };

  const tick = () => {
    if (done < total) {
      done += 1;
      paint(true);
      timer = setTimeout(tick, done === total ? HOLD : TICK);
      return;
    }
    // 回到起点。这一帧不走过渡 —— 勾倒着描回去、划线倒着收回去,读起来像
    // 「刚才那几步被取消了」,而它其实只是这段循环重新开始。
    done = base;
    card.classList.add('is-resetting');
    paint(false);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('is-resetting')));
    timer = setTimeout(tick, TICK);
  };

  const stop = () => { running = false; clearTimeout(timer); };
  const play = () => {
    if (running || (REDUCE && REDUCE.matches)) return;
    running = true;
    timer = setTimeout(tick, TICK);
  };
  const sync = () => {
    if (onScreen && document.visibilityState !== 'hidden') play(); else stop();
  };

  paint(false);

  // 没人看的时候不空转,和球那边同一条。
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(card);
  } else {
    sync();
  }
  document.addEventListener('visibilitychange', sync);
  if (REDUCE) REDUCE.addEventListener('change', () => { stop(); sync(); });
}

for (const card of document.querySelectorAll('[data-plan-demo]')) drive(card);
