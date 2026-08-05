import path from 'node:path';
import fs from 'node:fs';

export interface PluginArtifactFileSystem {
  access(file: string): Promise<void>;
}

export async function hasGeneratedPluginArtifacts(
  projectRoot: string | null | undefined,
  fileSystem: PluginArtifactFileSystem = fs.promises,
): Promise<boolean> {
  if (!projectRoot || typeof projectRoot !== 'string') return false;
  const required = [
    path.join(projectRoot, 'generated-plugin', 'open-design.json'),
    path.join(projectRoot, 'generated-plugin', 'SKILL.md'),
  ];
  try {
    await Promise.all(required.map((file) => fileSystem.access(file)));
    return true;
  } catch {
    return false;
  }
}
