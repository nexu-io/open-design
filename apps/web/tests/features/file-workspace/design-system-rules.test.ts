import { describe, expect, it } from 'vitest';
import type { ProjectFile } from '../../../src/types';
import type { TodoItem } from '../../../src/runtime/todos';
import type { FileOpEntry } from '../../../src/runtime/file-ops';
import type {
  DesignSystemProjectSection,
  DesignSystemProjectSectionReview,
  DesignSystemReviewEntry,
  DesignSystemSectionActivity,
  TranslateFn,
} from '../../../src/features/file-workspace/types';
import {
  buildDesignSystemReviewSections,
  colorHexFromBrandJson,
  colorHexFromDesignMd,
  designMdBodyWithColor,
  designSystemBasename,
  designSystemFallbackReviewSections,
  designSystemFileOpBelongsToSection,
  designSystemGenerationProgress,
  designSystemGenerationReviewHasStarted,
  designSystemGuidanceSort,
  designSystemHasSourceContext,
  designSystemInitialGenerationSteps,
  designSystemManifestCardError,
  designSystemPathMatchesSection,
  designSystemRelatedFilesForCategory,
  designSystemReviewAgentTaskLabel,
  designSystemReviewArtifactSort,
  designSystemReviewCategoryRank,
  designSystemReviewGroups,
  designSystemReviewNeedsAttention,
  designSystemReviewPreviewDisplay,
  designSystemReviewSubtitle,
  designSystemReviewTimeLabel,
  designSystemReviewTitleFromPath,
  designSystemSectionActivity,
  designSystemSectionChangedAfterReview,
  designSystemSectionEditableFile,
  designSystemSectionPreviewFile,
  designSystemSectionRunningNotice,
  designSystemSectionStatus,
  designSystemSectionStatusClass,
  designSystemSectionStatusLabel,
  designSystemSectionTodo,
  designSystemSectionVisibleDuringGeneration,
  designSystemTodoActivityPhase,
  designSystemTodoBelongsToSection,
  designSystemTodoRank,
  documentTemplateScenarioKey,
  formatWorkspaceSnapshotElapsed,
  inferDesignSystemReviewCategory,
  initialDesignKitColorHex,
  initialMarkdownDocument,
  isDesignSystemAssetFile,
  isDesignSystemEvidenceFile,
  isDesignSystemGuidanceFile,
  isDesignSystemPreviewFile,
  isDesignSystemRawAssetFile,
  isDesignSystemReviewArtifactFile,
  isDesignSystemReviewableAssetArtifact,
  isDesignSystemTokenFile,
  isDesignSystemUiKitEntryPage,
  isDesignSystemUiKitFile,
  joinProjectFilePath,
  nextMarkdownDocumentPath,
  normalizeDesignKitHex,
  normalizeDesignSystemPath,
  normalizeProjectFilePath,
  optionalDesignSystemManifestString,
  parseDesignSystemCardManifest,
  parseDesignSystemCardManifestEntry,
  preferPreviewArtifactsOverRawAssets,
  slugForTestId,
  truncateDesignSystemActivityText,
} from '../../../src/features/file-workspace/rules';

const t: TranslateFn = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

function file(name: string, over: Partial<ProjectFile> = {}): ProjectFile {
  return { name, kind: 'text', size: 0, mtime: 0, ...over } as ProjectFile;
}

function fileMap(files: ProjectFile[]): Map<string, ProjectFile> {
  return new Map(files.map((f) => [f.name, f]));
}

function section(over: Partial<DesignSystemProjectSection> = {}): DesignSystemProjectSection {
  return { title: 'colors-and-type', subtitle: 'sub', category: 'Colors', files: [], ...over };
}

function activity(over: Partial<DesignSystemSectionActivity> = {}): DesignSystemSectionActivity {
  return { running: false, mutated: false, errored: false, phase: 'idle', touchedFiles: [], ...over };
}

