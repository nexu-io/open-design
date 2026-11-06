import { useEffect, useRef } from "react";
import { trackEvent } from "../telemetry/client";
import { readStudioUiPreferences } from "../utils/studioUiPreferences";
import { makeStudioDebugLogger } from "../utils/studioDebug";
import { loadModelContextPolyfill } from "./polyfill";
import { registerStudioTools, type ToolRegistrationReport } from "./registrar";
import { runToolBody, type ToolResult } from "./toolResult";
import { getModelContext, type ModelContext, type ModelContextTool } from "./types";
import {
  buildStudioLook,
  STUDIO_LOOK_DESCRIPTION,
  STUDIO_LOOK_INPUT_SCHEMA,
  type StudioLook,
  type StudioLookInput,
  type StudioLookSnapshot,
} from "./tools/lookTools";
import {
  studioSeek,
  studioSelect,
  STUDIO_SEEK_DESCRIPTION,
  STUDIO_SEEK_INPUT_SCHEMA,
  STUDIO_SELECT_DESCRIPTION,
  STUDIO_SELECT_INPUT_SCHEMA,
  type SelectionToolDeps,
  type StudioSeekResult,
  type StudioSelectResult,
} from "./tools/selectionTools";
import {
  studioFrame,
  STUDIO_FRAME_DESCRIPTION,
  STUDIO_FRAME_INPUT_SCHEMA,
  type FrameToolDeps,
  type StudioFrameInput,
  type StudioFrameResult,
} from "./tools/frameTools";
import {
  studioInspect,
  STUDIO_INSPECT_DESCRIPTION,
  STUDIO_INSPECT_INPUT_SCHEMA,
  type InspectToolDeps,
  type StudioInspectInput,
  type StudioInspectResult,
} from "./tools/inspectTools";
import {
  studioSetStyle,
  studioSetText,
  STUDIO_SET_STYLE_DESCRIPTION,
  STUDIO_SET_STYLE_INPUT_SCHEMA,
  STUDIO_SET_TEXT_DESCRIPTION,
  STUDIO_SET_TEXT_INPUT_SCHEMA,
  type ContentToolDeps,
  type StudioSetStyleResult,
  type StudioSetTextResult,
} from "./tools/contentTools";
import {
  studioTransform,
  STUDIO_TRANSFORM_DESCRIPTION,
  STUDIO_TRANSFORM_INPUT_SCHEMA,
  type StudioTransformInput,
  type StudioTransformResult,
  type TransformToolDeps,
} from "./tools/transformTools";
import {
  studioAddAnimation,
  studioAddKeyframe,
  studioDeleteAnimation,
  studioUpdateAnimation,
  STUDIO_ADD_ANIMATION_DESCRIPTION,
  STUDIO_ADD_ANIMATION_INPUT_SCHEMA,
  STUDIO_ADD_KEYFRAME_DESCRIPTION,
  STUDIO_ADD_KEYFRAME_INPUT_SCHEMA,
  STUDIO_DELETE_ANIMATION_DESCRIPTION,
  STUDIO_DELETE_ANIMATION_INPUT_SCHEMA,
  STUDIO_UPDATE_ANIMATION_DESCRIPTION,
  STUDIO_UPDATE_ANIMATION_INPUT_SCHEMA,
  type AnimationToolDeps,
  type StudioAddAnimationResult,
  type StudioAddKeyframeResult,
  type StudioDeleteAnimationResult,
  type StudioUpdateAnimationResult,
} from "./tools/animationTools";

const log = makeStudioDebugLogger("webmcp");

function reportRegistration(report: ToolRegistrationReport, native: boolean): void {
  log("registered", { native, ...report });
  for (const failure of report.failed) {
    trackEvent("webmcp_registration_failed", {
      error_name: failure.name,
      tool_name: failure.tool,
    });
  }
}

export interface StudioAgentToolsDeps
  extends
    SelectionToolDeps,
    FrameToolDeps,
    InspectToolDeps,
    ContentToolDeps,
    TransformToolDeps,
    AnimationToolDeps {
  /** Read Studio's current state. Called per tool invocation, never cached. */
  getSnapshot: () => StudioLookSnapshot;
}

/**
 * Build the tool list once.
 *
 * Every `execute` reads `depsRef.current` at CALL time rather than closing over
 * a snapshot, which is what lets the list be built once and still see live
 * state. That is the whole point of the ref: see the registration note below.
 */
