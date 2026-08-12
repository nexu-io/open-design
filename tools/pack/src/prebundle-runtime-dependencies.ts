export const PREBUNDLE_RUNTIME_DEPENDENCIES = {
  "better-sqlite3": "12.10.0",
  "blake3-wasm": "2.1.5",
} as const;

export const PREBUNDLE_RUNTIME_DEPENDENCY_NAMES = Object.keys(
  PREBUNDLE_RUNTIME_DEPENDENCIES,
) as (keyof typeof PREBUNDLE_RUNTIME_DEPENDENCIES)[];