describe('normalizeDesignKitHex / colorHexFromBrandJson / colorHexFromDesignMd', () => {
  it('normalizes and uppercases a 6-digit hex', () => {
    expect(normalizeDesignKitHex('#abcdef')).toBe('#ABCDEF');
    expect(normalizeDesignKitHex('abcdef')).toBe('#ABCDEF');
  });
  it('expands a 3-digit hex', () => {
    expect(normalizeDesignKitHex('#abc')).toBe('#AABBCC');
  });
  it('returns null for an invalid hex', () => {
    expect(normalizeDesignKitHex('not-a-color')).toBeNull();
  });
  it('reads a color by index from brand.json', () => {
    expect(colorHexFromBrandJson('{"colors":[{"hex":"#111111"}]}', 0)).toBe('#111111');
  });
  it('returns null for missing or malformed brand.json', () => {
    expect(colorHexFromBrandJson(null, 0)).toBeNull();
    expect(colorHexFromBrandJson('not json', 0)).toBeNull();
  });
  it('returns null for an empty DESIGN.md body', () => {
    expect(colorHexFromDesignMd('', 0)).toBeNull();
  });
});

describe('initialDesignKitColorHex', () => {
  it('prefers brand.json over DESIGN.md over swatches over current colors', () => {
    const hex = initialDesignKitColorHex(0, {
      brandJson: '{"colors":[{"hex":"#111111"}]}',
      designMdBody: null,
      swatches: ['#222222'],
      currentColors: [{ role: 'r', name: 'n', hex: '#333333', usage: '' }],
    });
    expect(hex).toBe('#111111');
  });
  it('falls back to swatches when no brand.json/DESIGN.md color exists', () => {
    const hex = initialDesignKitColorHex(0, {
      brandJson: null,
      designMdBody: null,
      swatches: ['#222222'],
      currentColors: [],
    });
    expect(hex).toBe('#222222');
  });
});

describe('designMdBodyWithColor', () => {
  it('synthesizes a color table when no existing table can be patched', () => {
    const result = designMdBodyWithColor('# Design', [], 0, '#ABCDEF');
    expect(result).toContain('## Color Palette');
    expect(result).toContain('#ABCDEF');
  });
});

describe('designSystemHasSourceContext', () => {
  it('is false with no provenance', () => {
    expect(designSystemHasSourceContext({} as never)).toBe(false);
  });
  it('is true when provenance has a company blurb', () => {
    expect(designSystemHasSourceContext({ provenance: { companyBlurb: 'Acme' } } as never)).toBe(true);
  });
});

describe('slugForTestId', () => {
  it('lowercases and dashes non-alphanumeric runs, trimming edges', () => {
    expect(slugForTestId(' Hello, World! ')).toBe('hello-world');
  });
});

describe('designSystemSectionEditableFile / designSystemSectionPreviewFile', () => {
  it('prefers an html/sketch preview file', () => {
    const html = file('index.html', { kind: 'html' });
    expect(designSystemSectionEditableFile(section(), html, fileMap([html]))).toBe(html);
  });
  it('falls back to an html file among the section files', () => {
    const html = file('preview/a.html', { kind: 'html' });
    const result = designSystemSectionEditableFile(section({ files: ['preview/a.html'] }), null, fileMap([html]));
    expect(result).toBe(html);
  });
  it('picks the first renderable file as the preview file', () => {
    const html = file('index.html', { kind: 'html' });
    expect(designSystemSectionPreviewFile(['index.html'], fileMap([html]))).toBe(html);
  });
  it('returns null when no renderable file exists', () => {
    expect(designSystemSectionPreviewFile(['a.txt'], fileMap([file('a.txt')]))).toBeNull();
  });
});

describe('buildDesignSystemReviewSections / preferPreviewArtifactsOverRawAssets / isDesignSystemReviewArtifactFile', () => {
  it('builds sections from artifact files when present', () => {
    const html = file('preview/typography.html', { kind: 'html' });
    const sections = buildDesignSystemReviewSections(['preview/typography.html'], fileMap([html]));
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0]?.category).toBe('Type');
  });
  it('falls back to grouped sections when no artifact files exist', () => {
    const sections = buildDesignSystemReviewSections(['tokens.css'], fileMap([file('tokens.css')]));
    expect(sections.some((s) => s.category === 'Colors')).toBe(true);
  });
  it('excludes non-preview raw brand assets when a brand preview exists', () => {
    const names = ['preview/brand.html', 'assets/logo.png'];
    expect(preferPreviewArtifactsOverRawAssets(names)).toEqual(['preview/brand.html']);
  });
  it('keeps all names when no brand preview exists', () => {
    const names = ['assets/logo.png'];
    expect(preferPreviewArtifactsOverRawAssets(names)).toEqual(names);
  });
  it('rejects evidence and metadata files as review artifacts', () => {
    const html = file('context/notes.html', { kind: 'html' });
    expect(isDesignSystemReviewArtifactFile('context/notes.html', fileMap([html]))).toBe(false);
  });
});

