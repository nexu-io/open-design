// Shared helpers for reading a required field off a parsed 2xx JSON response.
//
// WHY THIS EXISTS: every provider file in this directory independently
// hand-rolled its own "is this field actually there" check (`json.x ?? []`,
// `json.x ?? null`), and every one of those ad-hoc checks turned out to have
// the SAME bug: a malformed 2xx response missing the field entirely was
// silently collapsed into the same fallback value used for a legitimate
// empty/cleared result, hiding a broken backend response from the caller
// instead of surfacing it. nettee found this bug six separate times across
// four files before it became clear this was one bug, not six — these two
// helpers are the fix at the root: every provider function that needs to
// trust a required response field routes through here, so the "field
// present vs. field absent" distinction is made once, correctly, instead of
// re-derived per call site.
export function requiredField<T extends object, K extends keyof T>(
  json: T,
  field: K,
  context: string,
): T[K] {
  // A field can be intentionally `null` (e.g. "the daemon cleared this
  // value") — only its ABSENCE from the response is a contract break, not
  // whatever value it holds.
  if (!json || typeof json !== 'object' || !(field in json)) {
    throw new Error(`${context} succeeded without a '${String(field)}' field`);
  }
  return json[field];
}

/** Like `requiredField`, but for a field with no legitimate null/undefined
 *  success case — e.g. a saved/fetched entity a caller can't do anything
 *  useful with as `null`. Use `requiredField` instead when `null` or an
 *  empty array/string is itself a valid, meaningful result. */
export function requiredNonNullField<T extends object, K extends keyof T>(
  json: T,
  field: K,
  context: string,
): NonNullable<T[K]> {
  const value = requiredField(json, field, context);
  if (value === null || value === undefined) {
    throw new Error(`${context} succeeded without a '${String(field)}' field`);
  }
  return value as NonNullable<T[K]>;
}
