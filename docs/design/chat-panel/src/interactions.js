// 稿子里需要「点一下才看得出来」的交互。
// 静态 HTML 演示不了点击态,但这几条是规格的一部分,不做出来评审就只能靠脑补。

// 「重试」:点下去图标转一圈(360°)。
// 先摘再挂 + 强制一次回流,否则同一个元素连点第二次时 class 没变过,
// 浏览器不会重新起动画。
// 【失败行那枚重试不在这里】—— 它点下去整行淡出(见下面的 .msg-fail),
// 200ms 的淡出会把 500ms 的圈截在半路,看着像卡住了。那一行的回执是
// "行没了",已经说完了,不用再转一圈。
const SPIN_SEL = '.rt, .msg-act .keep';
document.addEventListener('click', (event) => {
  const btn = event.target.closest?.(SPIN_SEL);
  if (!btn) return;
  btn.classList.remove('is-spinning');
  void btn.offsetWidth;
  btn.classList.add('is-spinning');
});

// 转完就摘掉标记,让下一次点击能重新触发。
// 只认这两类身上的:同名的 spin 还给 .mk.is-run 用(那条是 infinite,不会有 animationend)。
document.addEventListener('animationend', (event) => {
  if (event.animationName !== 'spin') return;
  event.target.closest?.(SPIN_SEL)?.classList.remove('is-spinning');
});

// 「重发」:点下去这一行自己消失 —— 重发即是重新发一次,发出去了就没有
// 「发送失败」这回事,不留一个「已重发」的新状态给人读。
// 淡出结束才 display:none,让那 5px margin 跟着一起收掉;
// 演示稿里 1.2s 后自动复原,否则这张卡看一次就空着了。
document.addEventListener('click', (event) => {
  const btn = event.target.closest?.('.msg-fail button');
  if (!btn) return;
  btn.closest('.msg-fail').classList.add('is-sent');
});

document.addEventListener('animationend', (event) => {
  if (event.animationName !== 'msg-fail-out') return;
  const row = event.target;
  row.classList.add('is-gone');
  setTimeout(() => row.classList.remove('is-sent', 'is-gone'), 1200);
});


// 视频控制条的音量:点图标弹出竖滑轨,拖着调,拖到底换成静音那支图标。
// 不做成"点一下直接静音":那是两件事挤在一颗按钮上 —— 想调小声的人会先被静音,
// 再点一次又跳回原音量,中间那一档永远够不着。
const vidVol = (track, clientY) => {
  const r = track.getBoundingClientRect();
  const v = Math.min(1, Math.max(0, (r.bottom - clientY) / r.height));
  track.querySelector('i').style.height = (v * 100).toFixed(1) + '%';
  // 2% 以下就算关了 —— 拖到最底下手指往往差那么一两个像素
  track.closest('.vvol')?.querySelector('.vsound')?.classList.toggle('is-muted', v < 0.02);
};

document.addEventListener('click', (event) => {
  const btn = event.target.closest?.('.art.mod-video .vsound');
  if (btn) {
    const group = btn.closest('.vvol');
    const wasOpen = group.classList.contains('is-open');
    for (const el of document.querySelectorAll('.vvol.is-open')) el.classList.remove('is-open');
    if (!wasOpen) group.classList.add('is-open');
    return;
  }
  // 点在别处收起来;点在滑轨上不算"别处"
  if (!event.target.closest?.('.art.mod-video .vpop')) {
    for (const el of document.querySelectorAll('.vvol.is-open')) el.classList.remove('is-open');
  }
});

document.addEventListener('pointerdown', (event) => {
  const track = event.target.closest?.('.art.mod-video .vtrack');
  if (!track) return;
  event.preventDefault();
  vidVol(track, event.clientY);
  const move = (ev) => vidVol(track, ev.clientY);
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});

