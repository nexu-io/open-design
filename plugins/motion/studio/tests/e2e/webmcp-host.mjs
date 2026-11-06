/** Runs in the top frame before Studio: a WebMCP host whose registered tools `window[name]` can check and call. */
export function installWebMcpHost(name) {
  if (window.top !== window) return;
  const tools = new Map();
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: { registerTool: async (tool) => void tools.set(tool.name, tool) },
  });
  window[name] = {
    has: (tool) => tools.has(tool),
    call: (tool, input) => tools.get(tool).execute(input, { signal: new AbortController().signal }),
  };
}
