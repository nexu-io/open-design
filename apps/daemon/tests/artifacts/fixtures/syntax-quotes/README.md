# Quote-repair regression fixtures

`order-stress-r01.sanitized.html` is a privacy-reviewed derivative of the full
generated artifact from the local AMR / OD Next pressure Case
`SYNTAX-ORDER-STRESS-R01`. It retains the complete HTML/JavaScript structure and
all six original syntax-error locations, but is **not byte-identical** to the
historical artifact. Its 12 embedded photographs are replaced by the same tiny
transparent GIF; seed name, phone and residential address are replaced by
explicit synthetic test values. No original photographs or contact values are
included in the committed derivative. Hashes, byte counts, derivation and the
six quote repairs are recorded in `provenance.json`.

The complete original and manually inferred original reference remain local as
`order-stress-r01.original.html` and `order-stress-r01.reference.html`. This
directory's exact `.gitignore` entries prevent these two files from being
included in the PR. Their hashes are retained for local evidence identity; the
provenance does not expose a machine-specific absolute path. Local complete-file
acceptance evidence and committed sanitized-fixture evidence must be reported
separately, especially for file-size-dependent performance comparisons.

`order-stress-r01.sanitized-reference.html` is a **manually inferred** minimal reference,
not a recovered historical correct output and not proof of application behavior.
Four locations replace the mismatched closing quote. Two other locations escape
three pairs of static HTML attribute quotes inside JavaScript string literals.
All inline JavaScript parses strictly after these six local repairs; no artifact
code was executed to create or verify this reference.

The focused test asserts complete-file equality to this reviewed reference.
Separately, controlled-mutation tests start with known-correct source and compare
the restored source plus parsed AST/string values to that independent oracle.
The two kinds of evidence must not be described as equivalent.

`replay.manifest.json` supplies the complete-structure sanitized artifact and
sanitized reference to the local deployed-daemon replay harness. It does not
start a real model, fetch external resources, or establish a natural model-error
frequency. The placeholder images are not suitable for visual acceptance.
It also checks the entire reference as valid/byte-unchanged and an ambiguous
attribute-expression fixture as blocked/byte-unchanged through that same API.

## Explicitly unsupported quote ambiguity

The rule requires agreement with the reported lexical start; it does not guess
backwards across a whole line when later quotes shift that diagnostic. For
example, the broken ternary `flag ? '<b>ready</b>" : '';` remains a rejection
fixture. Its final single quotes shift the lexical start, unlike the actual
historical branch whose false value is the double-quoted empty string.

Likewise, `const value = 'a" + "b";` admits two different parse-valid one-character
repairs with different values. It must be rejected, not resolved by preferring
whichever candidate happens to match a narrower payload heuristic.
