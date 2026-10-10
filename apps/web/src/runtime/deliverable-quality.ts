import type { ChatMessage } from '../types';

export type DeliverableQualityPresentation =
  | 'checking'
  | 'pass'
  | 'fail'
  | 'incomplete'
  | 'not_applicable'
  | 'unknown';

/** Physical execution success never supplies missing candidate quality evidence. */
export function deliverableQualityPresentation(
  quality: ChatMessage['deliverableQuality'],
  runStatus: ChatMessage['runStatus'],
): DeliverableQualityPresentation {
  if (runStatus === 'running' || runStatus === 'queued') return 'checking';
  if (!quality || quality.schema !== 'open-design.deliverable-quality/v1'
    || quality.checker !== 'prototype-interaction@1' || !Array.isArray(quality.checks) || !quality.coverage
    || !quality.checks.every(check => check && typeof check.id === 'string'
      && ['syntax', 'static', 'navigation'].includes(check.kind)
      && ['pass', 'fail', 'incomplete', 'not_applicable'].includes(check.status))
    || !Number.isSafeInteger(quality.coverage.expected) || quality.coverage.expected < 0
    || !Number.isSafeInteger(quality.coverage.checked) || quality.coverage.checked < 0
    || quality.coverage.checked > quality.coverage.expected) return 'unknown';
  if (quality.status === 'fail' || quality.checks.some((check) => check.status === 'fail')) return 'fail';
  if (quality.status === 'not_applicable') return 'not_applicable';
  if (quality.status === 'pass' && quality.coverage.complete
    && quality.coverage.expected > 0
    && quality.coverage.checked === quality.coverage.expected
    && /^[a-f0-9]{64}$/.test(quality.candidateHash)
    && quality.checks.some((check) => check.kind === 'navigation' && check.status === 'pass')
    && !quality.checks.some((check) => check.status === 'incomplete')) return 'pass';
  return 'incomplete';
}
