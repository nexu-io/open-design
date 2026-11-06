/**
 * Registers Studio's tools with the browser, once.
 *
 * The only file besides `types.ts` that touches the WebMCP API, so a spec
 * change lands here. Tool names are document-scoped, so Studio relies on its
 * single live `EditorShell` mounting one `StudioAgentTools`. A second live
 * shell would register the same names and receive `InvalidStateError`; the
 * duplicate check below only owns duplicates within one registration set.
 */

import type { ModelContext, ModelContextTool } from "./types";

export interface ToolRegistrationFailure {
  tool: string;
  /** The DOMException name where there is one. It is the only thing that tells
   *  a duplicate name (InvalidStateError) apart from a document that is not
   *  origin-keyed (SecurityError) or not permitted to use `tools`
   *  (NotAllowedError), and all three look identical without it. */
  name: string;
  message: string;
}

export interface ToolRegistrationReport {
  registered: string[];
  failed: ToolRegistrationFailure[];
}

/** Max 128 chars, ASCII alphanumeric plus `_`, `-`, `.` (`index.bs`). */
const VALID_TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * A tool whose name or description the browser would reject anyway. Caught here
 * so the failure names the offending tool instead of arriving as one of N
 * identical InvalidStateErrors.
 */
export function findToolDefinitionError(tool: ModelContextTool): string | null {
  if (!VALID_TOOL_NAME.test(tool.name)) {
    return `name must be 1-128 chars of A-Z a-z 0-9 _ - . (got ${JSON.stringify(tool.name)})`;
  }
  if (!tool.description.trim()) return "description must not be empty";
  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function invalidState(tool: string, message: string): ToolRegistrationFailure {
  return { tool, name: "InvalidStateError", message };
}

/**
 * `"aborted"` is a third outcome, not a failure: teardown got there first and
 * the caller should stop rather than record anything.
 */
type RegisterOneOutcome =
  | { status: "registered" }
  | { status: "failed"; failure: ToolRegistrationFailure }
  | { status: "aborted" };

async function registerOne(
  modelContext: ModelContext,
  tool: ModelContextTool,
  signal: AbortSignal,
): Promise<RegisterOneOutcome> {
  const definitionError = findToolDefinitionError(tool);
  if (definitionError) {
    return { status: "failed", failure: invalidState(tool.name, definitionError) };
  }

  try {
    await modelContext.registerTool(tool, { signal });
    return { status: "registered" };
  } catch (error) {
    // A mount-cleanup-mount cycle (React StrictMode in dev) aborts the signal in
    // the same task the registration promise is queued in, which rejects every
    // registerTool with AbortError. That is teardown working, not a failure, and
    // letting it escape fills the dev console with unhandled rejections.
    if (isAbortError(error)) return { status: "aborted" };
    return {
      status: "failed",
      failure: {
        tool: tool.name,
        name: error instanceof DOMException ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function registerStudioTools(
  modelContext: ModelContext,
  tools: readonly ModelContextTool[],
  signal: AbortSignal,
): Promise<ToolRegistrationReport> {
  const report: ToolRegistrationReport = { registered: [], failed: [] };
  const seen = new Set<string>();

  for (const tool of tools) {
    // Registering a name twice REJECTS rather than replacing, so a duplicate
    // must never reach the browser.
    if (seen.has(tool.name)) {
      report.failed.push(invalidState(tool.name, "duplicate tool name in this registration set"));
      continue;
    }
    seen.add(tool.name);

    const outcome = await registerOne(modelContext, tool, signal);
    if (outcome.status === "aborted") return report;
    if (outcome.status === "failed") report.failed.push(outcome.failure);
    else report.registered.push(tool.name);
  }

  return report;
}
