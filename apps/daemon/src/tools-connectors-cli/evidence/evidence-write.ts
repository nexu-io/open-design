/** @module evidence/evidence-write
 * Writes JSON and markdown evidence artifacts to disk and materializes package assets (build icons, fonts, source examples).
 */
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isSourceSurfaceComponentName, normalizeAnchorText, sourceComponentNameFromPath } from '../audit/index.js';
import { MAX_MARKDOWN_EXCERPT_CHARS, UI_KIT_ENTRY_GUIDANCE, ensureParentDirectory, githubSnapshotRoot, isAbsenceError, localSnapshotRoot, packageBuildAssetTarget, safeRepoRelativePath } from '../core/index.js';
import type { GithubDesignEvidence, GithubEvidenceInventoryCategory, GithubEvidenceInventorySection, GithubSnapshotFile, LocalDesignEvidence } from '../core/index.js';

/**
 * Writes snapshot files and a markdown evidence report for a GitHub repository intake run.
 * @param outputPath — Relative or absolute path to the target markdown file.
 * @param evidence — The evidence object produced by the intake layer.
 * @returns An updated evidence object with `outputPath` fields populated on each written file.
 */
export async function writeGithubDesignEvidence(outputPath: string, evidence: GithubDesignEvidence): Promise<GithubDesignEvidence> {
  const resolvedOutputPath = path.resolve(outputPath);
  const snapshotRoot = githubSnapshotRoot(resolvedOutputPath, evidence.repo);
  const writtenFiles: GithubSnapshotFile[] = [];
  for (const file of evidence.files) {
    const safeRelativePath = safeRepoRelativePath(file.repoPath);
    if (!safeRelativePath) continue;
    const fileOutputPath = path.join(snapshotRoot, safeRelativePath);
    await ensureParentDirectory(fileOutputPath);
    if (file.binary) {
      await writeFile(fileOutputPath, file.content);
    } else {
      await writeFile(fileOutputPath, file.content, 'utf8');
    }
    writtenFiles.push({ ...file, outputPath: path.relative(process.cwd(), fileOutputPath).split(path.sep).join('/') });
  }
  const materializedFiles = await materializePackageEvidenceArtifacts(writtenFiles);
  const nextEvidence = { ...evidence, files: writtenFiles, materializedFiles };
  await ensureParentDirectory(resolvedOutputPath);
  await writeFile(resolvedOutputPath, renderGithubDesignEvidenceMarkdown(nextEvidence), 'utf8');
  return nextEvidence;
}

/**
 * Writes snapshot files and a markdown evidence report for a local-folder design-context run.
 * @param outputPath — Relative or absolute path to the target markdown file.
 * @param evidence — The evidence object produced by the local intake.
 * @returns An updated evidence object with `outputPath` fields populated on each written file.
 */
export async function writeLocalDesignEvidence(outputPath: string, evidence: LocalDesignEvidence): Promise<LocalDesignEvidence> {
  const resolvedOutputPath = path.resolve(outputPath);
  const snapshotRoot = localSnapshotRoot(resolvedOutputPath, evidence.sourcePath);
  const writtenFiles: GithubSnapshotFile[] = [];
  for (const file of evidence.files) {
    const safeRelativePath = safeRepoRelativePath(file.repoPath);
    if (!safeRelativePath) continue;
    const fileOutputPath = path.join(snapshotRoot, safeRelativePath);
    await ensureParentDirectory(fileOutputPath);
    if (file.binary) {
      await writeFile(fileOutputPath, file.content);
    } else {
      await writeFile(fileOutputPath, file.content, 'utf8');
    }
    writtenFiles.push({ ...file, outputPath: path.relative(process.cwd(), fileOutputPath).split(path.sep).join('/') });
  }
  const materializedFiles = await materializePackageEvidenceArtifacts(writtenFiles);
  const nextEvidence = { ...evidence, files: writtenFiles, materializedFiles };
  await ensureParentDirectory(resolvedOutputPath);
  await writeFile(resolvedOutputPath, renderLocalDesignEvidenceMarkdown(nextEvidence), 'utf8');
  return nextEvidence;
}

