# Data model

ReasoningOption: id string, label string, optional description string and existing default marker.
AgentModelOption / RuntimeModelOption: existing id/label plus optional
reasoningOptions array and defaultReasoning string. IDs use ASCII letters/digits,
underscore, dot, and hyphen; bounded length; no shell/TOML fragments.

Saved preferences remain { model?, reasoning?, serviceTier? }. No storage migration. A choice
unsupported by the effective model options becomes reasoning: 'default'.

Run request: existing ChatRequest-compatible project/conversation/message/agent/model
fields plus reasoning. Omission delegates to CLI; explicit supported ID is forwarded.
