import type { ProjectFile, ProjectMetadata } from '@open-design/contracts';
import type { SkillSummary } from '../types';

export const DEFAULT_BRAND_ENRICHMENT_SKILL_IDS = [
  'design-md',
  'design-review',
  'plan-design-review',
  'color-expert',
  'brand-guidelines',
] as const;

const AI_OPTIMIZE_QUALITY_BAR = [
  'AI Optimize quality bar:',
  '- Treat this as a longer background-quality pass that may take 10-20 minutes; prioritize completeness and recoverable incremental progress over a quick superficial answer.',
  '- Keep this run scoped to the current design-system project and update the existing registered design system in place. Do not create a duplicate system.',
  '- Use the attached design-system skills as internal lenses: DESIGN.md structure, senior design review, color expertise, and brand-guideline completeness. Do not ask the user to choose skills.',
  '- Read the current project evidence before editing: context/source notes, DESIGN.md, BRAND.md, brand.json, system/variables.css, system/theme.json, system/index.html, kit.html, kit.dark.html, preview cards, generated artifacts, assets/, logos/, imagery/, fonts/, and source_examples/ when present.',
  '- Treat the programmatic output as a module graph, not a single markdown file. Inspect every listed module and reconcile duplicated facts across tokens, previews, source captures, copied assets, and generated examples.',
  '- Re-measure reachable website, HTML, CSS, Figma, GitHub, or local-code evidence instead of guessing. Extract exact color literals and semantic roles, @font-face/font-family data, spacing, radius, shadows, layout posture, motion/interaction states, copy voice, logo candidates, and representative hero/product imagery.',
  '- Use robust extraction heuristics before synthesis: frequency-rank colors and fonts, prefer computed styles over screenshots when available, filter imagery by rendered size and semantic role, cross-check DOM/CSS/assets/screenshot evidence, and label any inferred value as inferred instead of measured.',
  '- Extract the site\'s design best practices as reusable guidance only when the evidence supports them: content hierarchy, grid and density, navigation patterns, accessibility affordances, responsive behavior, interaction feedback, component states, editorial/product page conventions, and conversion or trust cues.',
  '- Preserve real assets. Save useful logos, icons, cover images, screenshots, illustrations, and fonts as project files when source evidence exposes them; do not redraw brand marks or substitute generated placeholders when real files are available.',
  '- Strengthen the complete reusable package: DESIGN.md, README.md, SKILL.md, brand.json, colors/type tokens, light and dark kit quality, focused preview cards, component/UI-kit guidance, and starter implementation examples. Keep file manifests synchronized with the files you actually write.',
  '- Use a Claude Design / Baoyu Design style bar for fidelity: the finished system should read as a versioned bundle of tokens, fonts, components, UI kits, provenance, and exact source assets that can drive a new polished HTML deliverable without re-asking the user.',
  '- Progressively write valid partial updates and keep the preview recoverable. If a field group is ready, update it and continue; do not wait until the end to write everything.',
  '- Run the available preview/finalize/audit commands for this project when they exist, fix validation errors, and leave explicit caveats for evidence that could not be measured.',
  '- Do not get stuck on blocked sources. If the live site is an anti-bot verification page, emit a question-form asking the user to complete verification; otherwise continue from existing local evidence and record the limitation.',
  '- Finish by summarizing what was improved, which files changed, and any remaining gaps.',
].join('\n');

const FALLBACK_BRAND_ENRICHMENT_PROMPT = [
  'AI optimize this Open Design design system in place.',
  '',
  'A fast programmatic extraction already produced a usable design system, but it may be thin or approximate. Run a deeper asynchronous extraction pass now and turn it into a production-usable design-system package.',
  '',
  AI_OPTIMIZE_QUALITY_BAR,
].join('\n');

const CONTEXT_MARKER = 'Current programmatic extraction context:';
const MAX_CONTEXT_FILES = 120;

export interface BrandEnrichmentPromptContext {
  metadata?: ProjectMetadata | null;
  designSystemId?: string | null;
  designSystemTitle?: string | null;
  projectFiles?: readonly Pick<ProjectFile, 'name' | 'path' | 'type' | 'size' | 'kind' | 'mime'>[];
}

export function installedBrandEnrichmentSkillIds(
  skills: readonly Pick<SkillSummary, 'id'>[],
): string[] {
  const installed = new Set(skills.map((skill) => skill.id));
  return DEFAULT_BRAND_ENRICHMENT_SKILL_IDS.filter((id) => installed.has(id));
}

export function isProgrammaticBrandExtractionProject(
  metadata: ProjectMetadata | null | undefined,
): boolean {
  if (!metadata) return false;
  return (
    metadata.kind === 'brand' ||
    metadata.importedFrom === 'brand-extraction' ||
    Boolean(metadata.brandId) ||
    Boolean(metadata.brandDesignSystemId)
  );
}