/** Copies qualifying build assets, font files, and source examples into package-relative paths if they do not already exist. @internal */
async function materializePackageEvidenceArtifacts(files: GithubSnapshotFile[]): Promise<string[]> {
  const materialized: string[] = [];
  for (const file of packageBuildAssetCandidates(files)) {
    const target = packageBuildAssetTarget(file.repoPath);
    if (target === undefined) continue;
    if (await writePackageFileIfMissing(target, file.content, file.binary === true)) {
      materialized.push(target);
    }
  }
  for (const file of packageFontAssetCandidates(files)) {
    const target = packageFontAssetTarget(file.repoPath);
    if (target === undefined) continue;
    if (await writePackageFileIfMissing(target, file.content, file.binary === true)) {
      materialized.push(target);
    }
  }
  for (const file of packageSourceExampleCandidates(files)) {
    const safeRelativePath = safeRepoRelativePath(file.repoPath);
    if (!safeRelativePath) continue;
    const target = path.join('source_examples', safeRelativePath).split(path.sep).join('/');
    if (await writePackageFileIfMissing(target, file.content, false)) {
      materialized.push(target);
    }
  }
  return materialized;
}

/** Filters snapshot files to binary build assets that have a qualifying `packageBuildAssetTarget`, capped at 8. @internal */
function packageBuildAssetCandidates(files: GithubSnapshotFile[]): GithubSnapshotFile[] {
  return files
    .filter((file) => file.binary === true && packageBuildAssetTarget(file.repoPath) !== undefined)
    .slice(0, 8);
}

/** Filters snapshot files to font binaries and font stylesheets that have a qualifying `packageFontAssetTarget`, capped at 8. @internal */
function packageFontAssetCandidates(files: GithubSnapshotFile[]): GithubSnapshotFile[] {
  return files
    .filter((file) => packageFontAssetTarget(file.repoPath) !== undefined)
    .slice(0, 8);
}

/** Derives the `fonts/` relative target path for a font binary or font stylesheet, or returns `undefined` if not qualifying. @internal */
function packageFontAssetTarget(repoPath: string): string | undefined {
  const safeRelativePath = safeRepoRelativePath(repoPath);
  if (!safeRelativePath) return undefined;
  const isFontBinary = /\.(ttf|otf|woff2?)$/iu.test(safeRelativePath);
  const isFontStylesheet = /(^|\/)(fonts?|assets\/fonts?|public\/fonts?|resources\/fonts?)\//iu.test(safeRelativePath)
    && /\.css$/iu.test(safeRelativePath);
  if (!isFontBinary && !isFontStylesheet) return undefined;
  const parts = safeRelativePath.split('/');
  const fontRootIndex = parts.findIndex((part) => /^fonts?$/iu.test(part));
  if (fontRootIndex !== -1 && fontRootIndex < parts.length - 1) {
    return path.join('fonts', ...parts.slice(fontRootIndex + 1)).split(path.sep).join('/');
  }
  const assetFontIndex = parts.findIndex((part, index) =>
    /^(assets?|public|resources)$/iu.test(part) && /^fonts?$/iu.test(parts[index + 1] ?? ''),
  );
  if (assetFontIndex !== -1 && assetFontIndex < parts.length - 2) {
    return path.join('fonts', ...parts.slice(assetFontIndex + 2)).split(path.sep).join('/');
  }
  if (!isFontBinary) return undefined;
  return path.join('fonts', path.basename(safeRelativePath)).split(path.sep).join('/');
}

