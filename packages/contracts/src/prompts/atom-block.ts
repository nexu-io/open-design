/**
 * Pure renderer for the per-stage `## Active stage: <stageId>` block
 * spec §23.4 sketches:
 *
 *   composeSystemPrompt(input):
 *     stack.push(`## Active stage: ${stage.id}`);
 *     for atomId in stage.atoms[]:
 *       stack.push(atom.skillFragment);
 *
 * The atom SKILL.md bodies come from `loadAtomBodies(db, atomIds)`
 * (in apps/daemon/src/plugins/atom-bodies.ts). This contracts-side
 * helper just assembles the markdown so the daemon-side composer and
 * any future contracts-side composer share one definition.
 *
 * Lives in contracts (pure TS, no fs / db) per the spec §11.8 PB1
 * single-import guarantee.
 */

export interface AtomBodyEntryView {
  atomId: string;
  body: string;
}

/**
 * Render a single stage's prompt block.
 *
 * - When `bodies` is empty the function returns an empty string so the
 *   caller can append unconditionally.
 * - The output is a sequence of:
 *     ## Active stage: <stageId>
 *
 *     ### <atomId>
 *
 *     <body>
 *
 *     ---
 *
 *   The trailing `---` separator is omitted after the last atom.
 */
export interface StageAtomBodiesView {
  stageId:    string;
  bodies:     ReadonlyArray<AtomBodyEntryView>;
  iteration?: number;
}

/**
 * Render every pipeline stage's `## Active stage` block, inlining each
 * atom's body exactly once across the whole pipeline (issue #6238).
 *
 * Invariant: the first stage that carries a non-empty body for an atom
 * inlines it in full; any later stage that references the same atom
 * keeps its `### <atomId>` subsection but replaces the body with a
 * one-line pointer back to the stage that inlined it. Stage headers are
 * preserved per spec §23.4 (each stage still renders its own block);
 * only the duplicated body text is collapsed.
 *
 * Stages whose atoms all resolve to empty bodies render nothing and are
 * dropped, matching `renderActiveStageBlock`'s empty-string contract.
 */
export function renderActiveStageBlocks(
  stages: ReadonlyArray<StageAtomBodiesView>,
): string[] {
  const inlinedAtomStage = new Map<string, string>();
  const blocks: string[] = [];
  for (const stage of stages) {
    const bodies = stage.bodies
      .filter((entry) => entry.body && entry.atomId)
      .map((entry) => {
        const firstStageId = inlinedAtomStage.get(entry.atomId);
        if (firstStageId !== undefined) {
          return {
            atomId: entry.atomId,
            body:
              `Atom \`${entry.atomId}\` — body already included under `
              + `\`## Active stage: ${firstStageId}\` above; apply it in this stage as well.`,
          };
        }
        inlinedAtomStage.set(entry.atomId, stage.stageId);
        return entry;
      });
    const block = renderActiveStageBlock({
      stageId: stage.stageId,
      bodies,
      ...(stage.iteration !== undefined ? { iteration: stage.iteration } : {}),
    });
    if (block.trim().length > 0) blocks.push(block);
  }
  return blocks;
}

export function renderActiveStageBlock(args: {
  stageId:    string;
  bodies:     ReadonlyArray<AtomBodyEntryView>;
  iteration?: number;
}): string {
  const visible = args.bodies.filter((b) => b.body && b.atomId);
  if (visible.length === 0) return '';
  const header = args.iteration !== undefined && args.iteration > 0
    ? `## Active stage: ${args.stageId} (iteration ${args.iteration})`
    : `## Active stage: ${args.stageId}`;
  const lines: string[] = ['', '', header];
  for (let i = 0; i < visible.length; i++) {
    const entry = visible[i]!;
    lines.push('', `### ${entry.atomId}`, '', entry.body.trim());
    if (i < visible.length - 1) {
      lines.push('', '---');
    }
  }
  return lines.join('\n');
}
