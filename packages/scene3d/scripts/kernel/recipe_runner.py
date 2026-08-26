#!/usr/bin/env python3
"""Run a scene3d kernel RECIPE and emit its operator trace.

The recipe is ordinary imperative Python the author writes -- loops, helpers,
halves-then-mirror. It does NOT build geometry and it never imports bpy: its
verbs (`ctx.box`, `ctx.cage`, `ctx.subdivide`, `ctx.mirror`) RECORD exact
operators, and this harness prints the resulting trace as JSON. The compiler's
single TypeScript evaluator turns that trace into the exact mesh and the
predicted census. So the author gets full imperative power AND the compiler
still owns the geometry -- which is what lets it predict and adjudicate.

Determinism is structural: every coordinate is a `fractions.Fraction`, and
`str(Fraction)` is the same canonical `"n/d"` (or `"n"`) text the TypeScript
`Rational` produces and parses. The same recipe therefore hashes to the same
bytes here and in the reference recorder -- no float ever exists.

Protocol: the trace is printed on one sentinel-framed line,

    ###SCENE3D-TRACE###<json>###

so any incidental prints in a recipe stay out of the payload. A contract
violation is a one-line sentence carrying the recipe's own line number, never
a raw traceback.
"""

import importlib.util
import json
import sys
import traceback
from fractions import Fraction


def _coord(value):
    """A coordinate as canonical rational text. int/str/Fraction only -- a
    float would reintroduce the imprecision the IR exists to avoid."""
    if isinstance(value, bool):
        raise TypeError("a coordinate must be an int, a rational string, or a Fraction, not a bool")
    if isinstance(value, Fraction):
        return str(value)
    if isinstance(value, int):
        return str(Fraction(value))
    if isinstance(value, str):
        return str(Fraction(value))  # parses "3/4" / "-1" exactly, or raises
    if isinstance(value, float):
        raise TypeError(
            "a coordinate must be exact: pass an int, a rational string like '1/2', "
            "or a Fraction -- never a float (%r)" % value
        )
    raise TypeError("a coordinate must be an int, a rational string, or a Fraction, not %s" % type(value).__name__)


