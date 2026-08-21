import * as fs from "node:fs";
import * as path from "node:path";
import { buildJavaModel } from "./java-model.js";
import { buildBedrockModel } from "./bedrock-model.js";
import { Census } from "../types.js";
import { NormalizedContract } from "../contract.js";

/**
 * Write the Minecraft model deliverable under `out/minecraft/` and return the
 * project-relative paths so the pipeline can register them as deliverables.
 * The dialect chooses the format: Java block model (`model.json` + per-material
 * texture files) or Bedrock geometry (`geometry.json` + one atlas texture).
 * Pure file I/O over the pure builders.
 */
export function emitMinecraftModel(
  census: Census,
  contract: NormalizedContract,
  projectDir: string,
  outDir: string,
): { deliverables: string[]; skipped: Array<{ object: string; reason: string }>; elements: number } {
  const mcDir = `${outDir}/minecraft`;
  const texDir = path.join(projectDir, mcDir, "textures");
  fs.mkdirSync(texDir, { recursive: true });
  const deliverables: string[] = [];

  if (contract.minecraft.dialect === "bedrock") {
    const build = buildBedrockModel(census, contract);
    const modelRel = `${mcDir}/geometry.json`;
    fs.writeFileSync(path.join(projectDir, modelRel), JSON.stringify(build.model, null, 2) + "\n", "utf8");
    deliverables.push(modelRel);
    const texRel = `${mcDir}/textures/${build.texture.key}.png`;
    fs.writeFileSync(path.join(projectDir, texRel), build.texture.png);
    deliverables.push(texRel);
    return { deliverables, skipped: build.skipped, elements: build.model["minecraft:geometry"][0]!.bones[0]!.cubes.length };
  }

  const build = buildJavaModel(census, contract);
  const modelRel = `${mcDir}/model.json`;
  // Stable, pretty JSON — a modeller reads and hand-tweaks this file.
  fs.writeFileSync(path.join(projectDir, modelRel), JSON.stringify(build.model, null, 2) + "\n", "utf8");
  deliverables.push(modelRel);

  for (const tex of build.textures) {
    const rel = `${mcDir}/textures/${tex.key}.png`;
    const abs = path.join(projectDir, rel);
    if (tex.png) {
      fs.writeFileSync(abs, tex.png);
    } else if (tex.copyFrom && fs.existsSync(tex.copyFrom) && fs.statSync(tex.copyFrom).isFile()) {
      fs.copyFileSync(tex.copyFrom, abs);
    } else {
      // The material referenced an image that is not on disk; the model still
      // names the texture (the modeller supplies it), we just cannot ship bytes.
      continue;
    }
    deliverables.push(rel);
  }

  return { deliverables, skipped: build.skipped, elements: build.model.elements.length };
}
