# Community Import Smoke Test

A small community plugin for exercising the Open Design import UI. It is meant
to be boring in exactly the useful way: the folder has the portable `SKILL.md`
floor, the enriched `open-design.json` sidecar, and a minimal Claude-compatible
plugin manifest.

## Test Paths

- Upload folder: choose `plugins/community/import-smoke-test`.
- Upload zip: package this folder and upload the archive.
- From GitHub: use `github:nexu-io/open-design@main/plugins/community/import-smoke-test` after the entry is available on `main`.
- Marketplace name: use `community/import-smoke-test` after the community marketplace has been registered or refreshed.

## Expected Result

Open Design should install the plugin as a user/community plugin, preserve the
source provenance, and show the plugin with the title `Community Import Smoke
Test`.
