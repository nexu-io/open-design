/**
 * The slice of the WebMCP browser API that Studio uses.
 *
 * Mirrors the WebIDL in the W3C spec (`webmachinelearning/webmcp`, `index.bs`)
 * as of 2026-08-26. Two things worth knowing before editing this file:
 *
 * - The API hangs off `document`, NOT `navigator`. `navigator.modelContext` is
 *   a polyfill compatibility shim, not a spec member, so feature-detecting it
 *   is wrong even where an article's sample "works".
 * - The spec is pre-stable (Origin Trial). This file and `registrar.ts` are the
 *   only places that touch the API, so a spec change is a two-file edit. Re-read
 *   `index.bs` rather than trusting this transcription.
 *
 * Only the surface Studio registers against is declared. `getTools` and
 * `executeTool` are the consumer side; Studio registers, it does not call.
 *
 * These stay hand-written rather than imported from `@mcp-b/webmcp-types`,
 * which the polyfill pulls in. That package's `registerTool` is overloaded to
 * infer argument types from a literal `inputSchema`, which is useful when you
 * register one tool inline and actively hostile when you register a uniform
 * list of them, as `registerStudioTools` does. Narrower is the safe operation
 * here. It does mean this file can drift from the spec, hence the note above.
 */

export interface ModelContextToolAnnotations {
  /** The tool does not change state. Lets an agent decide when calling is free. */
  readOnlyHint?: boolean;
  /** The tool's output contains data the page's author does not vouch for. */
  untrustedContentHint?: boolean;
}

export interface ToolExecuteCallbackOptions {
  /**
   * Aborted when the caller cancels. Studio's commit path is not cancellable
   * once dispatched, so tools check this BEFORE dispatching and document that a
   * late abort does not unwind a write.
   */
  signal: AbortSignal;
}

export interface ModelContextTool {
  /**
   * Max 128 characters, ASCII alphanumeric plus `_`, `-`, `.`. Registering a
   * name that already exists REJECTS with InvalidStateError; it does not
   * replace.
   */
  name: string;
  title?: string;
  /** Required and non-empty; an empty string rejects with InvalidStateError. */
  description: string;
  /** JSON Schema. Nothing in the platform validates input against it. */
  inputSchema?: object;
  /**
   * The user agent JSON-serializes whatever this resolves with, so it must
   * return an object. Returning `undefined` fails the serialization.
   *
   * A rejection is NOT a usable error channel: the spec discards the reason and
   * rejects the caller with a bare UnknownError. Resolve with a tagged failure
   * instead. See `toolResult.ts`.
   *
   * `options` is optional here although the spec always passes it: the
   * `@mcp-b/global` polyfill (through 5.1.0) calls `execute(input)` with no
   * second argument, so a Studio handler must not depend on receiving one.
   */
  execute: (input: object, options?: ToolExecuteCallbackOptions) => Promise<unknown>;
  annotations?: ModelContextToolAnnotations;
}

export interface ModelContextRegisterToolOptions {
  exposedTo?: string[];
  /** Aborting unregisters the tool. It does not cancel a running `execute`. */
  signal?: AbortSignal;
}

export interface ModelContext {
  registerTool(tool: ModelContextTool, options?: ModelContextRegisterToolOptions): Promise<void>;
}

function isModelContext(value: unknown): value is ModelContext {
  if (typeof value !== "object" || value === null) return false;
  return typeof Reflect.get(value, "registerTool") === "function";
}

/**
 * The live WebMCP entry point, or null when this browser has not shipped it.
 *
 * Reads through a guard rather than augmenting the `Document` interface. The
 * polyfill's typings already declare `Document.modelContext` globally, and a
 * second, narrower declaration of the same property is a type error.
 */
export function getModelContext(doc: Document = document): ModelContext | null {
  const candidate = Reflect.get(doc, "modelContext");
  return isModelContext(candidate) ? candidate : null;
}
