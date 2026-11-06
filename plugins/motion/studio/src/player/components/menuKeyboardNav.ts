import { useEffect, type RefObject } from "react";

/**
 * APG menu keyboard basics for the timeline context menus: focuses the first
 * menu item on open, moves focus with ArrowUp/ArrowDown/Home/End, and gives
 * focus back to the element that held it at open, on unmount, unless an item moved
 * it elsewhere. Pair with `role="menu"` on the container and `role="menuitem"`
 * on the buttons (dismiss/Escape handling stays in useContextMenuDismiss).
 */
export function useMenuKeyboardNav(menuRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const previouslyFocused = document.activeElement;

    const items = () =>
      Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).filter(
        (el) => !el.disabled,
      );
    items()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") {
        return;
      }
      const list = items();
      if (list.length === 0) return;
      e.preventDefault();
      const idx = list.findIndex((el) => el === document.activeElement);
      let next: number;
      if (e.key === "ArrowDown") next = idx < 0 ? 0 : (idx + 1) % list.length;
      else if (e.key === "ArrowUp")
        next = idx < 0 ? list.length - 1 : (idx - 1 + list.length) % list.length;
      else if (e.key === "Home") next = 0;
      else next = list.length - 1;
      list[next]?.focus();
    };
    menu.addEventListener("keydown", onKeyDown);

    return () => {
      menu.removeEventListener("keydown", onKeyDown);
      const active = document.activeElement;
      const focusLeftWithMenu =
        active === null || active === document.body || menu.contains(active);
      if (
        focusLeftWithMenu &&
        previouslyFocused instanceof HTMLElement &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus();
      }
    };
  }, [menuRef]);
}