// 「新开会话」(Fork):点下去,这一行底下原地落一条分界 + 新会话的开头。
// ------------------------------------------------------------
// 会话标题写死「商城原型」—— 组件全集里没有面板头,这个名字取自场景稿那份
// panel-hd,两份稿子说的是同一个会话。真接产品时它读的是当前会话的标题。
// 线以下【不编一段对话】:刚 fork 出来的会话手里只有上下文,一句话都还没说,
// 编一段假的问答会让人以为 fork 会自己开口。只交代带过来的是什么。
// 再点一次收回去:这是演示稿,一格得能反复看。
const FORK_TITLE = '商城原型';
const forkBlock = () => `
  <div class="fork-sep is-new" aria-label="新会话从这里开始"><i></i><span>${FORK_TITLE}</span><i></i></div>
  <div class="fork-note is-new"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.10508 8.78991C7.45179 10.0635 8.61653 11 10 11H14C16.4703 11 18.5222 12.7915 18.9274 15.1461C20.1303 15.5367 21 16.6668 21 18C21 19.6569 19.6569 21 18 21C16.3431 21 15 19.6569 15 18C15 16.7334 15.7849 15.6501 16.8949 15.2101C16.5482 13.9365 15.3835 13 14 13H10C8.87439 13 7.83566 12.6281 7 12.0004V15.1707C8.16519 15.5825 9 16.6938 9 18C9 19.6569 7.65685 21 6 21C4.34315 21 3 19.6569 3 18C3 16.6938 3.83481 15.5825 5 15.1707V8.82929C3.83481 8.41746 3 7.30622 3 6C3 4.34315 4.34315 3 6 3C7.65685 3 9 4.34315 9 6C9 7.26661 8.21506 8.34988 7.10508 8.78991ZM6 7C6.55228 7 7 6.55228 7 6C7 5.44772 6.55228 5 6 5C5.44772 5 5 5.44772 5 6C5 6.55228 5.44772 7 6 7ZM6 19C6.55228 19 7 18.5523 7 18C7 17.4477 6.55228 17 6 17C5.44772 17 5 17.4477 5 18C5 18.5523 5.44772 19 6 19ZM18 19C18.5523 19 19 18.5523 19 18C19 17.4477 18.5523 17 18 17C17.4477 17 17 17.4477 17 18C17 18.5523 17.4477 19 18 19Z"/></svg>上文已带过来,接着说就行</div>`;

document.addEventListener('click', (event) => {
  const btn = event.target.closest?.('.fb button[aria-label="新开会话"]');
  if (!btn) return;
  const row = btn.closest('.fb');
  const box = row.parentElement;
  // 钉住那一格演示的是"落好之后长什么样",不参与开合。
  if (box.querySelector('.fork-sep.is-pinned')) return;
  const shown = box.querySelector('.fork-sep');
  if (shown) {
    box.querySelector('.fork-note')?.remove();
    shown.remove();
    return;
  }
  row.insertAdjacentHTML('afterend', forkBlock());
});

// 超长消息折到 6 行之后,文末那枚「…」只在【真的还有下文】时才挂上。
// ------------------------------------------------------------
// -webkit-line-clamp 自己不告诉你有没有截断,CSS 也问不出来 —— 只能量:
// 被压住内容的盒子,scrollHeight 会高过 clientHeight。留 1px 容差,
// 免得亚像素行高把没截断的也算成截断了。
// 宽度一变(面板宽窄、窗口缩放)结论就可能翻过来,所以 resize 时重量一次。
const markClamped = () => {
  for (const bub of document.querySelectorAll('.bub.mod-clamp')) {
    const txt = bub.querySelector('.txt');
    if (!txt) continue;
    bub.classList.toggle('is-cut', txt.scrollHeight - txt.clientHeight > 1);
  }
};
markClamped();
addEventListener('resize', markClamped);
// 字体是内嵌的 base64,量的时候可能还没上屏 —— 字体一到位行宽会变,再量一次。
document.fonts?.ready.then(markClamped);

// 附件行两端的翻页箭头:只在【真的还有东西被遮住】时才出。
// ------------------------------------------------------------
// 滚动条是藏起来的,所以"还能往哪边走"没人说;而 CSS 问不出一个可滚容器
// 现在停在哪儿 —— 只能量 scrollLeft / scrollWidth / clientWidth,
// 量出来的结论落成 .is-prev / .is-next 两个类,样式只认这两个类。
// 壳子由 JS 现包:标记里那一行仍旧只是 .att,JS 不跑就是今天这个样子,
// 一行照样能横向滚(触控板),只是少了两枚给鼠标点的靶子。
const ATT_CHEV = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.9999 13.1714L16.9497 8.22168L18.3639 9.63589L11.9999 15.9999L5.63599 9.63589L7.0502 8.22168L11.9999 13.1714Z"/></svg>';

