import bpy, math

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
body = bpy.context.object
body.name = "prp_crate_body"
body.scale = (1.0, 1.0, 0.8)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.9))
lid = bpy.context.object
lid.name = "prp_crate_lid"
lid.scale = (1.1, 1.1, 0.1)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def make_wood(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.55, 0.35, 0.15, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.75
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def make_metal(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.8, 0.8, 0.85, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.35
    bsdf.inputs["Metallic"].default_value = 1.0
    return mat


wood = make_wood("mtl_crate_wood")
metal = make_metal("mtl_crate_metal")
body.data.materials.append(wood)
lid.data.materials.append(metal)

bpy.ops.object.camera_add(location=(5.5, -5.0, 3.5))
cam = bpy.context.object
cam.name = "cam_crate_shot"
cam.rotation_euler = (math.radians(63), 0, math.radians(45))
bpy.context.scene.camera = cam

bpy.ops.object.light_add(type="AREA", location=(4, 4, 6))
light = bpy.context.object
light.name = "lgt_key"
light.data.energy = 200