describe('isDesignSystemRawAssetFile / isDesignSystemReviewableAssetArtifact', () => {
  it('recognizes an assets/ path', () => {
    expect(isDesignSystemRawAssetFile('assets/logo.png')).toBe(true);
    expect(isDesignSystemRawAssetFile('preview/index.html')).toBe(false);
  });
  it('recognizes a reviewable brand-ish asset path', () => {
    expect(isDesignSystemReviewableAssetArtifact('assets/brand-logo.png')).toBe(true);
    expect(isDesignSystemReviewableAssetArtifact('assets/random.png')).toBe(false);
  });
});

describe('formatWorkspaceSnapshotElapsed', () => {
  it('formats sub-minute durations in seconds', () => {
    expect(formatWorkspaceSnapshotElapsed(45)).toBe('45s');
  });
  it('formats whole-minute durations without a seconds suffix', () => {
    expect(formatWorkspaceSnapshotElapsed(120)).toBe('2m');
  });
  it('formats minute+second durations with a padded seconds suffix', () => {
    expect(formatWorkspaceSnapshotElapsed(125)).toBe('2m 05s');
  });
  it('clamps negative input to 0', () => {
    expect(formatWorkspaceSnapshotElapsed(-5)).toBe('0s');
  });
});

describe('designSystemReviewArtifactSort / designSystemReviewTitleFromPath / inferDesignSystemReviewCategory', () => {
  it('derives a readable title from a file path, stripping index basenames', () => {
    expect(designSystemReviewTitleFromPath('preview/typography/index.html')).toBe('typography');
    expect(designSystemReviewTitleFromPath('logo_mark.png')).toBe('logo-mark');
  });
  it('infers category from filename/title keywords', () => {
    expect(inferDesignSystemReviewCategory('typography.html', 'typography')).toBe('Type');
    expect(inferDesignSystemReviewCategory('palette.html', 'palette')).toBe('Colors');
    expect(inferDesignSystemReviewCategory('spacing.html', 'spacing')).toBe('Spacing');
    expect(inferDesignSystemReviewCategory('logo.png', 'logo')).toBe('Brand');
    expect(inferDesignSystemReviewCategory('random.html', 'random')).toBe('Components');
  });
  it('sorts artifacts by category rank, then title', () => {
    const sorted = ['b-logo.png', 'a-typography.html'].sort(designSystemReviewArtifactSort);
    expect(sorted).toEqual(['a-typography.html', 'b-logo.png']);
  });
});

describe('isDesignSystemUiKitEntryPage', () => {
  it('is true for an html file under ui_kits/', () => {
    expect(isDesignSystemUiKitEntryPage('ui_kits/buttons.html')).toBe(true);
  });
  it('is false for a non-html ui-kit file', () => {
    expect(isDesignSystemUiKitEntryPage('ui_kits/buttons.png')).toBe(false);
  });
});

