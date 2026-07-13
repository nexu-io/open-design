// Transport adapters for memory entries, the tree, and the MEMORY.md index.
// One home for the `/api/memory`, `/api/memory/tree`, `/api/memory/:id`, and
// `/api/memory/index` routes; callers reach these through the slice's port.
import type {
  MemoryEntry,
  MemoryListResponse,
  MemoryTreeListResponse,
  MemoryTreeNode,
  MemoryType,
} from '@open-design/contracts';

/** Wire body for creating (POST) or updating (PUT) a memory entry. */
export interface SaveMemoryEntryInput {
  id?: string;
  name: string;
  description: string;
  type: MemoryType;
  body: string;
}

export async function fetchMemoryList(): Promise<MemoryListResponse> {
  const resp = await fetch('/api/memory');
  if (!resp.ok) throw new Error(`Memory list request failed (${resp.status})`);
  return (await resp.json()) as MemoryListResponse;
}

export async function fetchMemoryTree(): Promise<MemoryTreeNode[]> {
  const resp = await fetch('/api/memory/tree');
  if (!resp.ok) throw new Error(`Memory tree request failed (${resp.status})`);
  const json = (await resp.json()) as MemoryTreeListResponse;
  return json.tree ?? [];
}

export async function fetchMemoryEntry(id: string): Promise<MemoryEntry | null> {
  const resp = await fetch(`/api/memory/${encodeURIComponent(id)}`);
  if (!resp.ok) return null;
  const json = (await resp.json()) as { entry: MemoryEntry };
  return json.entry ?? null;
}

export async function saveMemoryEntry(draft: SaveMemoryEntryInput): Promise<MemoryEntry | null> {
  const url = draft.id
    ? `/api/memory/${encodeURIComponent(draft.id)}`
    : '/api/memory';
  const resp = await fetch(url, {
    method: draft.id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as { entry: MemoryEntry };
  return json.entry ?? null;
}

export async function deleteMemoryEntry(id: string): Promise<boolean> {
  const resp = await fetch(`/api/memory/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return resp.ok;
}

export async function saveMemoryIndex(index: string): Promise<boolean> {
  const resp = await fetch('/api/memory/index', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index }),
  });
  return resp.ok;
}
