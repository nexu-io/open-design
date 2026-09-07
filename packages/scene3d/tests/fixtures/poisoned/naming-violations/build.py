import bpy

bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
o = bpy.context.object
o.name = "Cube.001"

bpy.ops.mesh.primitive_cube_add(size=2, location=(4, 0, 0))
o2 = bpy.context.object
o2.name = "crate_body"

bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(8, 0, 0))
o3 = bpy.context.object
o3.name = "BAD NAME"