const attNav = (row) => {
  const wrap = document.createElement('div');
  wrap.className = 'att-wrap';
  row.replaceWith(wrap);
  wrap.append(row);
  wrap.insertAdjacentHTML('beforeend',
    `<button class="att-nav mod-prev" type="button" aria-label="看前面的附件"><i>${ATT_CHEV}</i></button>` +
    `<button class="att-nav mod-next" type="button" aria-label="看后面的附件"><i>${ATT_CHEV}</i></button>`);

  // 1px 的容差:亚像素宽度下 scrollLeft 到底了也可能差那么零点几。
  const sync = () => {
    const max = row.scrollWidth - row.clientWidth;
    wrap.classList.toggle('is-prev', max > 1 && row.scrollLeft > 1);
    wrap.classList.toggle('is-next', max > 1 && row.scrollLeft < max - 1);
  };

  // 一次走【八成宽】而不是整屏:留两成的重叠,翻过去还能看见刚才那一张,
  // 人才知道自己是接着看,不是跳到了另一段。
  for (const btn of wrap.querySelectorAll('.att-nav')) {
    btn.addEventListener('click', () => {
      const step = row.clientWidth * 0.8;
      row.scrollBy({ left: btn.classList.contains('mod-prev') ? -step : step, behavior: 'smooth' });
    });
  }

  row.addEventListener('scroll', sync, { passive: true });
  addEventListener('resize', sync);
  // 缩略图是 CSS 画的、字体是内嵌的 —— 都可能在这一行之后才把宽度定下来。
  document.fonts?.ready.then(sync);
  new ResizeObserver(sync).observe(row);
  sync();
};

for (const row of document.querySelectorAll('.att')) attNav(row);

// ---- 文件名太长:从【中间】截断 ----
// ------------------------------------------------------------
// 尾巴省略(CSS 那套 text-overflow)对文件名是最差的一种截法:被吃掉的正好是
// 扩展名,而"这是张图还是个 html"往往比中段那串修饰词更要紧。
// 所以这里两头都留:
//   头 —— 留到放不下为止,它是"这是哪个东西"(设置页 / product-card)
//   尾 —— 【只留扩展名】,它是"这是什么文件"
//   中间那截修饰词(-第三轮评审-final-v3-20260821)信息密度最低,省掉的就是它
// 尾巴钉死在扩展名上还有个好处:头一长宽度就单调变宽,可以二分,
// 结果是精确的"放得下的最长的那一版",不是估出来的。
//
// 为什么不用 CSS:中间省略在 CSS 里没有对应写法(text-overflow 只认两端),
// 而且真正的可用宽度要等这一行别的东西(耗时、+182/-0、失败按钮)都排完才知道。

const ELL = '\u2026';

// 预算【按整行算】,不拿名字自己去试。
// ------------------------------------------------------------
// 一开始写的是"把名字放回去,看 .nm 溢没溢出"。看着直接,其实是个棘轮:
// 这些行里的 .nm 是 flex: 0 1 auto —— 宽度跟着内容走。名字一截短,.nm 跟着变窄,
// 下次再量,可用宽度就是那个已经缩过的值,于是只会越截越短、永远长不回去。
// 改成从【行】倒推:行宽减去左右内边距、减去别的子元素(图标、耗时、失败按钮)、
// 减去它们之间的 gap,再减去「读取 」那一截前缀 —— 剩下的才是名字能占的地方。
// 这几样都跟名字本身无关,所以名字怎么变,预算都是同一个数。
const budgetFor = (row, nm, btn) => {
  const cs = getComputedStyle(row);
  const gap = parseFloat(cs.columnGap) || 0;
  let left = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  for (const kid of row.children) if (kid !== nm) left -= kid.getBoundingClientRect().width;
  left -= gap * Math.max(0, row.children.length - 1);
  // 前缀 = .nm 的内容宽 - 按钮宽。名字换了按钮会变宽,前缀不会。
  return left - (nm.scrollWidth - btn.getBoundingClientRect().width);
};

const midTrunc = (code) => {
  const nm = code.closest('.nm');
  const row = code.closest('.tool');
  const btn = code.closest('.fn');
  if (!nm || !row || !btn) return;

  const full = code.dataset.full ?? (code.dataset.full = code.textContent);
  code.textContent = full;                       // 先还原:地方变宽时要能长回去
  const budget = budgetFor(row, nm, btn);
  // 上一次是按多宽算的?一样就不重排 —— 省掉每次通知都跑一轮二分。
  const key = Math.round(budget);
  const w = () => btn.getBoundingClientRect().width;

  if (w() <= budget) { btn.removeAttribute('title'); code.dataset.w = String(key); return; }
  if (code.dataset.w === String(key) && code.dataset.cut) {
    code.textContent = code.dataset.cut; return;
  }

  const dot = full.lastIndexOf('.');
  const tail = dot > 0 ? full.slice(dot) : '';   // 含点;没有扩展名就只留头
  let lo = 0, hi = full.length - tail.length - 1, best = ELL + tail;
  while (lo <= hi) {
    const k = (lo + hi) >> 1;
    code.textContent = full.slice(0, k) + ELL + tail;
    if (w() <= budget) { best = code.textContent; lo = k + 1; } else hi = k - 1;
  }
  code.textContent = best;
  code.dataset.w = String(key);
  code.dataset.cut = best;
  // 截过之后,完整的名字仍然拿得到:悬停出气泡,读屏念 aria-label(标记里已有)。
  btn.setAttribute('title', full);
};