/** Selects up to 6 unique surface-component source files for placement under `source_examples/`. @internal */
function packageSourceExampleCandidates(files: GithubSnapshotFile[]): GithubSnapshotFile[] {
  const seen = new Set<string>();
  const candidates = files
    .filter((file) => !file.binary && typeof file.content === 'string')
    .filter((file) => /\.(tsx|ts|jsx|js)$/iu.test(file.repoPath))
    .filter((file) => {
      const name = sourceComponentNameFromPath(file.repoPath);
      if (name === undefined || !isSourceSurfaceComponentName(name)) return false;
      const key = normalizeAnchorText(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => sourceExamplePriority(right.repoPath) - sourceExamplePriority(left.repoPath));
  return candidates.slice(0, 6);
}

/** Returns a priority weight for a source example file based on its design-evidence inventory category. @internal */
function sourceExamplePriority(repoPath: string): number {
  const category = designEvidenceInventoryCategory(repoPath);
  if (category === 'App shell and navigation') return 4;
  if (category === 'Chat and input surfaces') return 3;
  if (category === 'Reusable components') return 2;
  return 1;
}

/** Writes `content` to `relativePath` under cwd only if the file does not already exist; returns true if written. @internal */
async function writePackageFileIfMissing(relativePath: string, content: string | Buffer, binary: boolean): Promise<boolean> {
  const safeRelativePath = safeRepoRelativePath(relativePath);
  if (!safeRelativePath) return false;
  const targetPath = path.resolve(process.cwd(), safeRelativePath);
  const cwd = path.resolve(process.cwd());
  if (targetPath !== cwd && !targetPath.startsWith(`${cwd}${path.sep}`)) return false;
  try {
    await stat(targetPath);
    return false;
  } catch (error) {
    if (!isAbsenceError(error)) throw error;
  }
  await ensureParentDirectory(targetPath);
  if (binary) {
    await writeFile(targetPath, content);
  } else {
    await writeFile(targetPath, content, 'utf8');
  }
  return true;
}

/** Renders the full markdown evidence report for a GitHub repository intake, including inventory, excerpts, and design-system guidance. @internal */
function renderGithubDesignEvidenceMarkdown(evidence: GithubDesignEvidence): string {
  const inventory = buildDesignEvidenceInventory(evidence.files);
  const lines = [
    `# GitHub Design Evidence: ${evidence.repo.owner}/${evidence.repo.repo}`,
    '',
    `Source: ${evidence.repo.source}`,
    `Read method: ${evidence.method}`,
    ...(evidence.localCloneMethod ? [`Local clone method: ${evidence.localCloneMethod === 'gh-cli' ? 'GitHub CLI authenticated clone' : 'git clone'}`] : []),
    `Ref: ${evidence.resolvedRef ?? evidence.ref ?? 'default branch'}`,
    `Repository paths discovered: ${evidence.treePaths.length}`,
    `Snapshot files written: ${evidence.files.length}`,
    '',
    '## Intake Status',
    '',
    evidence.method === 'connector'
      ? '- Connector platform fallback was used through `od tools connectors`.'
      : '- This-device intake was used through local git or GitHub CLI.',
  ];
  if (evidence.warnings.length > 0) {
    lines.push('', '## Warnings', '', ...evidence.warnings.map((warning) => `- ${warning}`));
  }
  if (evidence.readme) {
    lines.push('', `## README (${evidence.readme.path})`, '', '```md', excerpt(evidence.readme.content), '```');
  }
  if (inventory.length > 0) {
    lines.push('', '## Source Evidence Inventory', '');
    for (const section of inventory) {
      lines.push(`### ${section.title}`, '', section.description, '');
      for (const file of section.files) {
        const kind = file.binary ? 'binary asset' : 'source';
        lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''} (${kind})`);
      }
      lines.push('');
    }
  }
  if (evidence.files.length > 0) {
    lines.push('', '## Files Inspected', '');
    for (const file of evidence.files) {
      const kind = file.binary ? ', binary asset' : '';
      lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''} (${file.bytes} bytes, ${file.source}${kind})`);
    }
    const binaryFiles = evidence.files.filter((file) => file.binary);
    if (binaryFiles.length > 0) {
      lines.push('', '## Binary Assets Preserved', '');
      for (const file of binaryFiles) {
        lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''}`);
      }
    }
    const textFiles = evidence.files.filter((file): file is GithubSnapshotFile & { content: string } => !file.binary && typeof file.content === 'string');
    if (textFiles.length > 0) {
      lines.push('', '## Design-Relevant Excerpts', '');
      for (const file of textFiles.slice(0, 12)) {
        lines.push(`### ${file.repoPath}`, '', fencedExcerpt(file.repoPath, file.content), '');
      }
    }
  }
  if (evidence.materializedFiles && evidence.materializedFiles.length > 0) {
    lines.push('', '## Package Files Materialized', '');
    for (const file of evidence.materializedFiles) {
      lines.push(`- \`${file}\``);
    }
  }
  lines.push(
    '',
    '## Next Design-System Work',
    '',
    '- Use these source paths and snapshots as evidence before writing `DESIGN.md`.',
    '- Convert the inventory above into a Claude Design-style package: `README.md`, `SKILL.md`, `colors_and_type.css`, `preview/colors-*`, `preview/typography-specimens.html`, `preview/spacing-*`, `preview/components-*`, `preview/brand-assets.html`, `ui_kits/app/`, and preserved `assets/`, `build/`, or `fonts/` when evidence exists.',
    '- `ui_kits/app/index.html` must be a browser-reviewable component entry: load `../../colors_and_type.css`, load or import at least three files from `ui_kits/app/components/`, and mount the composed UI through ReactDOM/Babel or compiled browser-ready JavaScript. Do not duplicate a static HTML mock when modular component files exist.',
    '- `ui_kits/app/components/App.jsx` (or equivalent app shell) must compose source-backed role components such as Sidebar, AssistantsList, ChatArea, InputBar, and MessageBubble, not merely list their filenames.',
    ...UI_KIT_ENTRY_GUIDANCE,
    '- Preserve at least three high-signal source examples outside `context/` under `source_examples/` when reusable component snapshots exist, so future agents can compare generated components against original source structure.',
    '- When a captured asset path begins with `build/`, copy the snapshot back into a root `build/` path with its original filename, such as `context/.../files/build/icon.png` -> `build/icon.png`. Do not satisfy build/runtime icon evidence by only renaming those files into `assets/`.',
    '- Make `preview/brand-assets.html` visibly load preserved asset files from `assets/` or `build/`; do not redraw captured logos/icons as inline placeholders.',
    '- Extract concrete colors, typography, spacing, radius, component behavior, assets, and product tone only when supported by inspected files.',
    '- If evidence is missing or ambiguous, mark that uncertainty instead of inventing tokens.',
    '',
  );
  return lines.join('\n');
}

