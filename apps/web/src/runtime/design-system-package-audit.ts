import type {
  DesignSystemPackageAudit,
  DesignSystemPackageAuditIssue,
} from '../types';

function issueCountLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function auditIssueSummary(issue: DesignSystemPackageAuditIssue): string {
  return issue.path ? `${issue.code} (${issue.path})` : issue.code;
}

function targetedAuditRepairActions(issues: DesignSystemPackageAuditIssue[]): string[] {
  const codes = new Set(issues.map((issue) => issue.code));
  const actions: string[] = [];
  const hasAny = (...values: string[]) => values.some((value) => codes.has(value));
  if (hasAny(
    'ui_kit_index_missing_component_references',
    'ui_kit_index_missing_runtime_bootstrap',
    'ui_kit_index_missing_component_composition',
    'ui_kit_index_missing_jsx_runtime',
    'ui_kit_component_missing_browser_global',
  )) {
    actions.push('- Rebuild `ui_kits/app/index.html` as a runnable UI-kit entry: load React, ReactDOM, Babel, and `../../colors_and_type.css`; create `#root`; load at least three `components/*.jsx` scripts; expose loaded components on `window.ComponentName`; then render `<App />` with `ReactDOM.createRoot(...).render(...)`.');
  }
  if (hasAny(
    'missing_modular_ui_kit',
    'thin_modular_ui_kit',
    'missing_ui_kit_component_roles',
    'ui_kit_app_missing_role_composition',
  )) {
    actions.push('- Make `ui_kits/app/components/` substantive and role-based: include an app shell plus navigation/sidebar, list or rail, main workspace, composer/input, and message/card components when source evidence contains those product surfaces.');
  }
  if (hasAny('missing_skill_frontmatter', 'skill_missing_reuse_sections')) {
    actions.push('- Rewrite `SKILL.md` as a discoverable skill package with YAML frontmatter (`name`, `description`, `user-invocable`) and sections for What is inside, Source context, When to use this skill, How to use, and Design system highlights.');
  }
  if (hasAny('readme_missing_product_overview', 'readme_missing_package_reuse_guide', 'readme_missing_preview_manifest')) {
    actions.push('- Rewrite `README.md` as a Claude Design package guide with Product Overview/Product Context, source/context references, Package Contents, preview-card manifest, preserved assets/fonts/build/source examples, `ui_kits/app/`, and a concrete reuse or review workflow.');
  }
  if (hasAny('readme_missing_preview_manifest')) {
    actions.push('- Add a `## Preview Manifest` section to `README.md` that lists every generated `preview/*.html` card with the exact path, review purpose, and source-backed components or assets it demonstrates.');
  }
  if (hasAny('missing_source_component_examples', 'thin_source_component_examples')) {
    actions.push('- Copy real high-signal source snapshots into `source_examples/` or equivalent package source files; keep original component code substantial enough to inspect, not tiny generated stubs.');
  }
  if (hasAny('missing_build_assets', 'build_assets_not_source_backed', 'brand_assets_preview_not_using_preserved_assets')) {
    actions.push('- Preserve runtime/build assets by copying originals from `context/.../files/build/...` into root `build/` byte-for-byte, keep original filenames such as `icon.png` or `tray_icon.png`, and update `preview/brand-assets.html` to visibly reference those files.');
  }
  if (hasAny('preview_cards_missing_source_component_context', 'generic_visual_artifacts')) {
    actions.push('- Update focused preview cards to name or model actual source components from the evidence, such as Sidebar, Navbar, Chat, Inputbar, Message, Topic, Settings, or selector components, instead of abstract token-only swatches.');
  }
  return actions;
}

export function designSystemPackageAuditHasFindings(audit: DesignSystemPackageAudit): boolean {
  return audit.errors.length + audit.warnings.length > 0;
}

export function summarizeDesignSystemPackageAudit(audit: DesignSystemPackageAudit): string {
  if (!designSystemPackageAuditHasFindings(audit)) {
    return `Package audit passed (${issueCountLabel(audit.filesInspected, 'file')} inspected).`;
  }
  const countLabel = [
    audit.errors.length ? issueCountLabel(audit.errors.length, 'error') : '',
    audit.warnings.length ? issueCountLabel(audit.warnings.length, 'warning') : '',
  ].filter(Boolean).join(' and ');
  const findings = [...audit.errors, ...audit.warnings];
  const listed = findings.slice(0, 5).map(auditIssueSummary).join(', ');
  const extra = findings.length > 5 ? `, +${findings.length - 5} more` : '';
  return `Package audit found ${countLabel}: ${listed}${extra}.`;
}

export function buildDesignSystemPackageAuditRepairPrompt(
  audit: DesignSystemPackageAudit,
): string | null {
  if (!designSystemPackageAuditHasFindings(audit)) return null;
  const findings = [...audit.errors, ...audit.warnings]
    .slice(0, 16)
    .map((issue) => {
      const pathLabel = issue.path ? ` ${issue.path}` : '';
      return `- [${issue.severity}] ${issue.code}${pathLabel}: ${issue.message}`;
    });
  const hiddenCount = audit.errors.length + audit.warnings.length - findings.length;
  if (hiddenCount > 0) findings.push(`- ...and ${hiddenCount} more audit finding(s).`);
  const targetedActions = targetedAuditRepairActions([...audit.errors, ...audit.warnings]);
  return [
    'Fix the design-system package audit findings below.',
    '',
    'Treat every error and warning as blocking. Do not suppress the audit, delete evidence, or satisfy findings by only rewriting prose; update the real package artifacts and preserve source-backed files outside `context/` when the audit asks for them.',
    '',
    'Claude-style repair checklist:',
    '- If runtime/build assets are reported, preserve representative originals under root `build/` with their original filenames, copy them byte-for-byte from captured context snapshots, and make `preview/brand-assets.html` visibly reference the preserved files.',
    '- If source examples are reported, copy substantive original component snapshots into `source_examples/` or equivalent package source files; do not create tiny stubs that only share component names.',
    '- If UI-kit findings are reported, make `ui_kits/app/index.html` load `../../colors_and_type.css`, load/import modular files from `ui_kits/app/components/`, and mount a composed interface.',
    '- If README or SKILL findings are reported, keep them in sync with the final file structure and include Claude Design-style reusable package guidance.',
    '',
    ...(targetedActions.length > 0 ? [
      'Targeted repair actions:',
      ...targetedActions,
      '',
    ] : []),
    'Update the package files directly, then rerun `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings` until it passes.',
    '',
    'Audit findings:',
    ...findings,
  ].join('\n');
}
