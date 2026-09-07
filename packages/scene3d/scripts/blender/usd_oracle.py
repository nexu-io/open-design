"""USD conformance oracle — a second, independent authority on the exported
stage, using OpenUSD's own runtime (pxr) rather than our structure-only parser.

It answers questions only the real USD runtime can: does the stage COMPOSE
(sublayers/references/variants resolve), does it declare a defaultPrim, and do
its material bindings resolve to prims that actually exist. A binding that
targets a missing prim is the trap fable and the Khronos docs both name: USD
silently ignores it, so the surface renders unshaded with no error anywhere.

Emits ONE line of JSON on stdout and never raises: an oracle that crashes must
degrade to "unchecked", not fail the compile. `{"unavailable": true}` means
pxr is not installed on this host — the check simply did not run.
"""
import json
import sys


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        from pxr import Usd
    except Exception as e:  # pxr not installed on this host
        print(json.dumps({"unavailable": True, "error": repr(e)}))
        return

    out = {"ok": True, "defaultPrim": None, "unresolvedBindings": [], "error": None}
    try:
        stage = Usd.Stage.Open(path)
        if stage is None:
            out["ok"] = False
            out["error"] = "stage failed to open"
            print(json.dumps(out))
            return
        dp = stage.GetDefaultPrim()
        out["defaultPrim"] = dp.GetName() if dp and dp.IsValid() else None
        for prim in stage.Traverse():
            rel = prim.GetRelationship("material:binding")
            if not rel:
                continue
            for target in rel.GetTargets():
                if not stage.GetPrimAtPath(target).IsValid():
                    out["unresolvedBindings"].append(
                        "%s -> %s" % (prim.GetPath(), target)
                    )
    except Exception as e:  # composition or traversal blew up
        out["ok"] = False
        out["error"] = repr(e)
    print(json.dumps(out))


main()