/** Renders the full markdown evidence report for a local-folder intake run, including inventory, excerpts, and design-system guidance. @internal */
function renderLocalDesignEvidenceMarkdown(evidence: LocalDesignEvidence): string {
  const inventory = buildDesignEvidenceInventory(evidence.files);
  const lines = [
    `# Local Design Evidence: ${evidence.sourceName}`,
    '',
    `Source path: ${evidence.sourcePath}`,
    `Read method: ${evidence.method}`,
    `Local paths discovered: ${evidence.treePaths.length}`,
    `Snapshot files written: ${evidence.files.length}`,
    '',
    '## Intake Status',
    '',
    '- Local source folder was read through bounded `od tools connectors local-design-context` intake.',
  ];
  if (evidence.warnings.length > 0) {
    lines.push('', '## Warnings', '', ...evidence.warnings.map((warning) => `- ${warning}`));
  }
  if (evidence.readme) {
    lines.push('', `## README (${evidence.readme.path})`, '', '```md', excerpt(evidence.readme.content), '```');
  }
  if (inventory.length > 0) {
    lines.push('', '## Source Evidence Inventory', '');
    for (const section of inventory) {
      lines.push(`### ${section.title}`, '', section.description, '');
      for (const file of section.files) {
        const kind = file.binary ? 'binary asset' : 'source';
        lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''} (${kind})`);
      }
      lines.push('');
    }
  }
  if (evidence.files.length > 0) {
    lines.push('', '## Files Inspected', '');
    for (const file of evidence.files) {
      const kind = file.binary ? ', binary asset' : '';
      lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''} (${file.bytes} bytes, ${file.source}${kind})`);
    }
    const binaryFiles = evidence.files.filter((file) => file.binary);
    if (binaryFiles.length > 0) {
      lines.push('', '## Binary Assets Preserved', '');
      for (const file of binaryFiles) {
        lines.push(`- ${file.repoPath}${file.outputPath ? ` -> \`${file.outputPath}\`` : ''}`);
      }
    }
    const textFiles = evidence.files.filter((file): file is GithubSnapshotFile & { content: string } => !file.binary && typeof file.content === 'string');
    if (textFiles.length > 0) {
      lines.push('', '## Design-Relevant Excerpts', '');
      for (const file of textFiles.slice(0, 12)) {
        lines.push(`### ${file.repoPath}`, '', fencedExcerpt(file.repoPath, file.content), '');
      }
    }
  }
  if (evidence.materializedFiles && evidence.materializedFiles.length > 0) {
    lines.push('', '## Package Files Materialized', '');
    for (const file of evidence.materializedFiles) {
      lines.push(`- \`${file}\``);
    }
  }
  lines.push(
    '',
    '## Next Design-System Work',
    '',
    '- Use these local source paths and snapshots as evidence before writing `DESIGN.md`.',
    '- Convert the inventory above into a Claude Design-style package: `README.md`, `SKILL.md`, `colors_and_type.css`, `preview/colors-*`, `preview/typography-specimens.html`, `preview/spacing-*`, `preview/components-*`, `preview/brand-assets.html`, `ui_kits/app/`, and preserved `assets/`, `build/`, or `fonts/` when evidence exists.',
    '- `ui_kits/app/index.html` must be a browser-reviewable component entry: load `../../colors_and_type.css`, load or import at least three files from `ui_kits/app/components/`, and mount the composed UI through ReactDOM/Babel or compiled browser-ready JavaScript. Do not duplicate a static HTML mock when modular component files exist.',
    '- `ui_kits/app/components/App.jsx` (or equivalent app shell) must compose source-backed role components such as Sidebar, AssistantsList, ChatArea, InputBar, and MessageBubble, not merely list their filenames.',
    ...UI_KIT_ENTRY_GUIDANCE,
    '- Preserve at least three high-signal source examples outside `context/` under `source_examples/` when reusable component snapshots exist, so future agents can compare generated components against original source structure.',
    '- When a captured asset path begins with `build/`, copy the snapshot back into a root `build/` path with its original filename, such as `context/.../files/build/icon.png` -> `build/icon.png`. Do not satisfy build/runtime icon evidence by only renaming those files into `assets/`.',
    '- Make `preview/brand-assets.html` visibly load preserved asset files from `assets/` or `build/`; do not redraw captured logos/icons as inline placeholders.',
    '- Extract concrete colors, typography, spacing, radius, component behavior, assets, and product tone only when supported by inspected files.',
    '- If evidence is missing or ambiguous, mark that uncertainty instead of inventing tokens.',
    '',
  );
  return lines.join('\n');
}

