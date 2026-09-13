"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useSpring, useTransform, useReducedMotion } from "motion/react";

import styles from "./AnimateDigits.module.css";
const cn = (...classes: (string | undefined)[]) => classes.filter(Boolean).join(" ");
// Adapted from https://ui.unlumen.com/r/animate-digits.json

interface AnimateDigitsProps {
  value: string;
  gap?: number;
  className?: string;
  digitClassName?: string;
  enterStiffness?: number;
  enterDamping?: number;
  exitStiffness?: number;
  exitDamping?: number;
  direction?: "dynamic" | "up" | "down";
  enterY?: number;
  enterBlur?: number;
  enterScale?: number;
}

interface ExitItem {
  id: number;
  char: string;
  exitY: number;
}

let _id = 0;

function DigitCell({
  char,
  isDigit,
  className,
  enterStiffness = 170,
  enterDamping = 10,
  exitStiffness = 170,
  exitDamping = 15,
  direction = "dynamic",
  enterY = 32,
  enterBlur = 52,
  enterScale = 0.7,
}: {
  char: string;
  isDigit: boolean;
  className?: string;
  enterStiffness?: number;
  enterDamping?: number;
  exitStiffness?: number;
  exitDamping?: number;
  direction?: "dynamic" | "up" | "down";
  enterY?: number;
  enterBlur?: number;
  enterScale?: number;
}) {
  const [exitQueue, setExitQueue] = useState<ExitItem[]>([]);

  const prevCharRef = useRef(char);
  const isFirstRender = useRef(true);

  // Springs — jump() snaps the spring itself (position + velocity reset)
  const springConfig = { stiffness: enterStiffness, damping: enterDamping };
  const y = useSpring(0, springConfig);
  const opacity = useSpring(1, springConfig);
  const scale = useSpring(1, springConfig);
  const blur = useSpring(0, springConfig);
  const filter = useTransform(blur, (v) => `blur(${v}px)`);

  useEffect(() => {
    if (!isDigit) return;

    const prev = prevCharRef.current;
    prevCharRef.current = char;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (char === prev || !/\d/.test(prev)) return;

    const up =
      direction === "dynamic"
        ? Number(char) > Number(prev)
        : direction === "up";

    const id = _id++;
    setExitQueue((q) => {
      const next = [...q, { id, char: prev, exitY: up ? -enterY : enterY }];
      return next.length > 3 ? next.slice(-3) : next;
    });

    y.jump(up ? enterY : -enterY);
    opacity.jump(0);
    scale.jump(enterScale);
    blur.jump(enterBlur);

    y.set(0);
    opacity.set(1);
    scale.set(1);
    blur.set(0);
  }, [
    char,
    isDigit,
    direction,
    enterY,
    enterBlur,
    enterScale,
    y,
    opacity,
    scale,
    blur,
  ]);

  if (!isDigit) {
    return <span className={className}>{char}</span>;
  }

  return (
    <span
      className={cn(
        styles.cell,
        className,
      )}
    >
      <AnimatePresence>
        {exitQueue.map(({ id, char: exitChar, exitY }) => (
          <motion.span
            key={id}
            aria-hidden
            initial={{ opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
            animate={{ opacity: 0, scale: 0.7, filter: "blur(10px)", y: exitY }}
            transition={{
              type: "spring",
              stiffness: exitStiffness,
              damping: exitDamping,
            }}
            onAnimationComplete={() =>
              setExitQueue((q) => q.filter((item) => item.id !== id))
            }
          >
            {exitChar}
          </motion.span>
        ))}
      </AnimatePresence>
      <motion.span style={{ opacity, scale, filter, y }}>{char}</motion.span>
    </span>
  );
}

function AnimateDigits({
  value,
  gap = 2,
  className,
  digitClassName,
  enterStiffness,
  enterDamping,
  exitStiffness,
  exitDamping,
  direction,
  enterY,
  enterBlur,
  enterScale,
}: AnimateDigitsProps) {
  const reducedMotion = useReducedMotion();
  // Keep the displayed value current during rapid stepping; never queue stale values.
  const chars = value.split("");
  const decimalIndex = value.indexOf(".");
  const integerEnd = decimalIndex < 0 ? value.length : decimalIndex;
  if (reducedMotion) return <span className={className}>{value}</span>;

  return (
    <span
      className={cn(styles.digits, className)}
      style={{ gap }}
    >
      {chars.map((char, i) => (
        <DigitCell
          key={i < integerEnd ? `integer-${integerEnd - i}` : `fraction-${i - integerEnd}`}
          char={char}
          isDigit={/\d/.test(char)}
          className={digitClassName}
          enterStiffness={enterStiffness}
          enterDamping={enterDamping}
          exitStiffness={exitStiffness}
          exitDamping={exitDamping}
          direction={direction}
          enterY={enterY}
          enterBlur={enterBlur}
          enterScale={enterScale}
        />
      ))}
    </span>
  );
}

export { AnimateDigits, type AnimateDigitsProps };
