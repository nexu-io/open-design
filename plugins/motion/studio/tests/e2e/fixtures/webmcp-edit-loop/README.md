# WebMCP edit-loop acceptance fixture

Two nested source files intentionally author the same `id` and `data-hf-id` for their headline.
The browser acceptance test must use the source-safe handle returned by `studio_look`, edit only one
headline, and prove the sibling source stays byte-for-byte unchanged.

The runner copies this fixture to scratch and symlinks that copy into Studio's ignored
`data/projects` directory. It never mutates the checked-in fixture.
