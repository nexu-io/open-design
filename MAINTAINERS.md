# Maintainers

<p align="center"><b>English</b> · <a href="MAINTAINERS.pt-BR.md">Português (Brasil)</a> · <a href="MAINTAINERS.de.md">Deutsch</a> · <a href="MAINTAINERS.fr.md">Français</a> · <a href="MAINTAINERS.zh-CN.md">简体中文</a> · <a href="MAINTAINERS.ja-JP.md">日本語</a></p>

This document defines the rules for becoming, serving as, and stepping down from
a Maintainer of `nexu-io/open-design`. The Core Team's individual roster is
maintained internally and is not enumerated here — what matters publicly are
the rules everyone plays by.

> **Status**: v1, drafted 2026-05-11. Companion to [`CONTRIBUTING.md`](CONTRIBUTING.md#becoming-a-maintainer) — that file points contributors here for the full rules.

---

## Roles

| Role | Permissions |
|---|---|
| **Contributor** | Anyone with at least 1 merged PR. No special permissions. |
| **External Maintainer** | A community contributor promoted under the rules below. Can review, approve, close/reopen issues, and self-assign issues. **Cannot click the merge button** — that stays with the Core Team. |
| **Core Team** | Open Design's internal team. Holds full repository write access and is the final authority on governance decisions. Roster maintained internally. |

The rest of this document is about **External Maintainers** unless stated otherwise.

---

## What a Maintainer can do that a Contributor cannot

| Action | Contributor | Maintainer |
|---|:---:|:---:|
| Approve a PR | ⚠️ counts as a comment, **not** as the required approval | ✓ counts as the required approval for merge |
| Close / reopen issues | Only issues they opened themselves | ✓ any issue |
| Self-assign open, unassigned issues (P0 first) | ✗ | ✓ |

### Merge requirements

Any PR — regardless of who authored it — needs **all three** of:

1. No code conflicts.
2. CI fully green.
3. At least one approval from a Maintainer or Core Team member.

A Maintainer's approval is the path most PRs take to merge — it's the most direct way a Maintainer's trust shows up in the project's day-to-day.

---

## How to become a Maintainer

There are **three** entry criteria. All three must be met.

### 1. Contribution volume

- **≥ 20 merged PRs** to `nexu-io/open-design`.

This is a soft floor, not an automatic ticket. Hitting 20 PRs gets you into
consideration; it does not guarantee the role.

### 2. Account quality (anti-sock-puppet, anti-bot)

We check the candidate's GitHub profile against seven dimensions. **Pass at
least 5 of 7 admission lines, and trigger zero veto lines.**

| # | Dimension | Admission line | Veto line |
|---|---|---|---|
| 1 | GitHub account age | ≥ 1 year | < 90 days |
| 2 | Public repos | ≥ 3 | 0 |
| 3 | Followers | ≥ 10 | < 3 |
| 4 | Followers / following ratio | > 0.30 | < 0.05 (typical follow-farm pattern) |
| 5 | Profile completeness | Custom avatar **and** at least one of bio / company / blog / twitter | Default avatar **and** all of bio/company/blog empty |
| 6 | Cross-project activity | At least one merged PR or sustained issue/star activity in **another** public repo | Merged PRs only in this repo |
| 7 | Account standing | No GitHub platform restrictions (spam/banned/restored) | Any of the above |

#### Early-project waiver (auto-expires when repo turns 6 months old)

While `nexu-io/open-design` is younger than six months from initial commit,
the **cross-project activity** veto (#6) may be waived by Core Team consensus
when:

- Dimensions 1, 2, 3, and 5 are clearly above the admission line; **and**
- The candidate's PR quality in this repo is judged high by the Core Team's
  hands-on review.

A waiver must be noted in the Core Team's internal record alongside the
candidate's name and the date. After the repo reaches six months old, this
waiver clause is no longer available.

### 3. Contribution quality (Core Team judgment)

This is qualitative and not formula-based. The Core Team looks at:

- **Code quality** of merged PRs (correctness, scope discipline, repo-boundary respect).
- **Review quality** of any review comments left on others' PRs.
- **Community participation** — Discussions, issue triage, Discord engagement.
- **Collaboration signal** — responsiveness to feedback, willingness to revise.

Passing the first two criteria gets you into the candidate pool. Crossing
this third threshold is what gets you nominated.

### Selection process

1. A Core Team member raises the candidate internally.
2. The Core Team reaches consensus.
3. A Core Team member privately reaches out to confirm the candidate is willing.
4. Onboarding.
5. Public announcement.

There is no nomination PR, no public voting, no fixed term. The intent is
the **inverse of the K8s/Apache approver-vote model** — early in the
project's life, lightweight Core Team consensus moves faster and produces
the same quality of outcome. As the Maintainer cohort grows past five
External Maintainers, this section will be revisited.

---

## Responsibilities and expectations

**There are no hard quotas.** No weekly PR-review count, no minimum
issue-triage rate, no SLA for response time. Maintainership is recognition
of trust, not an unpaid job.

What we ask, in spirit:

- Approve PRs you have the context for; abstain when you don't.
- Honor the merge requirements (§ "Merge requirements") — your approval
  is a real signal, not a rubber stamp.
- Keep `#maintainers` informed if you're going dark for an extended period.
- Treat the not-yet-public roadmap shared in `#maintainers` as confidential.

If the Core Team observes a pattern of bad-case behavior (rubber-stamp
approvals, malicious issue closures, leaking unannounced roadmap, etc.),
permissions are revoked under § "Step-down — for cause".

---

## Maintainer-only access

Beyond the repository permissions listed above, Maintainers receive a few
things the wider community does not:

- **Discord `#maintainers` channel** — a private working space shared with
  the Core Team. Used for design previews, RFC drafts, and internal
  coordination on the not-yet-public part of the roadmap.
- **Confidential roadmap** — early visibility into work that has not yet
  been announced. Maintainers agree to treat its contents as confidential
  until a Core Team member announces them publicly.
- **Direct line to the Core Team** — your `#maintainers` messages get a
  faster, more substantive response than public Discussions, and the Core
  Team genuinely solicits Maintainer input on architectural and roadmap
  decisions.
- **Maintainer badge** — a public mark of trust on your GitHub profile and
  in MAINTAINERS-related repo surfaces (rolling out once the GitHub badge
  capability is in place).
- **Public recognition at promotion** — announcement across Twitter,
  GitHub Discussions, and Discord when you join.

---

## Step-down

Maintainership is not a lifetime appointment. There are three exit paths.

### Graceful step-down (voluntary)

- The Maintainer messages the Core Team or posts in `#maintainers`.
- Permissions are revoked within 24 hours.
- The Maintainer transitions to **Emeritus** status.
- No public reason is required.

### Inactive transition

A Maintainer is considered for inactive transition when **any** of:

- 90 consecutive days with no activity signal (merged PR, review comment,
  issue triage, substantial Discussion or Discord participation), **or**
- 60 consecutive days without responding to any @-mention (PR review
  request, issue assignment).

Process:

1. The Core Team @-mentions the Maintainer privately in `#maintainers`,
   giving a **14-day response window**.
2. If no substantive response within 14 days, the Maintainer transitions
   to Emeritus and permissions are revoked.
3. A short, kind public note is posted in GitHub Discussions: "Thanks for
   your contributions — you've been moved to Emeritus, you're welcome
   back any time."
4. Returning is easy — see "Emeritus" below.

### Step-down for cause

Triggered by:

- Repeated bad-case behavior (e.g., rubber-stamp approvals on
  substandard PRs, malicious issue closures, abuse of permissions).
- Violation of the project's [Code of Conduct][coc].
- Security-grade incidents (compromised account not promptly reported,
  intentional leak of unannounced roadmap, etc.).

Process:

1. Any Core Team member can open the discussion.
2. **At least 3 Core Team members** must agree before action is taken
   (full Core Team consensus is not required).
3. Within 24 hours of the decision: permissions revoked, removed from
   `#maintainers`, removed from any Maintainer roster (does **not**
   transition to Emeritus).
4. The affected person is informed of the decision and reasons, and may
   appeal once.

The principle is **bias toward keeping the Maintainer**. A single small
lapse is not grounds for forced step-down; the for-cause path is for
repeated patterns or severe one-off incidents only.

[coc]: https://www.contributor-covenant.org/

---

## Emeritus

Maintainers who step down gracefully or transition through inactivity become
**Emeritus**. Emeritus status:

- Removes write/approve/close permissions.
- Keeps the person's name acknowledged on the (internal) roster's Emeritus
  section.
- Keeps Discord `#maintainers` access (read or post — Maintainer's choice).
- Carries no ongoing responsibility.

### Returning from Emeritus

The simplest return path: 3 merged PRs in the most recent 30 days, then
the Core Team restores permissions. No re-nomination is required.

The point of Emeritus is to acknowledge that life happens — a sabbatical,
a job change, a kid — without any drama or social cost on either side.

---

## Changes to this document

The rules in this document are amendable by Core Team consensus. Material
changes (admission criteria, step-down thresholds) will be announced in
GitHub Discussions before taking effect for any active candidate. Editorial
clarifications can land directly.
