// CI machines are slower; scale all waits proportionally.
const scale = process.env.CI ? 2.0 : 1.0;

export const T = {
  short: Math.ceil(3_000 * scale),
  medium: Math.ceil(10_000 * scale),
  long: Math.ceil(30_000 * scale),
  xlong: Math.ceil(60_000 * scale),
};
