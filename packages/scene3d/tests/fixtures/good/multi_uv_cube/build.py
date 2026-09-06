import bpy

# Regression fixture for the master-round-trip UV layer order/name loss:
# https://S3D-W-908 ("UV layer order lost in lowering").
#
# The USD exporter renames a mesh's ACTIVE UV layer to the USD convention
# `st`, and OpenUSD's `GetPropertyNames()` (which Blender's USD importer
# walks to rebuild layers on re-import) returns properties in LEXICOGRAPHIC
# order — so a two-UV-layer mesh can come back from the master round trip
# with its layers renamed AND reordered. Two UV layers with disjoint,
# easy-to-tell-apart values make a swap or reorder unambiguous to detect by
# reading the shipped container's TEXCOORD accessors directly.
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.5))
obj = bpy.context.object
obj.name = "prp_multi"

me = obj.data
while me.uv_layers:
    me.uv_layers.remove(me.uv_layers[0])

# UVMap in [0, 0.25); Lightmap in [0.75, 1) — disjoint ranges so provenance
# is unambiguous when read back from the shipped glTF.
uv1 = me.uv_layers.new(name="UVMap")
uv2 = me.uv_layers.new(name="Lightmap")
me.uv_layers.active = uv1
uv1.active_render = True

for loop in me.loops:
    uv1.data[loop.index].uv = (0.1, 0.2)
    uv2.data[loop.index].uv = (0.9, 0.8)

mat = bpy.data.materials.new("mtl_multi")
mat.use_nodes = True
obj.data.materials.append(mat)

cam_data = bpy.data.cameras.new("cam_hero")
cam = bpy.data.objects.new("cam_hero", cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (3, -3, 2)
cam.rotation_euler = (1.1, 0, 0.785)
bpy.context.scene.camera = cam

light_data = bpy.data.lights.new("lgt_key", type="SUN")
light = bpy.data.objects.new("lgt_key", light_data)
bpy.context.collection.objects.link(light)
light.rotation_euler = (0.6, 0.2, 0.8)
