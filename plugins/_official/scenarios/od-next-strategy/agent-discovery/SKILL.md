---
name: agent-skill-discovery
description: Discover and load the smallest appropriate set of verified Open Design official Skills for an untyped task.
---

# Agent-native Skill Discovery

You own the decision. The lifecycle context includes compact metadata for every official auto-selectable Skill in the pinned catalog. Use the current user request and known conversation context to compare that complete candidate set semantically, then decide whether to reuse, replace, augment, load, or decline a Skill. Do not reduce this decision to literal keyword matching.

Wrong selection is more harmful than a missed selection. When no candidate is clearly appropriate, resolve `none` and continue without a Skill. Ask one material clarification only when the answer would change the task or Skill choice; do not force a nearby candidate merely to complete discovery.

For a clear candidate, call `load` directly with the `id`, `candidateDigest`, catalog revision, and exactly one resolved role from `allowedRoles` in the injected metadata catalog. The daemon revalidates that pinned evidence before returning the full Skill body. Continue the user's work in the same Agent turn after resolution. Load only what the task needs: at most one active primary Skill and at most two distinct auxiliary Skills. Respect candidate roles and conflicts; replace an active primary only through the explicit replacement flow. Current task profiles are primary candidates; specific templates and functional Skills are auxiliary candidates. Choose a task profile for the deliverable and add a specific template only when its purpose and visual language fit the brief. A template's `routingMetadata.taskType` describes its intended parent category; it does not create a task profile absent from this catalog. In particular, document or image templates may fit without an available primary profile. If one or two auxiliaries fit but no primary task profile is appropriate, load the auxiliaries and then call `resolve --none`; here `none` explicitly means “no primary is needed”, not “discard the loaded auxiliaries”. Deactivate an obsolete auxiliary before loading a third one. Its old body may still exist in a continued native context, so treat it as superseded and prefer a cold reconstruction when it conflicts with the new task.

On POSIX shells, use the injected runtime paths (never a bare `od` command):

```bash
"$OD_NODE_BIN" "$OD_BIN" tools skills load --id 'REPLACE_WITH_CANDIDATE_ID' --catalog-revision 'REPLACE_WITH_REVISION' --candidate-digest 'REPLACE_WITH_CANDIDATE_DIGEST' --role primary --purpose-file - --json <<'OD_SKILL_PURPOSE'
Explain briefly why this Skill fits the current task.
OD_SKILL_PURPOSE
"$OD_NODE_BIN" "$OD_BIN" tools skills deactivate --id 'REPLACE_WITH_ACTIVE_AUXILIARY_ID' --reason-file - --json <<'OD_SKILL_DEACTIVATE_REASON'
Explain briefly why this auxiliary no longer applies.
OD_SKILL_DEACTIVATE_REASON
"$OD_NODE_BIN" "$OD_BIN" tools skills resolve --none --reason-file - --json <<'OD_SKILL_NONE_REASON'
Explain briefly why no primary Skill is needed.
OD_SKILL_NONE_REASON
"$OD_NODE_BIN" "$OD_BIN" tools skills resolve --clarify --reason-file - --json <<'OD_SKILL_CLARIFY_REASON'
State the one material choice that is missing.
OD_SKILL_CLARIFY_REASON
```

Replace the quoted `REPLACE_WITH_*` sentinels before running a command. Take the revision and candidate digest only from the injected official metadata catalog for this physical context. For a primary replacement add `--replace 'REPLACE_WITH_ACTIVE_PRIMARY_ID'` and replace that sentinel too. Use `tools skills status --json` to inspect durable state and `tools skills status --rehydrate --json` after a cold reconstruction.

A successful load returns a strategy-neutral v1 profile and, when the Skill has side files, a daemon-verified `materializedRoot` below `.od-skills/` plus a digest roster. Read or execute side files only through that returned relative root. Resource bytes are intentionally not copied into the model response. A discovered task profile does not activate OD Next v2 and does not authorize you to invent OD Next stages or contract objects.

Treat website creation as Prototype work. Requests such as “帮我做一个官网”, a landing page, a web app, a product website, or an interactive mobile prototype are positive Prototype cases. Requests that only analyze, summarize, explain, or write requirements for a website are not automatically Prototype work.

Before the current task has a successful primary `load`, an exact reusable primary, or `resolve --none`, do not begin any task-dependent operation that changes project files, generates media, applies assets, calls a write-capable connector, or otherwise creates an external side effect. An auxiliary-only `load` does not finish resolution by itself. Read-only discovery and the minimum read-only inspection needed to choose safely are allowed.

On later turns, decide for yourself whether the task has changed enough to re-check the catalog metadata, reuse the current resolution, replace or augment it, resolve none, or clarify. The host does not require a fresh classifier or a discovery call on every turn.