const names = [...document.querySelectorAll('.tool .nm .fn > code')];
if (names.length) {
  // 自己改文字有可能又惊动 ResizeObserver,重入一层就再算一遍 —— 加把锁。
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    try { for (const c of names) midTrunc(c); } finally { running = false; }
  };
  // 面板宽度会变(演示页两列变一列),每一行各自盯着自己所在的那一行。
  const ro = new ResizeObserver(run);
  for (const code of names) { const row = code.closest('.tool'); if (row) ro.observe(row); }
  // 窗口尺寸这一路单独再挂一次。ResizeObserver 的通知是【按帧】投递的,
  // 页面不可见(切到别的标签页、窗口被压在后面)时不产帧,也就不通知。
  addEventListener('resize', run);
  // 内嵌字体加载完宽度会变一次,不重跑的话第一屏是按后备字体截的。
  document.fonts?.ready.then(run);
  run();
}

// 意图澄清里的颜色选择。
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

for (const picker of document.querySelectorAll('[data-color-picker]')) {
  const native = picker.querySelector('.color-native');
  const hex = picker.querySelector('.color-hex');
  const next = picker.querySelector('[data-color-next]');
  const swatches = [...picker.querySelectorAll('.color-swatch')];
  let current = native.value.toLowerCase();

  const paint = (value, syncText = true) => {
    current = value.toLowerCase();
    picker.style.setProperty('--choice-color', current);
    native.value = current;
    if (syncText) hex.value = current;
    hex.setAttribute('aria-invalid', 'false');
    next.disabled = false;
    for (const swatch of swatches) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.color.toLowerCase() === current));
    }
  };

  for (const swatch of swatches) {
    swatch.addEventListener('click', () => paint(swatch.dataset.color));
  }

  native.addEventListener('input', () => paint(native.value));
  hex.addEventListener('input', () => {
    const value = hex.value.trim();
    if (HEX_COLOR.test(value)) {
      paint(value, false);
      return;
    }
    hex.setAttribute('aria-invalid', 'true');
    next.disabled = true;
  });
  hex.addEventListener('blur', () => {
    if (!HEX_COLOR.test(hex.value.trim())) paint(current);
  });
}

// 意图澄清里的语言下拉:常用语言直接展示,低频语言由「更多语言」展开。
// 更多列表的可见高度由 CSS 固定为 6.5 行;这里只管开合与单选状态。
document.addEventListener('click', (event) => {
  const more = event.target.closest?.('[data-language-select] .language-more-toggle');
  if (more) {
    const list = more.nextElementSibling;
    const open = list.hidden;
    list.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    return;
  }

  const option = event.target.closest?.('[data-language-select] .language-option');
  if (!option) return;
  const picker = option.closest('[data-language-select]');
  for (const item of picker.querySelectorAll('.language-option')) item.setAttribute('aria-selected', String(item === option));
  const next = picker.closest('.cbody')?.querySelector('.foot .mod-primary');
  if (next) next.disabled = false;
});

// 意图澄清里的版面密度:数字输入与滑杆共用同一个值。
// 直接输入超出范围的数字时收进 1–5 档;拖动时上方数字实时跟随。
for (const field of document.querySelectorAll('[data-number-slider]')) {
  const slider = field.querySelector('.amount-slider');
  const range = field.querySelector('.amount-range');
  const input = field.querySelector('[data-slider-input]');
  if (!slider || !range || !input) continue;

  const min = Number(range.min);
  const max = Number(range.max);
  const step = Number(range.step) || 1;
  let current = Number(range.value);

  const normalize = (raw) => {
    const snapped = min + Math.round((Number(raw) - min) / step) * step;
    return Math.min(max, Math.max(min, snapped));
  };

  const paint = (raw) => {
    if (String(raw).trim() === '' || !Number.isFinite(Number(raw))) return;
    current = normalize(raw);
    range.value = String(current);
    input.value = String(current);
    slider.style.setProperty('--range-pct', `${((current - min) / (max - min)) * 100}%`);
    range.setAttribute('aria-valuetext', `${current} 档`);
  };

  range.addEventListener('input', () => paint(range.value));
  input.addEventListener('input', () => paint(input.value));
  input.addEventListener('blur', () => paint(input.value || current));
  paint(current);
}
