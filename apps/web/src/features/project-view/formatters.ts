// Pure string / prompt / attachment formatters for the project-view slice.
// These build the agent prompts, chat-attachment lists, and design-system
// display summaries the orchestrator sends — no transport, no DOM globals
// (ADR 0002). They move byte-for-byte out of the former `ProjectView`
// god-component.
import type {
  AgentEvent,
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
  DesignSystemSummary,
  PreviewCommentAttachment,
  Project,
  ProjectFile,
  ProjectMetadata,
} from '../../types';
import type { RunContextSelection } from '@open-design/contracts';
import { isDesignSystemProject } from '../../components/design-system-project';
import type { PluginFolderAgentAction } from '../../components/design-files/pluginFolderActions';

export function designSystemFeedbackAttachments(
  projectFiles: ProjectFile[],
  sectionFiles: string[],
): ChatAttachment[] {
  const fileLookup = new Map(projectFiles.map((file) => [file.name, file]));
  return sectionFiles
    .map((name) => fileLookup.get(name))
    .filter((file): file is ProjectFile => Boolean(file))
    .slice(0, 8)
    .map((file) => ({
      path: file.name,
      name: file.name,
      kind: file.kind === 'image' ? 'image' : 'file',
      size: file.size,
    }));
}

export function buildBrandAgentExtractionContinuationPrompt(input: {
  promptSeed?: string | null;
  metadata?: ProjectMetadata | null;
  projectFiles: readonly ProjectFile[];
}): string {
  const trimmed = input.promptSeed?.trim() ?? '';
  const brandId = input.metadata?.brandId?.trim() || '(current brand id)';
  const sourceUrl = input.metadata?.brandSourceUrl?.trim() || 'the source website';
  const base = /DESIGN SYSTEM EXTRACTION|ready design system is NOT guaranteed/i.test(trimmed)
    ? trimmed
    : [
        `Continue the AI design-system extraction for ${sourceUrl}.`,
        `Brand id: ${brandId}`,
        '',
        'The programmatic pass has not produced a ready design system yet. Continue from the current brand.html scaffold and saved project files; do not assume the design system is ready, and do not create a duplicate design-system id.',
        '',
        'Inspect brand.html, brand.json, DESIGN.md, BRAND.md, context/, logos/, imagery/, fonts/, and system assets. Measure the source website when reachable. If the live page is an anti-bot verification interstitial, ask the user to clear it in the Browser tab before continuing.',
        '',
        `Write valid partial brand.json updates progressively, run od brand preview ${brandId} after meaningful field groups, then run od brand finalize ${brandId} when the kit is complete. Fix validation errors and keep updating the same registered design system in place.`,
      ].join('\n');
  const visibleFiles = input.projectFiles
    .filter((file) => file.name.trim())
    .slice(0, 80)
    .map((file) => `  - ${file.name}${file.size > 0 ? ` (${Math.round(file.size / 1024)}KB)` : ''}`);
  if (visibleFiles.length === 0 || base.includes('Current brand extraction continuation context:')) {
    return base;
  }
  return [
    base,
    '',
    'Current brand extraction continuation context:',
    `- Source URL: ${sourceUrl}`,
    `- Brand id: ${brandId}`,
    '- Files visible in the project right now:',
    ...visibleFiles,
  ].join('\n');
}

export function designSystemNameForSourceProject(project: Project): string {
  const sourceName = project.name.trim() || 'Untitled';
  return /\bdesign system\b/i.test(sourceName)
    ? sourceName
    : `${sourceName} Design System`;
}