class RecipeCtx:
    """The recording context: every verb appends an exact op and returns self,
    so a recipe reads as a fluent construction while producing pure data."""

    def __init__(self):
        self._ops = []

    def cage(self, points, faces, ids=None):
        self._ops.append({
            "op": "cage",
            "points": [[_coord(p[0]), _coord(p[1]), _coord(p[2])] for p in points],
            "faces": [[int(i) for i in f] for f in faces],
            **({"ids": [str(i) for i in ids]} if ids is not None else {}),
        })
        return self

    def box(self, half=1):
        h = _coord(half)
        n = str(-Fraction(h))
        pts = [
            (n, n, n), (h, n, n), (h, h, n), (n, h, n),
            (n, n, h), (h, n, h), (h, h, h), (n, h, h),
        ]
        faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]]
        return self.cage(pts, faces)

    def subdivide(self, levels=1):
        if not isinstance(levels, int) or isinstance(levels, bool) or levels < 0:
            raise ValueError("subdivide(levels): levels must be a non-negative integer")
        self._ops.append({"op": "subdivide", "levels": levels})
        return self

    def mirror(self, axis):
        if axis not in (0, 1, 2):
            raise ValueError("mirror(axis): axis must be 0, 1 or 2")
        self._ops.append({"op": "mirror", "axis": axis})
        return self

    def move(self, region, offset):
        """Translate the vertices in a coordinate region by an exact offset.

        region is a dict of axis -> [min, max] (inclusive, exact); offset is
        [x, y, z]. Coordinates are ints, rational strings or Fractions."""
        if not isinstance(region, dict):
            raise ValueError("move(region, offset): region must be a dict of axis -> [min, max]")
        r = {}
        for key in ("x", "y", "z"):
            b = region.get(key)
            if b is None:
                continue
            if len(b) != 2:
                raise ValueError("move(region, offset): region['%s'] must be [min, max]" % key)
            r[key] = [_coord(b[0]), _coord(b[1])]
        if len(offset) != 3:
            raise ValueError("move(region, offset): offset must be [x, y, z]")
        self._ops.append({
            "op": "move",
            "region": r,
            "offset": [_coord(offset[0]), _coord(offset[1]), _coord(offset[2])],
        })
        return self

    def crease(self, region):
        """Mark every edge with both endpoints in the region as sharp, so a
        later subdivide keeps it crisp (a flat base, a hard rim)."""
        if not isinstance(region, dict):
            raise ValueError("crease(region): region must be a dict of axis -> [min, max]")
        r = {}
        for key in ("x", "y", "z"):
            b = region.get(key)
            if b is None:
                continue
            if len(b) != 2:
                raise ValueError("crease(region): region['%s'] must be [min, max]" % key)
            r[key] = [_coord(b[0]), _coord(b[1])]
        self._ops.append({"op": "crease", "region": r})
        return self

    def scale(self, region, factor, pivot=(0, 0, 0)):
        """Scale the vertices in a region about a pivot by a per-axis factor."""
        if not isinstance(region, dict):
            raise ValueError("scale(region, factor, pivot): region must be a dict of axis -> [min, max]")
        r = {}
        for key in ("x", "y", "z"):
            b = region.get(key)
            if b is None:
                continue
            if len(b) != 2:
                raise ValueError("scale(...): region['%s'] must be [min, max]" % key)
            r[key] = [_coord(b[0]), _coord(b[1])]
        if len(factor) != 3 or len(pivot) != 3:
            raise ValueError("scale(region, factor, pivot): factor and pivot must each be [x, y, z]")
        self._ops.append({
            "op": "scale",
            "region": r,
            "factor": [_coord(factor[0]), _coord(factor[1]), _coord(factor[2])],
            "pivot": [_coord(pivot[0]), _coord(pivot[1]), _coord(pivot[2])],
        })
        return self

    def trace(self):
        return {"version": 1, "ops": self._ops}


def _fail(message):
    sys.stderr.write(message + "\n")
    sys.exit(3)


def _line_in(path, exc):
    for frame in traceback.extract_tb(exc.__traceback__):
        if frame.filename == path:
            return frame.lineno
    return None


CONTRACT = (
    "the recipe contract: define build(ctx); ctx records exact operators -- "
    "ctx.box()/ctx.cage(points, faces) seed geometry, ctx.subdivide(levels), "
    "ctx.mirror(axis), ctx.move(region, offset) and ctx.crease(region) transform it; "
    "coordinates are ints, rational strings ('1/2') or fractions.Fraction, never floats"
)


def main(argv):
    if len(argv) != 2:
        _fail("recipe_runner.py expects exactly one argument: the recipe .py path")
    path = argv[1]
    spec = importlib.util.spec_from_file_location("scene3d_recipe", path)
    if spec is None or spec.loader is None:
        _fail("cannot load recipe: %s" % path)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:  # noqa: BLE001 - report as a sentence
        line = _line_in(path, exc)
        where = (" at line %d" % line) if line is not None else ""
        _fail("recipe %s raised %s during import%s: %s -- %s" % (path, type(exc).__name__, where, exc, CONTRACT))
    if not hasattr(module, "build") or not callable(module.build):
        _fail("recipe %s must define build(ctx) -- %s" % (path, CONTRACT))
    ctx = RecipeCtx()
    try:
        module.build(ctx)
    except Exception as exc:  # noqa: BLE001
        line = _line_in(path, exc)
        where = (" at line %d" % line) if line is not None else ""
        _fail("recipe %s raised %s during build(ctx)%s: %s -- %s" % (path, type(exc).__name__, where, exc, CONTRACT))
    trace = ctx.trace()
    if not trace["ops"]:
        _fail("recipe %s recorded no operators -- start with ctx.box() or ctx.cage(...) and transform it" % path)
    sys.stdout.write("###SCENE3D-TRACE###" + json.dumps(trace, separators=(",", ":")) + "###\n")


if __name__ == "__main__":
    main(sys.argv)
