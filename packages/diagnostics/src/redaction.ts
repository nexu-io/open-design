const SENSITIVE_KEY_RE = /token|password|secret|key|dsn|authorization|cookie/i;

// Any parameter whose name contains a secret word, so vendor-prefixed names
// (`tavilyApiKey`, `x-api-key`, `client_secret`) are caught, not just an
// exact list. Over-redacting a harmless `monkey=` is the acceptable cost.
const URL_QUERY_SECRET_RE = /([?&#])([A-Za-z0-9_.-]*(?:token|password|passwd|secret|key|dsn|auth|signature|credential)[A-Za-z0-9_.-]*)(=)([^&\s#"']*)/gi;

// Credentials with a recognizable shape leak whatever surrounds them (a
// config dump, an error echoing a URL), so match them on their own. Mirrors
// the vendor shapes in apps/daemon/src/redact.ts.
const KNOWN_SECRET_RE = new RegExp([
  /\b(?:pk|sk)-lf-[A-Za-z0-9-]{16,}/.source,
  /\bsk-(?:proj-|live-|test-|ant-)?[A-Za-z0-9_-]{20,}/.source,
  /\bgh[opsur]_[A-Za-z0-9]{36,251}/.source,
  /\bgithub_pat_[A-Za-z0-9_]{22,}/.source,
  /\bAKIA[0-9A-Z]{16}/.source,
  /\bAQ\.[A-Za-z0-9_-]{20,}/.source,
  /\bAIza[0-9A-Za-z_-]{35}/.source,
  /\bnvapi-[A-Za-z0-9_-]{20,}/.source,
  /\bxox[abprs]-[0-9A-Za-z-]{10,}/.source,
  /\b(?:sk|pk|rk)_(?:live|test)_[0-9a-zA-Z]{16,}/.source,
  /\btvly-[A-Za-z0-9_-]{16,}/.source,
  /\bglpat-[A-Za-z0-9_-]{20,}/.source,
  /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.source,
].join("|"), "g");

// Catch loose key=value pairs in log lines that aren't inside a URL — e.g. env
// dumps, command-line args, or json-line meta. The leading boundary stops it
// from matching mid-identifier (e.g. `not_a_token`). Order alternatives long-
// first so `access_token` wins over `token`.
const BARE_SECRET_RE = /(^|[\s,;])(access_token|refresh_token|id_token|api[_-]?key|password|secret|token|auth(?:orization)?)(=|:\s*)([^\s,;"']+)/gi;

// Bearer / Token / Basic auth schemes embed the secret after the scheme
// keyword, so the BARE pattern above stops at the space before `Bearer` and
// leaves the actual credential exposed. This pattern matches the scheme +
// credential as one unit. Case-insensitive: HTTP auth schemes are
// case-insensitive per RFC 7235 §2.1, and we routinely see lowercase
// `authorization: bearer …` in proxy / curl-style logs.
// Character class covers RFC 6750 token68 (ALPHA / DIGIT / "-" / "." / "_"
// / "~" / "+" / "/" / "=") plus ":" for Basic credentials. Missing "~"
// previously left tokens like `Bearer abcd~efgh` partially exposed.
const HTTP_AUTH_SCHEME_RE = /\b(Bearer|Token|Basic)\s+([A-Za-z0-9._~\-+/=:]{4,})/gi;

const REDACTED = "[REDACTED]";

export interface RedactionOptions {
  username?: string | undefined;
  /**
   * The current user's home directory. Its last segment is redacted like the
   * username because a Windows profile folder often differs from the account
   * name (e.g. `alexb_000` for `alexb`).
   */
  homeDir?: string | undefined;
}

export function redactJsonValue(value: unknown, opts: RedactionOptions = {}): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactJsonValue(entry, opts));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key) && typeof raw === "string" && raw.length > 0) {
        out[key] = REDACTED;
      } else {
        out[key] = redactJsonValue(raw, opts);
      }
    }
    return out;
  }
  if (typeof value === "string") return redactText(value, opts);
  return value;
}

export function redactText(text: string, opts: RedactionOptions = {}): string {
  // Run the HTTP auth scheme replacement first so the credential after
  // `Bearer` / `Token` / `Basic` is captured before BARE_SECRET_RE swallows
  // the `Authorization: Bearer` prefix and stops at the space.
  let out = text.replace(HTTP_AUTH_SCHEME_RE, (_match, scheme) => `${scheme} ${REDACTED}`);
  out = out.replace(URL_QUERY_SECRET_RE, (_match, sep, name, eq) => `${sep}${name}${eq}${REDACTED}`);
  out = out.replace(KNOWN_SECRET_RE, REDACTED);
  out = out.replace(BARE_SECRET_RE, (_match, lead, name, sep) => `${lead}${name}${sep}${REDACTED}`);
  // Structured fragments often follow a timestamp/prefix and cannot be parsed as whole JSON.
  out = out.replace(/("[^"\n]*(?:token|password|secret|api[_-]?key|authorization|cookie|dsn)[^"\n]*"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
    (_match, prefix) => `${prefix}"${REDACTED}"`);
  const homeName = opts.homeDir?.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  for (const name of new Set([opts.username, homeName])) {
    if (!name || name.length <= 1) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`/Users/${escaped}(?=[/"\\s])`, "g"), "/Users/<USER>");
    // One or two backslashes: raw JSON log lines keep Windows paths escaped.
    out = out.replace(new RegExp(`(\\\\{1,2})Users(\\\\{1,2})${escaped}(?=[\\\\"\\s])`, "g"), "$1Users$2<USER>");
    out = out.replace(new RegExp(`/home/${escaped}(?=[/"\\s])`, "g"), "/home/<USER>");
  }
  return out;
}

export function redactJsonText(text: string, opts: RedactionOptions = {}): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return redactText(text, opts);
  }
  return JSON.stringify(redactJsonValue(parsed, opts), null, 2);
}
