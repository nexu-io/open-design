/** @module core/design-scoring
 * Design-file relevance scoring and path predicates that drive file selection for context snapshots.
 */

/**
 * Returns a numeric relevance score for a repository file path; a negative score means the file should be skipped.
 * Higher scores indicate stronger design relevance; files are sorted descending before `maxFiles` truncation.
 * @param repoPath — Repo-relative path to score (any casing; normalized internally).
 */
export function scoreDesignFile(repoPath: string): number {
  const normalized = repoPath.toLowerCase();
  if (shouldSkipRepoPath(normalized)) return -1;
  let score = 0;
  // Native / non-web design-token source. Without this, a SwiftUI, Kotlin, or
  // other non-JS repo has every source file score 0, so config dotfiles (which
  // hit the generic text bonus below) win the ranking and the real source is
  // never snapshotted. Design-token files (ColorSystem.swift, Typography.kt,
  // Spacing.swift, ...) get the high boost; other native source gets a solid
  // floor so it outranks config noise.
  if (/(^|\/)(color|colors|colour|colours|theme|themes|palette|palettes|typography|type|fonts?|spacing|sizing|metrics|dimens|tokens?|designsystem|design-?system|design|styles?|styling|appearance|brand|branding)[a-z0-9_]*\.(swift|kt|kts|java|dart|scala|cs|m|mm)$/u.test(normalized)) score += 95;
  if (/\.(swift|kt|kts|java|scala|go|rs|rb|py|php|cs|dart|vue|svelte|astro|ex|exs|elm|c|cc|cpp|cxx|h|hpp|hh|m|mm)$/u.test(normalized)) score += 40;
  if (/(^|\/)readme\.(md|mdx|txt|rst)$/u.test(normalized)) score += 100;
  if (/(^|\/)package\.json$/u.test(normalized)) score += 95;
  if (/(^|\/)(tailwind|theme|themes?|themeprovider|antdprovider|tokens?|colors?|typography|design-system|design|constant|constants|env|style|styles)\.(config\.)?(ts|tsx|js|jsx|json|css|scss|less|md)$/u.test(normalized)) score += 95;
  if (/(^|\/)(globals?|index|style|styles|app|root)\.(css|scss|less)$/u.test(normalized)) score += 88;
  if (/^(build|assets?|public|resources)\/(cherry[-_])?(logo|icon|tray[_-]?icon|avatar|wordmark|brand|mark)[^/]*\.(svg|png|jpe?g|webp|ico)$/u.test(normalized)) score += 150;
  if (/^(fonts?|assets?\/fonts?|public\/fonts?|resources\/fonts?)\/.*\.(ttf|otf|woff2?)$/u.test(normalized)) score += 145;
  if (/\/assets\/fonts?\/.*\.(ttf|otf|woff2?|css)$/u.test(normalized)) score += 145;
  if (/\/assets\/fonts?\/.*ubuntu.*\.(ttf|otf|woff2?|css)$/u.test(normalized)) score += 18;
  if (/(^|\/)(build|assets?|public|resources|fonts?)\/.*(logo|icon|avatar|tray|brand|wordmark|mark)[^/]*\.(svg|png|jpe?g|webp|ico)$/u.test(normalized)) score += 86;
  if (/(^|\/)(build|assets?|public|resources|fonts?)\/.*\.(ttf|otf|woff2?)$/u.test(normalized)) score += 84;
  if (/\/(context|providers?|theme|styles?|config|utils?)\//u.test(normalized)) score += 70;
  if (/\/(app|layout|shell|navbar|sidebar|home|chat|settings|inputbar|assistants?|topics?)\//u.test(normalized)) score += 68;
  if (/\/(components?|ui|design-system|primitives?)\//u.test(normalized)) score += 65;
  if (/(button|card|dialog|modal|input|form|nav|navbar|sidebar|table|badge|avatar|toast|menu|tabs|layout|shell|composer|message|assistant|model|provider|settings)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)) score += 58;
  if (/\/components\/app\/(navbar|sidebar)\.(tsx|ts|jsx|js|css|scss)$/u.test(normalized)) score += 150;
  if (/\/pages\/home\/(homepage|chat|navbar)\.(tsx|ts|jsx|js)$/u.test(normalized)) score += 155;
  if (/\/pages\/home\/(inputbar|messages|tabs)\/(inputbar|inputbarcore|messages|message|messagegroup|messagecontent|assistantlist|assistantitem|assistantstab|topicstab|index)\.(tsx|ts|jsx|js)$/u.test(normalized)) score += 145;
  if (/\/pages\/home\/tabs\/components\/(assistantlist|assistantitem|topics?)\.(tsx|ts|jsx|js)$/u.test(normalized)) score += 90;
  if (/\/pages\/home\/inputbar\/(components\/inputbarcore|sendmessagebutton|attachmentpreview)\.(tsx|ts|jsx|js)$/u.test(normalized)) score += 80;
  if (/\/pages\/home\/components\/chatnavbar\/(index|chatnavbarcontent\/index|chatnavbarcontent\/topiccontent)\.(tsx|ts|jsx|js)$/u.test(normalized)) score += 115;
  if (/(^|\/)(app|pages|src)\/(layout|page|app|index|main)\.(tsx|ts|jsx|js|css)$/u.test(normalized)) score += 45;
  if (isDesignAssetPath(normalized)) score += 42;
  if (/\.(css|scss|less|tsx|ts|jsx|js|md|mdx|json|svg)$/u.test(normalized)) score += 10;
  if (isBinaryDesignAssetPath(normalized)) score += 6;
  if (/\/pages\/home\/inputbar\/tools\/components\//u.test(normalized)) score -= 80;
  if (/\/pages\/settings\//u.test(normalized)) score -= 120;
  if (/\/assets\/images\/providers?\//u.test(normalized)) score -= 72;
  return score;
}

/**
 * Returns a numeric relevance score for a repository directory path; negative means skip.
 * Used during bounded directory browsing to prioritize which directories to recurse into.
 * @param repoPath — Repo-relative directory path (any casing; normalized internally).
 */
export function scoreDesignDirectory(repoPath: string): number {
  const normalized = repoPath.toLowerCase();
  if (shouldSkipRepoPath(`${normalized}/`)) return -1;
  const segments = normalized.split('/');
  const basename = segments.at(-1) ?? normalized;
  let score = 0;
  if (/^(apps?|packages?|src|source|frontend|web|client|ui|components?|design-system|styles?|theme|themes|tokens?|assets?|public|resources|build|fonts?)$/u.test(basename)) {
    score += 80;
  }
  if (/(^|\/)(apps?|packages?)\//u.test(normalized)) score += 35;
  if (/(^|\/)(components?|ui|design-system|primitives?|styles?|theme|tokens?|assets?|public|resources|build|fonts?)$/u.test(normalized)) score += 45;
  if (segments.length <= 2) score += 10;
  if (segments.length > 5) score -= 20;
  return score;
}

/**
 * Returns true if a repo path should be excluded from design-context snapshots.
 * Skips generated output, test files, lock files, binary non-asset files, and tooling directories.
 * @param normalizedPath — Lowercase repo-relative path.
 */
export function shouldSkipRepoPath(normalizedPath: string): boolean {
  if (isDesignAssetDirectory(normalizedPath) || isDesignAssetPath(normalizedPath)) return false;
  // Editor / CI / agent-tooling directories are never design evidence, but
  // their .md / .json files otherwise score on the generic text bonus and crowd
  // out real source (this is what filled a SwiftUI import with .zenflow, .zed,
  // and .vscode files instead of the Swift token source).
  if (/(^|\/)\.(vscode|zed|idea|fleet|zenflow|github|husky|gradle|vs|turbo|cache|devcontainer)\//u.test(normalizedPath)) return true;
  return /(^|\/)(node_modules|vendor|dist|build|coverage|\.next|\.nuxt|\.git|out|target|storybook-static)\//u.test(normalizedPath)
    || /(^|\/)(package-lock\.json|pnpm-lock\.ya?ml|yarn\.lock|bun\.lockb)$/u.test(normalizedPath)
    || /(^|\/)(__tests__|__snapshots__|test|tests)\//u.test(normalizedPath)
    || /\.(test|spec|bench)\.(tsx|ts|jsx|js)$/u.test(normalizedPath)
    || /\.(gif|avif|mp4|mov|zip|tar|gz|pdf)$/u.test(normalizedPath)
    || (/\.(png|jpe?g|webp|ico|woff2?|ttf|otf)$/u.test(normalizedPath) && !isDesignAssetPath(normalizedPath));
}

/** Returns true if the path is a design asset directory (assets/, public/, fonts/, etc.). @internal */
function isDesignAssetDirectory(normalizedPath: string): boolean {
  return /(^|\/)(assets?|public|resources|build|fonts?)\/$/u.test(normalizedPath)
    || /(^|\/)src\/renderer\/src\/assets\//u.test(normalizedPath);
}

/** Returns true if the path is a recognized design asset file (logo, icon, font, etc.) under a known asset root. @internal */
function isDesignAssetPath(normalizedPath: string): boolean {
  return /(^|\/)(assets?|public|resources|build|fonts?)\/.*(logo|icon|avatar|tray|brand|wordmark|mark|font|ubuntu)[^/]*\.(svg|png|jpe?g|webp|ico|ttf|otf|woff2?)$/u.test(normalizedPath)
    || /(^|\/)src\/renderer\/src\/assets\/.*\.(svg|png|jpe?g|webp|ico|ttf|otf|woff2?)$/u.test(normalizedPath);
}

/**
 * Returns true if the path extension is a binary design asset format (PNG, JPEG, WEBP, ICO, or font binary).
 * Used to choose between text and binary read paths during snapshot collection.
 */
export function isBinaryDesignAssetPath(normalizedPath: string): boolean {
  return /\.(png|jpe?g|webp|ico|ttf|otf|woff2?)$/u.test(normalizedPath);
}

/**
 * Returns true if the file extension is a text-snapshotable format (source code, styles, markup, config, etc.).
 * Binary files that do not match this predicate are only included when `isBinaryDesignAssetPath` returns true.
 */
export function isTextSnapshotPath(normalizedPath: string): boolean {
  return /\.(css|scss|less|tsx|ts|jsx|js|mjs|cjs|md|mdx|json|jsonc|svg|txt|rst|yaml|yml|toml|xml|swift|kt|kts|java|scala|go|rs|rb|py|php|cs|dart|vue|svelte|astro|ex|exs|elm|c|cc|cpp|cxx|h|hpp|hh|m|mm)$/u.test(normalizedPath);
}

/**
 * Scores all paths, filters out negatives, sorts by score descending, and returns the top `maxFiles` paths.
 * @param paths — Full list of repo-relative paths.
 * @param maxFiles — Maximum number of paths to return.
 */
export function selectDesignFiles(paths: string[], maxFiles: number): string[] {
  return paths
    .map((repoPath) => ({ repoPath, score: scoreDesignFile(repoPath) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.repoPath.localeCompare(right.repoPath))
    .slice(0, maxFiles)
    .map((entry) => entry.repoPath);
}

/**
 * Like `selectDesignFiles` but ensures the preferred (shallowest) README is always included in the result.
 * @param paths — Full list of repo-relative paths.
 * @param maxFiles — Maximum number of paths to return.
 */
export function selectDesignFilesWithPreferredReadme(paths: string[], maxFiles: number): string[] {
  const selected = selectDesignFiles(paths, maxFiles);
  const preferredReadme = preferredReadmePath(paths);
  if (!preferredReadme || selected.includes(preferredReadme)) return selected;
  return [preferredReadme, ...selected.filter((repoPath) => repoPath !== preferredReadme)].slice(0, maxFiles);
}

/**
 * Finds the shallowest README file among a list of repo paths, preferring root-level READMEs.
 * @param paths — Full list of repo-relative paths.
 * @returns The preferred README path, or `undefined` if none found.
 */
export function preferredReadmePath(paths: string[]): string | undefined {
  return paths
    .filter((repoPath) => /(^|\/)readme\.(md|mdx|txt|rst)$/iu.test(repoPath))
    .sort((left, right) => {
      const leftSegments = left.split('/').length;
      const rightSegments = right.split('/').length;
      return leftSegments - rightSegments || left.localeCompare(right);
    })[0];
}
