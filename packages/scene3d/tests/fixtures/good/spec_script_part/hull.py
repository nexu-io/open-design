"""Fill the declared box with a freeform solid: a chamfered slab with a
cylindrical boss, built from bmesh primitives and boolean-free.

This is the freeform-as-a-shape-kind contract in miniature. The rules a
part script must keep:

  - define `build(ctx)`; ctx.size is the declared box (metres), ctx.material
    binds one of the scene's declared materials;
  - create EXACTLY ONE mesh object — the compiler fits that object into the
    box and nothing else;
  - geometry must be manifold and closed: it faces the same census, lint,
    claims and export as any primitive.

The script authors GEOMETRY only. Placement is the relations' job; this
object will be centred on x/y and rested on its support by the solver, so
nothing here needs to know where it ends up.
"""

import bmesh


def build(ctx):
    # Attribute style is the documented contract; ctx["size"] also works.
    size = ctx.size
    me = bmesh.new()

    # Chamfered base slab: a cube scaled to the box footprint, top face
    # inset toward the centre to break the prism silhouette.
    bmesh.ops.create_cube(me, size=1.0)
    sx, sy, sz = size[0], size[1], min(size[2] * 0.6, size[2])
    bmesh.ops.scale(me, vec=(sx, sy, sz), verts=me.verts)

    # Cylindrical boss on top, filling most of the remaining height.
    # Caps are triangulated: an ngon cap would trip the ngon rule on every
    # script part — generated output must lint clean by construction, the
    # same bar the primitive emitter holds itself to (TRIFAN caps).
    boss_r = min(sx, sy) * 0.3
    boss_h = size[2] - sz
    ret = bmesh.ops.create_cone(
        me,
        cap_ends=True,
        segments=24,
        radius1=boss_r,
        radius2=boss_r * 0.7,
        depth=boss_h,
    )
    bmesh.ops.translate(me, vec=(0.0, 0.0, sz / 2.0 + boss_h / 2.0), verts=ret["verts"])
    bmesh.ops.triangulate(me, faces=[f for f in me.faces if len(f.verts) > 4])

    # Dissolve-free weld keeps the two solids as one shell of one object.
    bmesh.ops.remove_doubles(me, verts=me.verts, dist=1e-5)

    import bpy

    mesh = bpy.data.meshes.new("script_part")
    me.to_mesh(mesh)
    me.free()
    obj = bpy.data.objects.new("script_part", mesh)
    bpy.context.collection.objects.link(obj)