export function buildBrandEnrichmentPrompt(
  existingPrompt?: string | null,
  context: BrandEnrichmentPromptContext = {},
): string {
  const trimmed = existingPrompt?.trim();
  const contextBlock = buildBrandEnrichmentContextBlock(context);
  const basePrompt = !trimmed
    ? FALLBACK_BRAND_ENRICHMENT_PROMPT
    : trimmed.includes('AI Optimize quality bar:')
      ? trimmed
      : [
          trimmed,
          '',
          AI_OPTIMIZE_QUALITY_BAR,
        ].join('\n');
  if (!contextBlock || basePrompt.includes(CONTEXT_MARKER)) return basePrompt;
  return [basePrompt, '', contextBlock].join('\n');
}

function buildBrandEnrichmentContextBlock(context: BrandEnrichmentPromptContext): string {
  const lines: string[] = [CONTEXT_MARKER];
  if (context.designSystemTitle || context.designSystemId) {
    lines.push(
      `- Existing registered design system: ${compactPair(context.designSystemTitle, context.designSystemId)}`,
    );
  }

  const metadata = context.metadata ?? null;
  if (metadata) {
    const sourceUrl = metadata.brandSourceUrl?.trim();
    if (sourceUrl) {
      lines.push(
        `- Source to re-check: ${sourceUrl.startsWith('designmd://') ? 'pasted DESIGN.md' : sourceUrl}`,
      );
    }
    if (metadata.sourceFileName?.trim()) lines.push(`- Source file name: ${metadata.sourceFileName.trim()}`);
    if (metadata.entryFile?.trim()) lines.push(`- Preview entry file: ${metadata.entryFile.trim()}`);
    if (metadata.brandId?.trim()) lines.push(`- Brand extraction id: ${metadata.brandId.trim()}`);
    if (metadata.brandDesignSystemId?.trim()) {
      lines.push(`- Persisted brand design-system id: ${metadata.brandDesignSystemId.trim()}`);
    }
    if (metadata.importedFrom?.trim()) lines.push(`- Imported from: ${metadata.importedFrom.trim()}`);
    lines.push(`- Project kind: ${metadata.kind}`);
  }

  lines.push(
    '- Programmatic modules to inspect and reconcile: DESIGN.md, README.md, SKILL.md, BRAND.md, brand.json, system/index.html, system/variables.css, system/theme.json, system/kit.html, system/kit.dark.html, context/, source_examples/, logos/, imagery/, assets/, fonts/, and every generated deliverable preview.',
  );

  const files = summarizeProjectFiles(context.projectFiles ?? []);
  if (files.length > 0) {
    lines.push('- Files visible in the extracted project right now:');
    lines.push(...files);
  }

  return lines.length > 2 ? lines.join('\n') : '';
}

function compactPair(title?: string | null, id?: string | null): string {
  const cleanTitle = title?.trim();
  const cleanId = id?.trim();
  if (cleanTitle && cleanId) return `${cleanTitle} (${cleanId})`;
  return cleanTitle || cleanId || '(unknown)';
}

function summarizeProjectFiles(
  files: readonly Pick<ProjectFile, 'name' | 'path' | 'type' | 'size' | 'kind' | 'mime'>[],
): string[] {
  const ranked = [...files]
    .filter((file) => file.name.trim())
    .sort((a, b) => projectFilePriority(a) - projectFilePriority(b) || a.name.localeCompare(b.name));
  const visible = ranked.slice(0, MAX_CONTEXT_FILES);
  const lines = visible.map((file) => {
    const path = file.path?.trim() && file.path !== file.name ? ` path=${file.path}` : '';
    const type = file.type === 'dir' ? 'dir' : file.kind;
    const size = Number.isFinite(file.size) && file.size > 0 ? ` ${Math.round(file.size / 1024)}KB` : '';
    return `  - ${file.name}${path} (${type || file.mime}${size})`;
  });
  if (ranked.length > visible.length) {
    lines.push(`  - ...${ranked.length - visible.length} more files not shown in this prompt; inspect the project file tree before finalizing.`);
  }
  return lines;
}

function projectFilePriority(
  file: Pick<ProjectFile, 'name' | 'path' | 'kind' | 'mime'>,
): number {
  const value = `${file.path ?? ''}/${file.name}`.toLowerCase();
  if (value.includes('design.md') || value.includes('brand.json') || value.includes('variables.css')) return 0;
  if (value.includes('system/') || value.includes('kit')) return 1;
  if (value.includes('font') || value.includes('logo') || value.includes('asset')) return 2;
  if (value.includes('imagery') || value.includes('source') || value.includes('context')) return 3;
  if (file.kind === 'html' || file.mime.includes('html')) return 4;
  return 5;
}
