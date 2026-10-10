import {
  normalizeArtifactFocusPath,
  type ArtifactFocusSelection,
} from '@open-design/contracts';
import { artifactKind } from './format';

/** Order the already admitted turn artifacts; focus must never widen that set. */
export function orderArtifactCards<T extends { path: string }>(
  entries: readonly T[],
  focus: ArtifactFocusSelection,
): T[] {
  const preferred = [...(focus.open ? [focus.open] : []), ...(focus.show ?? [])]
    .map(normalizeArtifactFocusPath)
    .filter((path): path is string => path !== null);
  const ranked = entries.map((entry) => {
    const path = normalizeArtifactFocusPath(entry.path) ?? entry.path;
    // Selection is a project-relative identity: pages/index.html must not
    // promote the root index.html merely because their basenames match.
    const declaredRank = preferred.indexOf(path);
    const lowerPath = path.toLowerCase();
    const fallbackRank = lowerPath === 'index.html' || lowerPath === 'index.htm'
      ? 0
      : artifactKind(path) === 'html'
        ? 1
        : /\.(md|mdx|markdown)$/.test(lowerPath)
          ? 2
          : 3;
    return {
      entry,
      path,
      rank: declaredRank < 0 ? preferred.length + fallbackRank : declaredRank,
    };
  });
  // Neither write timestamps nor current directory enumeration order can
  // replace the turn's selected deliverable after a replay or file refresh.
  ranked.sort((a, b) => a.rank - b.rank || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return ranked.map(({ entry }) => entry);
}
