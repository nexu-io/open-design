import type { WorkspaceContextItem } from '@open-design/contracts';

export function workspaceContextLinkedDir(item: WorkspaceContextItem): string | null {
  if (item.kind !== 'local-code' && item.kind !== 'project') return null;
  const dir = item.absolutePath?.trim();
  return dir || null;
}

export function workspaceContextLinkedDirs(items: WorkspaceContextItem[]): string[] {
  const dirs = items
    .map(workspaceContextLinkedDir)
    .filter((dir): dir is string => Boolean(dir));
  return Array.from(new Set(dirs));
}

// Human label for a workspace context kind. Kept as hardcoded English to match
// the sibling copies in ChatComposer/ChatPane (these kind labels are not
// currently localized); used by the chip hover card.
export function workspaceContextKindLabel(kind: WorkspaceContextItem['kind']): string {
  switch (kind) {
    case 'browser': return 'Browser';
    case 'design-files': return 'Design files';
    case 'design-system': return 'Design system';
    case 'folder': return 'Folder';
    case 'project': return 'Referenced project';
    case 'local-code': return 'Local code';
    case 'terminal': return 'Terminal';
    case 'side-chat': return 'Side chat';
    case 'live-artifact': return 'Live artifact';
    case 'file':
    default: return 'File';
  }
}

// The single most useful identifier to surface for a context item: the folder
// it points at, else the URL, else the project id / title. Empty when the item
// carries no locator (the hover card then shows only the type).
export function workspaceContextDetailLine(item: WorkspaceContextItem): string {
  return (
    item.absolutePath?.trim() ||
    item.url?.trim() ||
    item.path?.trim() ||
    item.title?.trim() ||
    ''
  );
}
