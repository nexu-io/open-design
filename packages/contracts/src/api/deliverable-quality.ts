/** Host evidence for the settled candidate, independent of physical Run success. */
export const DELIVERABLE_QUALITY_SCHEMA = 'open-design.deliverable-quality/v1' as const;
export const DELIVERABLE_QUALITY_CHECKER = 'prototype-interaction@1' as const;
export type DeliverableQualityStatus = 'pass' | 'fail' | 'incomplete' | 'not_applicable';
export interface DeliverableQualityCheck {
  id: string;
  kind: 'syntax' | 'static' | 'navigation';
  status: DeliverableQualityStatus;
  control?: string;
  expected?: string;
  observed?: string;
  reason?: string;
  file?: string;
  line?: number;
}
export interface DeliverableQualityEvidence {
  schema: typeof DELIVERABLE_QUALITY_SCHEMA;
  checker: typeof DELIVERABLE_QUALITY_CHECKER;
  status: DeliverableQualityStatus;
  /** SHA-256 over the entry and local executable dependencies, not just HTML. */
  candidateHash: string;
  entryFile: string;
  checkedAt: number;
  durationMs: number;
  coverage: { expected: number; checked: number; complete: boolean };
  checks: DeliverableQualityCheck[];
  initialStatus?: DeliverableQualityStatus;
  repair?: { attempts: number; maxAttempts: number; durationMs: number; reason?: string };
  history?: Array<{ candidateHash: string; status: DeliverableQualityStatus; checkedAt: number }>;
}
