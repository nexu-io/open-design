/** This catch must work before any application dependency can be imported. */
export function renderPackagedMainEntry(usePrebundle: boolean): string {
  const entry = usePrebundle ? "./prebundled/packaged-main.mjs" : "@open-design/packaged";
  return `import(${JSON.stringify(entry)}).catch((error) => {
  console.error("packaged entry failed", error);
  const missingModule = error && ["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"].includes(error.code);
  const message = (missingModule
    ? "Open Design could not load a required application file. "
    : "Open Design could not start. ") +
    "Download and reinstall the latest Open Design installer for the same release channel. Keep your application data. If the problem persists, contact support with this error.";
  console.error(message);
  try {
    if (require("node:fs").existsSync(require("node:path").join(__dirname, "node_modules", ".ignored"))) {
      console.error("A package-manager backup directory (node_modules/.ignored) was found in this installation.");
    }
    if (process.versions.electron && process.env.ELECTRON_RUN_AS_NODE !== "1" && !process.argv.includes("--headless")) {
      require("electron").dialog.showErrorBox("Open Design could not start", message);
    }
  } catch (reportError) {
    console.error("packaged recovery message failed", reportError);
  }
  process.exit(1);
});
`;
}