export function buildStudioTools(depsRef: {
  readonly current: StudioAgentToolsDeps;
}): ModelContextTool[] {
  /**
   * `execute` for a tool whose handler takes the caller's abort signal.
   *
   * The spec shape is `execute(input, { signal })`, but `@mcp-b/global` (5.0.1
   * through 5.1.0; the polyfill chunk is byte-identical across them) invokes a
   * registered `execute` with the input ALONE, both from its in-page
   * `BrowserMcpServer` wrapper and from the descriptor it mirrors into a native
   * `document.modelContext`. A handler that destructures its second argument
   * throws before it runs, so every write tool failed with "Cannot destructure
   * property 'signal' of 'undefined'" while the read tools, which ignore the
   * argument, kept working. This is the one boundary that tolerates the missing
   * options object. Each handler already defaults an undefined signal to a
   * never-aborted one, so nothing downstream has to.
   */
  const writeTool =
    <T>(
      name: string,
      run: (
        deps: StudioAgentToolsDeps,
        input: object,
        signal: AbortSignal | undefined,
      ) => Promise<ToolResult<T>>,
    ): ModelContextTool["execute"] =>
    (input, options) =>
      runToolBody<T>(name, () => run(depsRef.current, input, options?.signal));

  return [
    {
      name: "studio_look",
      title: "Look at the composition",
      description: STUDIO_LOOK_DESCRIPTION,
      inputSchema: STUDIO_LOOK_INPUT_SCHEMA,
      annotations: {
        readOnlyHint: true,
        // The labels, text and ids come from the user's composition, which can
        // contain anything. This is a hint to the agent, not a sanitiser.
        untrustedContentHint: true,
      },
      execute: (input): Promise<ToolResult<StudioLook>> =>
        runToolBody("studio_look", async () =>
          buildStudioLook(depsRef.current.getSnapshot(), input as StudioLookInput),
        ),
    },
    {
      name: "studio_select",
      title: "Select an element",
      description: STUDIO_SELECT_DESCRIPTION,
      inputSchema: STUDIO_SELECT_INPUT_SCHEMA,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input): Promise<ToolResult<StudioSelectResult>> =>
        runToolBody("studio_select", () =>
          studioSelect(depsRef.current, readStringInput(input, "handle")),
        ),
    },
    {
      name: "studio_seek",
      title: "Move the playhead",
      description: STUDIO_SEEK_DESCRIPTION,
      inputSchema: STUDIO_SEEK_INPUT_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: (input): Promise<ToolResult<StudioSeekResult>> =>
        runToolBody("studio_seek", async () =>
          studioSeek(depsRef.current, readNumberInput(input, "time")),
        ),
    },
    {
      name: "studio_frame",
      title: "See the composition",
      description: STUDIO_FRAME_DESCRIPTION,
      inputSchema: STUDIO_FRAME_INPUT_SCHEMA,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input): Promise<ToolResult<StudioFrameResult>> =>
        runToolBody("studio_frame", () => studioFrame(depsRef.current, input as StudioFrameInput)),
    },
    {
      name: "studio_inspect",
      title: "Inspect one element",
      description: STUDIO_INSPECT_DESCRIPTION,
      inputSchema: STUDIO_INSPECT_INPUT_SCHEMA,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input): Promise<ToolResult<StudioInspectResult>> =>
        runToolBody("studio_inspect", () =>
          studioInspect(depsRef.current, input as StudioInspectInput),
        ),
    },
    {
      name: "studio_set_text",
      title: "Set an element's text",
      description: STUDIO_SET_TEXT_DESCRIPTION,
      inputSchema: STUDIO_SET_TEXT_INPUT_SCHEMA,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: writeTool<StudioSetTextResult>("studio_set_text", (deps, input, signal) =>
        studioSetText(deps, input, signal),
      ),
    },
    {
      name: "studio_set_style",
      title: "Set an element's styles",
      description: STUDIO_SET_STYLE_DESCRIPTION,
      inputSchema: STUDIO_SET_STYLE_INPUT_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: writeTool<StudioSetStyleResult>("studio_set_style", (deps, input, signal) =>
        studioSetStyle(deps, input, signal),
      ),
    },
    {
      name: "studio_transform",
      title: "Move, resize or rotate",
      description: STUDIO_TRANSFORM_DESCRIPTION,
      inputSchema: STUDIO_TRANSFORM_INPUT_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: writeTool<StudioTransformResult>("studio_transform", (deps, input, signal) =>
        studioTransform(deps, input as StudioTransformInput, signal),
      ),
    },
    {
      name: "studio_add_animation",
      title: "Add an animation",
      description: STUDIO_ADD_ANIMATION_DESCRIPTION,
      inputSchema: STUDIO_ADD_ANIMATION_INPUT_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: writeTool<StudioAddAnimationResult>("studio_add_animation", (deps, input, signal) =>
        studioAddAnimation(deps, input, signal),
      ),
    },
    {
      name: "studio_update_animation",
      title: "Change an animation",
      description: STUDIO_UPDATE_ANIMATION_DESCRIPTION,
      inputSchema: STUDIO_UPDATE_ANIMATION_INPUT_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: writeTool<StudioUpdateAnimationResult>(
        "studio_update_animation",
        (deps, input, signal) => studioUpdateAnimation(deps, input, signal),
      ),
    },
    {
      name: "studio_add_keyframe",
      title: "Add a keyframe",
      description: STUDIO_ADD_KEYFRAME_DESCRIPTION,
      inputSchema: STUDIO_ADD_KEYFRAME_INPUT_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: writeTool<StudioAddKeyframeResult>("studio_add_keyframe", (deps, input, signal) =>
        studioAddKeyframe(deps, input, signal),
      ),
    },
    {
      name: "studio_delete_animation",
      title: "Remove an animation",
      description: STUDIO_DELETE_ANIMATION_DESCRIPTION,
      inputSchema: STUDIO_DELETE_ANIMATION_INPUT_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: writeTool<StudioDeleteAnimationResult>(
        "studio_delete_animation",
        (deps, input, signal) => studioDeleteAnimation(deps, input, signal),
      ),
    },
  ];
}

