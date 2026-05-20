# Blog traffic digest

Daily Search Console snapshot for posts on https://open-design.ai/blog/.
Refreshed by [`.github/workflows/blog-3day-report.yml`](../.github/workflows/blog-3day-report.yml)
once per day at 10:00 Asia/Shanghai.

How to read this file:

- **T-3 spotlight** lists posts published exactly three days ago. At
  T-3 the question we care about is "did Google pick it up at all" —
  so the table also shows the current URL Inspection coverage state.
- **Rolling 30-day cohort** lists every post 1–30 days old with its
  latest 3-day Search Analytics window. Sort order is impressions
  descending. This is where you spot the long-tail winners.
- GSC Search Analytics lags by ~2 days; the script clamps each
  window to end at `today − 2` so figures are stable across runs.

The file keeps the most recent 30 dated sections; older
entries are pruned automatically. Use `git log` on this file for
deeper history.

---

_No digests yet. The first run of `.github/workflows/blog-3day-report.yml`
will prepend a dated section above this line._
