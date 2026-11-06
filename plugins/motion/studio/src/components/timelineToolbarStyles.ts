// CapCut-flat icon buttons: a transparent 28px hit area with a subtle hover wash.
export const flatBtn = "flex h-7 w-7 items-center justify-center rounded-md transition-colors";
export const flatIdle = `${flatBtn} text-text-2 hover:bg-hover hover:text-text-0 active:bg-press active:scale-[0.98]`;
export const flatActive = `${flatBtn} bg-on text-text-0 hover:bg-on-hover active:scale-[0.98]`;
export const flatDisabled = `${flatBtn} text-text-off cursor-not-allowed`;
