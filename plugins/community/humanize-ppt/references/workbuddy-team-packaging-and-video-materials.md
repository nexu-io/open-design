# WorkBuddy/CodeBuddy team packaging and PPT video-material pattern

Use this reference when preparing a Humanize PPT Agent Team for WorkBuddy/CodeBuddy upload or when adding HyperFrames/Remotion output to a PPT workflow.

## Upload package shape

A team upload zip should mirror the `trading-team` style plugin package, not a rendered HTML demo package.

Required root-level entries:

```text
.codebuddy-plugin/plugin.json
setting.json
agents/
rules/
skills/
```

Common optional entries:

```text
avatars/
README.md
.workbuddy-plugin/
settings.json
```

For stricter compatibility, prefer the clean minimal root:

```text
.codebuddy-plugin/
agents/
avatars/
rules/
setting.json
skills/
README.md
```

Do not deliver a zip whose root is mostly `index.html`, `assets/`, `screenshots/`, `source/`, or a rendered deck. That is a demo artifact, not an uploadable team plugin.

## Verification checklist

Before saying a WorkBuddy/CodeBuddy team package is upload-ready, do three checks in this order:

1. Compare the root tree against a known-good team-plugin example, such as `trading-team` style packages. The success criterion is structural compatibility, not visual/demo quality.
2. Inspect the zip root with `unzip -l` or Python. If the root looks like a rendered HTML demo (`index.html`, `assets/`, `screenshots/`, `source/`), stop and rebuild the package as a team plugin.
3. Validate every `plugin.json` reference resolves inside the zip, including agents, skills, and avatars.

Run these checks before saying the package is upload-ready:

```bash
python3 - <<'PY'
from pathlib import Path
import zipfile, json, sys
zp = Path('/path/to/team.zip')
with zipfile.ZipFile(zp) as z:
    names = set(z.namelist())
    roots = sorted(set(n.split('/')[0] for n in names if n))
    print('roots:', roots)

    required_files = ['.codebuddy-plugin/plugin.json', 'setting.json']
    required_dirs = ['agents/', 'rules/', 'skills/']
    missing_required = [p for p in required_files if p not in names]
    missing_required += [d for d in required_dirs if not any(n.startswith(d) for n in names)]

    demo_roots = {'index.html', 'assets', 'screenshots', 'source'}
    if demo_roots.intersection(roots) and not {'.codebuddy-plugin', 'agents', 'rules', 'skills'}.issubset(set(roots)):
        print('looks like rendered demo, not team plugin:', sorted(demo_roots.intersection(roots)))

    plugin = json.loads(z.read('.codebuddy-plugin/plugin.json')) if '.codebuddy-plugin/plugin.json' in names else {}
    missing_refs = []
    for a in plugin.get('agents', []):
        p = a[2:] if a.startswith('./') else a
        if p not in names:
            missing_refs.append(('agent', p))
    for s in plugin.get('skills', []):
        base = (s[2:] if s.startswith('./') else s).rstrip('/') + '/'
        if not any(n.startswith(base) for n in names):
            missing_refs.append(('skill_dir', base))
    for m in plugin.get('members', []):
        avatar = m.get('avatar')
        if avatar and avatar not in names:
            missing_refs.append(('avatar', avatar))
    team_avatar = plugin.get('avatar')
    if team_avatar and team_avatar not in names:
        missing_refs.append(('team_avatar', team_avatar))

    print('missing required:', missing_required or 'OK')
    print('missing refs:', missing_refs or 'OK')
    if missing_required or missing_refs:
        raise SystemExit(1)
PY
```

Also verify size and digest if the file will be shared:

```bash
ls -lh /path/to/team.zip
shasum -a 256 /path/to/team.zip
```

## Scenario rules file

`rules/<plugin-name>_rules.md` should include YAML frontmatter and a `<system_reminder>` block. It should state:

- available lead/member agents;
- bundled skills;
- SOP phases;
- routing rules;
- final delivery requirements;
- pitfalls and hard constraints.

For Humanize PPT teams, include the pitfall below explicitly.

## Video-material pitfall

Do not turn the deck into an empty page that only contains an embedded HyperFrames/Remotion video. That creates a player inside a PPT, not a presentation page.

Use HyperFrames and Remotion as material producers:

- `transition` — short motion bridge between slides or sections;
- `explainer` — 5-15s clip explaining a concept or process;
- `before_after` — visual comparison between raw model output and Humanize PPT output;
- `talking_material` — auxiliary video insert that supports a speaker moment;
- `social_preview` — shareable trailer/card for the deck;
- `fallback_still` — poster image for static/PDF/export contexts.

When a page feels empty, first diagnose the missing material type:

1. explanatory image;
2. flow/process diagram;
3. before/after comparison;
4. screenshot or evidence;
5. transition fragment;
6. short narration clip;
7. fallback still.

Only after this diagnosis choose the producer: GPT image, HyperFrames, Remotion, screenshot capture, or plain HTML/CSS layout.

## Packaging learned pattern

A robust Humanize PPT team package may include both `remotion-video-toolkit` and `hyperframes` in `.codebuddy-plugin/plugin.json` `skills`. The video/motion agent can own both, but its instructions should distinguish responsibilities:

- Remotion: structured explainer clips, timed narration, before/after video materials;
- HyperFrames: HTML motion graphics, transitions, social previews, captioned overlays, slide-to-video adapters.
