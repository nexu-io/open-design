# Skills

A skill is the atomic unit of design capability in Open Design — one folder, one `SKILL.md`, optional `assets/` and `references/`. The daemon scans this directory at startup; drop a folder in, restart, and the picker shows it.

## Adding a new skill

→ **[`docs/skills-contributing.md`](../docs/skills-contributing.md)** — the contributor guide. Quick start, anatomy, local dev loop, merge bar, PR template, and common rejection patterns.

→ **[`docs/skills-protocol.md`](../docs/skills-protocol.md)** — the protocol spec. Frontmatter grammar, discovery rules, mode semantics.

The fastest path is to copy the existing skill closest to your idea, edit `SKILL.md` and `example.html`, and read the contributor guide before opening the PR. We're picky about skills because they're the user-facing surface — the merge bar is real and the contributor guide makes it explicit.

## Skills that already ship

The `mode` and `featured` flags in each skill's `SKILL.md` decide where it shows up in the picker. The list below is a quick orientation; for a curated set of "imitate this if you're starting from scratch" skills, see the **References** section in [`docs/skills-contributing.md`](../docs/skills-contributing.md).

```bash
# Browse the registry from the CLI:
ls skills/
# 54+ skills across prototype, deck, template, design-system, image, video, and audio modes
```

## License

Skills in this directory are Apache-2.0 unless their own `LICENSE` says otherwise. The most notable exception is [`skills/guizang-ppt/`](guizang-ppt/), bundled verbatim from [op7418/guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill) under MIT.
