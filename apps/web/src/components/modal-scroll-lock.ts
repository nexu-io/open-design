type ModalScrollLock = { count: number; restore: () => void };

const locks = new WeakMap<HTMLElement, ModalScrollLock>();
export const WEB_MODAL_SCROLL_LOCK_ATTRIBUTE = "data-web-modal-scroll-lock";

function preserveStyle(element: HTMLElement, properties: string[]) {
	const saved = Array.from(element.style)
		.filter((property) => properties.includes(property))
		.map((property) => [
			property,
			element.style.getPropertyValue(property),
			element.style.getPropertyPriority(property),
		] as const);
	return () => {
		for (const property of properties) element.style.removeProperty(property);
		for (const [property, value, priority] of saved) {
			element.style.setProperty(property, value, priority);
		}
	};
}

/**
 * One owner for every host modal's background lock, released in any order.
 * Pin the body at its viewport offset before hiding root overflow so a scrolled
 * host cannot jump to the origin. Keep body width responsive and expose removed
 * scrollbar sizes so CMS backdrops retain their centering while painting across
 * the entire viewport. The home pane is locked by the
 * matching entry-layout.css attribute selector; modal content keeps its scroll.
 * Body overflow is owned by that selector, leaving inline overflow available
 * to Dialog's independent background isolation lifecycle.
 */
export function lockWebModalScroll(body: HTMLElement = document.body): () => void {
	let lock = locks.get(body);
	if (lock) {
		lock.count += 1;
	} else {
		const doc = body.ownerDocument;
		const root = doc.documentElement;
		const scrolling = doc.scrollingElement ?? root;
		const { scrollLeft, scrollTop } = scrolling;
		const width = body.getBoundingClientRect().width;
		const viewportWidth = doc.defaultView?.innerWidth ?? root.clientWidth;
		const scrollbarWidth = (doc.defaultView?.innerWidth ?? root.clientWidth) - root.clientWidth;
		const scrollbarHeight = (doc.defaultView?.innerHeight ?? root.clientHeight) - root.clientHeight;
		const restoreBody = preserveStyle(body, [
			"position", "top", "left", "width",
			"--web-modal-scrollbar-width", "--web-modal-scrollbar-height",
		]);
		const restoreRoot = preserveStyle(root, [
			"overflow", "overflow-x", "overflow-y", "scrollbar-gutter",
		]);
		const previousAttribute = body.getAttribute(WEB_MODAL_SCROLL_LOCK_ATTRIBUTE);
		// Do not introduce a gutter on hosts whose root never had a scrollbar.
		if (scrollbarWidth > 0
			&& doc.defaultView?.getComputedStyle(root).scrollbarGutter === "auto") {
			root.style.scrollbarGutter = "stable";
		}
		body.setAttribute(WEB_MODAL_SCROLL_LOCK_ATTRIBUTE, "");
		body.style.setProperty("--web-modal-scrollbar-width", `${scrollbarWidth}px`);
		body.style.setProperty("--web-modal-scrollbar-height", `${scrollbarHeight}px`);
		body.style.position = "fixed";
		body.style.top = `${-scrollTop}px`;
		body.style.left = `${-scrollLeft}px`;
		// Retain the original gutter while following both viewport expansion and shrinkage.
		body.style.width = `calc(100vw - ${viewportWidth - width}px)`;
		root.style.overflow = "hidden";
		lock = {
			count: 1,
			restore: () => {
				restoreBody();
				restoreRoot();
				if (previousAttribute === null) body.removeAttribute(WEB_MODAL_SCROLL_LOCK_ATTRIBUTE);
				else body.setAttribute(WEB_MODAL_SCROLL_LOCK_ATTRIBUTE, previousAttribute);
				const restoreBehavior = preserveStyle(root, ["scroll-behavior"]);
				root.style.scrollBehavior = "auto";
				scrolling.scrollLeft = scrollLeft;
				scrolling.scrollTop = scrollTop;
				restoreBehavior();
			},
		};
		locks.set(body, lock);
	}
	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (--lock.count > 0) return;
		locks.delete(body);
		lock.restore();
	};
}
