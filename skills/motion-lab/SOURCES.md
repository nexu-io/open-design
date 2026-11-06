# Source and adaptation

- Upstream: https://github.com/yangxu128/Motion.Lab/tree/fbfda036aadbc1b46547bce8a7a57ec12bf73485
- Commit: `fbfda036aadbc1b46547bce8a7a57ec12bf73485`
- License: MIT; see LICENSE.

## Open Design changes

- The upstream README declares MIT; this checkout has no separate LICENSE file. Preserved the declaration URL and contributor attribution in LICENSE.
- Adapted the workflow from lib/skill.ts; exported all 160 records from data/effects.ts into an index and four category references. IDs, descriptions, parameters and HTML/CSS/JS snippets retain upstream values.
- Split the generated monolithic skill into lazily read files; added host, lifecycle, dependency and accessibility guidance.
- Omitted the Next.js application, preview React components, site assets and public hosting assumptions.