export function buildCreateDesignSystemFromProjectPrompt(input: {
  project: Project;
  projectFiles: readonly ProjectFile[];
  activeDesignSystem?: DesignSystemSummary | null;
}): string {
  const visibleFiles = input.projectFiles
    .filter((file) => file.name.trim())
    .slice(0, 140)
    .map((file) => `  - ${file.name}${file.size > 0 ? ` (${Math.round(file.size / 1024)}KB)` : ''}`);
  const metadataJson = input.project.metadata
    ? JSON.stringify(input.project.metadata, null, 2)
    : '{}';
  const activeDesignSystem = input.activeDesignSystem
    ? [
        `- Active design system id: ${input.activeDesignSystem.id}`,
        `- Active design system title: ${input.activeDesignSystem.title}`,
      ]
    : ['- Active design system: (none)'];
  return [
    'Create this project as a complete Open Design design system workspace.',
    '',
    'Autonomy requirement:',
    '- Do not ask setup or clarification questions during design-system generation.',
    '- Do not emit `<question-form>`, "Quick brief — 30 seconds", direction cards, choice cards, or any UI that waits for user input.',
    '- The source project already contains the evidence. Choose sensible defaults where details are missing and begin generating the design-system artifacts immediately.',
    '',
    'Source project handoff:',
    `- Source project id: ${input.project.id}`,
    `- Source project name: ${input.project.name}`,
    ...activeDesignSystem,
    '- Read `context/source-context.md` first. It lists the copied project files and original project metadata.',
    '- Treat every copied file, uploaded asset, reference image, browser snapshot, sketch, generated artifact, and context note in this workspace as design-system evidence.',
    '- Use the copied project outputs to infer real visual language, components, layout, interaction patterns, copy tone, tokens, typography, spacing, assets, and anti-patterns.',
    '- Do not create another project or another design-system id. Update this new design-system project in place.',
    '',
    'Source project metadata:',
    '```json',
    metadataJson,
    '```',
    '',
    'Visible copied files to inspect:',
    ...(visibleFiles.length > 0 ? visibleFiles : ['  - (none listed yet; rely on context/source-context.md after the copy finishes)']),
    input.projectFiles.length > visibleFiles.length
      ? `  - ...and ${input.projectFiles.length - visibleFiles.length} more files listed in context/source-context.md`
      : '',
    '',
    'Expected output:',
    '- A clear `DESIGN.md` with product context, visual foundations, color, type, spacing, layout, components, motion, voice, and anti-patterns.',
    '- A reusable package: `README.md`, `SKILL.md`, `colors_and_type.css`, provenance notes, `assets/`, `build/` when runtime icons exist, optional `fonts/`, focused `preview/` cards, preserved source examples, and `ui_kits/app/`.',
    '- Preserve real source assets when evidence provides them: logos, app icons, tray icons, avatars, wordmarks, imagery, and font files belong in `assets/`, `build/`, or `fonts/`, not only in prose.',
    '- Preserve high-signal source/component examples outside `context/` when copied files include substantial implementation or artifact code. Do not replace them with tiny stubs.',
    '- Split review previews into focused cards for colors, typography, spacing, radius/shadows, components, brand assets, and applied UI surfaces. Preview cards must visibly load preserved files when available.',
    '- Build `ui_kits/app/` as an applied interface kit that reflects the source project, with an index page and component files when the evidence supports them. Do not leave it as a generic static mock.',
    '- Keep `README.md`, `SKILL.md`, `DESIGN.md`, preview manifest text, and `ui_kits/app/README.md` synchronized with the final file structure.',
    '',
    'Completion gate:',
    '- Finish only after the project contains reviewable design-system artifacts and the right-side Design System tab can inspect them.',
    '- Before your final response, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings`.',
    '- Fix every audit error and design-quality warning. If an issue cannot be fixed because source evidence is missing, explain that blocker instead of claiming the design system is ready.',
    '',
    'When finished, summarize the generated files and name the first previews reviewers should inspect.',
  ].filter(Boolean).join('\n');
}

