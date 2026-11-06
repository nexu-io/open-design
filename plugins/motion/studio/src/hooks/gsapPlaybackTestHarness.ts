import { gsap } from "gsap";

type KeyframeMutation = {
  duration: number;
  ease?: string;
  easeEach?: string;
  keyframes: Array<{
    percentage: number;
    properties: Record<string, number | string>;
    ease?: string;
  }>;
};

/** Plays a replace-with-keyframes mutation in real GSAP and reads `x` at `time` seconds. */
export function xAtTime(mutation: KeyframeMutation, time: number): number {
  const target = { x: 0, y: 0, opacity: 1 };
  const frames: Record<string, unknown> = mutation.easeEach ? { easeEach: mutation.easeEach } : {};
  for (const kf of mutation.keyframes) {
    frames[`${kf.percentage}%`] = { ...kf.properties, ...(kf.ease ? { ease: kf.ease } : {}) };
  }
  const vars = {
    duration: mutation.duration,
    keyframes: frames,
    ...(mutation.ease ? { ease: mutation.ease } : {}),
  };
  gsap.timeline({ paused: true }).to(target, vars, 0).seek(time);
  return target.x;
}
