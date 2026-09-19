// Startup splash artwork: the SAME pixel-scan wordmark the Home hero runs
// (apps/web/src/components/home-hero/pixel-scan/engine.ts), ported to plain
// WebGL so it can render in the splash window.
//
// Why a port instead of importing the web one: the splash is shown BEFORE the
// web sidecar boots, so there is no HTTP origin to load a bundle, `three`, or
// the logo SVG from — everything here has to be inlined into the main-process
// HTML string. The web engine only uses `three` as a fullscreen-quad wrapper
// (one RawShaderMaterial), so the port is the same shader verbatim plus ~80
// lines of raw GL setup.
//
// The fragment/vertex shaders below are COPIED from that engine — keep them in
// sync when the effect changes there (regenerate with the snippet in
// `scripts/` or by hand; they are pasted verbatim, no edits).
//
// Differences from the Home hero, all deliberate:
//   • no pointer interaction (nothing to hover on a splash) — the cursor
//     uniforms stay parked off-canvas and the trail weights stay 0;
//   • the entrance sweep LOOPS (sweep → hold on the assembled logo → sweep
//     again) instead of running once, because the splash has to keep moving
//     for however long the boot takes;
//   • a 2D static-logo fallback if WebGL is unavailable, so the splash always
//     shows the wordmark.

