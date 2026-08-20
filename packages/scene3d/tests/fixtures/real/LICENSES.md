# Real-asset test corpus — provenance and licenses

These are REAL production assets from the Khronos glTF-Sample-Assets
repository (github.com/KhronosGroup/glTF-Sample-Assets), the industry's
canonical corpus for exercising glTF tooling. They exist here so the
compiler is tested against actual downloaded assets — real PBR texture
sets, real UV layouts, real scanned topology, real rigs — not just
generated primitives.

| Asset | File | License | Attribution |
|---|---|---|---|
| Damaged Helmet | `helmet/DamagedHelmet.glb` | CC-BY 4.0 | Model: theblueturtle_ (Sketchfab); glTF conversion: ctxwing; original PBR setup: Leonardo Carrion |
| Fox | `fox/Fox.glb` | CC0 (model) + CC-BY 4.0 (rig/animation) | Model: PixelMannen; rig and animation: @tomkranis; glTF conversion: AsoboStudio |
| CesiumMan | `cesium/CesiumMan.glb` | CC-BY 4.0 | Cesium (cesium.com) |
| BrainStem | `brainstem/BrainStem.glb` | CC-BY 4.0 | Keith Hunter, Smith Micro Software / Poser; glTF conversion: Khronos |

Do not modify the `.glb` files; they are pinned inputs. The `scene3d.json`
beside each relaxes naming conventions only — third-party assets are not
subject to this repo's naming scheme, and the point of compiling them is
to measure what they actually are.
