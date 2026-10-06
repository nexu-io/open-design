import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';
type InputModality = 'keyboard' | 'pointer';

interface TooltipState {
  target: HTMLElement;
  text: string;
  placement: TooltipPlacement;
  /**
   * 气泡此刻该不该看得见。**这不等于「有没有 state」** —— 隐藏时我们保留
   * target / text / style 不动,只把这一位翻成 false,于是节点留在 DOM 里
   * 从 opacity 1 淡到 0,而且淡出全程还带着最后那句话,不会先塌成空盒。
   * 理由见下面 `TooltipLayer` 的 docblock。
   */
  visible: boolean;
  /**
   * 这次隐藏**不许淡**,立刻不可见。
   *
   * 两种情形要这个:
   * ① 用户已经把这颗按钮按下去了(pointerdown / click / Enter / Space)——
   *    名字该在按下那一刻就让位,而不是压在刚触发的东西上面淡 100ms。
   *    「截图到对话」那条路正卡在这里:`FileViewer.captureExportImageSnapshot`
   *    等两帧就让宿主合成器抓屏,100ms 的淡出到那时还剩两成多不透明度,
   *    会原样印进截图里。
   * ② 触发元素已经从 DOM 里没了 —— 气泡指着空气,没有淡出的道理。
   */
  instant: boolean;
  style: {
    x: number;
    y: number;
    /**
     * 量过没有。新目标第一帧还不知道气泡多宽,先按 `hidden` 渲染,
     * `useLayoutEffect` 在**浏览器绘制之前**量完并改成 `visible` ——
     * 所以那一帧永远不会以 (0,0) 的位置画出来。
     */
    visibility: 'hidden' | 'visible';
  };
}

const TOOLTIP_MARGIN = 8;
/**
 * 气泡和触发元素之间的距离。**6,不是 7** —— 稿
 * `729fa43ce7:docs/design/chat-panel/src/components.css:2701` 的
 * `bottom: calc(100% + 6px)`,朝下那一支(:2721 `top: calc(100% + 6px)`)同值。
 * 四个方向共用这一个数:稿子只画了上下两向,左右是 portal 才有的,跟着同一个数走。
 */
const TOOLTIP_GAP = 6;

function isTooltipTarget(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement
    && el.classList.contains('od-tooltip')
    && Boolean(el.dataset.tooltip?.trim())
    && el.getAttribute('aria-expanded') !== 'true';
}

function readTooltipTarget(start: EventTarget | null): HTMLElement | null {
  if (!(start instanceof Element)) return null;
  const candidate = start.closest('.od-tooltip[data-tooltip]');
  return isTooltipTarget(candidate) ? candidate : null;
}

function tooltipPlacement(target: HTMLElement): TooltipPlacement {
  const raw = target.dataset.tooltipPlacement;
  return raw === 'bottom' || raw === 'left' || raw === 'right' ? raw : 'top';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positionTooltip(
  target: HTMLElement,
  tooltip: HTMLElement,
  placement: TooltipPlacement,
): TooltipState['style'] {
  const rect = target.getBoundingClientRect();
  const tip = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = Math.max(TOOLTIP_MARGIN, viewportWidth - tip.width - TOOLTIP_MARGIN);
  const maxTop = Math.max(TOOLTIP_MARGIN, viewportHeight - tip.height - TOOLTIP_MARGIN);

  let left = rect.left + rect.width / 2 - tip.width / 2;
  let top = rect.top - tip.height - TOOLTIP_GAP;

  if (placement === 'bottom') {
    top = rect.bottom + TOOLTIP_GAP;
  } else if (placement === 'left') {
    left = rect.left - tip.width - TOOLTIP_GAP;
    top = rect.top + rect.height / 2 - tip.height / 2;
  } else if (placement === 'right') {
    left = rect.right + TOOLTIP_GAP;
    top = rect.top + rect.height / 2 - tip.height / 2;
  }

  return {
    x: Math.round(clamp(left, TOOLTIP_MARGIN, maxLeft)),
    y: Math.round(clamp(top, TOOLTIP_MARGIN, maxTop)),
    visibility: 'visible',
  };
}

function sameStyle(
  left: TooltipState['style'],
  right: TooltipState['style'],
): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.visibility === right.visibility;
}

