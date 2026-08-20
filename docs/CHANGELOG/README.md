# Release note source contract

Release note content is stored under `docs/CHANGELOG/v<releaseVersion>/<locale>.md`.
The directory name must contain the exact full release version, including its
channel and counter when present. There is no fallback to a base version.

Each locale file must:

- use a canonical BCP 47 locale as its filename, such as `en.md` or `zh-CN.md`;
- be valid UTF-8 Markdown no larger than 1 MiB;
- begin with YAML front matter containing non-empty `title` and `description`
  strings; and
- contain a non-empty Markdown body after the front matter.

The `en` locale is required whenever a release-note directory is supplied.
Stable releases additionally require `zh-CN`. Other channels may omit the
version directory entirely.

`tools-release` retains the front matter in the uploaded file and publishes it
as an immutable object at
`<channel>/versions/<releaseVersion>/release-notes/<locale>.md`. Public release
metadata contains only locale transport descriptors (`url`, `mediaType`,
`sha256`, and `size`); render fields are read from the content itself.
