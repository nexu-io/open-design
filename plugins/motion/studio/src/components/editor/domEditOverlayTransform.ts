/**
 * One walk from an element up to its composition root, composing the transform
 * it actually paints under.
 *
 * The overlay measures an element's angle in two places — the selection box and
 * the crop frame — and they need different arithmetic: one works in DOMMatrix
 * because it goes on to transform corner points, the other in plain 2D
 * components because it only needs an angle and a scale. What they must never
 * differ on is *which* transforms count and in what order, because when they
 * disagree the chrome disagrees with itself: the selection box drawn at one
 * angle and the crop outline at another, on the same element.
 *
 * So the walk lives here once and takes the arithmetic as a parameter. Adding
 * an individual property CSS grew later — `translate`, `scale` — means adding
 * one step here and one method to each algebra, rather than finding both walks
 * and hoping.
 */

/** The composition's own root; the walk stops there rather than at the document. */
const COMPOSITION_ROOT_ATTR = "data-composition-id";

/**
 * The arithmetic the walk needs, whatever the caller's matrix type is.
 *
 * `fromTransform` returns null for a transform the caller cannot use — a
 * perspective matrix, say — which aborts the walk rather than composing a
 * matrix that describes something other than what is painted.
 */
export interface PlanarTransformOps<M> {
  identity(): M;
  fromTransform(value: string): M | null;
  fromRotate(degrees: number): M;
  /** `outer` applied around `inner`, as an ancestor composes over a child. */
  compose(outer: M, inner: M): M;
}

/**
 * The planar rotation in the CSS `rotate` property, in degrees.
 *
 * Computes to `none`, an angle (`-22deg`), or an axis plus an angle
 * (`0 0 1 -22deg`). Only a rotation about z stays in the overlay's plane; any
 * other axis is 3D and reports 0, which leaves the caller on its axis-aligned
 * fallback rather than drawing a box at a plausible-looking wrong angle.
 */
export function individualRotateDegrees(value: string | undefined): number {
  if (!value || value === "none") return 0;
  const parts = value.trim().split(/\s+/);
  const angle = parts.at(-1);
  if (!angle?.endsWith("deg")) return 0;
  if (parts.length === 4) {
    const [x, y, z] = parts;
    if (Number(x) !== 0 || Number(y) !== 0 || Math.abs(Number(z)) !== 1) return 0;
    const deg = Number.parseFloat(angle);
    return Number.isFinite(deg) ? deg * Math.sign(Number(z)) : 0;
  }
  if (parts.length !== 1) return 0;
  const deg = Number.parseFloat(angle);
  return Number.isFinite(deg) ? deg : 0;
}

/** One node's own contribution, with the individual properties applied before
 *  `transform` the way CSS does. Null when the node's transform is unusable. */
function ownNodeTransform<M>(
  node: HTMLElement,
  ops: PlanarTransformOps<M>,
  getStyle: (node: HTMLElement) => CSSStyleDeclaration | null,
): M | null {
  const style = getStyle(node);
  if (!style) return null;
  const transform = style.transform;
  const own = transform && transform !== "none" ? ops.fromTransform(transform) : ops.identity();
  if (!own) return null;
  const spin = individualRotateDegrees(style.rotate);
  return spin === 0 ? own : ops.compose(ops.fromRotate(spin), own);
}

/**
 * The element's transform composed with every ancestor's, up to the composition
 * root.
 *
 * Within a node, CSS applies the individual properties before `transform`, so
 * `rotate` composes on the left of it. Between nodes, an ancestor applies
 * outside its child. Null means some node's transform was unusable and the
 * caller should fall back rather than guess.
 *
 * `memo` holds each node's COMPOSED chain, for a caller walking many elements
 * in one synchronous pass.
 *
 * A chain is `chain(parent)` composed with the node's own, so siblings share
 * everything above them and the whole tree costs one style read and one
 * compose per node instead of one per node PER DESCENDANT. Valid only for the
 * length of one pass, which is why the caller owns it: nothing here writes to
 * the DOM, so nothing can move under it, and it is dropped before anything
 * else runs. Omitted, every call composes its own chain from scratch.
 */
export function composeElementTransform<M>(
  element: HTMLElement,
  ops: PlanarTransformOps<M>,
  getStyle: (node: HTMLElement) => CSSStyleDeclaration | null,
  memo?: Map<HTMLElement, M | null>,
): M | null {
  const pending: HTMLElement[] = [];
  // `undefined` means nothing on the way up was already composed, so the chain
  // starts from identity. A memoized `null` is an answer, not a miss: some node
  // above carries a transform this algebra cannot represent.
  let above: M | null | undefined;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    above = memo?.get(node);
    if (above !== undefined) break;
    pending.push(node);
    if (node.hasAttribute(COMPOSITION_ROOT_ATTR)) break;
  }

  let acc: M | null = above === undefined ? ops.identity() : above;
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    const node = pending[i]!;
    if (acc !== null) {
      const own = ownNodeTransform(node, ops, getStyle);
      // The ancestors' chain is the OUTER of the pair, as an ancestor applies
      // around its child.
      acc = own === null ? null : ops.compose(acc, own);
    }
    memo?.set(node, acc);
  }
  return acc;
}
