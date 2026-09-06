/**
 * Grounding exemptions, matched at a NAME-SEGMENT boundary.
 *
 * An exemption names the parts a grounding rule must not apply to — a bedded
 * rock, a wall-mounted bracket, a skybox. It is meant to cover a family by
 * prefix (`mount_` covers `mount_bracket`, `mount_bolt`), but a plain
 * `startsWith` also let a bare prefix leak across word boundaries: `mount`
 * exempted `mountain_rock`, `cart` exempted `cartridge`. That silently turned
 * a real floating/sinking part into an exempt one.
 *
 * A match now requires either an exact name, an entry that already ends at a
 * separator (`mount_`), or a separator immediately after the entry in the name
 * (`mount` still covers `mount_bracket` but not `mountain`). Separators are
 * the tokens the naming convention itself uses: `.`, `_`, `-`.
 *
 * Shared by lintWorld (SUNK/NOT_GROUNDED) and lintClaims (the `grounded`
 * claim) so the two grounding authorities never disagree about who is exempt.
 */
export function isExempt(name: string, exempt: readonly string[]): boolean {
  return exempt.some((entry) => {
    if (entry.length === 0) return false;
    if (name === entry) return true;
    if (!name.startsWith(entry)) return false;
    // Boundary check: the entry ends at a separator, or the character it stops
    // before in the name is one. Otherwise `mount` would still match
    // `mountain`.
    return /[._-]$/.test(entry) || /[._-]/.test(name.charAt(entry.length));
  });
}
