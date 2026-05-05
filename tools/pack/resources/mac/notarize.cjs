const path = require("node:path");

module.exports = async function notarize(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  const missing = [
    ["APPLE_ID", appleId],
    ["APPLE_APP_SPECIFIC_PASSWORD", appleIdPassword],
    ["APPLE_TEAM_ID", teamId],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `[tools-pack notarize] missing required Apple notarization env: ${missing.join(", ")}`,
    );
  }

  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${productFilename}.app`);
  const { notarize } = await import("@electron/notarize");

  await notarize({
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
};
