# update_spec.py

> Architecture rationale (why narrow scope, why no backups, the spec_lock as execution contract): see [docs/technical-design.md "Spec Propagation"](../../../../docs/technical-design.md#spec-propagation-spec_lockmd-as-execution-contract).

Propagate a `spec_lock.md` value change to both the lock file and every `svg_output/*.svg`. The single edit surface for bulk style tweaks after generation.

## Usage

```bash
python3 skills/ppt-master/scripts/update_spec.py <project_path> <section>.<key>=<value>
```

Bare `<key>=<value>` (no dot) is treated as `colors.<key>=<value>` for backward compat.

One invocation = one change. The tool:

1. Reads the old value from `<project_path>/spec_lock.md`
2. Writes the new value into `spec_lock.md`
3. Propagates the change into every `.svg` under `svg_output/`
4. Prints the list of files touched

## Examples

```bash
# swap the primary color deck-wide (bare key → colors.primary)
python3 skills/ppt-master/scripts/update_spec.py projects/acme_ppt169_20260301 primary=#0066AA

# explicit section.key form
python3 skills/ppt-master/scripts/update_spec.py projects/acme_ppt169_20260301 colors.accent=#FF6B35

# change the deck-wide font family
python3 skills/ppt-master/scripts/update_spec.py projects/acme_ppt169_20260301 \
  'typography.font_family="Inter", Arial, sans-serif'
```

## v2 scope

- **Supported**:
  - `colors.*` — HEX value replacement across `svg_output/*.svg` (case-insensitive).
  - `typography.font_family` — replaces the inner value of every `font-family="..."` / `font-family='...'` attribute.
- **Not supported**: typography sizes, icons, images, canvas, forbidden — these involve attribute-scoped or semantic replacements whose risk/benefit does not warrant bulk propagation. Edit `spec_lock.md` and the affected SVGs by hand, or re-author the pages.

## When to use

- "Change the primary color across the whole deck" → one `update_spec.py` call
- "Switch the deck-wide font family" → one `update_spec.py` call
- "Switch an individual page's accent" → just edit that page's SVG directly
- "Re-design the palette / type system" → update `spec_lock.md` manually, then the Executor can regenerate affected pages

## Safety

- HEX values (e.g. `#005587`) are unique enough in SVG content that literal replacement is safe
- `font-family` substitution is scoped to the attribute; the outer quote character is preserved, and switched automatically if the new value contains the same quote
- The tool refuses non-HEX inputs, unknown keys, and unsupported sections
- No backups are created — the project folder should be under git so you can diff / revert

### Note on first `font-family` update

The script writes the `spec_lock.md` value verbatim into every SVG's `font-family` attribute. If the Executor generated SVGs with quote-flattened font names (e.g. `font-family="Microsoft YaHei, Arial, sans-serif"`) while `spec_lock.md` holds the quoted form (`"Microsoft YaHei", Arial, sans-serif`), the **first** substitution will normalize every SVG to match the `spec_lock.md` literal (e.g. `font-family='"Microsoft YaHei", Arial, sans-serif'`). The two forms are semantically equivalent (CSS and DrawingML parse them identically), but the normalization produces byte-level diffs across every SVG that contains text. Subsequent updates only touch files where the value actually changes.
