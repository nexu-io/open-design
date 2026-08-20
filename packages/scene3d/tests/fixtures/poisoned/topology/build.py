import bpy, bmesh

bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
a = bpy.context.object
a.name = "prp_duplicate_a"

bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
b = bpy.context.object
b.name = "prp_duplicate_b"

bpy.ops.mesh.primitive_cube_add(size=2, location=(5, 0, 0))
c = bpy.context.object
c.name = "prp_non_manifold"
bm = bmesh.new()
bm.from_mesh(c.data)
top = [v for v in bm.verts if abs(v.co.z - 1.0) < 1e-6]
bm.faces.new(top)
bm.to_mesh(c.data)
bm.free()

bpy.ops.mesh.primitive_cube_add(size=2, location=(10, 0, 0))
d = bpy.context.object
d.name = "prp_nan_transform"
d.location = (float("nan"), 0.0, 0.0)