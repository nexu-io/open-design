export interface CapturedAnalyticsPayload {
  decoded: unknown;
  decodeError: string | null;
}

export interface AnalyticsPrivacyOptions {
  /** Read actual credentials from the running fixture; never commit them. */
  sensitiveValues: readonly string[];
}

export interface AnalyticsPrivacyFinding {
  recordIndex: number;
  kind: 'credential' | 'api_key_pattern' | 'email' | 'undecodable';
}

/**
 * Strict no-email profile for events whose declared contract excludes email.
 * This audits actual decoded captures; it does not scrub production payloads.
 * An email finding on a declared identity field needs contract review, not an
 * automatic product-leak conclusion. Errors contain no payload text.
 */
export function auditAnalyticsPayloadPrivacy(
  records: readonly CapturedAnalyticsPayload[],
  options: AnalyticsPrivacyOptions,
) {
  if (records.length === 0) throw new Error('Privacy audit needs captured payloads');
  if (options.sensitiveValues.length === 0 || options.sensitiveValues.some(value => !value)) {
    throw new Error('Privacy audit needs nonempty runtime credential values');
  }
  const findings: AnalyticsPrivacyFinding[] = [];
  for (const [recordIndex, record] of records.entries()) {
    if (record.decodeError !== null || record.decoded === null || record.decoded === undefined) {
      findings.push({ recordIndex, kind: 'undecodable' });
      continue;
    }
    const text = JSON.stringify(record.decoded);
    if (options.sensitiveValues.some(value => text.includes(value))) findings.push({ recordIndex, kind: 'credential' });
    if (/sk-[A-Za-z0-9_-]{16,}/.test(text)) findings.push({ recordIndex, kind: 'api_key_pattern' });
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) findings.push({ recordIndex, kind: 'email' });
  }
  return { recordCount: records.length, findings };
}

export function assertAnalyticsPayloadPrivacy(
  records: readonly CapturedAnalyticsPayload[],
  options: AnalyticsPrivacyOptions,
) {
  const result = auditAnalyticsPayloadPrivacy(records, options);
  if (result.findings.length > 0) {
    throw new Error(`Analytics privacy audit failed: ${JSON.stringify(result.findings)}`);
  }
  return result;
}