export function chatAttachmentsFromPreviewCommentImages(
  images: PreviewCommentAttachment[] | undefined,
): ChatAttachment[] {
  if (!Array.isArray(images)) return [];
  const seen = new Set<string>();
  const out: ChatAttachment[] = [];
  for (const image of images) {
    const path = image.path.trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push({
      path,
      name: image.name.trim() || path.split('/').pop() || path,
      kind: 'image',
    });
  }
  return out;
}

export function mergeChatAttachments(...groups: ChatAttachment[][]): ChatAttachment[] {
  const seen = new Set<string>();
  const out: ChatAttachment[] = [];
  for (const group of groups) {
    for (const attachment of group) {
      const path = attachment.path.trim();
      if (!path || seen.has(path)) continue;
      seen.add(path);
      out.push({ ...attachment, path });
    }
  }
  return out;
}

export function historyWithWorkspaceContext(
  history: ChatMessage[],
  messageId: string,
  context: RunContextSelection | undefined,
): ChatMessage[] {
  const items = context?.workspaceItems ?? [];
  if (items.length === 0) return history;
  const block = [
    '',
    '',
    '<active-workspace-context>',
    'Open Design selected or inferred these workspace contexts for this turn. Treat absolute paths as reference context unless the user explicitly asks to edit them.',
    ...items.map((item, index) => {
      const details = [
        item.path ? `path: ${item.path}` : null,
        item.absolutePath ? `absolute: ${item.absolutePath}` : null,
        item.url ? `url: ${item.url}` : null,
        item.title ? `title: ${item.title}` : null,
        item.tabId ? `tab: ${item.tabId}` : null,
      ].filter(Boolean).join(' | ');
      return `${index + 1}. ${item.kind}: ${item.label}${details ? ` | ${details}` : ''}`;
    }),
    '</active-workspace-context>',
  ].join('\n');
  return history.map((message) =>
    message.id === messageId && message.role === 'user'
      ? { ...message, content: `${message.content}${block}` }
      : message,
  );
}

export function commentTaskQuery(attachment: ChatCommentAttachment): string {
  return (attachment.comment ?? '').trim();
}

export function commentTaskContextAttachment(attachment: ChatCommentAttachment): ChatCommentAttachment {
  return {
    ...attachment,
    comment: '',
    commentContext: 'query',
  };
}

export function designSystemNeedsWorkPrompt(
  sectionTitle: string,
  feedback: string,
  sectionFiles: string[],
): string {
  const fileList =
    sectionFiles.length > 0
      ? sectionFiles.map((name) => `- @${name}`).join('\n')
      : '- No generated files are registered for this section yet.';
  return (
    `Needs work on the design system section "${sectionTitle}".\n\n` +
    `User feedback:\n${feedback}\n\n` +
    `Relevant section files:\n${fileList}\n\n` +
    'Revise the design-system project files directly. Keep DESIGN.md, tokens, previews, UI kit examples, and assets consistent with the feedback. ' +
    'After editing, summarize what changed and which files should be reviewed again.'
  );
}

export function fallbackDesignSystemSummaryForProject(
  project: Project,
  designSystemId: string | null,
): DesignSystemSummary | null {
  if (!designSystemId || !isDesignSystemProject(project)) return null;
  const metadata = project.metadata;
  const sourceUrl = metadata?.brandSourceUrl?.trim() || null;
  const title =
    metadata?.sourceFileName?.trim()
    || project.name.replace(/\s+Design System\s*$/i, '').trim()
    || project.name
    || 'Design system';
  return {
    id: designSystemId,
    title,
    category: 'Brands',
    summary: sourceUrl ? `Draft design system extracted from ${sourceUrl}.` : '',
    swatches: [],
    surface: 'web',
    source: 'user',
    status: 'draft',
    isEditable: true,
    projectId: project.id,
    ...(sourceUrl
      ? { provenance: { sourceUrls: [sourceUrl], sourceNotes: `Extracting from ${sourceUrl}` } }
      : {}),
  };
}

// --- Plugin-folder GitHub workflow (publish repo / open-design PR) -------