describe('designSystemManifestCardError / optionalDesignSystemManifestString / parseDesignSystemCardManifestEntry / parseDesignSystemCardManifest', () => {
  it('formats a manifest card error with a leading dot detail', () => {
    expect(designSystemManifestCardError(2, '.path must be set').message).toContain('cards[2].path must be set');
  });
  it('returns undefined for an absent optional field', () => {
    expect(optionalDesignSystemManifestString({}, 'group', 0)).toBeUndefined();
  });
  it('throws when an optional field is present but not a string', () => {
    expect(() => optionalDesignSystemManifestString({ group: 5 }, 'group', 0)).toThrow(/must be a string/);
  });
  it('parses a valid card entry', () => {
    const entry = parseDesignSystemCardManifestEntry({ path: 'a.html', group: 'UI Kit' }, 0);
    expect(entry).toEqual({ path: 'a.html', group: 'UI Kit' });
  });
  it('throws for a card missing a path', () => {
    expect(() => parseDesignSystemCardManifestEntry({}, 0)).toThrow(/path must be a non-empty string/);
  });
  it('parses an empty manifest map for null/absent text', () => {
    expect(parseDesignSystemCardManifest(null).size).toBe(0);
  });
  it('parses cards into a manifest map keyed by normalized path', () => {
    const map = parseDesignSystemCardManifest('{"cards":[{"path":"A.HTML"}]}');
    expect(map.get('a.html')).toEqual({ path: 'a.html' });
  });
  it('throws on invalid JSON', () => {
    expect(() => parseDesignSystemCardManifest('not json')).toThrow(/Invalid _ds_manifest\.json/);
  });
});

describe('designSystemReviewPreviewDisplay', () => {
  it('is specimen when there is no preview file', () => {
    expect(designSystemReviewPreviewDisplay(section(), null)).toBe('specimen');
  });
  it('is ui-kit for a file under ui_kits/', () => {
    const f = file('ui_kits/buttons.html', { kind: 'html' });
    expect(designSystemReviewPreviewDisplay(section(), f)).toBe('ui-kit');
  });
  it('is asset for a non-html preview file', () => {
    const f = file('logo.png', { kind: 'image' });
    expect(designSystemReviewPreviewDisplay(section(), f)).toBe('asset');
  });
});

describe('designSystemRelatedFilesForCategory / designSystemFallbackReviewSections', () => {
  it('caps related files at 12 and always includes the artifact itself', () => {
    const names = Array.from({ length: 20 }, (_, i) => `tokens-${i}.css`);
    const related = designSystemRelatedFilesForCategory('tokens-0.css', 'Colors', names);
    expect(related).toHaveLength(12);
    expect(related[0]).toBe('tokens-0.css');
  });
  it('builds fallback sections grouped by kind', () => {
    const sections = designSystemFallbackReviewSections(['tokens.css', 'components/button.html', 'assets/logo.png']);
    expect(sections.map((s) => s.category)).toEqual(['Colors', 'Components', 'Brand']);
  });
});

describe('designSystemReviewGroups / designSystemReviewCategoryRank / designSystemReviewNeedsAttention', () => {
  it('groups reviews by category in fixed order, omitting empty categories', () => {
    const review = (category: DesignSystemProjectSection['category']): DesignSystemProjectSectionReview => ({
      section: section({ category }),
      previewFile: null,
      previewDisplay: 'specimen',
      reviewEntry: undefined,
      sectionActivity: activity(),
      changedAfterFeedback: false,
      sectionStatus: 'needs-review',
      sectionStatusLabel: '',
      reviewTimeLabel: null,
    });
    const groups = designSystemReviewGroups([review('Brand'), review('Type')]);
    expect(groups.map((g) => g.title)).toEqual(['Type', 'Brand']);
  });
  it('ranks categories in a fixed order', () => {
    expect(designSystemReviewCategoryRank('Type')).toBeLessThan(designSystemReviewCategoryRank('Brand'));
  });
  it('flags every non-approved status as needing attention', () => {
    const review: DesignSystemProjectSectionReview = {
      section: section(),
      previewFile: null,
      previewDisplay: 'specimen',
      reviewEntry: undefined,
      sectionActivity: activity(),
      changedAfterFeedback: false,
      sectionStatus: 'approved',
      sectionStatusLabel: '',
      reviewTimeLabel: null,
    };
    expect(designSystemReviewNeedsAttention(review)).toBe(false);
    expect(designSystemReviewNeedsAttention({ ...review, sectionStatus: 'needs-review' })).toBe(true);
  });
});