/** `apps/web/public/logo-scan.svg`, inlined (the splash has no server). */
export const SPLASH_LOGO_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTcwNSIgaGVpZ2h0PSIyOTEiIHZpZXdCb3g9IjAgMCAxNzA1IDI5MSIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwXzEzODlfNTc0KSI+CjxwYXRoIGQ9Ik0xMDM0LjAxIDMwLjA5OTlDMTA1My4zNyAzMC4wOTk5IDEwNzAuMDggMzMuNzgzNiAxMDg0LjEzIDQxLjE1MUMxMDk4LjM1IDQ4LjUxODMgMTEwOS4zMSA1OS4wNTUzIDExMTcuMDIgNzIuNzYxOUMxMTI0LjkgODYuMjk3MyAxMTI4Ljg0IDEwMi4zMTcgMTEyOC44NCAxMjAuODIxQzExMjguODQgMTM5LjE1NCAxMTI0LjkgMTU1LjAwMiAxMTE3LjAyIDE2OC4zNjZDMTEwOS4zMSAxODEuNzMgMTA5OC4zNSAxOTIuMDEgMTA4NC4xMyAxOTkuMjA2QzEwNzAuMDggMjA2LjQwMiAxMDUzLjM3IDIxMCAxMDM0LjAxIDIxMEg5NjkuNzYxVjMwLjA5OTlIMTAzNC4wMVpNMTAzNC4wMSAxODQuNTU3QzEwNTQuNTcgMTg0LjU1NyAxMDcwLjMzIDE3OC45ODkgMTA4MS4zIDE2Ny44NTJDMTA5Mi40NCAxNTYuNTQ0IDEwOTggMTQwLjg2NyAxMDk4IDEyMC44MjFDMTA5OCAxMDAuNjA0IDEwOTIuNDQgODQuNjY5NiAxMDgxLjMgNzMuMDE4OUMxMDcwLjMzIDYxLjM2ODMgMTA1NC41NyA1NS41NDMgMTAzNC4wMSA1NS41NDNIMTAwMC4zNFYxODQuNTU3SDEwMzQuMDFaIiBmaWxsPSIjMjAyMDIwIi8+CjxwYXRoIGQ9Ik0xMjA4Ljc5IDIxMS43OTlDMTE5NS45NCAyMTEuNzk5IDExODQuNjMgMjA4Ljk3MiAxMTc0Ljg2IDIwMy4zMThDMTE2NS4yNyAxOTcuNjY0IDExNTcuNzMgMTg5Ljc4MyAxMTUyLjI1IDE3OS42NzRDMTE0Ni45NCAxNjkuNTY1IDExNDQuMjggMTU3LjkxNSAxMTQ0LjI4IDE0NC43MjJDMTE0NC4yOCAxMzIuMjE1IDExNDYuOTQgMTIxLjA3OCAxMTUyLjI1IDExMS4zMTJDMTE1Ny41NiAxMDEuNTQ2IDExNjQuOTMgOTMuODM2IDExNzQuMzUgODguMTgyQzExODMuNzcgODIuNTI4IDExOTQuNDggNzkuNzAxIDEyMDYuNDcgNzkuNzAxQzEyMTguNjQgNzkuNzAxIDEyMjkuMzUgODIuMzU2NiAxMjM4LjYgODcuNjY4QzEyNDcuODUgOTIuOTc5MyAxMjU1LjA1IDEwMC40MzIgMTI2MC4xOSAxMTAuMDI3QzEyNjUuNSAxMTkuNDUgMTI2OC4xNSAxMzAuNDE2IDEyNjguMTUgMTQyLjkyM0MxMjY4LjE1IDE0NC45NzkgMTI2OC4wNyAxNDcuMjA2IDEyNjcuOSAxNDkuNjA1QzEyNjcuNzMgMTUxLjgzMiAxMjY3LjQ3IDE1NC4yMzEgMTI2Ny4xMyAxNTYuODAxSDExNzUuNjNDMTE3Ni40OSAxNjIuNzk4IDExNzguMzggMTY4LjAyMyAxMTgxLjI5IDE3Mi40NzhDMTE4NC4zNyAxNzYuNzYxIDExODguMjMgMTgwLjEwMiAxMTkyLjg1IDE4Mi41MDFDMTE5Ny40OCAxODQuOSAxMjAyLjc5IDE4Ni4wOTkgMTIwOC43OSAxODYuMDk5QzEyMTUuOTggMTg2LjA5OSAxMjIyLjQxIDE4NC42NDMgMTIyOC4wNiAxODEuNzNDMTIzMy44OSAxNzguODE3IDEyMzcuOTEgMTc0Ljk2MiAxMjQwLjE0IDE3MC4xNjVMMTI2NS41OCAxNzguNjQ2QzEyNjAuNDQgMTg4LjkyNiAxMjUyLjgyIDE5Ny4wNjQgMTI0Mi43MSAyMDMuMDYxQzEyMzIuNiAyMDguODg2IDEyMjEuMjkgMjExLjc5OSAxMjA4Ljc5IDIxMS43OTlaTTEyMzYuNTQgMTMzLjE1N0MxMjM2LjM3IDEyNy44NDYgMTIzNC45MiAxMjMuMDQ4IDEyMzIuMTcgMTE4Ljc2NUMxMjI5LjQzIDExNC40ODIgMTIyNS44MyAxMTEuMTQxIDEyMjEuMzggMTA4Ljc0MkMxMjE2LjkzIDEwNi4xNzIgMTIxMS45NiAxMDQuODg3IDEyMDYuNDcgMTA0Ljg4N0MxMjAxLjY4IDEwNC44ODcgMTE5Ny4xNCAxMDYuMDg2IDExOTIuODUgMTA4LjQ4NUMxMTg4LjU3IDExMC44ODQgMTE4NC44OSAxMTQuMjI1IDExODEuOCAxMTguNTA4QzExNzguODkgMTIyLjYyIDExNzcgMTI3LjUwMyAxMTc2LjE1IDEzMy4xNTdIMTIzNi41NFoiIGZpbGw9IiMyMDIwMjAiLz4KPHBhdGggZD0iTTEzMDYuNzIgMTY4LjYyM0MxMzA3LjkyIDE3My40MiAxMzA5Ljk4IDE3Ny4xMDQgMTMxMi44OSAxNzkuNjc0QzEzMTUuOTcgMTgyLjI0NCAxMzE5LjMyIDE4NC4wNDMgMTMyMi45MSAxODUuMDcxQzEzMjYuNTEgMTg1LjkyOCAxMzI5Ljk0IDE4Ni4zNTYgMTMzMy4xOSAxODYuMzU2QzEzMzkuODggMTg2LjM1NiAxMzQ1LjEgMTg1LjA3MSAxMzQ4Ljg3IDE4Mi41MDFDMTM1Mi44MSAxNzkuNzYgMTM1NC43OCAxNzYuMzMzIDEzNTQuNzggMTcyLjIyMUMxMzU0Ljc4IDE2OC43OTQgMTM1My41IDE2Ni4xMzkgMTM1MC45MyAxNjQuMjU0QzEzNDguMzYgMTYyLjM2OSAxMzQ1LjAyIDE2MC45MTMgMTM0MC45IDE1OS44ODVDMTMzNi45NiAxNTguNjg2IDEzMzIuODUgMTU3LjQ4NiAxMzI4LjU3IDE1Ni4yODdDMTMyMy45NCAxNTUuMDg4IDEzMTguOTcgMTUzLjcxNyAxMzEzLjY2IDE1Mi4xNzVDMTMwOC41MiAxNTAuNjMzIDEzMDMuNjQgMTQ4LjQ5MSAxMjk5LjAxIDE0NS43NUMxMjk0LjM5IDE0My4wMDkgMTI5MC42MiAxMzkuNDk2IDEyODcuNyAxMzUuMjEzQzEyODQuNzkgMTMwLjkzIDEyODMuMzQgMTI1LjYxOCAxMjgzLjM0IDExOS4yNzlDMTI4My4zNCAxMTEuMjI2IDEyODUuNTYgMTA0LjI4NyAxMjkwLjAyIDk4LjQ2MkMxMjk0LjQ3IDkyLjQ2NTMgMTMwMC41NSA4Ny44MzkzIDEzMDguMjYgODQuNTg0QzEzMTUuOTcgODEuMzI4NiAxMzI0LjYzIDc5LjcwMSAxMzM0LjIyIDc5LjcwMUMxMzQ1LjcgNzkuNzAxIDEzNTUuNjQgODIuMDk5NiAxMzY0LjAzIDg2Ljg5N0MxMzcyLjQzIDkxLjY5NDMgMTM3OC41MSA5OC43MTkgMTM4Mi4yOCAxMDcuOTcxTDEzNTYuODQgMTE2LjE5NUMxMzU1LjY0IDExMy43OTYgMTM1My44NCAxMTEuNzQgMTM1MS40NCAxMTAuMDI3QzEzNDkuMjEgMTA4LjMxNCAxMzQ2LjQ3IDEwNy4xMTQgMTM0My4yMiAxMDYuNDI5QzEzNDAuMTMgMTA1LjU3MiAxMzM2Ljk2IDEwNS4xNDQgMTMzMy43MSAxMDUuMTQ0QzEzMjguMjMgMTA1LjE0NCAxMzIzLjYgMTA2LjI1OCAxMzE5LjgzIDEwOC40ODVDMTMxNi4wNiAxMTAuNzEyIDEzMTQuMTggMTEzLjg4MiAxMzE0LjE4IDExNy45OTRDMTMxNC4xOCAxMjAuMDUgMTMxNC43OCAxMjEuODQ5IDEzMTUuOTcgMTIzLjM5MUMxMzE3LjM1IDEyNC45MzMgMTMxOS4xNCAxMjYuMjE4IDEzMjEuMzcgMTI3LjI0NkMxMzIzLjYgMTI4LjEwMyAxMzI2LjI1IDEyOC45NTkgMTMyOS4zNCAxMjkuODE2QzEzMzIuNDIgMTMwLjUwMSAxMzM1LjY4IDEzMS4zNTggMTMzOS4xIDEzMi4zODZDMTM0NC41OSAxMzMuOTI4IDEzNDkuOTggMTM1LjY0MSAxMzU1LjMgMTM3LjUyNkMxMzYwLjc4IDEzOS4yMzkgMTM2NS43NSAxNDEuNDY3IDEzNzAuMiAxNDQuMjA4QzEzNzQuODMgMTQ2Ljk0OSAxMzc4LjQzIDE1MC41NDcgMTM4MSAxNTUuMDAyQzEzODMuNzQgMTU5LjQ1NyAxMzg1LjI4IDE2NS4xMTEgMTM4NS42MiAxNzEuOTY0QzEzODUuNjIgMTc5LjMzMSAxMzgzLjQ4IDE4Ni4wOTkgMTM3OS4yIDE5Mi4yNjdDMTM3NC45MSAxOTguMjY0IDEzNjguNzUgMjAzLjA2MSAxMzYwLjY5IDIwNi42NTlDMTM1Mi44MSAyMTAuMDg2IDEzNDMuMzkgMjExLjc5OSAxMzMyLjQyIDIxMS43OTlDMTMxOS43NCAyMTEuNzk5IDEzMDguODYgMjA5LjA1OCAxMjk5Ljc4IDIwMy41NzVDMTI5MC43IDE5OC4wOTIgMTI4NC41NCAxODkuMjY5IDEyODEuMjggMTc3LjEwNEwxMzA2LjcyIDE2OC42MjNaIiBmaWxsPSIjMjAyMDIwIi8+CjxwYXRoIGQ9Ik0xNTUzLjI4IDgxLjVIMTU3OS40OVYxOTAuNzI1QzE1NzkuNDkgMjA1LjI4OCAxNTc1LjkgMjE3Ljc5NiAxNTY4LjcgMjI4LjI0N0MxNTYxLjUgMjM4Ljg3IDE1NTEuMTQgMjQ3LjAwOCAxNTM3LjYgMjUyLjY2MkMxNTI0LjA3IDI1OC40ODcgMTUwNy43OSAyNjEuNCAxNDg4Ljc3IDI2MS40TDE0ODQuNCAyMzYuNDcxQzE1MDUuOTkgMjM1Ljk1NyAxNTIyLjM2IDIzMS44NDUgMTUzMy40OSAyMjQuMTM1QzE1NDQuOCAyMTYuNDI1IDE1NTAuNDUgMjA1LjM3NCAxNTUwLjQ1IDE5MC45ODJWMTkwLjcyNUgxNTUzLjc5QzE1NDkuODUgMTk2LjU1IDE1NDQuMTEgMjAxLjUxOSAxNTM2LjU4IDIwNS42MzFDMTUyOS4yMSAyMDkuNzQzIDE1MjAuMzggMjExLjc5OSAxNTEwLjEgMjExLjc5OUMxNDk4LjggMjExLjc5OSAxNDg4Ljc3IDIwOS4wNTggMTQ4MC4wNCAyMDMuNTc1QzE0NzEuMyAxOTguMDkyIDE0NjQuNDQgMTkwLjM4MiAxNDU5LjQ4IDE4MC40NDVDMTQ1NC42OCAxNzAuNTA4IDE0NTIuMjggMTU4Ljk0MyAxNDUyLjI4IDE0NS43NUMxNDUyLjI4IDEzMi41NTcgMTQ1NC42OCAxMjAuOTkyIDE0NTkuNDggMTExLjA1NUMxNDY0LjQ0IDEwMS4xMTggMTQ3MS4zIDkzLjQwNzYgMTQ4MC4wNCA4Ny45MjVDMTQ4OC43NyA4Mi40NDIzIDE0OTguOCA3OS43MDEgMTUxMC4xIDc5LjcwMUMxNTE2LjQ0IDc5LjcwMSAxNTIyLjE4IDgwLjU1NzYgMTUyNy4zMiA4Mi4yNzFDMTUzMi42NCA4My44MTMgMTUzNy4yNiA4NS45NTQ2IDE1NDEuMiA4OC42OTZDMTU0NS4zMSA5MS4yNjYgMTU0OC42NSA5NC4xNzg2IDE1NTEuMjIgOTcuNDM0TDE1NTMuMjggODEuNVpNMTQ4My4zOCAxNDUuNzVDMTQ4My4zOCAxNTcuNTcyIDE0ODYuNDYgMTY3LjE2NyAxNDkyLjYzIDE3NC41MzRDMTQ5OC44IDE4MS45MDEgMTUwNy4wMiAxODUuNTg1IDE1MTcuMyAxODUuNTg1QzE1MjMuMyAxODUuNTg1IDE1MjguNzggMTg0LjA0MyAxNTMzLjc1IDE4MC45NTlDMTUzOC43MiAxNzcuNzA0IDE1NDIuNzQgMTczLjA3OCAxNTQ1LjgzIDE2Ny4wODFDMTU0OC45MSAxNjEuMDg0IDE1NTAuNDUgMTUzLjk3NCAxNTUwLjQ1IDE0NS43NUMxNTUwLjQ1IDEzNy4xODMgMTU0OC45MSAxMjkuOTg3IDE1NDUuODMgMTI0LjE2MkMxNTQyLjc0IDExOC4xNjUgMTUzOC42MyAxMTMuNjI1IDE1MzMuNDkgMTEwLjU0MUMxNTI4LjUyIDEwNy40NTcgMTUyMy4xMyAxMDUuOTE1IDE1MTcuMyAxMDUuOTE1QzE1MDcuMDIgMTA1LjkxNSAxNDk4LjggMTA5LjU5OSAxNDkyLjYzIDExNi45NjZDMTQ4Ni40NiAxMjQuMTYyIDE0ODMuMzggMTMzLjc1NyAxNDgzLjM4IDE0NS43NVoiIGZpbGw9IiMyMDIwMjAiLz4KPHBhdGggZD0iTTE0MDQuMzMgODEuNUgxNDMzLjM3VjIxMEgxNDA0LjMzVjgxLjVaTTE0MTguOTggNjEuOTY4QzE0MTMuNjcgNjEuOTY4IDE0MDkuMjEgNjAuMTY5IDE0MDUuNjIgNTYuNTcxQzE0MDIuMDIgNTIuOTczIDE0MDAuMjIgNDguNjg5NiAxNDAwLjIyIDQzLjcyMUMxNDAwLjIyIDM4LjQwOTYgMTQwMi4wMiAzMy45NTUgMTQwNS42MiAzMC4zNTdDMTQwOS4yMSAyNi43NTkgMTQxMy42NyAyNC45NiAxNDE4Ljk4IDI0Ljk2QzE0MjQuMTIgMjQuOTYgMTQyOC40OSAyNi43NTkgMTQzMi4wOSAzMC4zNTdDMTQzNS42OCAzMy45NTUgMTQzNy40OCAzOC40MDk2IDE0MzcuNDggNDMuNzIxQzE0MzcuNDggNDguNjg5NiAxNDM1LjY4IDUyLjk3MyAxNDMyLjA5IDU2LjU3MUMxNDI4LjQ5IDYwLjE2OSAxNDI0LjEyIDYxLjk2OCAxNDE4Ljk4IDYxLjk2OFoiIGZpbGw9IiMyMDIwMjAiLz4KPHBhdGggZD0iTTE1OTMuMjIgODEuNUgxNjE5LjQzTDE2MjEuNDkgOTQuMDkzQzE2MjUuNzcgODkuNjM4MyAxNjMwLjgzIDg2LjEyNiAxNjM2LjY1IDgzLjU1NkMxNjQyLjY1IDgwLjk4NiAxNjQ5LjA3IDc5LjcwMSAxNjU1LjkzIDc5LjcwMUMxNjY2LjA0IDc5LjcwMSAxNjc0LjY5IDgxLjg0MjYgMTY4MS44OCA4Ni4xMjZDMTY4OS4yNSA5MC4yMzggMTY5NC45MSA5Ni40MDYgMTY5OC44NSAxMDQuNjNDMTcwMi43OSAxMTIuNjgzIDE3MDQuNzYgMTIyLjc5MSAxNzA0Ljc2IDEzNC45NTZWMjEwSDE2NzUuNzJWMTM4LjgxMUMxNjc1LjcyIDEyOC4wMTcgMTY3My40OSAxMTkuODc5IDE2NjkuMDMgMTE0LjM5NkMxNjY0Ljc1IDEwOC45MTMgMTY1OC4yNCAxMDYuMTcyIDE2NDkuNSAxMDYuMTcyQzE2NDAuNTkgMTA2LjE3MiAxNjMzLjgyIDEwOC45OTkgMTYyOS4yIDExNC42NTNDMTYyNC41NyAxMjAuMTM2IDE2MjIuMjYgMTI4LjI3NCAxNjIyLjI2IDEzOS4wNjhWMjEwSDE1OTMuMjJWODEuNVoiIGZpbGw9IiMyMDIwMjAiLz4KPHBhdGggZD0iTTQ0MS4wMDEgMjExLjc5OUM0MjguMzIyIDIxMS43OTkgNDE2LjQxNCAyMDkuNTcxIDQwNS4yNzggMjA1LjExN0MzOTQuMTQxIDIwMC42NjIgMzg0LjM3NSAxOTQuNDA4IDM3NS45OCAxODYuMzU2QzM2Ny43NTYgMTc4LjEzMiAzNjEuMjQ1IDE2OC40NTEgMzU2LjQ0OCAxNTcuMzE1QzM1MS44MjIgMTQ2LjAwNyAzNDkuNTA5IDEzMy41ODUgMzQ5LjUwOSAxMjAuMDVDMzQ5LjUwOSAxMDYuNjg2IDM1MS44MjIgOTQuNDM1NCAzNTYuNDQ4IDgzLjI5ODhDMzYxLjI0NSA3MS45OTA4IDM2Ny43NTYgNjIuMjI0OCAzNzUuOTggNTQuMDAwOEMzODQuMzc1IDQ1Ljc3NjggMzk0LjE0MSAzOS40Mzc0IDQwNS4yNzggMzQuOTgyOEM0MTYuNDE0IDMwLjUyODEgNDI4LjMyMiAyOC4zMDA4IDQ0MS4wMDEgMjguMzAwOEM0NTMuNjc5IDI4LjMwMDggNDY1LjUwMSAzMC41MjgxIDQ3Ni40NjcgMzQuOTgyOEM0ODcuNjAzIDM5LjQzNzQgNDk3LjI4NCA0NS43NzY4IDUwNS41MDggNTQuMDAwOEM1MTMuOTAzIDYyLjIyNDggNTIwLjQxNCA3MS45OTA4IDUyNS4wNCA4My4yOTg4QzUyOS44MzcgOTQuNDM1NCA1MzIuMjM2IDEwNi42ODYgNTMyLjIzNiAxMjAuMDVDNTMyLjIzNiAxMzMuNTg1IDUyOS44MzcgMTQ2LjAwNyA1MjUuMDQgMTU3LjMxNUM1MjAuNDE0IDE2OC40NTEgNTEzLjkwMyAxNzguMTMyIDUwNS41MDggMTg2LjM1NkM0OTcuMjg0IDE5NC40MDggNDg3LjYwMyAyMDAuNjYyIDQ3Ni40NjcgMjA1LjExN0M0NjUuNTAxIDIwOS41NzEgNDUzLjY3OSAyMTEuNzk5IDQ0MS4wMDEgMjExLjc5OVpNNDQxLjAwMSAxODUuODQyQzQ1Mi42NTEgMTg1Ljg0MiA0NjMuMDE3IDE4My4xODYgNDcyLjA5OCAxNzcuODc1QzQ4MS4xNzggMTcyLjM5MiA0ODguMjg5IDE2NC43NjggNDkzLjQyOSAxNTUuMDAyQzQ5OC41NjkgMTQ1LjA2NCA1MDEuMTM5IDEzMy40MTQgNTAxLjEzOSAxMjAuMDVDNTAxLjEzOSAxMDYuNTE0IDQ5OC41NjkgOTQuODYzOCA0OTMuNDI5IDg1LjA5NzhDNDg4LjI4OSA3NS4zMzE4IDQ4MS4xNzggNjcuNzkzMSA0NzIuMDk4IDYyLjQ4MThDNDYzLjAxNyA1Ni45OTkxIDQ1Mi42NTEgNTQuMjU3OCA0NDEuMDAxIDU0LjI1NzhDNDI5LjM1IDU0LjI1NzggNDE4Ljk4NCA1Ni45OTkxIDQwOS45MDQgNjIuNDgxOEM0MDAuODIzIDY3Ljc5MzEgMzkzLjYyNyA3NS4zMzE4IDM4OC4zMTYgODUuMDk3OEMzODMuMTc2IDk0Ljg2MzggMzgwLjYwNiAxMDYuNTE0IDM4MC42MDYgMTIwLjA1QzM4MC42MDYgMTMzLjQxNCAzODMuMTc2IDE0NS4wNjQgMzg4LjMxNiAxNTUuMDAyQzM5My42MjcgMTY0Ljc2OCA0MDAuODIzIDE3Mi4zOTIgNDA5LjkwNCAxNzcuODc1QzQxOC45ODQgMTgzLjE4NiA0MjkuMzUgMTg1Ljg0MiA0NDEuMDAxIDE4NS44NDJaIiBmaWxsPSIjMjAyMDIwIi8+CjxwYXRoIGQ9Ik03NTQuNzg3IDIxMS43OTlDNzQxLjkzNyAyMTEuNzk5IDczMC42MjkgMjA4Ljk3MiA3MjAuODYzIDIwMy4zMThDNzExLjI2OCAxOTcuNjY0IDcwMy43MjkgMTg5Ljc4MiA2OTguMjQ3IDE3OS42NzRDNjkyLjkzNSAxNjkuNTY1IDY5MC4yOCAxNTcuOTE0IDY5MC4yOCAxNDQuNzIyQzY5MC4yOCAxMzIuMjE0IDY5Mi45MzUgMTIxLjA3OCA2OTguMjQ3IDExMS4zMTJDNzAzLjU1OCAxMDEuNTQ2IDcxMC45MjUgOTMuODM1OCA3MjAuMzQ5IDg4LjE4MThDNzI5Ljc3MiA4Mi41Mjc4IDc0MC40OCA3OS43MDA4IDc1Mi40NzQgNzkuNzAwOEM3NjQuNjM4IDc5LjcwMDggNzc1LjM0NyA4Mi4zNTY0IDc4NC41OTkgODcuNjY3OEM3OTMuODUxIDkyLjk3OTEgODAxLjA0NyAxMDAuNDMyIDgwNi4xODcgMTEwLjAyN0M4MTEuNDk4IDExOS40NSA4MTQuMTU0IDEzMC40MTUgODE0LjE1NCAxNDIuOTIzQzgxNC4xNTQgMTQ0Ljk3OSA4MTQuMDY4IDE0Ny4yMDYgODEzLjg5NyAxNDkuNjA1QzgxMy43MjUgMTUxLjgzMiA4MTMuNDY4IDE1NC4yMzEgODEzLjEyNiAxNTYuODAxSDcyMS42MzRDNzIyLjQ5IDE2Mi43OTcgNzI0LjM3NSAxNjguMDIzIDcyNy4yODggMTcyLjQ3OEM3MzAuMzcyIDE3Ni43NjEgNzM0LjIyNyAxODAuMTAyIDczOC44NTMgMTgyLjUwMUM3NDMuNDc5IDE4NC44OTkgNzQ4Ljc5IDE4Ni4wOTkgNzU0Ljc4NyAxODYuMDk5Qzc2MS45ODMgMTg2LjA5OSA3NjguNDA4IDE4NC42NDIgNzc0LjA2MiAxODEuNzNDNzc5Ljg4NyAxNzguODE3IDc4My45MTMgMTc0Ljk2MiA3ODYuMTQxIDE3MC4xNjVMODExLjU4NCAxNzguNjQ2QzgwNi40NDQgMTg4LjkyNiA3OTguODE5IDE5Ny4wNjQgNzg4LjcxMSAyMDMuMDYxQzc3OC42MDIgMjA4Ljg4NiA3NjcuMjk0IDIxMS43OTkgNzU0Ljc4NyAyMTEuNzk5Wk03ODIuNTQzIDEzMy4xNTdDNzgyLjM3MSAxMjcuODQ1IDc4MC45MTUgMTIzLjA0OCA3NzguMTc0IDExOC43NjVDNzc1LjQzMiAxMTQuNDgxIDc3MS44MzQgMTExLjE0IDc2Ny4zOCAxMDguNzQyQzc2Mi45MjUgMTA2LjE3MiA3NTcuOTU2IDEwNC44ODcgNzUyLjQ3NCAxMDQuODg3Qzc0Ny42NzYgMTA0Ljg4NyA3NDMuMTM2IDEwNi4wODYgNzM4Ljg1MyAxMDguNDg1QzczNC41NjkgMTEwLjg4MyA3MzAuODg2IDExNC4yMjQgNzI3LjgwMiAxMTguNTA4QzcyNC44ODkgMTIyLjYyIDcyMy4wMDQgMTI3LjUwMyA3MjIuMTQ4IDEzMy4xNTdINzgyLjU0M1oiIGZpbGw9IiMyMDIwMjAiLz4KPHBhdGggZD0iTTgyOC4yMTkgODEuNDk5OEg4NTQuNDMzTDg1Ni40ODkgOTQuMDkyOEM4NjAuNzcyIDg5LjYzODEgODY1LjgyNiA4Ni4xMjU4IDg3MS42NTIgODMuNTU1OEM4NzcuNjQ4IDgwLjk4NTggODg0LjA3MyA3OS43MDA4IDg5MC45MjcgNzkuNzAwOEM5MDEuMDM1IDc5LjcwMDggOTA5LjY4OCA4MS44NDI0IDkxNi44ODQgODYuMTI1OEM5MjQuMjUxIDkwLjIzNzggOTI5LjkwNSA5Ni40MDU4IDkzMy44NDYgMTA0LjYzQzkzNy43ODYgMTEyLjY4MiA5MzkuNzU3IDEyMi43OTEgOTM5Ljc1NyAxMzQuOTU2VjIxMEg5MTAuNzE2VjEzOC44MTFDOTEwLjcxNiAxMjguMDE3IDkwOC40ODggMTE5Ljg3OCA5MDQuMDM0IDExNC4zOTZDODk5Ljc1IDEwOC45MTMgODkzLjI0IDEwNi4xNzIgODg0LjUwMiAxMDYuMTcyQzg3NS41OTIgMTA2LjE3MiA4NjguODI1IDEwOC45OTkgODY0LjE5OSAxMTQuNjUzQzg1OS41NzMgMTIwLjEzNSA4NTcuMjYgMTI4LjI3NCA4NTcuMjYgMTM5LjA2OFYyMTBIODI4LjIxOVY4MS40OTk4WiIgZmlsbD0iIzIwMjAyMCIvPgo8cGF0aCBkPSJNNTczLjkxOSAxOTAuOTgyTDU3Ny4yNiAxOTAuMjExVjI2MS40SDU0OC4yMTlWODEuNDk5OEg1NzQuNDMzTDU3Ni40ODkgOTcuNDMzOEM1ODAuNzcyIDkyLjQ2NTEgNTg2LjM0IDg4LjI2NzQgNTkzLjE5NCA4NC44NDA4QzYwMC4wNDcgODEuNDE0MSA2MDguMzU3IDc5LjcwMDggNjE4LjEyMyA3OS43MDA4QzYyOS4yNTkgNzkuNzAwOCA2MzkuMTExIDgyLjQ0MjEgNjQ3LjY3OCA4Ny45MjQ4QzY1Ni40MTYgOTMuNDA3NCA2NjMuMTgzIDEwMS4xMTcgNjY3Ljk4MSAxMTEuMDU1QzY3Mi45NDkgMTIwLjgyMSA2NzUuNDM0IDEzMi4zODYgNjc1LjQzNCAxNDUuNzVDNjc1LjQzNCAxNTguOTQyIDY3Mi45NDkgMTcwLjUwNyA2NjcuOTgxIDE4MC40NDVDNjYzLjE4MyAxOTAuMzgyIDY1Ni41MDEgMTk4LjA5MiA2NDcuOTM1IDIwMy41NzVDNjM5LjM2OCAyMDkuMDU3IDYyOS40MzEgMjExLjc5OSA2MTguMTIzIDIxMS43OTlDNjA3Ljg0MyAyMTEuNzk5IDU5OC45MzMgMjA5LjgyOCA1OTEuMzk1IDIwNS44ODhDNTgzLjg1NiAyMDEuNzc2IDU3OC4wMzEgMTk2LjgwNyA1NzMuOTE5IDE5MC45ODJaTTY0NC4zMzcgMTQ1Ljc1QzY0NC4zMzcgMTMzLjkyOCA2NDEuMTY3IDEyNC4zMzMgNjM0LjgyOCAxMTYuOTY2QzYyOC42NiAxMDkuNTk4IDYyMC42OTMgMTA1LjkxNSA2MTAuOTI3IDEwNS45MTVDNjA0Ljc1OSAxMDUuOTE1IDU5OS4xMDUgMTA3LjQ1NyA1OTMuOTY1IDExMC41NDFDNTg4Ljk5NiAxMTMuNjI1IDU4NC45NyAxMTguMDc5IDU4MS44ODYgMTIzLjkwNUM1NzguODAyIDEyOS43MyA1NzcuMjYgMTM3LjAxMiA1NzcuMjYgMTQ1Ljc1QzU3Ny4yNiAxNTQuMzE2IDU3OC44MDIgMTYxLjU5OCA1ODEuODg2IDE2Ny41OTVDNTg0Ljk3IDE3My40MiA1ODguOTk2IDE3Ny44NzUgNTkzLjk2NSAxODAuOTU5QzU5OS4xMDUgMTg0LjA0MyA2MDQuNzU5IDE4NS41ODUgNjEwLjkyNyAxODUuNTg1QzYyMC42OTMgMTg1LjU4NSA2MjguNjYgMTgxLjkwMSA2MzQuODI4IDE3NC41MzRDNjQxLjE2NyAxNjcuMTY2IDY0NC4zMzcgMTU3LjU3MiA2NDQuMzM3IDE0NS43NVoiIGZpbGw9IiMyMDIwMjAiLz4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xNDUuNSAwQzIyNS44NTcgMCAyOTEgNjUuMTQyNiAyOTEgMTQ1LjVDMjkxIDIyNS44NTcgMjI1Ljg1NyAyOTEgMTQ1LjUgMjkxSDE5LjM1ODFDOC42NDM4NSAyOTEgMC4wMDA2ODE5ODIgMjgyLjM1OCAwLjAwMDYxNjQ0MiAyNzEuNjQ0QzAuMDAwNDE3OTM5IDIzOS4xOTMgMS41MDYyNGUtMDkgMTc0LjUyMyAwIDE0NS41QzAgNjUuMTQyNiA2NS4xNDI2IDUuMjA2OWUtMDYgMTQ1LjUgMFpNMTQ1LjUwMSAyOS4xMDA0QzgxLjIxNDcgMjkuMTAwNCAyOS4xMDA0IDgxLjIxNDcgMjkuMTAwNCAxNDUuNTAxQzI5LjEwMDUgMjA5Ljc4NiA4MS4yMTQ3IDI2MS45IDE0NS41MDEgMjYxLjlDMjA5Ljc4NiAyNjEuOSAyNjEuOSAyMDkuNzg2IDI2MS45IDE0NS41MDFDMjYxLjkgODEuMjE0NyAyMDkuNzg2IDI5LjEwMDQgMTQ1LjUwMSAyOS4xMDA0WiIgZmlsbD0iIzIwMjAyMCIvPgo8cGF0aCBkPSJNMTM3LjkzNCAyMTUuMDRMOTQuMzExOSAxMDAuMjQ3QzkyLjkwMDIgOTYuNTMxNyA5Ni41Mjg2IDkyLjg4OTUgMTAwLjIxOSA5NC4zMTcyTDIxNS4wNjcgMTM4Ljc0OUMyMTkuNzkzIDE0MC41NzggMjE4LjQ5MSAxNDcuNjMzIDIxMy40MjcgMTQ3LjYzM0gxNDYuNzY5VjIxMy40QzE0Ni43NjkgMjE4LjQ5OSAxMzkuNzQ0IDIxOS44MDQgMTM3LjkzNCAyMTUuMDRaIiBmaWxsPSIjMjAyMDIwIi8+CjwvZz4KPGRlZnM+CjxjbGlwUGF0aCBpZD0iY2xpcDBfMTM4OV81NzQiPgo8cmVjdCB3aWR0aD0iMTcwNSIgaGVpZ2h0PSIyOTEiIGZpbGw9IndoaXRlIi8+CjwvY2xpcFBhdGg+CjwvZGVmcz4KPC9zdmc+Cg==";

