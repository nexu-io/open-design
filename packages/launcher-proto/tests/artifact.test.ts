import { expect, it } from "vitest";
import { validateLauncherApplicationArtifact, validateLauncherHostEnvironment } from "../src/artifact.js";

it.each(["darwin", "win32", "linux"] as const)("accepts a %s contract without knowing its bundle layout", platform => {
  const environment = { contractVersion:1 as const, platform, arch:"arm64", electronVersion:"41.3.0" };
  const artifact = { ...environment, appRoot:"code", resourcesPath:"assets", entry:"code/start.mjs" };
  expect(validateLauncherApplicationArtifact(artifact, environment)).toBe(artifact);
  for (const change of [{platform:"other"},{arch:"x64"},{electronVersion:"42.0.0"},{contractVersion:2}]) {
    expect(() => validateLauncherHostEnvironment({...environment,...change}, environment)).toThrow("not compatible");
  }
});
it.each(["../code", "/code", "C:/code", "code\\main", "code/../main", "code//main", "code/./main", "code\0main"])("rejects nonportable or escaping artifact path %j", path => {
  const environment = {contractVersion:1 as const,platform:"win32" as const,arch:"x64",electronVersion:"41.3.0"};
  expect(()=>validateLauncherApplicationArtifact({...environment,appRoot:"code",resourcesPath:path,entry:"code/start.mjs"},environment)).toThrow();
});
it("rejects a declared entry outside the application code root",()=>{
  const environment={contractVersion:1 as const,platform:"darwin" as const,arch:"arm64",electronVersion:"41.3.0"};
  expect(()=>validateLauncherApplicationArtifact({...environment,appRoot:"code",resourcesPath:"assets",entry:"other/start.mjs"},environment)).toThrow("outside");
});
