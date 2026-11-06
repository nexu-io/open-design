/** Structural equality for plain data; DOM nodes (from any realm) compare by identity. */
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if ("nodeType" in a || "nodeType" in b || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => sameData((a as never)[key], (b as never)[key]));
}
