import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../../daemon/src/frontmatter';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

async function countDirsWithFile(root: string, fileName: string): Promise<number> {
  const entries = await readdir(root, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      if ((await stat(path.join(root, entry.name, fileName))).isFile()) count++;
    } catch {
      // Ignore directories that do not expose the target file.
    }
  }
  return count;
}

async function collectSkillStats() {
  const skillsRoot = path.join(repoRoot, 'skills');
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  let total = 0;
  let prototype = 0;
  let deck = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsRoot, entry.name, 'SKILL.md');
    try {
      if (!(await stat(skillPath)).isFile()) continue;
      const raw = await readFile(skillPath, 'utf8');
      const { data } = parseFrontmatter(raw) as {
        data?: { od?: { mode?: unknown } };
      };
      total++;
      const mode = data?.od?.mode;
      if (mode === 'prototype' || mode == null) prototype++;
      if (mode === 'deck') deck++;
    } catch {
      // Discovery mirrors the daemon: unreadable skill folders are skipped.
    }
  }

  return { total, prototype, deck };
}

async function countAgentDefs(): Promise<number> {
  const agentsSource = await readFile(
    path.join(repoRoot, 'apps/daemon/src/agents.ts'),
    'utf8',
  );
  return (agentsSource.match(/\n  {\n    id: '/g) ?? []).length;
}

function expectMatch(readme: string, pattern: RegExp, expected: string) {
  const match = pattern.exec(readme);
  expect(match?.[1]).toBe(expected);
}

describe('README metadata stays in sync with the repo', () => {
  it('keeps the English README counts aligned with the codebase', async () => {
    const [readme, skillStats, designSystems, agents] = await Promise.all([
      readFile(path.join(repoRoot, 'README.md'), 'utf8'),
      collectSkillStats(),
      countDirsWithFile(path.join(repoRoot, 'design-systems'), 'DESIGN.md'),
      countAgentDefs(),
    ]);

    expectMatch(
      readme,
      /driven by \*\*(\d+) composable Skills\*\* and \*\*(\d+) brand-grade Design Systems\*\*/,
      String(skillStats.total),
    );
    expectMatch(
      readme,
      /driven by \*\*\d+ composable Skills\*\* and \*\*(\d+) brand-grade Design Systems\*\*/,
      String(designSystems),
    );
    expectMatch(
      readme,
      /alt="Agents" src="https:\/\/img\.shields\.io\/badge\/agents-(\d+)%20CLIs/,
      String(agents - 1),
    );
    expectMatch(
      readme,
      /alt="Design systems" src="https:\/\/img\.shields\.io\/badge\/design%20systems-(\d+)-orange/,
      String(designSystems),
    );
    expectMatch(
      readme,
      /alt="Skills" src="https:\/\/img\.shields\.io\/badge\/skills-(\d+)-teal/,
      String(skillStats.total),
    );
    expectMatch(readme, /\| \*\*Coding-agent CLIs \((\d+)\)\*\* \|/, String(agents));
    expectMatch(readme, /\| \*\*Design systems built-in\*\* \| \*\*(\d+)\*\* —/, String(designSystems));
    expectMatch(readme, /\| \*\*Skills built-in\*\* \| \*\*(\d+)\*\* —/, String(skillStats.total));
    expectMatch(readme, /\*\*`prototype`\*\* \((\d+) skills/, String(skillStats.prototype));
    expectMatch(readme, /\*\*`deck`\*\* \((\d+) skills/, String(skillStats.deck));
    expectMatch(readme, /06 · (\d+)-system library/, String(designSystems));
    expectMatch(readme, /\+ active DESIGN\.md\s+\((\d+) systems available\)/, String(designSystems));
    expectMatch(readme, /\+ active SKILL\.md\s+\((\d+) skills available\)/, String(skillStats.total));
    expectMatch(readme, /\n2\. Loads (\d+) skills \+ \d+ design systems\./, String(skillStats.total));
    expectMatch(readme, /\n2\. Loads \d+ skills \+ (\d+) design systems\./, String(designSystems));
    expectMatch(readme, /Provider flexibility \| Anthropic only \| 7\+ via \[`pi-ai`]\[piai] \| \*\*(\d+) CLI adapters \+ OpenAI-compatible BYOK proxy\*\*/, String(agents));
    expectMatch(readme, /\[x] Daemon \+ agent detection \((\d+) CLI adapters\)/, String(agents));
    expectMatch(readme, /\n(\d+) systems out of the box, each as a single \[`DESIGN\.md`\]/, String(designSystems));
    expectMatch(readme, /\*\*`DESIGN\.md` × (\d+) systems shipped\*\*/, String(designSystems));
  });
});
