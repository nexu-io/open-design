## What this PR adds

A new Skill — **x-kol-discovery** — at `skills/x-kol-discovery/`.

> 在 X (Twitter) 上穷尽搜索某个产品/项目的自来水推广博主，按统一 rubric 打分分级（A/B/C），写入飞书 Twitter KOLs sheet。

## Why I made it

I do open source DevRel and one of the recurring chores is figuring out who is *already* talking about a project on X — the organic, "self-watering" advocates worth deepening a relationship with. Doing it by hand is slow and the scoring drifts each time. This skill wraps the full loop (exhaustive keyword + handle search → dedupe → rubric scoring A/B/C → write to a Lark sheet) so the output is consistent across runs and across products. I've used it on a few projects and figured it'd be more useful living in OD than in my private skills folder.

## How to try it

1. `cd open-design`
2. Run OD locally: `pnpm tools-dev run web`
3. Open a project, start a chat, and ask: _"帮我在 X 上找一下推广 nexu-io/open-design 的自来水博主，过去 30 天，A/B/C 打分写到飞书表"_

## What's in this PR

- `skills/x-kol-discovery/SKILL.md` — the skill itself (frontmatter + instructions)
- everything else inside `skills/x-kol-discovery/` is referenced from `SKILL.md`

## Checklist

- [x] `SKILL.md` has a `name` and `description` in the frontmatter
- [x] Every relative path in `SKILL.md` resolves
- [x] No path escapes the skill folder
- [ ] Maintainer review

---

👋 This is my first OD contribution. Hi! If anything looks off, tell me what to change and I'll happily push a fixup commit.

If you want to chat (or you're another newcomer reading this and want help shipping your first PR), come hang out in the OD Discord: https://discord.gg/qhbcCH8Am4

_Generated with the `od-contribute` skill._