describe('file classification predicates', () => {
  it('isDesignSystemEvidenceFile matches context/ paths', () => {
    expect(isDesignSystemEvidenceFile('context/notes.md')).toBe(true);
    expect(isDesignSystemEvidenceFile('design.md')).toBe(false);
  });
  it('isDesignSystemGuidanceFile matches known root guidance files only', () => {
    expect(isDesignSystemGuidanceFile('design.md')).toBe(true);
    expect(isDesignSystemGuidanceFile('sub/design.md')).toBe(false);
  });
  it('designSystemGuidanceSort orders by the canonical guidance order', () => {
    expect(['skill.md', 'design.md'].sort(designSystemGuidanceSort)).toEqual(['design.md', 'skill.md']);
  });
  it('isDesignSystemTokenFile matches known token filenames and keyword paths', () => {
    expect(isDesignSystemTokenFile('tokens.css')).toBe(true);
    expect(isDesignSystemTokenFile('preview/tokens.css')).toBe(false);
  });
  it('isDesignSystemPreviewFile matches root html and preview/ paths', () => {
    expect(isDesignSystemPreviewFile('index.html')).toBe(true);
    expect(isDesignSystemPreviewFile('preview/anything.html')).toBe(true);
  });
  it('isDesignSystemUiKitFile matches ui_kits/ and components/ paths', () => {
    expect(isDesignSystemUiKitFile('ui_kits/buttons.html')).toBe(true);
    expect(isDesignSystemUiKitFile('assets/buttons.html')).toBe(false);
  });
  it('isDesignSystemAssetFile matches assets/ paths and image/font extensions', () => {
    expect(isDesignSystemAssetFile('assets/logo.png')).toBe(true);
    expect(isDesignSystemAssetFile('logo.png')).toBe(true);
    expect(isDesignSystemAssetFile('index.html')).toBe(false);
  });
});

describe('designSystemGenerationReviewHasStarted / designSystemSectionVisibleDuringGeneration', () => {
  it('is true once any section has a preview file', () => {
    const review: DesignSystemProjectSectionReview = {
      section: section(),
      previewFile: file('preview/a.html', { kind: 'html' }),
      previewDisplay: 'specimen',
      reviewEntry: undefined,
      sectionActivity: activity(),
      changedAfterFeedback: false,
      sectionStatus: 'needs-review',
      sectionStatusLabel: '',
      reviewTimeLabel: null,
    };
    expect(designSystemGenerationReviewHasStarted([review])).toBe(true);
  });
  it('is false when nothing has started', () => {
    const review: DesignSystemProjectSectionReview = {
      section: section({ files: [] }),
      previewFile: null,
      previewDisplay: 'specimen',
      reviewEntry: undefined,
      sectionActivity: activity(),
      changedAfterFeedback: false,
      sectionStatus: 'missing',
      sectionStatusLabel: '',
      reviewTimeLabel: null,
    };
    expect(designSystemGenerationReviewHasStarted([review])).toBe(false);
    expect(designSystemSectionVisibleDuringGeneration(review)).toBe(false);
  });
});

describe('designSystemSectionStatus / designSystemSectionStatusLabel / designSystemSectionStatusClass', () => {
  it('prioritizes running over everything else', () => {
    expect(designSystemSectionStatus(section({ files: ['a'] }), undefined, false, activity({ running: true }))).toBe('running');
  });
  it('is missing when the section has no files', () => {
    expect(designSystemSectionStatus(section({ files: [] }), undefined, false, activity())).toBe('missing');
  });
  it('reflects the review decision when present', () => {
    expect(designSystemSectionStatus(section({ files: ['a'] }), 'looks-good', false, activity())).toBe('approved');
    expect(designSystemSectionStatus(section({ files: ['a'] }), 'needs-work', false, activity())).toBe('needs-work');
  });
  it('labels and classes every status', () => {
    const s = section({ files: ['a'] });
    expect(designSystemSectionStatusLabel(t, s, 'approved', activity())).toBe('ds.reviewLooksGood');
    expect(designSystemSectionStatusClass('approved')).toBe('is-approved');
    expect(designSystemSectionStatusLabel(t, section({ requiredFile: 'design.md' }), 'missing', activity())).toContain('ds.sectionRequiredFileMissing');
  });
});

describe('designSystemGenerationProgress', () => {
  it('returns a floor value for zero steps', () => {
    expect(designSystemGenerationProgress([])).toBe(8);
  });
  it('reaches 100% scaled progress capped at 92 when all steps succeed', () => {
    const steps = Array.from({ length: 3 }, (_, i) => ({ id: `${i}`, title: '', detail: '', status: 'succeeded' as const }));
    expect(designSystemGenerationProgress(steps)).toBe(92);
  });
});

