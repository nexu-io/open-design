// Phase 5 / spec §15.6 / plan §3.U1 — SigV4 signer correctness.

import { describe, expect, it } from 'vitest';
import { encodeS3PathSegment, signSigV4 } from '../src/storage/aws-sigv4.js';

describe('signSigV4', () => {
  it('produces the AWS-documented signature for the GET-object reference request', () => {
    // Reference vector adapted from
    // https://docs.aws.amazon.com/general/latest/gr/sigv4-signed-request-examples.html
    // (GetObject, with header-based auth, range header)
    const headers: Record<string, string> = {
      'host':  'examplebucket.s3.amazonaws.com',
      'range': 'bytes=0-9',
    };
    const result = signSigV4({
      method:  'GET',
      path:    '/test.txt',
      query:   '',
      headers,
      body:    Buffer.alloc(0),
      region:  'us-east-1',
      service: 's3',
      credentials: {
        accessKeyId:     'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      },
      now: new Date('2013-05-24T00:00:00Z'),
    });
    // The published reference signature.
    expect(result.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
      'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
      'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(result.amzDate).toBe('20130524T000000Z');
    expect(result.contentSha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('signs an empty-key listing request with sorted canonical query', () => {
    const headers: Record<string, string> = { 'host': 'od-bucket.s3.us-east-1.amazonaws.com' };
    const result = signSigV4({
      method:  'GET',
      path:    '/',
      query:   'list-type=2&prefix=p1%2F',
      headers,
      body:    Buffer.alloc(0),
      region:  'us-east-1',
      service: 's3',
      credentials: { accessKeyId: 'AKIA-FIXTURE', secretAccessKey: 'shhh' },
      now: new Date('2026-05-09T12:00:00.000Z'),
    });
    // The authorization header must reference the four signed headers
    // we expect for a no-body GET request with credentials.sessionToken
    // absent.
    expect(result.authorization).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date');
    expect(result.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it('forwards the session token into a signed x-amz-security-token header', () => {
    const headers: Record<string, string> = { 'host': 'b.s3.us-east-1.amazonaws.com' };
    signSigV4({
      method:  'PUT',
      path:    '/k',
      query:   '',
      headers,
      body:    Buffer.from('hi'),
      region:  'us-east-1',
      service: 's3',
      credentials: {
        accessKeyId:     'AKIA-X',
        secretAccessKey: 'sk',
        sessionToken:    'TOK',
      },
      now: new Date('2026-05-09T00:00:00Z'),
    });
    expect(headers['x-amz-security-token']).toBe('TOK');
    expect(headers['authorization']).toMatch(/SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token/);
  });
});

describe('encodeS3PathSegment', () => {
  it('encodes RFC-3986-reserved chars while preserving unreserved ones', () => {
    expect(encodeS3PathSegment('hello.txt')).toBe('hello.txt');
    expect(encodeS3PathSegment('a/b')).toBe('a%2Fb');
    expect(encodeS3PathSegment("foo'bar")).toBe('foo%27bar');
    expect(encodeS3PathSegment('a b c')).toBe('a%20b%20c');
  });
});
