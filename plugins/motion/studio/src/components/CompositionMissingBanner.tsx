import { useI18n } from "../i18n/I18n";
interface CompositionMissingBannerProps {
  /** The composition this tab has open, that the server can no longer find. */
  path: string;
}

/**
 * Shown when the currently open composition's file has vanished from disk
 * mid-session — the `absent` read reason (#4325): the file tree listed it and
 * the read cannot get it.
 *
 * Distinct from `ProjectUnreachableBanner`: there the whole PROJECT fails to
 * resolve; here the project is fine and this one file inside it is not. Proven
 * 2026-09-23 to be a stale tree, not a placeholder or a path-encoding gap:
 * `refreshFileTree` only ran after Studio's own file operations, so an agent
 * removing or replacing a composition updated the preview and the SDK session
 * but never the listing — the file stayed clickable, and every edit through
 * it failed silently, with nothing to tell the user why. The tree is now
 * refreshed as soon as this fires (`useSdkSession`'s `onAbsentRead`); this
 * banner is the only thing that explains the failure while that catches up.
 */
export function CompositionMissingBanner({ path }: CompositionMissingBannerProps) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="hf-backdrop-in absolute left-1/2 top-14 z-92 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-md border border-amber-500/30 bg-amber-950/85 px-4 py-2 text-[12px] font-medium text-amber-100 shadow-lg shadow-black/30"
    >
      <span>
        <strong>{path}</strong> {t("is no longer on disk. Select another composition to keep editing.")}</span>
    </div>
  );
}