describe('designSystemInitialGenerationSteps', () => {
  it('marks the first pending step as running when nothing else is', () => {
    const steps = designSystemInitialGenerationSteps({
      files: [],
      sectionReviews: [],
      system: {} as never,
      t,
    });
    expect(steps.some((step) => step.status === 'running')).toBe(true);
  });
});

describe('designSystemSectionActivity / designSystemSectionTodo / designSystemTodoRank / designSystemTodoActivityPhase / designSystemTodoBelongsToSection', () => {
  const colorsSection = section({ category: 'Colors', files: ['tokens.css'] });
  it('detects a running write mutation as the writing phase', () => {
    const fileOps: FileOpEntry[] = [
      { path: 'tokens.css', fullPath: 'tokens.css', ops: ['write'], status: 'running' } as FileOpEntry,
    ];
    const result = designSystemSectionActivity(colorsSection, fileOps, []);
    expect(result.phase).toBe('writing');
    expect(result.running).toBe(true);
  });
  it('picks the highest-priority (in_progress) todo for a section', () => {
    const todos: TodoItem[] = [
      { content: 'update color tokens', status: 'pending' } as TodoItem,
      { content: 'update color tokens now', status: 'in_progress' } as TodoItem,
    ];
    const todo = designSystemSectionTodo(colorsSection, todos);
    expect(todo?.status).toBe('in_progress');
  });
  it('ranks in_progress above pending above everything else', () => {
    expect(designSystemTodoRank({ status: 'in_progress' } as TodoItem)).toBe(0);
    expect(designSystemTodoRank({ status: 'pending' } as TodoItem)).toBe(1);
    expect(designSystemTodoRank({ status: 'completed' } as TodoItem)).toBe(2);
  });
  it('classifies a pending todo as planned regardless of content', () => {
    expect(designSystemTodoActivityPhase(colorsSection, { status: 'pending', content: 'write tokens' } as TodoItem)).toBe('planned');
  });
  it('classifies mutation-keyword content as writing', () => {
    expect(designSystemTodoActivityPhase(colorsSection, { status: 'in_progress', content: 'write the color tokens' } as TodoItem)).toBe('writing');
  });
  it('classifies read-keyword content as reading', () => {
    expect(designSystemTodoActivityPhase(colorsSection, { status: 'in_progress', content: 'read the repo' } as TodoItem)).toBe('reading');
  });
  it('matches a todo to its section by category keyword', () => {
    expect(designSystemTodoBelongsToSection({ content: 'update the color palette', activeForm: '' } as TodoItem, colorsSection)).toBe(true);
    expect(designSystemTodoBelongsToSection({ content: 'unrelated task', activeForm: '' } as TodoItem, colorsSection)).toBe(false);
  });
});

describe('designSystemFileOpBelongsToSection / designSystemPathMatchesSection', () => {
  it('matches a file op whose path is one of the section files', () => {
    const entry: FileOpEntry = { path: 'tokens.css', fullPath: 'tokens.css', ops: ['write'], status: 'done' } as FileOpEntry;
    expect(designSystemFileOpBelongsToSection(entry, section({ files: ['tokens.css'] }))).toBe(true);
  });
  it('falls back to keyword path matching for the category', () => {
    const entry: FileOpEntry = { path: 'src/tokens/palette.css', fullPath: 'src/tokens/palette.css', ops: ['write'], status: 'done' } as FileOpEntry;
    expect(designSystemFileOpBelongsToSection(entry, section({ files: [] }))).toBe(true);
  });
  it('returns false for an unrecognized section title', () => {
    expect(designSystemPathMatchesSection('a.css', 'Unknown')).toBe(false);
  });
});

