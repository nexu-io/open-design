import type { ProjectFile } from '../../types';

export interface PluginFolderCandidate {
  path: string;
  fileCount: number;
  updatedAt: number;
  manifestPath: string;
}

export function getPluginFolderCandidates(files: ProjectFile[]): PluginFolderCandidate[] {
  const byFolder = new Map<string, ProjectFile[]>();
  for (const file of files) {
    const slash = file.name.lastIndexOf('/');
    if (slash <= 0) continue;
    const folder = file.name.slice(0, slash);
    const topFolder = folder.split('/')[0];
    if (!topFolder) continue;
    const rows = byFolder.get(topFolder) ?? [];
    rows.push(file);
    byFolder.set(topFolder, rows);
  }

  const candidates: PluginFolderCandidate[] = [];
  for (const [folder, rows] of byFolder) {
    const names = new Set(rows.map((row) => row.name));
    const manifestPath = `${folder}/open-design.json`;
    const hasManifest = names.has(manifestPath);
    const hasSkill = names.has(`${folder}/SKILL.md`);
    if (!hasManifest || !hasSkill) continue;
    candidates.push({
      path: folder,
      fileCount: rows.length,
      updatedAt: Math.max(...rows.map((row) => row.mtime)),
      manifestPath,
    });
  }

  return candidates.sort((a, b) => b.updatedAt - a.updatedAt);
}