/**
 * 全应用共用的一枚提示气泡(body portal)。
 *
 * ## 为什么节点常驻挂载,而不是 hide 时卸载
 *
 * 稿子 `729fa43ce7:docs/design/chat-panel/src/components.css:2699-2711` 的气泡是挂在
 * `[data-tip]::after` 上的:那个伪元素**一直存在**,`opacity: 0` 起手,hover /
 * `:focus-visible` 时切到 `1`,靠 `transition: opacity var(--duration-faster)
 * var(--ease-out)` 淡进淡出。
 *
 * 这里是 portal,原来 hide 时直接 `return null` 把节点卸载掉 —— 元素根本没机会
 * 在 DOM 里从 `opacity:0` 走到 `1`,那条 `transition` 写了也是死规则(W126 那一轮
 * 正是因此没搬它)。产品 2026-09-03 拍板做重构:**节点一直挂着,只切 opacity**。
 *
 * ## 常驻挂载带来的那一个坑:读屏
 *
 * 一个永远在 DOM 里的 `role="tooltip"` 节点,不处理的话读屏软件在它不可见时
 * 照样念得出来。所以隐藏态挂 `aria-hidden="true"`,把它整个从可访问性树里摘掉;
 * `pointer-events: none`(`styles/primitives.css`)保证它也挡不住任何点击。
 * 判据在 `tests/components/w129-tooltip-fade.test.tsx` 的「读屏」那一组。
 *
 * ## 目标之间切换时不淡
 *
 * `pointerout` 与下一颗按钮的 `pointerover` 在同一轮事件循环里发生,React 批处理
 * 之后只剩一次渲染:`visible` 全程为 true,气泡直接换词换位置。这正是共享一枚气泡
 * 该有的样子 —— 淡出再淡入会让相邻两颗图标之间的移动看起来一卡一卡。
 */
