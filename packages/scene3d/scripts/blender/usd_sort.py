"""Physically sort every prim's children by name in a USDA layer, in place.

Run as a SUBPROCESS, never imported into the runner: pxr and bpy bundle
conflicting USD DLLs, and once bpy has loaded its copy `from pxr import Sdf`
dies with a DLL bind error. A clean interpreter loads pxr fine, and the sort
needs nothing from the Blender session — just the file.

Why this exists: Blender's USD exporter iterates the depsgraph in whatever
order its scheduler produced, so an unchanged scene authors a differently-
ordered (content-identical) stage on every compile. USD is the master every
container is lowered from, so the disorder propagates into every deliverable
and defeats content hashing. Sorting here, before the re-import, closes all
formats at once.

Sdf exposes no insert-at-index, but a copy-out / delete / copy-back APPENDS —
so visiting names in sorted order IS the sort; each child's subtree gets the
same treatment recursively. Purely a reorder: no spec is created or dropped,
and references are by path, so nothing can dangle.

Exit 0 on success; any failure prints its reason to stderr and exits 1 with
the file untouched (the caller records the skip — never silent).
"""
import sys


def main(path):
    from pxr import Sdf

    layer = Sdf.Layer.FindOrOpen(path)
    if layer is None:
        raise RuntimeError("Sdf could not open %s" % path)
    root = Sdf.Path("/")

    # A scratch name no prim in this layer already uses. A fixed name would
    # collide with an authored prim that happens to share it — and the
    # collision does not merely fail, it copies over and then DELETES that
    # prim. Rare, and unacceptable: the sorter may only reorder.
    taken = set()

    def collect(spec):
        for c in spec.nameChildren:
            taken.add(c.name)
            collect(c)

    collect(layer.pseudoRoot)
    tmp_name = "__s3d_sort_tmp"
    while tmp_name in taken:
        tmp_name += "_"

    def sort_children(spec, spec_path):
        names = sorted(c.name for c in spec.nameChildren)
        if len(names) > 1:
            for name in names:
                child_path = spec_path.AppendChild(name)
                tmp_path = spec_path.AppendChild(tmp_name)
                Sdf.CopySpec(layer, child_path, layer, tmp_path)
                if spec_path == root:
                    del layer.rootPrims[name]
                else:
                    del spec.nameChildren[name]
                Sdf.CopySpec(layer, tmp_path, layer, child_path)
                if spec_path == root:
                    del layer.rootPrims[tmp_name]
                else:
                    del spec.nameChildren[tmp_name]
        for c in list(spec.nameChildren):
            sort_children(c, spec_path.AppendChild(c.name))

    sort_children(layer.pseudoRoot, root)
    layer.Save()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.stderr.write("usage: usd_sort.py <stage.usda>\n")
        sys.exit(1)
    try:
        main(sys.argv[1])
    except Exception as exc:
        sys.stderr.write("%s\n" % exc)
        sys.exit(1)
