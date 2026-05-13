/**
 * AgentMail inbox poller for Clerk verification codes.
 *
 * Clerk prod instances require email-OTP at /sign-in/factor-two even with a
 * verified email address — fixture codes (`424242`) only work on dev. We poll
 * the test user's AgentMail inbox via REST API and extract the 6-digit code
 * from the most recent Clerk verification email.
 *
 * Env vars:
 *   OD_E2E_AGENTMAIL_API_KEY  - AgentMail Bearer token
 *   OD_E2E_AGENTMAIL_INBOX    - inbox_id (e.g. dangerousflower464@agentmail.to)
 *
 * Reference: skills/operations/tools/agentmail/references/API.md in openclaw.
 */

const AGENTMAIL_BASE = 'https://api.agentmail.to/v0';

interface AgentMailMessage {
  message_id: string;
  thread_id?: string;
  from?: string;
  to?: string[];
  subject?: string;
  text?: string;
  html?: string;
  received_at?: string;
  created_at?: string;
}

interface ListMessagesResponse {
  messages?: AgentMailMessage[];
  count?: number;
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`AgentMail poller: required env var ${name} is not set.`);
  }
  return v;
}

async function listInboxMessages(): Promise<AgentMailMessage[]> {
  const apiKey = envOrThrow('OD_E2E_AGENTMAIL_API_KEY');
  const inbox = envOrThrow('OD_E2E_AGENTMAIL_INBOX');
  const url = `${AGENTMAIL_BASE}/inboxes/${encodeURIComponent(inbox)}/messages?limit=10`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AgentMail list messages failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as ListMessagesResponse;
  return data.messages ?? [];
}

async function getMessage(messageId: string): Promise<AgentMailMessage> {
  const apiKey = envOrThrow('OD_E2E_AGENTMAIL_API_KEY');
  const inbox = envOrThrow('OD_E2E_AGENTMAIL_INBOX');
  const url = `${AGENTMAIL_BASE}/inboxes/${encodeURIComponent(inbox)}/messages/${encodeURIComponent(messageId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AgentMail get message failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as AgentMailMessage;
}

/**
 * Extract the first 6-digit code from email text/html that looks like a
 * Clerk verification OTP. Clerk emails typically format the code as a single
 * block of 6 digits in the subject AND body (HTML often wraps each digit in
 * its own span; strip tags before matching).
 */
function extractClerkCode(body: string | undefined): string | null {
  if (!body) return null;
  // Strip HTML tags for code extraction (Clerk's HTML email wraps each digit
  // in <span>; we want the consolidated digit string).
  const stripped = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  // Match 6 consecutive digits, possibly separated by single spaces (Clerk
  // sometimes inserts whitespace between digit spans).
  const match = stripped.match(/\b(\d\s?\d\s?\d\s?\d\s?\d\s?\d)\b/);
  if (!match || !match[1]) return null;
  return match[1].replace(/\s+/g, '');
}

/**
 * Poll the inbox for a Clerk verification email newer than `sinceIso` and
 * return the 6-digit code.
 *
 * @param sinceIso - ISO timestamp; only consider messages received at or after
 * @param timeoutMs - total time to wait (default 60s)
 * @param intervalMs - poll interval (default 3s)
 */
export async function waitForClerkVerificationCode(
  sinceIso: string,
  timeoutMs = 60_000,
  intervalMs = 3_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const sinceTs = Date.parse(sinceIso);
  const seenIds = new Set<string>();
  while (Date.now() < deadline) {
    const messages = await listInboxMessages();
    for (const msg of messages) {
      if (seenIds.has(msg.message_id)) continue;
      seenIds.add(msg.message_id);
      const receivedAt = msg.received_at ?? msg.created_at ?? '';
      const receivedTs = receivedAt ? Date.parse(receivedAt) : 0;
      if (receivedTs && receivedTs < sinceTs) continue;
      const subject = (msg.subject ?? '').toLowerCase();
      const from = (msg.from ?? '').toLowerCase();
      const looksLikeClerk =
        subject.includes('verification') ||
        subject.includes('code') ||
        subject.includes('sign in') ||
        from.includes('clerk');
      if (!looksLikeClerk) continue;
      // Try subject FIRST — Clerk's "536694 is your verification code"
      // format puts the code in the subject line, which the list endpoint
      // always returns (body fetch may fail or be slow).
      const subjectCode = extractClerkCode(msg.subject);
      if (subjectCode) return subjectCode;
      // List endpoint may omit body — fetch full message.
      let full = msg;
      if (!msg.text && !msg.html) {
        try {
          full = await getMessage(msg.message_id);
        } catch {
          continue;
        }
      }
      const code =
        extractClerkCode(full.subject) ??
        extractClerkCode(full.text) ??
        extractClerkCode(full.html);
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `AgentMail poller: no Clerk verification email arrived within ${timeoutMs}ms (since ${sinceIso}).`,
  );
}
