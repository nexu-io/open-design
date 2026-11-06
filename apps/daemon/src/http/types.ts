import type { ApiError } from '@open-design/contracts';

export type Result<T, E = ApiError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T, E = ApiError>(value: T): Result<T, E> => ({ ok: true, value });
export const err = <T = never, E = ApiError>(error: E): Result<T, E> => ({ ok: false, error });

export interface RouteInputContext {
  body: unknown;
  query: Record<string, unknown>;
  params: Record<string, string>;
}

export type InputParser<Input> = (raw: RouteInputContext) => Result<Input>;

export type Handler<Input, Output, Deps> = (
  input: Input,
  deps: Deps,
) => Promise<Result<Output>> | Result<Output>;

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

export interface JsonRouteSpec<Input, Output, Deps> {
  method: HttpMethod;
  path: string;
  requireSameOrigin?: boolean;
  parse: InputParser<Input>;
  handle: Handler<Input, Output, Deps>;
  successStatus?: number;
}