const PIXEL_SCAN_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
void main() { gl_Position = vec4(position, 1.0); }
`;

const PIXEL_SCAN_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D src;
uniform vec2 resolution;
uniform vec2 offset;
uniform float time;
uniform float enterTime;
uniform float leaveTime;

uniform int mode;
uniform float speed;
uniform float delay;
uniform float width;
uniform vec3 accent;
uniform vec3 accent2;
uniform vec3 baseCol;
uniform vec2 mouse;
uniform float hover;
uniform float spot;

#define TRAIL 24
uniform vec2 trail[TRAIL];
uniform float trailW[TRAIL];

#define W width
#define LAYERS 3.0

vec4 readTex(vec2 uv) {
  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) return vec4(0);
  return texture2D(src, uv);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(4859., 3985.))) * 3984.); }
float sdBox(vec2 p, float r) { vec2 q = abs(p) - r; return min(length(q), max(q.y, q.x)); }

float dir = 1.;
vec2 mp = vec2(0.);
vec2 tp[TRAIL];

vec2 pxToP(vec2 px) {
  vec2 uv = (px - offset) / resolution;
  vec2 q = uv * 2. - 1.;
  q.y *= resolution.y / resolution.x;
  return q;
}

float toRangeT(vec2 p, float scale) {
  float d;
  if (mode == 0) d = p.x / (scale * 2.) + .5;
  else if (mode == 1) d = 1. - (p.y / (scale * 2.) + .5);
  else if (mode == 2) d = length(p) / scale;

  else d = dot(p, vec2(0.7071, 0.7071)) / (scale * 2.) + .5;
  d = dir > 0. ? d : (1. - d);
  return d;
}

vec4 cell(vec2 p, vec2 pi, float scale, float t, float edge) {
  vec2 pc = pi + .5;

  vec2 uvc = pc / scale;
  uvc.y /= resolution.y / resolution.x;
  uvc = uvc * 0.5 + 0.5;
  if (uvc.x < 0. || uvc.x > 1. || uvc.y < 0. || uvc.y > 1.) return vec4(0);
  float alpha = smoothstep(.0, .1, texture2D(src, uvc).a);

  float x = toRangeT(pi, scale);
  float n = hash(pi);
  float SPREAD = W * 2.2;
  float anim = smoothstep(W * 2., .0, abs(x + n * SPREAD - t));

  vec2 cellP = pc / scale;
  float spotA = 0.;
  for (int i = 0; i < TRAIL; i++) {
    float w = trailW[i];
    if (w <= 0.) continue;
    vec2 rel = cellP - tp[i];
    float ang = atan(rel.y, rel.x);
    float wob = 1.
      + 0.30 * sin(3. * ang + time * 1.6)
      + 0.16 * sin(5. * ang - time * 1.1 + 1.3);
    float reach = spot * 0.8 * wob;
    spotA = max(spotA, smoothstep(reach, reach * 0.4, length(rel)) * w);
  }
  anim = max(anim, spotA * hover);

  float tone = 0.5 + 0.5 * sin(time * 2.0 + n * 6.2831)
                   + 0.18 * sin(time * 3.7 + n * 12.566);
  tone = clamp(tone, 0., 1.);
  vec3 cellAccent = mix(accent, accent2, tone);
  vec4 color = vec4(mix(baseCol, cellAccent, anim), 1.) * anim;

  float pull = hover * smoothstep(spot * 1.4, 0., length(cellP - mp));
  vec2 mag = normalize(mp - cellP + 1e-5) * pull * 0.18;
  vec2 bp = p - pc - mag;

  float sd = sdBox(bp, .38);
  color *= mix(1., clamp(.3 / abs(sd), 0., 10.), edge * pow(anim, 9.));
  color += vec4(cellAccent, 1.) * anim * smoothstep(.55, .0, abs(sd)) * 0.07;

  return color * alpha;
}

vec4 cellsColor(vec2 p, float scale, float t) {
  vec2 pi = floor(p);
  vec2 d = vec2(0, 1);
  vec4 cc = vec4(0);
  cc += cell(p, pi, scale, t, .2) * 4.;
  cc += cell(p, pi + d.xy, scale, t, .9);
  cc += cell(p, pi - d.xy, scale, t, .9);
  cc += cell(p, pi + d.yx, scale, t, .9);
  cc += cell(p, pi - d.yx, scale, t, .9);
  return cc / 8.;
}

vec4 draw(vec2 uv, vec2 p, float t, float scale) {
  vec4 c = readTex(uv);
  vec2 pi = floor(p * scale);
  float n = hash(pi);
  t = t * (1. + W * 4.) - W * 2.;
  float x = toRangeT(pi, scale);
  float a1 = smoothstep(t, t - W, x + n * W);
  c *= a1;
  c += cellsColor(p * scale, scale, t) * 1.1;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  vec2 p = uv * 2. - 1.;
  p.y *= resolution.y / resolution.x;

  mp = pxToP(mouse);
  for (int i = 0; i < TRAIL; i++) tp[i] = pxToP(trail[i]);

  float t;
  if (leaveTime > 0.) { dir = -1.; t = clamp(leaveTime * speed, 0., 1.); }
  else { t = clamp((enterTime - delay) * speed, 0., 1.); }
  t = (fract(t * .99999) - 0.5) * dir + 0.5;

  for (float i = 0.; i < LAYERS; i++) {
    float s = cos(i) * 11. + 32.;
    gl_FragColor += draw(uv, p, t, abs(s));
  }
  gl_FragColor /= LAYERS;
  gl_FragColor *= smoothstep(0., 0.01, t);
}
`;

