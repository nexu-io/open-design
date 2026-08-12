export const SITE_OUTPUT_MODES = ['single-html', 'multi-file'] as const;

export type SiteOutputMode = (typeof SITE_OUTPUT_MODES)[number];

export type SiteOutputPolicyResult = {
  entryFile: 'index.html';
  mode: SiteOutputMode;
  repaired: boolean;
  validation: 'passed';
  warnings: string[];
};
