# Native archives

`@open-design/archive` exposes `inspect` and `extract`; the `/build` entry
also exposes `pack`. Inputs and outputs are filesystem paths. Destinations
must not exist; failures remove owned staging directories, not caller data.

Tool selection is explicit `tool: { kind, executable }`, then
`ARCHIVE_7Z_PATH`, then operation-specific `ARCHIVE_ZIP_PATH` or
`ARCHIVE_UNZIP_PATH`, then PATH (`7zz`, `7z`, `zip`/`unzip`). `env`, `signal`
and `timeoutMs` are injectable. Commands use argv, never a shell. Invalid
explicit configuration fails without substitution or installation. Hosts own
bundled executable discovery, including Windows 7z.

`permissions: "portable"` extracts files as 0644, leaving execute grants to
the authenticated caller. Build callers can select `reproducible: true` to
pack a sorted snapshot with normalized timestamps; combined with portable
permissions this removes incidental source file metadata from release inputs.
This does not promise identical compressed bytes across tools or versions.

The initial interchange format is ZIP (stored/deflate, ZIP32, UTF-8 names).
Inspection parses metadata only; native tools perform compression and
decompression. Encrypted, multi-volume, ZIP64, ambiguous paths and special
files are rejected. Extraction bounds emitted bytes, owns destination paths,
and creates validated internal links only after regular files. Links require
`allowInternalLinks`; ZIP packing with links currently requires the `zip`
backend because 7z link preservation has not been established.

7z is a first-class selectable backend, not a platform fallback. The initial
safe extraction adapter starts a process per file; this is not yet the final
high-throughput implementation. Backend/version are returned for observability;
there is no cross-backend byte-identical archive guarantee. Release identity,
cache keys, trust and product-specific size budgets remain caller concerns.