/** Groups snapshot files into ordered inventory sections by design-evidence category. @internal */
function buildDesignEvidenceInventory(files: GithubSnapshotFile[]): GithubEvidenceInventorySection[] {
  const descriptions: Record<GithubEvidenceInventoryCategory, string> = {
    'Product docs and manifests': 'Use these to understand product purpose, dependency stack, scripts, and public naming.',
    'Brand assets and icons': 'Preserve source build/runtime paths: files under `build/` should be copied back into root `build/` with their original filenames, while non-build logos, avatars, or wordmarks can be copied into `assets/`. Reflect the preserved files in `preview/brand-assets.html`.',
    Fonts: 'Preserve source font files or declarations into `fonts/` and bind them in `colors_and_type.css` when applicable.',
    'Theme, tokens, and styling': 'Extract concrete color, typography, spacing, radius, shadow, and theme-variable values from these files.',
    'App shell and navigation': 'Use these to recreate the product frame, navigation density, sidebars, window chrome, and layout rhythm.',
    'Chat and input surfaces': 'Use these for the applied UI-kit surface and interaction model when the product includes chat or composer flows.',
    'Reusable components': 'Use these to derive buttons, inputs, cards, dialogs, avatars, selectors, menus, and feedback states.',
    'Other design evidence': 'Inspect these only after the primary design evidence above has been used.',
  };
  const order: GithubEvidenceInventoryCategory[] = [
    'Product docs and manifests',
    'Brand assets and icons',
    'Fonts',
    'Theme, tokens, and styling',
    'App shell and navigation',
    'Chat and input surfaces',
    'Reusable components',
    'Other design evidence',
  ];
  const grouped = new Map<GithubEvidenceInventoryCategory, GithubSnapshotFile[]>();
  for (const file of files) {
    const category = designEvidenceInventoryCategory(file.repoPath);
    const files = grouped.get(category) ?? [];
    files.push(file);
    grouped.set(category, files);
  }
  return order
    .map((title) => {
      const files = grouped.get(title) ?? [];
      return { title, description: descriptions[title], files };
    })
    .filter((section) => section.files.length > 0);
}

