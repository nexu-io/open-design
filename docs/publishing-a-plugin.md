# Publishing An Open Design Plugin

Open Design registry publishing is GitHub-backed in v1. The CLI remains the
canonical workflow; the product UI and agent flows wrap these commands.

## 1. Scaffold

```bash
od plugin scaffold --id vendor/plugin-name --title "Plugin name" --out ./plugins/community
```

Public registry IDs must use `vendor/plugin-name`. The generated
`open-design.json` must include `plugin.repo`, pointing at the canonical source
repository or subdirectory.

## 2. Validate And Pack

```bash
od plugin validate ./plugins/community/plugin-name
od plugin pack ./plugins/community/plugin-name --out ./dist
```

The registry accepts anything that validates and packs. The source repository
does not need a special layout beyond `SKILL.md` plus `open-design.json`.

## 3. Authenticate

```bash
od plugin login
od plugin whoami --json
```

These commands wrap GitHub CLI. Tokens stay in `gh`; Open Design does not store
GitHub credentials.

## 4. Publish

```bash
od plugin publish vendor/plugin-name --to open-design --repo https://github.com/vendor/plugin-name
```

v1 opens the GitHub registry review flow. The publish payload includes the
plugin ID, version, repo, capability summary, package digest, and registry entry
path. After merge, CI regenerates `open-design-marketplace.json`.

## 5. Install From The Registry

```bash
od marketplace refresh official
od plugin install vendor/plugin-name
od plugin info vendor/plugin-name --json
```

Installs preserve marketplace provenance, resolved source, manifest digest, and
archive integrity. `official` and `trusted` sources install as trusted;
`restricted` sources stay restricted until the user grants more trust.

## 6. Yank A Version

```bash
od plugin yank vendor/plugin-name@1.0.0 --reason "Security issue"
```

Yanking never deletes metadata or bytes. New installs refuse yanked versions;
existing exact lockfile replays can still warn and proceed if the archive
remains reachable and integrity matches.
