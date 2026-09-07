# The calibration control for the UV/material/geometry rules: a properly
# made TEXTURED asset. Every new lint (S3D-*-44x, 346-349, 327-330) must
# stay silent on this scene — a rule that flags well-made work is noise,
# and noise teaches the agent to ignore the gate.
import bpy

# One clean cube with its factory cross unwrap (verified non-overlapping,
# unmirrored) and a real 512x512 power-of-two texture wired to Base Color.
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.5))
box = bpy.context.object
box.name = "prp_box"

img = bpy.data.images.new("tex_box_diffuse", 512, 512)
img.generated_color = (0.55, 0.4, 0.25, 1.0)

mat = bpy.data.materials.new("mtl_box_wood")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Metallic"].default_value = 0.0
bsdf.inputs["Roughness"].default_value = 0.7
bsdf.inputs["Base Color"].default_value = (0.5, 0.4, 0.3, 1.0)
tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = img
mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
box.data.materials.append(mat)

# Stage the shot so the integrity rules are satisfied too: this fixture's
# verdict should be a clean compile, not "clean except the scaffolding".
cam_data = bpy.data.cameras.new("cam_hero_data")
cam = bpy.data.objects.new("cam_hero", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (2.2, -2.2, 1.6)
# Aim by track quaternion, not hand-tuned eulers: the control fixture must
# be zero-warning through all six stages, and an eyeballed rotation is how
# it picked up an off-camera warning the first time.
import mathutils
direction = mathutils.Vector((0.0, 0.0, 0.5)) - cam.location
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.camera = cam

light_data = bpy.data.lights.new("lgt_key_data", type="SUN")
lgt = bpy.data.objects.new("lgt_key", light_data)
bpy.context.collection.objects.link(lgt)
lgt.location = (1.5, -1.0, 3.0)
