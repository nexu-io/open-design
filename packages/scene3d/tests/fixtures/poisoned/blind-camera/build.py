# A scene that lints clean on every structural rule but renders nothing:
# the authored camera is aimed away from the subject and sits behind it, so
# the proof frames come back empty. Structure alone cannot catch this — only
# measuring the rendered pixels can. Pins S3D-E-383.
import bpy, math

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
body = bpy.context.object
body.name = "prp_hidden_body"

mat = bpy.data.materials.new("mtl_body_paint")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.2, 0.4, 0.7, 1.0)
bsdf.inputs["Roughness"].default_value = 0.6
body.data.materials.append(mat)

# A Blender camera looks down its local -Z. Rotating +90 deg about X maps
# that to +Y, so a camera at (0, 6, 0) stares away from the cube behind it
# at the origin. (Adding a further 180 deg about Z would turn it back around
# and defeat the fixture -- the whole point is that it sees nothing.)
bpy.ops.object.camera_add(location=(0, 6, 0))
cam = bpy.context.object
cam.name = "cam_wrong_way"
cam.rotation_euler = (math.radians(90), 0, 0)
bpy.context.scene.camera = cam

bpy.ops.object.light_add(type="AREA", location=(4, 4, 6))
light = bpy.context.object
light.name = "lgt_key"
light.data.energy = 200
