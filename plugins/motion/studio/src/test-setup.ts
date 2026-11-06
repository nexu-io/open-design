if (typeof globalThis.CSS === "undefined") {
  (globalThis as Record<string, unknown>).CSS = {};
}
if (typeof CSS.escape !== "function") {
  CSS.escape = (value: string) => value.replace(/([^\w-])/g, "\\$1");
}

// happy-dom does not implement `window.confirm`. Vitest 3 let `vi.spyOn` invent
// a missing property; Vitest 4 refuses with "can only spy on a function", so the
// environment has to supply a real one for the guard tests to replace. Declining
// is the safe default: no test calls it without stubbing a return value first.
if (typeof globalThis.confirm !== "function") {
  (globalThis as Record<string, unknown>).confirm = () => false;
}
