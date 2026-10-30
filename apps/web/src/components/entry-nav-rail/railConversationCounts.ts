// Where a conversation shows in the rail (per product: 会话的内容就只能存在一遍,
// 在对话里就不能在项目里). Every conversation lives in a project, so the split is
// by the project:
//
//   - a project made with 新建项目 (`metadata.railKind === 'project'`) is always
//     a folder in 项目, and its conversations stay inside it;
//   - any other project with exactly ONE conversation is a conversation — that
//     conversation is a row in 对话, and the project is not a folder in 项目;
//   - any other project (several conversations, none, or not counted yet) is a
//     folder in 项目, and its conversations stay inside it, off 对话.
//
// The 对话 section already reads every listed project's conversations (and the
// open project's live list), so it publishes the counts here; the 项目 section
// reads them to leave single-conversation projects out.

import { useSyncExternalStore } from 'react';

let counts: ReadonlyMap<string, number> = new Map();
const listeners = new Set<() => void>();

function sameCounts(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

export function publishRailConversationCounts(next: ReadonlyMap<string, number>): void {
  if (sameCounts(counts, next)) return;
  counts = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const EMPTY: ReadonlyMap<string, number> = new Map();

export function useRailConversationCounts(): ReadonlyMap<string, number> {
  return useSyncExternalStore(subscribe, () => counts, () => EMPTY);
}

/** True when the project is a 项目 folder rather than a single 对话 row. */
export function isRailFolderProject(
  project: { id: string; metadata?: { railKind?: string } | null } | undefined,
  counts: ReadonlyMap<string, number>,
  projectId = project?.id ?? '',
): boolean {
  if (project?.metadata?.railKind === 'project') return true;
  return counts.get(projectId) !== 1;
}
