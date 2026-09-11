export interface SplitTabLabel {
  stem: string;
  ext: string | null;
}

// Extensions use 2-5 ASCII alphanumerics; version-like tails stay in the stem.
const EXTENSION_TOKEN = /^[A-Za-z0-9]{2,5}$/;
const VERSION_TOKEN = /^[vVbB]\d+$/;

/** Split a title for stem truncation with a visible extension. Leading-dot names stay whole. */
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
  /** Optional dirty marker rendered after the extension. */
  dirtyMark?: string;
}

/** Renders a split filename label with optional extension and dirty marker. */
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
