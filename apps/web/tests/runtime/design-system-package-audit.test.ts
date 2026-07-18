import { describe, expect, it } from 'vitest';

import {
  buildDesignSystemPackageAuditRepairPrompt,
  designSystemPackageAuditHasFindings,
  summarizeDesignSystemPackageAudit,
} from '../../src/runtime/design-system-package-audit';
import type {
  DesignSystemPackageAudit,
  DesignSystemPackageAuditIssue,
} from '../../src/types';

function audit(
  errors: DesignSystemPackageAuditIssue[] = [],
  warnings: DesignSystemPackageAuditIssue[] = [],
  filesInspected = 12,
): DesignSystemPackageAudit {
  return { ok: errors.length === 0, projectPath: '/tmp/p', filesInspected, errors, warnings };
}

const issue = (
  code: string,
  severity: 'error' | 'warning' = 'error',
  path?: string,
): DesignSystemPackageAuditIssue => ({ severity, code, message: `${code} detail`, path });

describe('summarizeDesignSystemPackageAudit', () => {
  it('reports inspected file count using singular/plural label when there are no findings', () => {
    expect(summarizeDesignSystemPackageAudit(audit([], [], 1))).toBe(
      'Package audit passed (1 file inspected).',
    );
    expect(summarizeDesignSystemPackageAudit(audit([], [], 3))).toBe(
      'Package audit passed (3 files inspected).',
    );
  });

  it('lists up to five findings and appends a +N more tail', () => {
    const errs = Array.from({ length: 7 }, (_, i) => issue(`code_${i}`));
    const text = summarizeDesignSystemPackageAudit(audit(errs));
    expect(text).toContain('7 errors');
    expect(text).toContain('code_0');
    expect(text).toContain('code_4');
    expect(text).toContain('+2 more');
  });

  it('joins error and warning counts with "and" and includes path tags when present', () => {
    const text = summarizeDesignSystemPackageAudit(
      audit([issue('missing_skill_frontmatter', 'error', 'SKILL.md')], [issue('readme_thin', 'warning')]),
    );
    expect(text).toContain('1 error and 1 warning');
    expect(text).toContain('missing_skill_frontmatter (SKILL.md)');
    expect(text).toContain('readme_thin');
  });
});

describe('buildDesignSystemPackageAuditRepairPrompt', () => {
  it('returns null when the audit has no findings', () => {
    expect(buildDesignSystemPackageAuditRepairPrompt(audit())).toBeNull();
  });

  it('emits a targeted UI-kit repair action when ui_kit codes appear', () => {
    const prompt = buildDesignSystemPackageAuditRepairPrompt(
      audit([issue('ui_kit_index_missing_runtime_bootstrap')]),
    );
    expect(prompt).not.toBeNull();
    expect(prompt!).toContain('Targeted repair actions:');
    expect(prompt!).toContain('ui_kits/app/index.html');
  });

  it('truncates the findings list at 16 entries with a more-N suffix', () => {
    const errs = Array.from({ length: 20 }, (_, i) => issue(`c_${i}`));
    const prompt = buildDesignSystemPackageAuditRepairPrompt(audit(errs))!;
    expect(prompt).toContain('...and 4 more audit finding(s).');
  });
});

describe('designSystemPackageAuditHasFindings', () => {
  it('returns true when there are errors or warnings, false otherwise', () => {
    expect(designSystemPackageAuditHasFindings(audit())).toBe(false);
    expect(designSystemPackageAuditHasFindings(audit([issue('x')]))).toBe(true);
    expect(designSystemPackageAuditHasFindings(audit([], [issue('y', 'warning')]))).toBe(true);
  });
});
