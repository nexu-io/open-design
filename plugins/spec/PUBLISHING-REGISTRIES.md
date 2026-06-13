# Publishing To Skill Registries

Language: English | [简体中文](PUBLISHING-REGISTRIES.zh-CN.md)

Open Design plugins are intentionally shaped so one folder can travel across multiple agent ecosystems. The safest publishing model is:

1. Keep the source of truth in a public GitHub repository or in an Open Design PR.
2. Keep `SKILL.md` portable and registry-friendly.
3. Add `open-design.json` as the Open Design sidecar.
4. Publish or list the same source in external registries only after local validation passes.

Registry rules can change, so always check the target registry docs before running a publish command.

## Recommended Release Order

1. Validate the plugin folder locally.
2. Push a public GitHub repository or open an Open Design PR.
3. Add README install instructions for Open Design and generic Agent Skills clients.
4. Add registry-specific badges or links.
5. Publish to registries that match the plugin's audience.
6. Record every published URL in the README and PR body.

## Registry Matrix

| Target | Best for | Source shape | Publish strategy |
| --- | --- | --- | --- |
| Open Design | OD marketplace, composer chips, pipelines, GenUI, artifact provenance | `SKILL.md` + `open-design.json` | Open a PR to Open Design or publish a marketplace index entry pointing to the plugin repo. |
| skills.sh | Agent Skills discovery across many coding agents | Public Git repo or subpath containing `SKILL.md` | Make `npx skills add owner/repo` work, add the skills.sh badge, and keep the README clear. |
| ClawHub | OpenClaw users who install skills or OpenClaw plugins from a registry | `SKILL.md` folder for skills; OpenClaw package metadata for plugins | Use `clawhub skill publish ./my-skill` for skill folders. Use `clawhub package publish ... --family code-plugin` only when you also ship OpenClaw plugin metadata. |
| Standalone GitHub | Source of truth and broad agent compatibility | Portable folder or mono-repo subpath | Tag releases, document install commands, and keep changelogs. |

## skills.sh Strategy

The skills.sh ecosystem indexes installable Agent Skills and documents the `skills` CLI as the main install path. The public docs show installation through GitHub-style sources:

```bash
npx skills add owner/repo
npx skills add https://github.com/owner/repo/tree/main/path/to/skill
npx skills add ./my-local-skills
```

For Open Design plugin authors:

- Ensure the repo or subpath contains a valid `SKILL.md`.
- Keep `open-design.json` additive; generic skill clients should be able to ignore it.
- Put a short install block in your README:

```bash
npx skills add owner/repo --skill my-plugin
od plugin install https://github.com/owner/repo
```

- Add a badge once the public source is stable:

```markdown
[![skills.sh](https://skills.sh/b/owner/repo)](https://skills.sh/owner/repo)
```

- Use a GitHub topic and README keywords that match the plugin's lane, such as `open-design-plugin`, `agent-skill`, `prototype`, `deck`, `hyperframes`, or `design-system`.

Do not assume skills.sh is the canonical storage location. Treat GitHub as source of truth and skills.sh as a discovery and install surface.

## ClawHub Strategy

ClawHub is the OpenClaw registry layer for skills and plugins. Its docs distinguish skill publishing from package publishing:

```bash
npm i -g clawhub
clawhub login

clawhub skill publish ./my-skill \
  --slug my-skill \
  --name "My Skill" \
  --version 1.0.0 \
  --changelog "Initial release"
```

Use this path for normal Open Design plugins because they are centered on `SKILL.md`.

Only use the OpenClaw package path when you intentionally ship an OpenClaw code plugin with OpenClaw compatibility metadata:

```bash
clawhub package publish <source> --family code-plugin --dry-run
clawhub package publish <source> --family code-plugin
```

For ClawHub-ready skills:

- Keep `SKILL.md` metadata accurate.
- Declare required environment variables, tools, permissions, connectors, or network access in the README and skill body.
- Run the dry run or inspect command before making a listing public.
- Link back to the canonical GitHub repo and Open Design PR.
- Keep changelog text honest and versioned.
- Keep `open-design.json` `specVersion` fixed to the spec kit version and bump plugin `version` for every publishable behavior change.

## Safety Checklist

Public skill registries are supply-chain surfaces. Before publishing:

- No hidden install scripts.
- No automatic credential collection.
- No network calls unless the plugin clearly declares why they are needed.
- No destructive shell commands without explicit user confirmation.
- Include `license`, `author`, source URL, version, and changelog.
- Include validation output from `pnpm guard`, plugin manifest validation, and any registry dry run.
- Prefer small example assets over large opaque archives.

## PR Body Snippet

```markdown
## Registry publishing

- Canonical source:
- Open Design PR:
- Open Design specVersion:
- Plugin version:
- Marketplace catalog version:
- skills.sh install:
- ClawHub listing:
- Other registries:

## Registry validation

- `pnpm guard`:
- `pnpm --filter @open-design/plugin-runtime typecheck`:
- `od plugin validate ./path/to/plugin`:
- `npx skills add ... --list`:
- `clawhub skill publish ./path --dry-run` or equivalent:
```

## References

- [skills.sh](https://skills.sh/)
- [skills.sh docs](https://www.skills.sh/docs)
- [skills CLI](https://github.com/vercel-labs/skills)
- [ClawHub](https://clawhub.ai/)
- [ClawHub quickstart](https://github.com/openclaw/clawhub/blob/main/docs/quickstart.md)
- [How ClawHub works](https://documentation.openclaw.ai/clawhub/how-it-works)
