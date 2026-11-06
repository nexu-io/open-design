/**
 * Studio's tailwind-merge config: teaches it the two scales `theme.css`
 * invents (`text-step-*`, `ctl`/`ctl-sm`/`ctl-lg`) so overrides replace, not stack.
 */

import type { CnFunction } from "cn";
import { createCn } from "cn/config";

/** `text-step-11`, `text-step-9`, … — the type scale from `theme.css`. */
const isTypeStep = (value: string) => /^step-\d+$/.test(value);

/** `ctl`, `ctl-sm`, `ctl-lg` — the control heights from `theme.css`. */
const isControlSize = (value: string) => /^ctl(-sm|-lg)?$/.test(value);

export const cn: CnFunction = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: [isTypeStep] }],
      h: [{ h: [isControlSize] }],
      w: [{ w: [isControlSize] }],
      size: [{ size: [isControlSize] }],
      "min-h": [{ "min-h": [isControlSize] }],
      "min-w": [{ "min-w": [isControlSize] }],
    },
  },
});
