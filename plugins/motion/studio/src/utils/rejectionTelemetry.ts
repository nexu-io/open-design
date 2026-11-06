export function errorProps(value: unknown): {
  error_message: string;
  error_name: string | null;
  stack_trace: string | null;
} {
  if (value instanceof Error) {
    return {
      error_message: value.message,
      error_name: value.name,
      stack_trace: value.stack?.slice(0, 4000) ?? null,
    };
  }
  return { error_message: String(value), error_name: null, stack_trace: null };
}

// fallow-ignore-next-line complexity
export function isCompositionAssetError(msg: string, name: string | null): boolean {
  if (msg.includes("Error fetching") && (msg.includes("404") || msg.includes("Not Found")))
    return true;
  if (name === "EncodingError" || msg.includes("unsupported or unrecognizable format")) return true;
  if (msg.includes("MEDIA_ERR_SRC_NOT_SUPPORTED")) return true;
  return false;
}

// A frame is a line ending in `:line:col`, in both the V8 (`at f (url:1:2)`) and Gecko/WebKit (`f@url:1:2`) forms.
const STACK_FRAME = /:\d+:\d+\)?\s*$/;
const EXTENSION_URL = /\b(?:chrome|moz|safari|safari-web)-extension:\/\//;

/** True when every frame is an extension's script: a failure no Studio code took part in. */
export function isExtensionOnlyStack(stack: string | null): boolean {
  const frames = stack?.split("\n").filter((line) => STACK_FRAME.test(line)) ?? [];
  return frames.length > 0 && frames.every((line) => EXTENSION_URL.test(line));
}
