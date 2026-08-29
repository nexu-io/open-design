# OD Next Task Profile Mapping v2.0.0

Use explicit project metadata before interpreting free-form text.

| Task type | Project kind | Profile | Rollout content state |
| --- | --- | --- | --- |
| `prototype` | `prototype` | `../assets/task-profiles/prototype.md` | active |
| `ppt` | `deck` | `../assets/task-profiles/ppt.md` | active |
| `marketing` | `image` or explicit marketing metadata | `../assets/task-profiles/marketing.md` | active |
| `hyperframes` | `video` with HyperFrames metadata | `../assets/task-profiles/hyperframes.md` | active |

If metadata cannot identify one profile reliably, use task type `generic` when
the generic contract is sufficient. Otherwise report blocked with the missing
mapping fact. Never select the nearest specialist profile by guesswork.

Content state describes packaged profile readiness only. It does not activate
the scenario or override daemon rollout policy.