export function TooltipLayer() {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastInputRef = useRef<InputModality>('pointer');
  const suppressedTitleRef = useRef<{ target: HTMLElement; title: string } | null>(null);
  const [state, setState] = useState<TooltipState | null>(null);

  const restoreNativeTitle = useCallback(() => {
    const suppressed = suppressedTitleRef.current;
    if (!suppressed) return;
    if (document.contains(suppressed.target)) {
      if (!suppressed.target.hasAttribute('title')) {
        suppressed.target.setAttribute('title', suppressed.title);
      }
      suppressed.target.removeAttribute('data-od-tooltip-native-title');
    }
    suppressedTitleRef.current = null;
  }, []);

  const suppressNativeTitle = useCallback((target: HTMLElement) => {
    if (suppressedTitleRef.current?.target === target) return;
    restoreNativeTitle();
    const title = target.getAttribute('title');
    if (!title) return;
    target.setAttribute('data-od-tooltip-native-title', title);
    target.removeAttribute('title');
    suppressedTitleRef.current = { target, title };
  }, [restoreNativeTitle]);

  const hideTooltip = useCallback((
    options: { restoreTitle?: boolean; instant?: boolean } = {},
  ) => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (options.restoreTitle !== false) restoreNativeTitle();
    const instant = options.instant === true;
    /* 不清 state:target / text / style 原样留着,气泡带着最后那句话淡出去。
       清成 null 会让盒子先塌成空的再淡,而且下一次 show 又得从 (0,0) 量起。 */
    setState((current) => (current === null || (!current.visible && current.instant === instant)
      ? current
      : { ...current, visible: false, instant }));
  }, [restoreNativeTitle]);

  const hideTooltipForActivation = useCallback((target: HTMLElement | null) => {
    /* 按下去 = 立刻让位,见 `TooltipState.instant` 的注释。 */
    if (!target) {
      hideTooltip({ instant: true });
      return;
    }
    suppressNativeTitle(target);
    hideTooltip({ restoreTitle: false, instant: true });
  }, [hideTooltip, suppressNativeTitle]);

  const showTooltip = useCallback((target: HTMLElement) => {
    const text = target.dataset.tooltip?.trim();
    if (!text) return;
    suppressNativeTitle(target);
    const placement = tooltipPlacement(target);
    setState((current) => {
      if (current?.target === target) {
        if (current.text === text && current.placement === placement && current.visible) {
          return current;
        }
        return { ...current, text, placement, visible: true, instant: false };
      }
      return {
        target,
        text,
        placement,
        visible: true,
        instant: false,
        /* 换目标时**沿用上一次量到的位置**当种子,只把 `visibility` 打回 `hidden`
           标成「还没量」。用 (0,0) 当种子的话,万一 layout effect 没赶在绘制前跑完,
           气泡会在屏幕左上角闪一下。 */
        style: current
          ? { ...current.style, visibility: 'hidden' }
          : { x: 0, y: 0, visibility: 'hidden' },
      };
    });
  }, [suppressNativeTitle]);

  const updatePosition = useCallback(() => {
    setState((current) => {
      if (!current) return null;
      /* 已经在淡出的气泡不再跟着滚动/缩放重新定位 —— 它要停在原地淡完。 */
      if (!current.visible) return current;
      /* 触发元素没了就立刻收,别对着空气淡 */
      if (!document.contains(current.target)) {
        return { ...current, visible: false, instant: true };
      }
      if (current.target.getAttribute('aria-expanded') === 'true') {
        return { ...current, visible: false, instant: false };
      }
      const node = tooltipRef.current;
      if (!node) return current;
      const placement = tooltipPlacement(current.target);
      const nextText = current.target.dataset.tooltip?.trim() ?? current.text;
      const nextStyle = positionTooltip(current.target, node, placement);
      if (
        current.text === nextText
        && current.placement === placement
        && sameStyle(current.style, nextStyle)
      ) {
        return current;
      }
      return {
        ...current,
        text: nextText,
        placement,
        style: nextStyle,
      };
    });
  }, []);

  const scheduleUpdatePosition = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updatePosition();
    });
  }, [updatePosition]);

  useLayoutEffect(() => {
    if (!state?.visible) return;
    updatePosition();
  }, [state?.target, state?.text, state?.placement, state?.visible, updatePosition]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      restoreNativeTitle();
    };
  }, [restoreNativeTitle]);

  useEffect(() => {
    /* 只在气泡看得见时盯着触发元素。淡出之后 `state.target` 还留着(见 `visible`
       的注释),不加这一位的话观察器会一直挂在一颗已经跟气泡无关的按钮上。 */
    if (!state?.visible || typeof MutationObserver === 'undefined') return;
    const target = state.target;
    const observer = new MutationObserver(() => {
      if (!isTooltipTarget(target)) {
        hideTooltip({ restoreTitle: false });
      }
    });
    observer.observe(target, {
      attributes: true,
      attributeFilter: ['aria-expanded', 'class', 'data-tooltip', 'disabled'],
    });
    return () => observer.disconnect();
  }, [hideTooltip, state?.target, state?.visible]);

  useEffect(() => {
    const shouldShowForFocus = (target: HTMLElement) => {
      if (lastInputRef.current === 'keyboard') return true;
      try {
        return target.matches(':focus-visible');
      } catch {
        return false;
      }
    };
    const onPointerOver = (event: PointerEvent) => {
      lastInputRef.current = 'pointer';
      const target = readTooltipTarget(event.target);
      if (target) showTooltip(target);
    };
    const onPointerOut = (event: PointerEvent) => {
      const target = readTooltipTarget(event.target);
      if (!target) return;
      const next = event.relatedTarget;
      if (next instanceof Node && target.contains(next)) return;
      hideTooltip();
    };
    const onPointerDown = (event: PointerEvent) => {
      lastInputRef.current = 'pointer';
      hideTooltipForActivation(readTooltipTarget(event.target));
    };
    const onPointerCancel = () => {
      lastInputRef.current = 'pointer';
      hideTooltip();
    };
    const onClick = (event: MouseEvent) => {
      hideTooltipForActivation(readTooltipTarget(event.target));
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = readTooltipTarget(event.target);
      if (!target) return;
      if (shouldShowForFocus(target)) {
        showTooltip(target);
        return;
      }
      suppressNativeTitle(target);
    };
    const onFocusOut = (event: FocusEvent) => {
      const target = readTooltipTarget(event.target);
      if (!target) return;
      const next = event.relatedTarget;
      if (next instanceof Node && target.contains(next)) return;
      hideTooltip();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      lastInputRef.current = 'keyboard';
      if (event.key === 'Escape') hideTooltip();
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        hideTooltipForActivation(readTooltipTarget(event.target));
      }
    };

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('click', onClick);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', scheduleUpdatePosition);
    window.addEventListener('scroll', scheduleUpdatePosition, true);
    return () => {
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointercancel', onPointerCancel);
      document.removeEventListener('click', onClick);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', scheduleUpdatePosition);
      window.removeEventListener('scroll', scheduleUpdatePosition, true);
    };
  }, [hideTooltip, hideTooltipForActivation, scheduleUpdatePosition, showTooltip, suppressNativeTitle]);

  if (typeof document === 'undefined') return null;

  const visible = state?.visible === true;
  const measured = state !== null && state.style.visibility === 'visible';
  /* `visibility` 只用来挡住三种「不该被画出来」的帧,和淡入淡出无关:
     ① 还没有过任何目标(state 为 null),盒子是空的;
     ② 新目标刚进来、还没量到尺寸(measured 为 false);
     ③ 这次是 `instant` 收场(按下去了 / 触发元素没了)—— 一刀切掉,不留淡出。
     正常淡出中的气泡三种都不是,它必须留在 `visible` 上,
     否则 opacity 过渡还没跑完就被 `visibility: hidden` 砍断。 */
  const painted = state !== null && (visible ? measured : !state.instant);

  return createPortal(
    <div
      ref={tooltipRef}
      className="od-tooltip-layer"
      role="tooltip"
      /* 常驻挂载的代价在这里买单:不可见时整个从可访问性树里摘掉,
         否则读屏软件会一直念得到这枚气泡。 */
      aria-hidden={visible ? undefined : true}
      data-tooltip-context={state?.target.closest('[role="menu"]') ? 'menu' : undefined}
      style={{
        transform: `translate3d(${state?.style.x ?? 0}px, ${state?.style.y ?? 0}px, 0)`,
        visibility: painted ? 'visible' : 'hidden',
        opacity: visible ? 1 : 0,
      }}
    >
      {state?.text ?? ''}
    </div>,
    document.body,
  );
}