/**
 * Nothing in the platform validates the input object against `inputSchema`, so
 * a tool receives whatever the agent sent. These read a field without asserting
 * its type; the tools themselves reject what they cannot use.
 */
function readStringInput(input: object, key: string): string {
  const value = Reflect.get(input, key);
  return typeof value === "string" ? value : "";
}

function readNumberInput(input: object, key: string): number {
  const value = Reflect.get(input, key);
  return typeof value === "number" ? value : Number.NaN;
}

/**
 * Register Studio's tools with the browser, exactly once per mount.
 *
 * The effect has an EMPTY dependency array on purpose, and the deps live in a
 * ref that every render refreshes. The obvious alternative — depend on the
 * handlers — re-runs on nearly every interaction, because the DomEdit actions
 * object changes identity whenever the selection or the element list does.
 * Re-running means the registration signal aborts and unregisters everything,
 * `toolchange` fires constantly so a connected agent watches the tool list
 * churn, and the spec warns that a quick unregister-then-reregister can apply
 * an old call's arguments against the new schema.
 *
 * `useStudioTestHooks` carries a comment about the same class of bug already hit
 * in this codebase, where effect teardown revoked a lease moments after it was
 * taken because writing state changed the effect's dependency identities.
 *
 * Any fallback must be awaited inside this effect before registration and then
 * re-read here. Installing one from a sibling effect would race this mount-only
 * lookup. Hot-module replacement can still create a brief unregister/register
 * window in development; production has one document-scoped registration.
 */
export function useStudioAgentTools(deps: StudioAgentToolsDeps): void {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (readStudioUiPreferences().agentToolsEnabled === false) {
      log("skipped", { why: "disabled by preference" });
      return;
    }

    const controller = new AbortController();

    void (async () => {
      const native: ModelContext | null = getModelContext();
      if (native) trackEvent("webmcp.native_present");
      // Native browsers never download the polyfill.
      const modelContext = native ?? (await loadModelContextPolyfill());
      if (!modelContext) {
        log("skipped", { why: "no model context, native or polyfilled" });
        return;
      }
      // The import is async, so the component may already be gone.
      if (controller.signal.aborted) return;

      const report = await registerStudioTools(
        modelContext,
        buildStudioTools(depsRef),
        controller.signal,
      );
      reportRegistration(report, native !== null);
    })();

    return () => controller.abort();
  }, []);
}
