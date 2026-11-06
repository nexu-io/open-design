import { thumbnailScheduler, type ThumbnailScheduler } from "./thumbnailScheduler";

export function bindThumbnailPageLifecycle(
  page: EventTarget,
  document: EventTarget & { readonly hidden: boolean },
  scheduler: ThumbnailScheduler = thumbnailScheduler,
): () => void {
  let left = false;
  const sync = () => scheduler.setPageHidden(left || document.hidden);
  const hide = () => {
    left = true;
    sync();
  };
  const show = () => {
    left = false;
    sync();
  };
  page.addEventListener("pagehide", hide);
  page.addEventListener("pageshow", show);
  document.addEventListener("visibilitychange", sync);
  sync();
  return () => {
    page.removeEventListener("pagehide", hide);
    page.removeEventListener("pageshow", show);
    document.removeEventListener("visibilitychange", sync);
  };
}