describe('normalizeDesignSystemPath / normalizeProjectFilePath / joinProjectFilePath', () => {
  it('lowercases, strips a leading ./, and normalizes slashes', () => {
    expect(normalizeDesignSystemPath('.\\Assets\\Logo.PNG')).toBe('assets/logo.png');
  });
  it('collapses redundant slashes without lowercasing', () => {
    expect(normalizeProjectFilePath('a\\\\b//c')).toBe('a/b/c');
  });
  it('joins a directory and name, or returns the bare name at the root', () => {
    expect(joinProjectFilePath('assets', 'logo.png')).toBe('assets/logo.png');
    expect(joinProjectFilePath('', 'logo.png')).toBe('logo.png');
  });
});

describe('nextMarkdownDocumentPath / initialMarkdownDocument / documentTemplateScenarioKey', () => {
  it('picks document.md when free', () => {
    expect(nextMarkdownDocumentPath([], '')).toBe('document.md');
  });
  it('increments past existing document names', () => {
    expect(nextMarkdownDocumentPath([file('document.md')], '')).toBe('document-2.md');
  });
  it('titleizes the filename for the generated document body', () => {
    const body = initialMarkdownDocument('my-new_doc.md', 'prototype', t);
    expect(body).toContain('# My New Doc');
  });
  it('falls back to the title-fallback key when the path has no usable basename', () => {
    const body = initialMarkdownDocument('.md', 'prototype', t);
    expect(body).toContain('designFiles.documentTemplate.titleFallback');
  });
  it('maps every project kind to a scenario key', () => {
    expect(documentTemplateScenarioKey('slide_deck')).toBe('designFiles.documentTemplate.scenario.slideDeck');
    expect(documentTemplateScenarioKey('design_system')).toBe('designFiles.documentTemplate.scenario.designSystem');
    expect(documentTemplateScenarioKey('template')).toBe('designFiles.documentTemplate.scenario.default');
  });
});

describe('designSystemBasename', () => {
  it('returns the last path segment, normalized', () => {
    expect(designSystemBasename('Assets/Logo.PNG')).toBe('logo.png');
  });
});

describe('designSystemSectionRunningNotice / designSystemReviewTimeLabel / designSystemReviewAgentTaskLabel', () => {
  it('surfaces a reading-context notice for the reading phase', () => {
    expect(designSystemSectionRunningNotice(t, section({ title: 'Colors' }), activity({ phase: 'reading' }))).toBe(
      'ds.sectionRunningReadingContext:{"title":"Colors"}',
    );
  });
  it('formats a valid review timestamp and returns null for an invalid one', () => {
    expect(designSystemReviewTimeLabel(t, '2024-01-01T00:00:00Z')).toContain('ds.reviewLastReviewed');
    expect(designSystemReviewTimeLabel(t, 'not-a-date')).toBeNull();
  });
  it('labels every agent-task status', () => {
    expect(designSystemReviewAgentTaskLabel(t, { status: 'queued' } as never)).toBe('ds.agentFeedbackQueued');
    expect(designSystemReviewAgentTaskLabel(t, { status: 'failed', error: 'boom' } as never)).toContain('ds.agentFeedbackFailedWithError');
    expect(designSystemReviewAgentTaskLabel(t, { status: 'failed' } as never)).toBe('ds.agentFeedbackFailed');
  });
});

describe('truncateDesignSystemActivityText', () => {
  it('leaves short text untouched', () => {
    expect(truncateDesignSystemActivityText('short')).toBe('short');
  });
  it('truncates long text with an ellipsis', () => {
    const long = 'a'.repeat(100);
    expect(truncateDesignSystemActivityText(long)).toHaveLength(80);
    expect(truncateDesignSystemActivityText(long).endsWith('...')).toBe(true);
  });
});

describe('designSystemSectionChangedAfterReview', () => {
  it('is false without a needs-work review entry', () => {
    expect(designSystemSectionChangedAfterReview([], new Map(), undefined)).toBe(false);
  });
  it('is true when a tracked file changed after the review timestamp', () => {
    const reviewEntry: DesignSystemReviewEntry = {
      decision: 'needs-work',
      updatedAt: '2024-01-01T00:00:00Z',
    } as DesignSystemReviewEntry;
    const changed = file('a.md', { mtime: Date.parse('2024-06-01T00:00:00Z') });
    expect(designSystemSectionChangedAfterReview(['a.md'], fileMap([changed]), reviewEntry)).toBe(true);
  });
});
