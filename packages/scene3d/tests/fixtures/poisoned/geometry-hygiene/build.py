# One engine-hygiene defect per object. Every one of these renders
# perfectly in a Blender viewport and misbehaves after engine import —
# which is exactly why they are compiler rules, not eyeball checks.
import bpy
import bmesh


def cube(name, x, size=1.0):
    bpy.ops.mesh.primitive_cube_add(size=size, location=(x, 0, 0.5))
    o = bpy.context.object
    o.name = name
    return o


# --- S3D-W-327: a vertex belonging to no face ----------------------------
loose = cube("prp_loose", 0)
bm = bmesh.new()
bm.from_mesh(loose.data)
bm.verts.new((5.0, 5.0, 5.0))
bm.to_mesh(loose.data)
bm.free()

# --- S3D-W-328: an unwelded seam — two vertices at one position ----------
seam = cube("prp_double_seam", 3)
bm = bmesh.new()
bm.from_mesh(seam.data)
bm.verts.ensure_lookup_table()
bm.verts.new(bm.verts[0].co)
bm.to_mesh(seam.data)
bm.free()

# --- S3D-W-329: one face wound the wrong way -----------------------------
wound = cube("prp_windflip", 6)
bm = bmesh.new()
bm.from_mesh(wound.data)
bm.faces.ensure_lookup_table()
bm.faces[0].normal_flip()
bm.to_mesh(wound.data)
bm.free()

# --- S3D-E-327: mirrored by transform — normals flip on import -----------
mirrored = cube("prp_mirrored", 9)
mirrored.scale = (-1.0, 1.0, 1.0)

# --- S3D-W-330: unapplied uniform scale ----------------------------------
scaled = cube("prp_scaled", 12)
scaled.scale = (2.0, 2.0, 2.0)

# A clean control in the same scene: no hygiene code may name it.
cube("prp_clean", 15)

cam_data = bpy.data.cameras.new("cam_hero_data")
cam = bpy.data.objects.new("cam_hero", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (7, -25, 10)
cam.rotation_euler = (1.2, 0.0, 0.0)
bpy.context.scene.camera = cam
light_data = bpy.data.lights.new("lgt_key_data", type="SUN")
lgt = bpy.data.objects.new("lgt_key", light_data)
bpy.context.collection.objects.link(lgt)
lgt.location = (7, -5, 10)
