# A kernel RECIPE: ordinary Python that AUTHORS an operator trace, which the
# compiler's exact Catmull-Clark evaluator turns into geometry. No bpy here —
# ctx verbs record exact rational operators; the compiler owns the mesh, so it
# predicts the built census and adjudicates it (S3D-E-702).
#
# A box control cage smoothed twice: a rounded cube, watertight and genus 0 by
# construction. Level 2 is exactly 98 vertices, 96 quad faces, 192 triangles.


def build(ctx):
    # A rounded hull with a flat, crisp base: the bottom edges are creased so
    # the base stays sharp while the rest smooths. Crease is topology-preserving,
    # so the census is still exactly V=98, F=96, 192 triangles.
    #
    # A "bulge" MORPH TARGET is authored on the cage (scale the whole box 2x)
    # and propagates through the two subdivisions exactly (S*delta), landing as
    # a Blender shape key on the 98-vertex surface.
    ctx.box().crease({"z": ["-1", "-1"]})
    ctx.shape("bulge").scale({}, [2, 2, 2], [0, 0, 0]).end_shape()
    ctx.subdivide(2)
