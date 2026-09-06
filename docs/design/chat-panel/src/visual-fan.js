// 视觉方向卡右上角那个排布切换。
// 叠放 ⇄ 网格。这一条必须真的能点 —— 稿子里"默认叠着"成立的前提就是
// "想铺开随时铺得开",做成静态图等于把这个前提藏起来让人自己脑补。
//
// 「换一批」和「随机」暂不接:它们要换的是预览图本身,而这份稿子里的预览是
// CSS 画的灰块,四张长得一样,换了也看不出换过 —— 做一个看不出效果的动作,
// 比不做更让人怀疑是不是坏了。

document.addEventListener('click', (event) => {
  const btn = event.target.closest?.('.vswitch');
  if (!btn) return;
  const opts = btn.closest('.opts.mod-visual');
  if (!opts) return;
  const next = opts.dataset.view === 'fan' ? 'grid' : 'fan';
  opts.dataset.view = next;
  // 图标和文字由 CSS 跟着 data-view 换;这里只把读屏念的那句同步过去。
  btn.setAttribute('aria-label', next === 'fan' ? '铺成网格' : '叠回一沓');
});

// ---- 左右箭头翻这一沓 ----
// 和拖拽是同一个动作的两条路:都只改 DOM 顺序,位置全交给 CSS 那几条 nth-child,
// 所以两条路走完的结果一定一致,不会各自算出一套位置来。
//   下一张 = 把最前面那张排到队尾
//   上一张 = 把队尾那张提到最前面
// 提到最前面时先把过渡关掉再开:它是从"队尾那张的位置"跳过来的,留着过渡的话
// 会看见它从左上角横穿整叠飞到手边,而它本来就该已经在那儿了。
document.addEventListener('click', (event) => {
  const btn = event.target.closest?.('.vnav-b');
  if (!btn) return;
  const wrap = btn.closest('.opts.mod-visual')?.querySelector('.vwrap');
  if (!wrap) return;
  const cards = [...wrap.querySelectorAll('.vopt')];
  if (cards.length < 2) return;

  if (btn.dataset.nav === 'next') {
    wrap.appendChild(cards[0]);
    return;
  }
  const last = cards[cards.length - 1];
  last.style.transition = 'none';
  wrap.insertBefore(last, cards[0]);
  requestAnimationFrame(() => { last.style.transition = ''; });
});

// ---- 那一沓可以拖着翻 ----
// 换成 21st.dev @tonyzebastian/image-stack 的那套形式:按住最前面那张往外拖,
// 拖过一段就松手,它翻到最后面,下一张顶上来。原来只能看不能动,四张里除了
// 最前面那张其余永远只露侧边 —— "还有几个"说到了,"是哪几个"没说。
//
// 不用拖满全程:超过阈值就当你要翻,剩下的路由动效走完(和真机上甩卡一样)。
// 位移不够就当没翻,弹回原位;位移小于 6px 更是压根不算拖,让它照常当点击 ——
// 选中一张仍然靠点。
const STACK_THROW = 56;   // 翻页阈值(px)
const STACK_TAP = 6;      // 小于这个位移仍算点击

document.addEventListener('pointerdown', (event) => {
  const card = event.target.closest?.('.opts.mod-visual[data-view="fan"] .vopt');
  if (!card || card !== card.parentElement.firstElementChild) return;

  const wrap = card.parentElement;
  const startX = event.clientX, startY = event.clientY;
  let dx = 0, dy = 0, moved = false;

  const onMove = (e) => {
    dx = e.clientX - startX; dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < STACK_TAP) return;
    moved = true;
    card.style.transition = 'none';
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 22}deg)`;
    card.style.zIndex = '9';
  };

  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    if (!moved) return;

    const throwOut = Math.hypot(dx, dy) > STACK_THROW;
    card.style.transition = '';           // 交回给 CSS 那条 transform 过渡
    if (!throwOut) { card.style.transform = ''; card.style.zIndex = ''; return; }

    // 先甩出去一截,再插到队尾 —— 直接 append 会让它从手上瞬移到最后一格。
    // 收尾用定时器而不是 transitionend:甩出去这一下如果被"当前 transform 恰好
    // 等于目标值"之类的边界情形吃掉,transitionend 永远不来,那张卡就卡在手上了。
    const k = 2.2;
    card.style.transform = `translate(${dx * k}px, ${dy * k}px) rotate(${dx / 10}deg)`;
    setTimeout(() => {
      wrap.appendChild(card);             // 排到最后,nth-child 的那几条自动接管
      card.style.transform = ''; card.style.zIndex = '';
    }, 190);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
});
