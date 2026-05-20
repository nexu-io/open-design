# Publishing An Open Design Plugin

Open Design registry publishing is GitHub-backed in v1. The CLI remains the
canonical workflow; the product UI and agent flows wrap these commands.

## 1. Scaffold

```bash
od plugin scaffold --id figma-workflow --title "Figma workflow" --out ./plugins/community
```

The scaffold command creates `./plugins/community/figma-workflow/`. Plugin IDs
must be lowercase, start with a letter, and use only `[a-z0-9._-]`; slash-
separated registry paths are used by catalogs, not by `od plugin scaffold`.
The generated `open-design.json` is the Open Design sidecar next to `SKILL.md`.

## 2. Validate And Pack

```bash
od plugin validate ./plugins/community/figma-workflow --no-daemon
od plugin pack ./plugins/community/figma-workflow
```

The registry accepts anything that validates and packs. The source repository
does not need a special layout beyond `SKILL.md` plus `open-design.json`.
`od plugin pack` writes the archive next to the plugin folder by default.

## 3. Authenticate

```bash
od plugin login
od plugin whoami --json
```

These commands wrap GitHub CLI. Tokens stay in `gh`; Open Design does not store
GitHub credentials.

## 4. Publish

```bash
od plugin publish figma-workflow --to open-design --repo https://github.com/acme/figma-workflow
```

v1 opens the GitHub registry review flow. The publish payload includes the
plugin ID, version, repo, capability summary, and target registry entry path.
After merge, CI regenerates `open-design-marketplace.json`.

## 5. Install From The Registry

```bash
od marketplace refresh official
od plugin install figma-workflow
od plugin info figma-workflow --json
```

Installs preserve marketplace provenance, resolved source, manifest digest, and
archive integrity. `official` and `trusted` sources install as trusted;
`restricted` sources stay restricted until the user grants more trust.

## 6. Yank A Version

```bash
od plugin yank figma-workflow@1.0.0 --reason "Security issue"
```

Yanking never deletes metadata or bytes. New installs refuse yanked versions;
existing exact lockfile replays can still warn and proceed if the archive
remains reachable and integrity matches.
