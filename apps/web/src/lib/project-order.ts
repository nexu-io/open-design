type ProjectOrderKey = {
  id: string;
  lastUserQueryAt?: number | null;
};

/** User sends alone define recency; IDs keep ties and unknown times stable. */
export function compareRecentProjects(a: ProjectOrderKey, b: ProjectOrderKey): number {
  const left = a.lastUserQueryAt ?? -Infinity;
  const right = b.lastUserQueryAt ?? -Infinity;
  if (left !== right) return left > right ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Apply the same recent-project order to tabs, independent of the active route. */
export function orderProjectItems<T extends { id: string }>(
  items: readonly T[],
  projectFor: (item: T) => ProjectOrderKey | undefined,
): T[] {
  return [...items].sort((a, b) => {
    const left = projectFor(a) ?? { id: a.id };
    const right = projectFor(b) ?? { id: b.id };
    return compareRecentProjects(left, right);
  });
}