export function pluginWorkflowTitle(action: PluginFolderAgentAction): string {
  return action === 'publish' ? 'Publish repo' : 'Open Design PR';
}

export function pluginWorkflowCliCommand(action: PluginFolderAgentAction, relativePath: string): string {
  return action === 'publish'
    ? `od plugin publish-repo ${relativePath}`
    : `od plugin open-design-pr ${relativePath}`;
}

export function pluginWorkflowPlannedSteps(action: PluginFolderAgentAction): string[] {
  if (action === 'publish') {
    return [
      'Resolve GitHub owner and validate plugin metadata',
      'Create or update the GitHub repository',
      'Push plugin files and tags',
      'Return the repository URL',
    ];
  }
  return [
    'Ensure the Open Design fork exists',
    'Clone the fork and prepare a branch',
    'Copy the plugin into plugins/community',
    'Push the branch and open the PR form',
  ];
}

export function pluginWorkflowPlannedEvents(action: PluginFolderAgentAction, relativePath: string): AgentEvent[] {
  return [
    { kind: 'text', text: `${pluginWorkflowStartContent(action, relativePath)}\n\n` },
    { kind: 'status', label: 'working', detail: pluginWorkflowTitle(action) },
  ];
}

export function pluginWorkflowResultEvents(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  url: string | undefined,
  log: string[] | undefined,
  ok: boolean,
  existingEvents?: AgentEvent[],
): AgentEvent[] {
  const summary = ok
    ? pluginWorkflowSuccessContent(action, relativePath, message, url, log)
    : pluginWorkflowFailureContent(action, relativePath, message, log);
  const baseEvents = (existingEvents ?? []).filter(
    (event) => !(event.kind === 'status' && event.label === 'working'),
  );
  return [
    ...baseEvents,
    { kind: 'text', text: `${summary}\n\n` },
    {
      kind: 'status',
      label: ok ? 'done' : 'failed',
      detail: ok ? 'CLI command finished' : 'CLI command failed',
    },
  ];
}

export function pluginWorkflowStartContent(action: PluginFolderAgentAction, relativePath: string): string {
  const title = pluginWorkflowTitle(action);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const steps = pluginWorkflowPlannedSteps(action).map((step) => `- ${step}`).join('\n');
  return `${title} started.\n\n\`\`\`bash\n${command}\n\`\`\`\n\nPlanned steps:\n${steps}`;
}

export function pluginWorkflowSuccessContent(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  url?: string,
  log?: string[],
): string {
  const summary = stripTrailingUrl(message, url) || `${pluginWorkflowTitle(action)} completed for \`${relativePath}\`.`;
  const lines = (log ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 5);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const details = lines.length > 0
    ? `\n\nCLI output:\n${lines.map((line) => `- \`${truncatePluginWorkflowLine(line)}\``).join('\n')}`
    : '';
  const link = url ? `\n\nLink: [${url}](${url})` : '';
  return `${summary}\n\n\`\`\`bash\n${command}\n\`\`\`${link}${details}`;
}

export function pluginWorkflowFailureContent(
  action: PluginFolderAgentAction,
  relativePath: string,
  message: string,
  log?: string[],
): string {
  const lines = (log ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 5);
  const command = pluginWorkflowCliCommand(action, relativePath);
  const details = lines.length > 0
    ? `\n\nCLI output:\n${lines.map((line) => `- \`${truncatePluginWorkflowLine(line)}\``).join('\n')}`
    : '';
  return `${pluginWorkflowTitle(action)} failed.\n\n\`\`\`bash\n${command}\n\`\`\`\n\n${message}${details}`;
}

function truncatePluginWorkflowLine(line: string): string {
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

export function stripTrailingUrl(message: string, url?: string): string {
  const text = message.trim();
  const link = url?.trim();
  if (!link) return text;
  return text.replace(new RegExp(`\\s*${escapeRegExp(link)}\\s*$`), '').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
