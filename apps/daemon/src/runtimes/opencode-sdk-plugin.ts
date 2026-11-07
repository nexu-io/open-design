import { Plugin } from '@opencode/plugin';

/**
 * Native replacement for the retired file-based event plugin
 * (`opencode-event-plugin.ts`, deleted: it wrote a `.mjs` file under
 * `<dataDir>/agent-runtime/opencode/plugins/` and merged it into
 * `OPENCODE_CONFIG_CONTENT`).
 *
 * Under the SDK the same preview signal is a first-class plugin registered
 * via `OpenCode.create({ plugins })`. The `events.subscribe()` adapter in
 * `opencode-sdk-events.ts` already covers preview + terminal records, so
 * this plugin is intentionally a no-op: it subscribes where the host
 * exposes an event hook (proving the hook exists) and never writes to
 * stdout — in-process preview delivery must not pollute the daemon's own
 * stdio. Kept as a named module so the SDK host wiring has an explicit
 * replacement to point at rather than a deleted path.
 */

export const NATIVE_SDK_TOOL_PLUGIN_ID = 'od-tool-events';

export function buildNativeSdkToolPlugin() {
  return (Plugin as unknown as { define: (p: unknown) => unknown }).define({
    id: NATIVE_SDK_TOOL_PLUGIN_ID,
    async setup(ctx: unknown) {
      const handler = async (payload: unknown) => {
        // No-op: `sdkEventToStreamRecords` maps `session.tool.*` frames to
        // `od_opencode_tool` preview records. Preview delivery here would
        // double-emit (and historically wrote to `process.stdout`, which
        // under the SDK is the daemon's own stdio).
        void payload;
      };
      const context = ctx as unknown as {
        event?: unknown;
        on?: unknown;
        subscribe?: unknown;
        onEvent?: unknown;
      };
      try {
        if (typeof context.event === 'function') {
          await (context.event as (h: typeof handler) => unknown)(handler);
          return;
        }
        if (typeof (context as { onEvent?: unknown }).onEvent === 'function') {
          await ((context as { onEvent: (h: typeof handler) => unknown }).onEvent)(handler);
        }
      } catch {
        // Preview delivery must never affect tool execution.
      }
    },
  });
}
