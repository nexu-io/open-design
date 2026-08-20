# One deliberate UV/material defect per object, so each stable code can be
# pinned to its target. Objects are spaced apart so the coplanar z-fighting
# search never muddies the signal.
import bpy


def textured_material(name, image, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Base Color"].default_value = (0.5, 0.4, 0.3, 1.0)
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def cube(name, x):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0, 0.5))
    o = bpy.context.object
    o.name = name
    return o


img = bpy.data.images.new("tex_shared_diffuse", 512, 512)
img.generated_color = (0.6, 0.5, 0.4, 1.0)
shared = textured_material("mtl_shared", img, 0.7)

# --- S3D-E-441: textured mesh, UV layers deleted -------------------------
no_uv = cube("prp_no_uv", 0)
no_uv.data.materials.append(shared)
while no_uv.data.uv_layers:
    no_uv.data.uv_layers.remove(no_uv.data.uv_layers[0])

# --- S3D-W-441: every face mapped onto the same full tile ----------------
overlap = cube("prp_overlap", 3)
overlap.data.materials.append(shared)
uv = overlap.data.uv_layers.active
corners = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
for poly in overlap.data.polygons:
    for k, li in enumerate(poly.loop_indices):
        uv.data[li].uv = corners[k % 4]

# --- S3D-W-442: one face mirrored in place (no overlap introduced) -------
flipped = cube("prp_flipped", 6)
flipped.data.materials.append(shared)
uv = flipped.data.uv_layers.active
poly = flipped.data.polygons[0]
us = [uv.data[li].uv.x for li in poly.loop_indices]
lo, hi = min(us), max(us)
for li in poly.loop_indices:
    uv.data[li].uv.x = lo + hi - uv.data[li].uv.x

# --- S3D-W-444: same texture, one mesh's islands scaled far denser -------
dense_a = cube("prp_dense_a", 9)
dense_a.data.materials.append(shared)
dense_b = cube("prp_dense_b", 12)
dense_b.data.materials.append(shared)
uv = dense_b.data.uv_layers.active
for loop_uv in uv.data:
    loop_uv.uv.x = 0.5 + (loop_uv.uv.x - 0.5) * 0.05
    loop_uv.uv.y = 0.5 + (loop_uv.uv.y - 0.5) * 0.05

# --- S3D-E-346: material bound to an image whose file does not exist -----
ghost_img = bpy.data.images.new("tex_ghost", 4, 4)
ghost_img.source = "FILE"
ghost_img.filepath = "//textures/does_not_exist.png"
ghost = cube("prp_ghost_tex", 15)
ghost.data.materials.append(textured_material("mtl_ghost", ghost_img, 0.6))

# --- S3D-W-346 / W-347: NPOT and oversized textures ----------------------
npot_img = bpy.data.images.new("tex_npot", 1000, 300)
npot = cube("prp_npot_tex", 18)
npot.data.materials.append(textured_material("mtl_npot", npot_img, 0.5))

huge_img = bpy.data.images.new("tex_huge", 8192, 64)
huge = cube("prp_huge_tex", 21)
huge.data.materials.append(textured_material("mtl_huge", huge_img, 0.4))

# --- S3D-W-348: two identical materials on two objects -------------------
dup_a = cube("prp_dup_a", 24)
dup_b = cube("prp_dup_b", 27)
dup_a.data.materials.append(textured_material("mtl_twin_one", img, 0.3))
dup_b.data.materials.append(textured_material("mtl_twin_two", img, 0.3))

# --- S3D-W-349: faces assigned to an empty material slot -----------------
partial = cube("prp_partial_mat", 30)
partial.data.materials.append(textured_material("mtl_partial", img, 0.2))
partial.data.materials.append(None)
for poly in partial.data.polygons[:2]:
    poly.material_index = 1

# Staging, so integrity rules stay out of the assertion picture.
cam_data = bpy.data.cameras.new("cam_hero_data")
cam = bpy.data.objects.new("cam_hero", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (15, -30, 12)
cam.rotation_euler = (1.2, 0.0, 0.0)
bpy.context.scene.camera = cam
light_data = bpy.data.lights.new("lgt_key_data", type="SUN")
lgt = bpy.data.objects.new("lgt_key", light_data)
bpy.context.collection.objects.link(lgt)
lgt.location = (15, -5, 10)
