/**
 * Parse the free-text Access email field into the list the deploy sends:
 * comma and/or whitespace separated, trimmed, empty entries dropped.
 *
 * Splitting on commas alone read `a@x.com b@y.com` as ONE entry. That entry
 * still contained an `@`, so it passed the field's own validation, reached
 * Cloudflare, and failed the Access app create — on the production path after
 * the assets upload and the live script PUT, i.e. after the Worker existed.
 */
export function parseCloudflareWorkersAccessEmails(value: string): string[] {
  return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

/**
 * Whether an entry is a single email address: no whitespace, exactly one `@`,
 * and neither side of it empty. Anything looser (`includes('@')`) accepts a
 * space-joined pair, `a@b@c`, or a bare `@` as a subject Cloudflare will
 * reject at the app create.
 */
export function isCloudflareWorkersAccessEmail(email: string): boolean {
  if (/\s/.test(email)) return false;
  const at = email.indexOf('@');
  return at > 0 && at === email.lastIndexOf('@') && at < email.length - 1;
}
