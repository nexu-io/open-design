# Security and Privacy

This package is a non-official Claude / Anthropic style design-system bundle for Open Design.

## What Is Included

- Publicly reachable website/CSS evidence from Anthropic and Claude pages.
- Preserved public webfont, favicon/icon, and imagery assets referenced by sampled public pages.
- Local HTML/CSS examples, token files, manifests, and provenance notes.

## What Must Not Be Included

- API keys, bearer tokens, cookies, session IDs, provider credentials, or private headers.
- Personal absolute paths in public manifests or documentation.
- Screenshots or files containing private customer/project data.
- Generated secrets or local app configuration state.

## Local Registry Installation

`scripts/install-as-agent-skill.sh` requires `AGENT_SKILLS_ROOT` to be set explicitly. This avoids publishing a maintainer-specific Obsidian or agent-skills path.

The generated registry entry is a small stub with a `design-system` symlink back to this Open Design package. Do not copy the entire package into a second editable source.

## Asset Boundary

The `fonts/`, `logos/`, and `imagery/` folders contain public-source assets saved for provenance and local design-system use. The package does not claim ownership of Anthropic marks, fonts, or imagery. Do not use these assets to imply endorsement or to fabricate a full wordmark that was not present in the sampled sources.

## Reporting Issues

Before contributing or publishing a derivative package, run a text scan for:

- `AGENT_SKILLS_ROOT`
- `/Users/`
- `/tmp/`
- `Bearer`
- `api_key`
- `secret`
- `password`

If any hit is not an intentional public documentation example, remove or redact it before distribution.
