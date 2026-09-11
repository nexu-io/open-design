# Research decisions

- Installed CLI catalogue is authoritative. `codex debug models` already exists in
  the adapter (PR #2082); it returns supported_reasoning_levels and
  default_reasoning_level. Local CLI 0.153.4 advertises xhigh/max/ultra for Sol/Astra.
- PR #4287 provides the model-owned service-tier metadata precedent. This checkout
  predates it, so copy the architectural pattern without cherry-picking unrelated work.
- Codex App Server model/list supports the same concept, but changing transport is
  unnecessary for this feature. OpenAI REST model objects do not enumerate efforts.
- Use arbitrary syntax-valid IDs advertised by the runtime. A global max/ultra enum
  would recreate the bug for future names. Descriptions are plain text, never HTML.
- Omitted metadata means compatibility fallback; a valid explicit empty list means
  no explicit efforts. All-malformed nonempty lists mean unavailable metadata.
- Preserve CLI Default delegation rather than forcing advertised defaults.

Sources: https://github.com/nexu-io/open-design/pull/2082,
https://github.com/nexu-io/open-design/pull/4287,
https://learn.chatgpt.com/docs/app-server#list-models-modellist,
https://developers.openai.com/api/reference/resources/models/methods/retrieve.
