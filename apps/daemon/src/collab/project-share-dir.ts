export function resolveProjectShareDir(
  projectsRoot: string,
  projectId: string,
  project: { id: string; metadata?: unknown } | null | undefined,
  resolveProjectDir: (projectsRoot: string, projectId: string, metadata?: unknown) => string,
): string {
  if (!project) throw new Error(`Project ${projectId} not found`);
  return resolveProjectDir(projectsRoot, projectId, project.metadata);
}
