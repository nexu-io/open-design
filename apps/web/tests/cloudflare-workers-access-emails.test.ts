import { describe, expect, it } from 'vitest';
import {
  isCloudflareWorkersAccessEmail,
  parseCloudflareWorkersAccessEmails,
} from '../src/components/cloudflare-workers-access-emails';

describe('parseCloudflareWorkersAccessEmails', () => {
  it('splits on spaces as well as commas', () => {
    // The defect: splitting on commas alone read this as ONE entry.
    expect(parseCloudflareWorkersAccessEmails('a@x.com b@y.com')).toEqual(['a@x.com', 'b@y.com']);
    expect(parseCloudflareWorkersAccessEmails('a@x.com,b@y.com')).toEqual(['a@x.com', 'b@y.com']);
    expect(parseCloudflareWorkersAccessEmails('a@x.com, b@y.com  c@z.com')).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
  });

  it('tolerates empty input and stray separators', () => {
    expect(parseCloudflareWorkersAccessEmails('')).toEqual([]);
    expect(parseCloudflareWorkersAccessEmails('  , , ')).toEqual([]);
    expect(parseCloudflareWorkersAccessEmails('a@x.com,')).toEqual(['a@x.com']);
  });

  it('keeps a line-separated paste as two addresses', () => {
    expect(parseCloudflareWorkersAccessEmails('a@x.com\nb@y.com')).toEqual(['a@x.com', 'b@y.com']);
  });
});

describe('isCloudflareWorkersAccessEmail', () => {
  it('accepts a single address', () => {
    expect(isCloudflareWorkersAccessEmail('a@x.com')).toBe(true);
    expect(isCloudflareWorkersAccessEmail('first.last+tag@sub.example.co.uk')).toBe(true);
  });

  it('rejects the shapes the loose includes-at check let through', () => {
    // A space-joined pair still contains an '@', which is all the field used to
    // require: it passed the form and failed the Access app create, after the
    // assets upload and the live script PUT.
    expect(isCloudflareWorkersAccessEmail('a@x.com b@y.com')).toBe(false);
    expect(isCloudflareWorkersAccessEmail('a@x.comb@y.com')).toBe(false);
    expect(isCloudflareWorkersAccessEmail('@x.com')).toBe(false);
    expect(isCloudflareWorkersAccessEmail('a@')).toBe(false);
    expect(isCloudflareWorkersAccessEmail('@')).toBe(false);
    expect(isCloudflareWorkersAccessEmail('nope')).toBe(false);
    expect(isCloudflareWorkersAccessEmail('')).toBe(false);
    expect(isCloudflareWorkersAccessEmail('a b@x.com')).toBe(false);
  });
});
