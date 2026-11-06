export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface BoundedJsonConstraints {
  /** Maximum nesting depth for objects and arrays, counting the root container as depth 1. */
  maxDepth: number;
  /** Maximum number of own enumerable keys allowed on any single object. */
  maxObjectKeys: number;
  /** Maximum number of items allowed in any single array. */
  maxArrayLength: number;
  /** Maximum UTF-16 code units allowed in any single string value. */
  maxStringLength: number;
  /** Maximum UTF-8 bytes for the serialized JSON payload. */
  maxSerializedBytes: number;
}

export const LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS = {
  maxDepth: 8,
  maxObjectKeys: 100,
  maxArrayLength: 500,
  maxStringLength: 16 * 1024,
  maxSerializedBytes: 256 * 1024,
} as const satisfies BoundedJsonConstraints;

export interface OkResponse {
  ok: true;
}

export interface IdResponse {
  id: string;
}

export type EntityResponse<Key extends string, Value> = Record<Key, Value>;

export type EntityListResponse<Key extends string, Value> = Record<Key, Value[]>;

export type Nullable<T> = T | null;
