import { useState } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";

export function useTimelineShiftModifier(): boolean {
  const [shiftHeld, setShiftHeld] = useState(false);
  useMountEffect(() => {
    const handleKey = (event: KeyboardEvent) =>
      event.key === "Shift" && setShiftHeld(event.type === "keydown");
    const handleBlur = () => setShiftHeld(false);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
      window.removeEventListener("blur", handleBlur);
    };
  });
  return shiftHeld;
}
