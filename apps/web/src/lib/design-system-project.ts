import type { ProjectMetadata } from '../types';

export function isDesignSystemCreationProject(
  metadata: ProjectMetadata | null | undefined,
): boolean {
  return metadata?.creationFlow === 'design_system_from_sources';
}

/** HTML showcase used for preview + workspace Edit; never raw JSON or SVG previews. */
export function pickDesignSystemShowcaseFile(fileNames: string[]): string | null {
  return (
    fileNames.find((file) => file === 'showcase.html')
    ?? fileNames.find((file) => file.endsWith('/showcase.html'))
    ?? null
  );
}

/** @deprecated alias — import paths return generated file lists. */
export function pickDesignSystemEntryFile(generatedFiles: string[]): string | null {
  return pickDesignSystemShowcaseFile(generatedFiles);
}

const AGENT_ATTACHMENT_SUFFIXES = [
  '/tokens.dtcg.json',
  '/tailwind.preset.ts',
  '/tailwind-map.json',
  '/summary.md',
  '/showcase.html',
] as const;

export function filterDesignSystemAgentAttachments(paths: string[]): string[] {
  return paths.filter((file) =>
    AGENT_ATTACHMENT_SUFFIXES.some((suffix) => file.endsWith(suffix)),
  );
}

export function buildDesignSystemCreationPrompt(
  brief: ProjectMetadata['designSystemBrief'] | undefined,
): string {
  const parts = [
    'Generate a usable design system package from the imported source artifacts already in this project.',
    'Use any project brief in metadata; do not repeat those fields as questions.',
    'Primary deliverable: a project-root showcase.html — a complete HTML document with real UI specimens (colors, type, buttons, forms) so the workspace preview and Edit tools work.',
    'Color swatches must use class swatch (or swatch-color), stable data-od-id values (ds-color-0, ds-color-1, …), data-ds-swatch, and inline background colors so Inspect edits persist and sync back to DESIGN.md.',
    'Update the existing showcase.html when present; do not leave preview-only SVGs or markdown as the main surface.',
    'Also deliver DESIGN.md, normalized tokens, semantic aliases, and Tailwind-ready mapping.',
  ];
  if (brief?.advancedGeneration) {
    parts.push(
      'Advanced mode: include React component stubs and Code Connect-style mapping files where practical.',
    );
  } else {
    parts.push('Standard mode: DESIGN.md and token files are sufficient.');
  }
  if (!brief?.questionnaireEnabled) {
    parts.push('Do not run a discovery questionnaire; proceed with practical outputs.');
  }
  return parts.join(' ');
}

/** One-shot session flag: open this HTML path after design-system project creation. */
export const designSystemEntryShowcaseKey = (projectId: string) =>
  `od:ds-entry-showcase:${projectId}`;