/** Layout for the wordmark host + canvas inside the splash body. */
export const SPLASH_PIXEL_SCAN_STYLE = `
      #splash-logo {
        position: relative;
        /* A 40px-tall wordmark (per product), width following the artwork's own
           proportions — it used to span 62% of the splash window, which read as
           a full-screen animation rather than a mark. */
        height: 40px;
        width: auto;
        /* The artwork is 1705x291; the host must share that ratio because the
           shader samples a texture rasterised to the host box. With a definite
           height this is also what resolves the width (≈234px). */
        aspect-ratio: 1705 / 291;
      }
      #splash-logo canvas {
        display: block;
        height: 100%;
        width: 100%;
      }
`;

export const SPLASH_PIXEL_SCAN_MARKUP = `
    <div id="splash-logo" role="img" aria-label="Open Design">
      <canvas id="splash-canvas"></canvas>
    </div>
`;

/**
 * Inline renderer for the splash window. Vanilla ES5-ish on purpose: it runs
 * in a sandboxed `data:` document with no bundler and no polyfills.
 */
export function splashPixelScanScript(): string {
  return `
      (function () {
        var host = document.getElementById("splash-logo");
        var canvas = document.getElementById("splash-canvas");
        if (!host || !canvas) return;

        var LOGO_SRC = ${JSON.stringify(SPLASH_LOGO_DATA_URL)};
        var VERT = ${JSON.stringify(PIXEL_SCAN_VERTEX_SHADER)};
        var FRAG = ${JSON.stringify(PIXEL_SCAN_FRAGMENT_SHADER)};

        // Same tuning the Home hero passes: brand greens, diagonal sweep
        // (mode 3), 0.2 band width.
        var ACCENT = [0.529, 0.918, 0.361];
        var ACCENT2 = [0.816, 1.0, 0.71];
        var BASE = [0.184, 0.471, 0.114];
        var TRAIL = 24;
        var ENTRANCE_SECONDS = 2.6;
        // Beat on the finished logo before the next sweep, so the loop reads as
        // "assembling again" rather than a strobe.
        var HOLD_SECONDS = 1.1;
        var MIN_ENTER = 0.06;

        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var img = new Image();
        var word = document.createElement("canvas");
        var gl = null;
        var program = null;
        var uni = {};
        var texture = null;
        var raf = 0;
        var startTime = 0;
        var cycleStart = 0;
        var stopped = false;

        function hostSize() {
          var rect = host.getBoundingClientRect();
          return {
            w: Math.max(1, Math.round(rect.width)),
            h: Math.max(1, Math.round(rect.height))
          };
        }

        // Contain-fit the artwork into the host box, exactly as the web engine
        // rasterises it — the shader reads this canvas as its glyph mask.
        function rasterise(size) {
          word.width = Math.max(1, Math.round(size.w * dpr));
          word.height = Math.max(1, Math.round(size.h * dpr));
          var ctx = word.getContext("2d");
          if (!ctx) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, size.w, size.h);
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            var s = Math.min(size.w / img.naturalWidth, size.h / img.naturalHeight);
            var dw = img.naturalWidth * s;
            var dh = img.naturalHeight * s;
            ctx.drawImage(img, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
          }
        }

        function drawStatic() {
          var size = hostSize();
          if (size.w < 2 || size.h < 2) return;
          canvas.width = Math.max(1, Math.round(size.w * dpr));
          canvas.height = Math.max(1, Math.round(size.h * dpr));
          var ctx = null;
          try {
            ctx = canvas.getContext("2d");
          } catch (err) {
            ctx = null;
          }
          if (!ctx || !img.naturalWidth) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, size.w, size.h);
          var s = Math.min(size.w / img.naturalWidth, size.h / img.naturalHeight);
          var dw = img.naturalWidth * s;
          var dh = img.naturalHeight * s;
          ctx.drawImage(img, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
        }

        function compile(type, source) {
          var shader = gl.createShader(type);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("[splash] shader compile failed:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
          }
          return shader;
        }

        function uploadTexture() {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          // three's CanvasTexture flips Y by default; the shader's uv comes from
          // gl_FragCoord (origin bottom-left), so without this the wordmark
          // renders upside down.
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, word);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }

        var sizedW = 0;
        var sizedH = 0;
        function resize() {
          var size = hostSize();
          // The host is an aspect-ratio box; on the first tick after parse its
          // rect can still be empty. Sizing the canvas to that would leave a
          // 1x1 buffer forever, so wait for a real box (the ResizeObserver
          // below calls back the moment layout produces one).
          if (size.w < 2 || size.h < 2) return;
          if (size.w === sizedW && size.h === sizedH) return;
          sizedW = size.w;
          sizedH = size.h;
          canvas.width = Math.max(1, Math.round(size.w * dpr));
          canvas.height = Math.max(1, Math.round(size.h * dpr));
          gl.viewport(0, 0, canvas.width, canvas.height);
          rasterise(size);
          uploadTexture();
          gl.uniform2f(uni.resolution, canvas.width, canvas.height);
        }

        function frame() {
          if (stopped) return;
          // Cheap every frame (it early-returns unless the box actually
          // changed) and it is what recovers a first paint that raced layout.
          resize();
          if (!sizedW) {
            raf = requestAnimationFrame(frame);
            return;
          }
          var now = performance.now();
          var elapsed = (now - cycleStart) / 1000;
          var enterTime;
          if (elapsed <= ENTRANCE_SECONDS) {
            var x = elapsed / ENTRANCE_SECONDS;
            // easeOutQuad, same curve the web engine uses for its entrance.
            var eased = 1 - (1 - x) * (1 - x);
            // Floor the ramp instead of starting at 0: the shader multiplies
            // its whole output by smoothstep(0, 0.01, t), so a literal 0 paints
            // an empty frame — once, on the web hero's mount, that is the
            // point; on a loop it is a blink every cycle. Starting just inside
            // means the next sweep opens with its leading blocks already lit.
            enterTime = MIN_ENTER + eased * (1 - MIN_ENTER);
          } else if (elapsed <= ENTRANCE_SECONDS + HOLD_SECONDS) {
            enterTime = 2;
          } else {
            cycleStart = now;
            enterTime = MIN_ENTER;
          }
          gl.uniform1f(uni.time, (now - startTime) / 1000);
          gl.uniform1f(uni.enterTime, enterTime);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          raf = requestAnimationFrame(frame);
        }

        function start() {
          try {
            // preserveDrawingBuffer: a splash frame can be composited outside
            // our rAF tick (window reveal, DPI change, a screenshot); without
            // it the compositor can pick up an already-swapped, empty buffer
            // and the wordmark blinks out mid-boot.
            gl = canvas.getContext("webgl", {
              alpha: true,
              antialias: false,
              premultipliedAlpha: true,
              preserveDrawingBuffer: true
            });
          } catch (err) {
            gl = null;
          }
          if (!gl) {
            drawStatic();
            return;
          }
          var vs = compile(gl.VERTEX_SHADER, VERT);
          var fs = compile(gl.FRAGMENT_SHADER, FRAG);
          if (!vs || !fs) {
            gl = null;
            drawStatic();
            return;
          }
          program = gl.createProgram();
          gl.attachShader(program, vs);
          gl.attachShader(program, fs);
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("[splash] program link failed:", gl.getProgramInfoLog(program));
            gl = null;
            drawStatic();
            return;
          }
          gl.useProgram(program);

          // Fullscreen quad — the whole scene the web engine builds with
          // three is one PlaneGeometry(2, 2).
          var buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 0, 1, -1, 0, -1, 1, 0,
            -1, 1, 0, 1, -1, 0, 1, 1, 0
          ]), gl.STATIC_DRAW);
          var loc = gl.getAttribLocation(program, "position");
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);

          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

          var names = ["src", "resolution", "offset", "time", "enterTime", "leaveTime",
            "mode", "speed", "delay", "width", "accent", "accent2", "baseCol",
            "mouse", "hover", "spot"];
          for (var i = 0; i < names.length; i++) uni[names[i]] = gl.getUniformLocation(program, names[i]);
          uni.trail = gl.getUniformLocation(program, "trail[0]");
          uni.trailW = gl.getUniformLocation(program, "trailW[0]");

          texture = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0);
          gl.uniform1i(uni.src, 0);

          gl.uniform2f(uni.offset, 0, 0);
          gl.uniform1f(uni.leaveTime, 0);
          gl.uniform1i(uni.mode, 3);
          gl.uniform1f(uni.speed, 1);
          gl.uniform1f(uni.delay, 0);
          gl.uniform1f(uni.width, 0.2);
          gl.uniform3f(uni.accent, ACCENT[0], ACCENT[1], ACCENT[2]);
          gl.uniform3f(uni.accent2, ACCENT2[0], ACCENT2[1], ACCENT2[2]);
          gl.uniform3f(uni.baseCol, BASE[0], BASE[1], BASE[2]);
          // No cursor on a splash: park it far away and leave every trail
          // sample cold, so the hover / spot uniforms contribute nothing.
          gl.uniform2f(uni.mouse, -10000, -10000);
          gl.uniform1f(uni.hover, 0);
          gl.uniform1f(uni.spot, 0.28);
          var trail = new Float32Array(TRAIL * 2);
          for (var t = 0; t < trail.length; t++) trail[t] = -10000;
          gl.uniform2fv(uni.trail, trail);
          gl.uniform1fv(uni.trailW, new Float32Array(TRAIL));

          resize();
          startTime = performance.now();
          cycleStart = startTime;
          raf = requestAnimationFrame(frame);
          window.addEventListener("resize", resize);
          if (typeof ResizeObserver === "function") {
            new ResizeObserver(function () { resize(); }).observe(host);
          }
          // A lost context on a splash is not recoverable by waiting: park the
          // static wordmark so the window never goes blank mid-boot, and pick
          // the shader back up if the GPU hands the context back.
          canvas.addEventListener("webglcontextlost", function (event) {
            event.preventDefault();
            stopped = true;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            gl = null;
            sizedW = 0;
            sizedH = 0;
            drawStatic();
          });
          canvas.addEventListener("webglcontextrestored", function () {
            stopped = false;
            start();
          });
        }

        img.onload = start;
        img.onerror = function () {
          console.error("[splash] logo failed to load");
        };
        img.src = LOGO_SRC;

        // The window is torn down when the app is ready, which stops this on
        // its own; the hook is here for a graceful stop before that.
        window.__odSplashStopLogo = function () {
          stopped = true;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
        };
      })();
`;
}
