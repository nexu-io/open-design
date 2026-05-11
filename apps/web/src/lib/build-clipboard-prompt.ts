// Builds the literal text the Continue in CLI button copies to the
// clipboard. Inline single-source-of-truth template per #451 / spec §3.4.
// The trailing TODO is the "blank task slot" the issue body specifies —
// do NOT pre-fill it.

import type { Project } from '@open-design/contracts';

export interface DesignMdSummary {
  generatedAt: Date | null;
  transcriptMessageCount: number | null;
  designSystemId: string | null;
  currentArtifact: string | null;
}

export interface BuildClipboardPromptInput {
  project: Pick<Project, 'id' | 'name'>;
  designMdState: DesignMdSummary;
  projectDir: string;
}

export function buildClipboardPrompt({
  project,
  designMdState,
  projectDir,
}: BuildClipboardPromptInput): string {
  const generatedAt =
    designMdState.generatedAt && Number.isFinite(designMdState.generatedAt.getTime())
      ? designMdState.generatedAt.toISOString()
      : 'unknown';
  const transcriptCount =
    typeof designMdState.transcriptMessageCount === 'number'
      ? String(designMdState.transcriptMessageCount)
      : 'unknown';

  return `# Continue in CLI — ${project.name}

You're picking up an Open Design project mid-flight in a fresh \`claude\` CLI session. Run \`claude\` at the working directory below; the design intent is captured in \`DESIGN.md\` at the project root.

## Working directory

\`\`\`
${projectDir}
\`\`\`

## Authoritative spec

Read \`DESIGN.md\` first. It contains:
- Summary
- Brand & Voice
- Information Architecture
- Components & Patterns
- Visual System
- Open Questions
- Provenance

The Provenance section names the project ID, design system, current artifact, transcript message count, and generated UTC timestamp. If the spec is stale (current state has moved past the provenance), surface that to the user before acting.

## Operating rules for this session

- Treat \`DESIGN.md\` as the authoritative source of design intent. Don't re-derive design decisions from chat history unless \`DESIGN.md\` is missing or contradicts current artifacts.
- The visual system, route table, and shared state contracts are documented in the existing project files — read what's there before introducing new patterns.
- No new build steps, lockfile churn, or dependency additions without surfacing.
- For shell-out tooling (\`pnpm\`, \`curl\`, \`ps\`), filesystem traversal beyond the project, or daemon-level debugging, you're in the right place — proceed.

## Project context

- Project name: ${project.name}
- Project ID: ${project.id}
- Design system: ${designMdState.designSystemId ?? 'none'}
- Current artifact: ${designMdState.currentArtifact ?? 'none'}
- Transcript message count when DESIGN.md was generated: ${transcriptCount}
- DESIGN.md generated at: ${generatedAt}

## Your task

<!-- TODO: describe what you want this session to do. -->
`;
}
