/* 总结文案的入场:逐字化开(motion-primitives 的 TextEffect,per='char')。
   ============================================================
   照搬 @ibelick 那个 Text Effect 的【进场】那一半,退出那一半不要 —— 这段话
   出来了就该一直在,是这一轮交给人的结论,不是过场动画。
   上游进场的值:每个字从 opacity 0 + blur(10px) + brightness(0%) 化到
   opacity 1 + blur(0) + brightness(100%),单字 0.4s,字与字之间错开
   staggerChildren 0.01s。这几个数原样搬,写在下面的 CSS 里。
   ------------------------------------------------------------
   CSS 拆不了字,所以这一步必须在 JS 里做:把文本节点切成一个字一个 <span>,
   每个 span 记一个序号 --i,延时由 CSS 用 --i × 0.01s 算。
   ------------------------------------------------------------
   一条不拆的规矩:元素子节点【整个算一个单位】,不钻进去拆 —— <b>12px</b> 拆开的话
      "1/2/p/x" 四个 inline-block 之间就有了断行机会,一行末尾能把它劈成
      "12p" 和 "x"。中文可以逐字断,拉丁词不行,所以整块当一个字处理。
   ------------------------------------------------------------
   JS 没跑起来也不影响阅读:那时页面上一个 .rv 都没有,.say 就是普通一段话,
   动画是加在拆出来的 span 上的,不是把原文先藏起来再放出来。 */
for (const host of document.querySelectorAll('[data-reveal]')) {
  let i = 0;
  const mark = (el) => { el.classList.add('rv'); el.style.setProperty('--i', i++); };

  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const ch of child.data) {
          /* 空白原样留着:包成 inline-block 会吃掉正常的断行位置 */
          if (!ch.trim()) { frag.append(ch); continue; }
          const span = document.createElement('span');
          span.textContent = ch;
          mark(span);
          frag.append(span);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        mark(child);
      }
    }
  };
  walk(host);

}
