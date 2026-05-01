export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface OkResponse {
  ok: true;
}

export interface IdResponse {
  id: string;
}

export type EntityResponse<Key extends string, Value> = Record<Key, Value>;

export type EntityListResponse<Key extends string, Value> = Record<Key, Value[]>;

export type Nullable<T> = T | null;
