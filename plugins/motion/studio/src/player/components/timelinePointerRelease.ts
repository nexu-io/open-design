export function releasedOutsideWindow(point: Pick<MouseEvent, "clientX" | "clientY">): boolean {
  const { clientX: x, clientY: y } = point;
  return x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight;
}
