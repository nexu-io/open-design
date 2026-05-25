import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

function slugFromFilename(filename: string): string {
  return filename.replace(/\.md$/, "");
}

function parseCraftRequires(raw: string): string[] {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return [];

  const frontmatter = match[1];

  // Find the craft: section (it may be indented under od:)
  // Look for a line with craft: followed by subsequent indented lines
  const craftLines: string[] = [];
  const lines = frontmatter.split("\n");
  let inCraft = false;
  let craftIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inCraft && trimmed === "craft:") {
      inCraft = true;
      craftIndent = line.length - line.trimStart().length;
      craftLines.push(line);
      continue;
    }

    if (inCraft) {
      const indent = line.length - line.trimStart().length;
      if (line.trim() === "" || indent > craftIndent) {
        craftLines.push(line);
      } else {
        break;
      }
    }
  }

  if (craftLines.length === 0) return [];

  const craftBlock = craftLines.join("\n");

  // Try inline array on same line: requires: [slug, slug, ...]
  const inlineMatch = craftBlock.match(/requires:\s*\[([^\]]*)\]/);
  if (inlineMatch) {
    return inlineMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  // Try list format under requires:
  const listMatch = craftBlock.match(/requires:\s*\n((?:\s+- [^\n]*\n?)*)/);
  if (listMatch) {
    return listMatch[1]
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("- "))
      .map((s) => s.slice(2).trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  return [];
}

async function readFutureSlugs(): Promise<Set<string>> {
  const futurePath = path.join(repoRoot, "craft", "FUTURE_SECTIONS.md");
  try {
    const content = await readFile(futurePath, "utf8");
    const slugs = new Set<string>();
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("- `") && trimmed.endsWith("`")) {
        slugs.add(trimmed.slice(3, -1));
      }
    }
    return slugs;
  } catch {
    return new Set();
  }
}

async function readCraftSlugs(): Promise<Set<string>> {
  const craftDir = path.join(repoRoot, "craft");
  const entries = await readdir(craftDir);
  const slugs = new Set<string>();
  for (const entry of entries) {
    if (entry.endsWith(".md") && entry !== "FUTURE_SECTIONS.md" && entry !== "README.md") {
      slugs.add(slugFromFilename(entry));
    }
  }
  return slugs;
}

async function collectCraftRequiresFromSkills(): Promise<Map<string, string[]>> {
  const skillsDir = path.join(repoRoot, "skills");
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const result = new Map<string, string[]>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
    try {
      const content = await readFile(skillPath, "utf8");
      const refs = parseCraftRequires(content);
      if (refs.length > 0) {
        result.set(entry.name, refs);
      }
    } catch {
      // SKILL.md missing or unreadable — skip
    }
  }

  return result;
}

async function main(): Promise<number> {
  const craftSlugs = await readCraftSlugs();
  const futureSlugs = await readFutureSlugs();
  const skillRefs = await collectCraftRequiresFromSkills();

  let exitCode = 0;

  for (const [skillName, refs] of skillRefs) {
    for (const ref of refs) {
      if (craftSlugs.has(ref) || futureSlugs.has(ref)) continue;
      console.error(
        `craft reference error: skills/${skillName}/SKILL.md references '${ref}' but no craft/${ref}.md found and slug is not in craft/FUTURE_SECTIONS.md`,
      );
      exitCode = 1;
    }
  }

  if (exitCode === 0) {
    console.log("Craft references check passed: all referenced slugs are valid or planned.");
  }

  return exitCode;
}

const exitCode = await main();
process.exit(exitCode);
