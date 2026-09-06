import bpy

bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
o = bpy.context.object
o.name = "prp_floaty_cube"

mat = bpy.data.materials.new("mtl_untouched")
mat.use_nodes = True
o.data.materials.append(mat)

mat2 = bpy.data.materials.new("mtl_semi_metal")
mat2.use_nodes = True
bsdf = mat2.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Metallic"].default_value = 0.5
o.data.materials.append(mat2)