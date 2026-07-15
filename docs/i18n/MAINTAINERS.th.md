# Maintainers

<p align="center"><a href="../../MAINTAINERS.md">English</a> · <a href="MAINTAINERS.pt-BR.md">Português (Brasil)</a> · <a href="MAINTAINERS.de.md">Deutsch</a> · <a href="MAINTAINERS.fr.md">Français</a> · <a href="MAINTAINERS.zh-CN.md">简体中文</a> · <a href="MAINTAINERS.ja-JP.md">日本語</a> · <a href="MAINTAINERS.ko.md">한국어</a> · <b>ภาษาไทย</b></p>

เอกสารนี้กำหนดกติกาสำหรับการเป็น, การทำหน้าที่ และการ step down จากบทบาท Maintainer ของ `nexu-io/open-design`. รายชื่อรายบุคคลของ Core Team ถูก maintain ภายในและไม่ได้ enumerate ไว้ที่นี่ — สิ่งที่สำคัญต่อสาธารณะคือกติกาที่ทุกคนเล่นตาม.

> **Status**: v1, drafted 2026-05-11. เป็น companion ของ [`CONTRIBUTING.th.md`](CONTRIBUTING.th.md#becoming-a-maintainer) — ไฟล์นั้นชี้ contributors มาที่นี่เพื่อดูกติกาเต็ม.

---

## Roles

| Role | Permissions |
|---|---|
| **Contributor** | ใครก็ตามที่มี merged PR อย่างน้อย 1 รายการ. ไม่มีสิทธิ์พิเศษ. |
| **External Maintainer** | Community contributor ที่ได้รับ promotion ตามกติกาด้านล่าง. Review, approve, close/reopen issues และ self-assign issues ได้. **กด merge button ไม่ได้** — สิทธินั้นอยู่กับ Core Team. |
| **Core Team** | ทีมภายในของ Open Design. ถือ repository write access เต็มและเป็น final authority สำหรับ governance decisions. Roster maintain ภายใน. |

ส่วนที่เหลือของเอกสารนี้พูดถึง **External Maintainers** เว้นแต่ระบุไว้เป็นอย่างอื่น.

---

## Maintainer ทำอะไรได้ที่ Contributor ทำไม่ได้

| Action | Contributor | Maintainer |
|---|:---:|:---:|
| Approve PR | ⚠️ นับเป็น comment, **ไม่** นับเป็น required approval | ✓ นับเป็น required approval สำหรับ merge |
| Close / reopen issues | เฉพาะ issues ที่ตนเปิดเอง | ✓ issue ใดก็ได้ |
| Self-assign open, unassigned issues (P0 first) | ✗ | ✓ |

### Merge requirements

PR ใด ๆ — ไม่ว่าใครเป็น author — ต้องมีครบ **ทั้งสามข้อ**:

1. ไม่มี code conflicts.
2. CI green ครบ.
3. มี approval อย่างน้อยหนึ่งรายการจาก Maintainer หรือ Core Team member.

Approval ของ Maintainer คือ path ที่ PR ส่วนใหญ่ใช้เพื่อ merge — เป็นวิธีตรงที่สุดที่ trust ของ Maintainer ปรากฏในงาน day-to-day ของ project.

---

## จะเป็น Maintainer ได้อย่างไร

มี entry criteria **สามข้อ**. ต้องผ่านทั้งสามข้อ.

### 1. Contribution volume

- **≥ 20 merged PRs** ไปยัง `nexu-io/open-design`.

นี่เป็น soft floor ไม่ใช่ตั๋วอัตโนมัติ. แตะ 20 PRs แล้วเข้าสู่การพิจารณา; ไม่ได้ guarantee role.

### 2. Account quality (anti-sock-puppet, anti-bot)

เราตรวจ GitHub profile ของ candidate ตามเจ็ดมิติ. **ต้องผ่าน admission lines อย่างน้อย 5 จาก 7 และ trigger veto lines เป็นศูนย์.**

| # | Dimension | Admission line | Veto line |
|---|---|---|---|
| 1 | GitHub account age | ≥ 1 year | < 90 days |
| 2 | Public repos | ≥ 3 | 0 |
| 3 | Followers | ≥ 10 | < 3 |
| 4 | Followers / following ratio | > 0.30 | < 0.05 (pattern แบบ follow-farm ทั่วไป) |
| 5 | Profile completeness | Custom avatar **และ** อย่างน้อยหนึ่งอย่างจาก bio / company / blog / twitter | Default avatar **และ** bio/company/blog ว่างทั้งหมด |
| 6 | Cross-project activity | มี merged PR อย่างน้อยหนึ่งรายการ หรือ sustained issue/star activity ใน public repo **อื่น** | Merged PRs อยู่เฉพาะใน repo นี้ |
| 7 | Account standing | ไม่มี GitHub platform restrictions (spam/banned/restored) | มีข้อใดข้อหนึ่งข้างต้น |

#### Early-project waiver (auto-expires เมื่อ repo อายุครบ 6 เดือน)

ขณะที่ `nexu-io/open-design` ยังอายุน้อยกว่าหกเดือนจาก initial commit, veto ด้าน **cross-project activity** (#6) อาจ waive ได้โดย Core Team consensus เมื่อ:

- Dimensions 1, 2, 3 และ 5 สูงกว่า admission line อย่างชัดเจน; **และ**
- Core Team judge ว่า PR quality ของ candidate ใน repo นี้สูงจาก hands-on review.

Waiver ต้องถูก note ใน internal record ของ Core Team พร้อมชื่อ candidate และวันที่. หลัง repo อายุครบหกเดือน clause นี้จะใช้ไม่ได้อีก.

### 3. Contribution quality (Core Team judgment)

ข้อนี้เป็น qualitative และไม่ได้ใช้ formula. Core Team ดูจาก:

- **Code quality** ของ merged PRs (correctness, scope discipline, repo-boundary respect).
- **Review quality** ของ review comments ที่ฝากไว้ใน PR ของคนอื่น.
- **Community participation** — Discussions, issue triage, Discord engagement.
- **Collaboration signal** — responsiveness ต่อ feedback, willingness to revise.

ผ่านสอง criteria แรกแล้วจะเข้าสู่ candidate pool. การข้าม threshold ที่สามนี้คือสิ่งที่ทำให้คุณถูก nominate.

### Selection process

1. Core Team member คนหนึ่ง raise candidate ภายใน.
2. Core Team reaches consensus.
3. Core Team member ติดต่อเป็นการส่วนตัวเพื่อ confirm ว่า candidate willing.
4. Onboarding.
5. Public announcement.

ไม่มี nomination PR, ไม่มี public voting, ไม่มี fixed term. Intent คือ **ตรงข้ามกับ K8s/Apache approver-vote model** — ในช่วงต้นของ project, lightweight Core Team consensus เดินเร็วกว่าและให้ outcome quality แบบเดียวกัน. เมื่อ Maintainer cohort โตเกิน External Maintainers ห้าคน section นี้จะถูก revisit.

---

## Responsibilities and expectations

**ไม่มี hard quotas.** ไม่มี weekly PR-review count, ไม่มี minimum issue-triage rate, ไม่มี SLA สำหรับ response time. Maintainership คือ recognition of trust ไม่ใช่งาน unpaid.

สิ่งที่เราขอในเชิง spirit:

- Approve PRs ที่คุณมี context; abstain เมื่อไม่มี.
- เคารพ merge requirements (§ "Merge requirements") — approval ของคุณคือ signal จริง ไม่ใช่ rubber stamp.
- แจ้ง `#maintainers` ถ้าคุณจะหายไปนาน.
- Treat roadmap ที่ยังไม่ public และแชร์ใน `#maintainers` เป็น confidential.

ถ้า Core Team เห็น pattern ของ bad-case behavior (rubber-stamp approvals, malicious issue closures, leaking unannounced roadmap ฯลฯ), permissions จะถูก revoke ตาม § "Step-down — for cause".

---

## Maintainer-only access

นอกจาก repository permissions ที่ลิสต์ไว้ข้างบน Maintainers จะได้บางอย่างที่ wider community ไม่ได้:

- **Discord `#maintainers` channel** — private working space ที่ใช้ร่วมกับ Core Team. ใช้สำหรับ design previews, RFC drafts และ internal coordination ใน roadmap ส่วนที่ยังไม่ public.
- **Confidential roadmap** — เห็นงานที่ยังไม่ announce เร็วกว่าคนอื่น. Maintainers ตกลงว่าจะรักษา contents เป็น confidential จนกว่า Core Team member จะ announce ต่อสาธารณะ.
- **Direct line to the Core Team** — messages ของคุณใน `#maintainers` จะได้ response ที่เร็วและ substantive กว่า public Discussions และ Core Team ตั้งใจ solicit Maintainer input ใน architectural และ roadmap decisions จริง ๆ.
- **Maintainer badge** — public mark of trust บน GitHub profile ของคุณและใน MAINTAINERS-related repo surfaces (จะ rollout เมื่อ GitHub badge capability พร้อม).
- **Public recognition at promotion** — announcement ผ่าน Twitter, GitHub Discussions และ Discord เมื่อคุณเข้าร่วม.

---

## Step-down

Maintainership ไม่ใช่ lifetime appointment. มี exit paths สามทาง.

### Graceful step-down (voluntary)

- Maintainer message หา Core Team หรือ post ใน `#maintainers`.
- Permissions revoked ภายใน 24 ชั่วโมง.
- Maintainer transition เป็น **Emeritus** status.
- ไม่ต้องมี public reason.

### Inactive transition

Maintainer จะถูกพิจารณา inactive transition เมื่อมี **ข้อใดข้อหนึ่ง**:

- 90 consecutive days โดยไม่มี activity signal (merged PR, review comment, issue triage, substantial Discussion หรือ Discord participation), **หรือ**
- 60 consecutive days โดยไม่ตอบ @-mention ใด ๆ (PR review request, issue assignment).

Process:

1. Core Team @-mention Maintainer เป็นการส่วนตัวใน `#maintainers`, ให้ **14-day response window**.
2. ถ้าไม่มี substantive response ภายใน 14 วัน, Maintainer transition เป็น Emeritus และ permissions ถูก revoke.
3. Post public note สั้น ๆ และสุภาพใน GitHub Discussions: "Thanks for your contributions — you've been moved to Emeritus, you're welcome back any time."
4. การกลับมาทำได้ง่าย — ดู "Emeritus" ด้านล่าง.

### Step-down for cause

Triggered by:

- Repeated bad-case behavior (เช่น rubber-stamp approvals บน PRs ที่ substandard, malicious issue closures, abuse of permissions).
- Violation of project's [Code of Conduct][coc].
- Security-grade incidents (compromised account ที่ไม่ report ทันที, ตั้งใจ leak unannounced roadmap ฯลฯ).

Process:

1. Core Team member คนใดก็เปิด discussion ได้.
2. **Core Team members อย่างน้อย 3 คน** ต้อง agree ก่อน action (ไม่จำเป็นต้อง full Core Team consensus).
3. ภายใน 24 ชั่วโมงหลัง decision: permissions revoked, removed from `#maintainers`, removed from Maintainer roster ใด ๆ (จะ **ไม่** transition เป็น Emeritus).
4. แจ้ง affected person ถึง decision และ reasons และ appeal ได้หนึ่งครั้ง.

Principle คือ **bias toward keeping the Maintainer**. Lapse เล็กครั้งเดียวไม่ใช่ grounds สำหรับ forced step-down; path for-cause มีไว้สำหรับ repeated patterns หรือ severe one-off incidents เท่านั้น.

[coc]: https://www.contributor-covenant.org/

---

## Emeritus

Maintainers ที่ step down อย่าง graceful หรือ transition เพราะ inactivity จะเป็น **Emeritus**. Emeritus status:

- เอา write/approve/close permissions ออก.
- เก็บชื่อของบุคคลนั้นไว้ใน section Emeritus ของ roster (internal).
- เก็บ Discord `#maintainers` access ไว้ (อ่านหรือ post — ตามที่ Maintainer เลือก).
- ไม่มี ongoing responsibility.

### Returning from Emeritus

Path กลับที่ง่ายที่สุด: 3 merged PRs ใน 30 วันที่ผ่านมา แล้ว Core Team restore permissions. ไม่ต้อง re-nomination.

Point ของ Emeritus คือ acknowledge ว่าชีวิตเกิดขึ้นได้ — sabbatical, job change, kid — โดยไม่มี drama หรือ social cost ทั้งสองฝั่ง.

---

## Changes to this document

กติกาในเอกสารนี้ amend ได้โดย Core Team consensus. Material changes (admission criteria, step-down thresholds) จะ announce ใน GitHub Discussions ก่อนมีผลกับ active candidate ใด ๆ. Editorial clarifications land ได้โดยตรง.
