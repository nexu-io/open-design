import { describe, expect, it } from 'vitest';
import { redactSecrets, redactSecretsWithCounts } from '../src/redact.js';

describe('redactSecrets', () => {
  it('returns empty / non-string input unchanged', () => {
    expect(redactSecrets('')).toBe('');
    expect(redactSecrets(undefined as unknown as string)).toBe(undefined);
  });

  it('redacts Anthropic / OpenAI sk-* keys', () => {
    expect(redactSecrets('use sk-ant-api03-AbCd1234efGh5678ijKl9012mnOp3456 today')).toBe(
      'use [REDACTED:sk_key] today',
    );
    expect(redactSecrets('paste sk-proj-abcdef1234567890ABCDEF here')).toBe(
      'paste [REDACTED:sk_key] here',
    );
  });

  it('redacts Langfuse pk-lf- / sk-lf- keys', () => {
    expect(
      redactSecrets('export LANGFUSE_PUBLIC_KEY=pk-lf-12345678-aaaa-bbbb-cccc-dddddddddddd'),
    ).toBe('export LANGFUSE_PUBLIC_KEY=[REDACTED:langfuse_key]');
    expect(
      redactSecrets('and LANGFUSE_SECRET_KEY=sk-lf-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
    ).toBe('and LANGFUSE_SECRET_KEY=[REDACTED:langfuse_key]');
  });

  it('redacts GitHub fine-grained / oauth tokens', () => {
    const ghp = 'ghp_' + 'a'.repeat(36);
    const gho = 'gho_' + 'b'.repeat(36);
    expect(redactSecrets(`token=${ghp}`)).toBe('token=[REDACTED:github_token]');
    expect(redactSecrets(`bearer ${gho}`)).toContain('[REDACTED:github_token]');
  });

  it('redacts AWS access key id and Google API key', () => {
    expect(redactSecrets('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE')).toBe(
      'AWS_ACCESS_KEY_ID=[REDACTED:aws_access_key]',
    );
    expect(redactSecrets('GMAPS=AIzaSyD-Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1')).toBe(
      'GMAPS=[REDACTED:google_api_key]',
    );
  });

  it('redacts Slack and Stripe tokens', () => {
    expect(redactSecrets('SLACK=xoxb-12345-67890-abcdefghijKLMNOP')).toBe(
      'SLACK=[REDACTED:slack_token]',
    );
    // Build the Stripe-shaped test fixture at runtime so the literal
    // `sk_test_...` string never lands in source where GitHub's push
    // protection (and any other static secret scanner) would flag it.
    // The regex sees the full token at test time and matches.
    const stripeFixture = ['sk', 'test', 'X'.repeat(24)].join('_');
    expect(redactSecrets(`STRIPE=${stripeFixture}`)).toBe(
      'STRIPE=[REDACTED:stripe_key]',
    );
  });

  it('redacts JWT triple', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSIsIm5hbWUiOiJBYmMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(redactSecrets(`Authorization: ${jwt}`)).toBe(
      'Authorization: [REDACTED:jwt]',
    );
  });

  it('redacts Bearer-token values but keeps the scheme word readable', () => {
    expect(
      redactSecrets('Authorization: Bearer abcdef0123456789ABCDEF=='),
    ).toBe('Authorization: Bearer [REDACTED:bearer_token]');
  });

  it('redacts email addresses', () => {
    expect(redactSecrets('contact me at jane.doe+stuff@example.co.uk!')).toBe(
      'contact me at [REDACTED:email]!',
    );
  });

  it('redacts IPv4 but not version-string look-alikes', () => {
    expect(redactSecrets('host 192.168.1.1 listens')).toBe(
      'host [REDACTED:ipv4] listens',
    );
    // 1.2.3.4 is technically a valid v4 — match.
    expect(redactSecrets('192.168.0.1, 10.0.0.1')).toBe(
      '[REDACTED:ipv4], [REDACTED:ipv4]',
    );
    // Out-of-range octets must not match.
    expect(redactSecrets('build 999.888.777.666 broken')).toBe(
      'build 999.888.777.666 broken',
    );
  });

  it('redacts US-style phone numbers', () => {
    expect(redactSecrets('call (415) 555-1234 today')).toBe(
      'call [REDACTED:phone] today',
    );
    expect(redactSecrets('+1 415-555-1234 office')).toBe(
      '[REDACTED:phone] office',
    );
  });

  it('redacts a Luhn-valid credit-card number', () => {
    // 4111-1111-1111-1111 is a canonical Visa test number that satisfies Luhn.
    expect(redactSecrets('paid with 4111 1111 1111 1111 thanks')).toBe(
      'paid with [REDACTED:credit_card] thanks',
    );
    expect(redactSecrets('card 5555-5555-5555-4444 charged')).toBe(
      'card [REDACTED:credit_card] charged',
    );
  });

  it('does NOT redact 16-digit runs that fail Luhn (timestamps, IDs)', () => {
    // 1234567812345678 fails Luhn; should pass through.
    expect(redactSecrets('order id 1234567812345678 confirmed')).toBe(
      'order id 1234567812345678 confirmed',
    );
    // A 64-bit unix nanos timestamp also fails Luhn.
    expect(redactSecrets('ts=1700000000123456789')).toBe(
      'ts=1700000000123456789',
    );
  });

  it('handles multiple categories in one input', () => {
    const input =
      'API key sk-ant-test-AbCdEfGhIjKlMnOpQrStUvWxYz123456 from jane@example.com via 192.168.1.1';
    const out = redactSecrets(input);
    expect(out).toContain('[REDACTED:sk_key]');
    expect(out).toContain('[REDACTED:email]');
    expect(out).toContain('[REDACTED:ipv4]');
  });

  it('is idempotent — redacting an already-redacted string is a no-op', () => {
    const once = redactSecrets('email is jane@example.com');
    expect(once).toBe('email is [REDACTED:email]');
    expect(redactSecrets(once)).toBe(once);
  });

  it('leaves ordinary prose untouched', () => {
    const prose =
      'Make a landing page for a coffee shop. The hero needs three columns and a warm color palette.';
    expect(redactSecrets(prose)).toBe(prose);
  });
});

describe('redactSecretsWithCounts', () => {
  it('returns per-category counts alongside redacted output', () => {
    const input =
      'keys: sk-ant-test-AbCdEfGhIjKlMnOpQrStUvWxYz123456 and sk-proj-AAAAAAAAAAAAAAAAAAAA, mail jane@x.com, ip 10.0.0.1';
    const { redacted, counts } = redactSecretsWithCounts(input);
    expect(redacted).toContain('[REDACTED:sk_key]');
    expect(counts.sk_key).toBe(2);
    expect(counts.email).toBe(1);
    expect(counts.ipv4).toBe(1);
  });

  it('returns empty counts when nothing matched', () => {
    const { redacted, counts } = redactSecretsWithCounts('no secrets here');
    expect(redacted).toBe('no secrets here');
    expect(counts).toEqual({});
  });
});