/** Classifies a snapshot file path into the appropriate `GithubEvidenceInventoryCategory`. @internal */
function designEvidenceInventoryCategory(repoPath: string): GithubEvidenceInventoryCategory {
  const normalized = repoPath.toLowerCase();
  if (/(^|\/)(readme\.(md|mdx|txt|rst)|package\.json)$/u.test(normalized)) {
    return 'Product docs and manifests';
  }
  if (/(^|\/)(assets?|public|resources|build)\/.*(logo|icon|avatar|tray|brand|wordmark|mark)[^/]*\.(svg|png|jpe?g|webp|ico)$/u.test(normalized)) {
    return 'Brand assets and icons';
  }
  if (/(^|\/)(fonts?|assets?\/fonts?|public\/fonts?|resources\/fonts?)\/.*\.(ttf|otf|woff2?)$/u.test(normalized) || /\.(ttf|otf|woff2?)$/u.test(normalized)) {
    return 'Fonts';
  }
  if (/(^|\/)(tailwind|theme|themes?|themeprovider|antdprovider|tokens?|colors?|typography|design-system|design|constant|constants|env|style|styles)\.(config\.)?(ts|tsx|js|jsx|json|css|scss|less|md)$/u.test(normalized)
    || /\/(context|providers?|theme|styles?|config|utils?)\//u.test(normalized)
    || /\.(css|scss|less)$/u.test(normalized)) {
    return 'Theme, tokens, and styling';
  }
  if (/\/(app|layout|shell|navbar|sidebar|nav|chrome)\//u.test(normalized)
    || /\/pages\/home\/(homepage|navbar)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)
    || /(navbar|sidebar|layout|shell|window|workspace)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)) {
    return 'App shell and navigation';
  }
  if (/\/(chat|inputbar|composer|messages?|assistants?|topics?|models?)\//u.test(normalized)
    || /(chat|inputbar|composer|message|assistant|topic|selectmodel|updateapp|model)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)) {
    return 'Chat and input surfaces';
  }
  if (/\/(components?|ui|primitives?)\//u.test(normalized)
    || /(button|card|dialog|modal|input|form|table|badge|avatar|toast|menu|tabs|popover|select|settings)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)) {
    return 'Reusable components';
  }
  return 'Other design evidence';
}

/** Truncates a string to `MAX_MARKDOWN_EXCERPT_CHARS`, appending `\n...` when clipped. @internal */
function excerpt(content: string): string {
  return content.length > MAX_MARKDOWN_EXCERPT_CHARS
    ? `${content.slice(0, MAX_MARKDOWN_EXCERPT_CHARS)}\n...`
    : content;
}

/** Wraps a file excerpt in a fenced code block using the file extension as the language hint. @internal */
function fencedExcerpt(repoPath: string, content: string): string {
  const ext = path.extname(repoPath).replace('.', '').toLowerCase();
  const info = ext === 'tsx' || ext === 'ts' || ext === 'jsx' || ext === 'js' ? ext : ext === 'json' ? 'json' : ext === 'css' || ext === 'scss' || ext === 'less' ? ext : '';
  return `\`\`\`${info}\n${excerpt(content)}\n\`\`\``;
}
