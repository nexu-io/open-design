import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { repairMacDockEntries } from "../../../src/platforms/macos/dock-entry.js";

const exec = promisify(execFile);
it.skipIf(process.platform !== "darwin")("repairs native typed preferences in an isolated domain without touching the user's Dock", async () => {
  const domain = `ai.open-design.dock-test.${process.pid}.${Date.now()}`;
  const canonical = "/Applications/Open Design.app";
  const old = "/tmp/od-test/versions/0.9.0/payload/Open Design.app";
  const unrelated = "/Applications/Unrelated.app";
  const tile = (path: string) => ({ "tile-type": "file-tile", "tile-data": { "file-label": "original", "file-data": { _CFURLString: `file://${path.replaceAll(" ", "%20")}`, _CFURLStringType: 15 } } });
  const seed = { "persistent-apps": [tile(old), tile(unrelated), tile(canonical)], "recent-apps": [tile(old), tile(unrelated)] };
  const prelude = `ObjC.import("Foundation"); const defaults = $.NSUserDefaults.alloc.initWithSuiteName(${JSON.stringify(domain)});`;
  try {
    await exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", `${prelude}
      const value = ObjC.deepUnwrap($(${JSON.stringify(seed)}));
      const dict = $.NSMutableDictionary.dictionaryWithDictionary($(value));
      dict.setObjectForKey($.NSData.alloc.initWithBase64EncodedStringOptions("AQIDBA==", 0), "opaque-data");
      defaults.setPersistentDomainForName(dict, ${JSON.stringify(domain)}); defaults.synchronize;`]);
    expect(await repairMacDockEntries({ canonicalAppBundlePath: canonical, versionsRoot: "/tmp/od-test/versions", preferencesDomain: domain, restartDock: false })).toEqual({ status: "repaired", removedEntries: 2 });
    const result = await exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", `${prelude}
      const dict = defaults.persistentDomainForName(${JSON.stringify(domain)});
      JSON.stringify({value:ObjC.deepUnwrap(dict), opaque:ObjC.unwrap(dict.objectForKey("opaque-data").base64EncodedStringWithOptions(0))});`]);
    const value = JSON.parse(result.stdout);
    expect(value.opaque).toBe("AQIDBA==");
    expect(value.value["persistent-apps"]).toHaveLength(2);
    expect(value.value["persistent-apps"][0]["tile-data"]["file-data"]._CFURLString).toBe("file:///Applications/Open%20Design.app");
    expect(value.value["persistent-apps"][1]).toEqual(tile(unrelated));
    expect(value.value["recent-apps"]).toEqual([tile(unrelated)]);
    expect(await repairMacDockEntries({ canonicalAppBundlePath: canonical, versionsRoot: "/tmp/od-test/versions", preferencesDomain: domain, restartDock: false })).toEqual({ status: "unchanged" });
  } finally {
    await exec("/usr/bin/defaults", ["delete", domain]).catch(() => undefined);
  }
}, 15000);
