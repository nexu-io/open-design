import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/** True while an IME composition is active or this key is part of confirming it. */
export function isImeComposing(
  event: ReactKeyboardEvent<HTMLTextAreaElement>,
  composing: boolean,
): boolean {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { keyCode?: number };
  return composing || nativeEvent.isComposing || nativeEvent.keyCode === 229;
}
