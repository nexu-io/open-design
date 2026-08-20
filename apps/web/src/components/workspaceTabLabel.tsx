export interface SplitTabLabel {
  stem: string;
  ext: string | null;
}

// Extension-shape: 2-5 alphanumeric characters after a dot, with the shape
// of a real file extension. Matches `.html`, `.tsx`, `.json`, `.md`,
// `.usda`, `.glb`, `.png`, `.mp3`, `.7z`, `.3ds`, `.h264`, `.x265`, and
// other extensions the app opens as workspace tabs, without matching
// single-token tails (`.2`, `.a`) that are not file extensions in this
// app's vocabulary. The version-tag exclusion below covers only the two
// common single-prefix shapes (`.v2`, `.b3`) so a project named `app.v2`
// keeps the version tag in the stem; codec extensions like `.h264` /
// `.x265` are structurally similar but are real file kinds, so the
// exclusion is intentionally narrow. Multi-letter version prefixes
// (`.beta3`) share the shape of real extensions (`.mp3`) and
// disambiguating cleanly would need a known-extension lookup this module
// intentionally does not carry.
const EXTENSION_TOKEN = /^[A-Za-z0-9]{2,5}$/;
const VERSION_TOKEN = /^[vVbB]\d+$/;

/**
 * Split a tab title into a stem and an optional file-extension suffix.
 *
 * The tab label styles let the stem ellipsis-truncate while pinning the
 * extension visible, so a narrow tab reads `index….html` instead of
 * `index….ht`. The extension is what tells the user which file kind the
 * tab points at, so it must not be the first thing to be lost.
 *
 * Leading-dot names (`.gitignore`, `.env`) have no visible stem to
 * truncate against, so the whole thing stays in the stem slot.
 */
export function splitTabLabel(title: string): SplitTabLabel {
  const idx = title.lastIndexOf('.');
  if (idx <= 0) return { stem: title, ext: null };
  const ext = title.slice(idx + 1);
  if (!EXTENSION_TOKEN.test(ext)) return { stem: title, ext: null };
  if (VERSION_TOKEN.test(ext)) return { stem: title, ext: null };
  return { stem: title.slice(0, idx), ext: `.${ext}` };
}

interface TabLabelProps {
  title: string;
  /**
   * Optional trailing modifier rendered as its own pinned span after the
   * extension. This is the dirty/unsaved indicator for sketch tabs (` •`).
   * Passing it separately (rather than baking it into `title`) keeps the
   * extension detection working: `foo.sketch.json` still splits as
   * `foo.sketch` + `.json` even when the tab is dirty.
   */
  dirtyMark?: string;
}

/**
 * Renders a workspace file tab label as a stem span (ellipsis-truncatable)
 * plus an optional extension span pinned visible via flex, and an optional
 * dirty-mark span pinned after the extension. Keeps the same
 * `.ws-tab-label` root the CSS and existing tests target.
 */
export function TabLabel({ title, dirtyMark }: TabLabelProps) {
  const { stem, ext } = splitTabLabel(title);
  return (
    <span className="ws-tab-label">
      <span className="ws-tab-label-stem">{stem}</span>
      {ext ? <span className="ws-tab-label-ext">{ext}</span> : null}
      {dirtyMark ? <span className="ws-tab-label-dirty">{dirtyMark}</span> : null}
    </span>
  );
}
