# Animation Rows

The Codex app reads one fixed atlas: 8 columns, 9 rows, 192x208 pixels per cell.

| Row | State | Used columns | Durations |
| --- | --- | ---: | --- |
| 0 | idle | 0-5 | 280, 110, 110, 140, 140, 320 ms |
| 1 | running-right | 0-7 | 120 ms each, final 220 ms |
| 2 | running-left | 0-7 | 120 ms each, final 220 ms |
| 3 | waving | 0-3 | 140 ms each, final 280 ms |
| 4 | jumping | 0-4 | 140 ms each, final 280 ms |
| 5 | failed | 0-7 | 140 ms each, final 240 ms |
| 6 | waiting | 0-5 | 150 ms each, final 260 ms |
| 7 | running | 0-5 | 120 ms each, final 220 ms |
| 8 | review | 0-5 | 150 ms each, final 280 ms |

Unused cells after each row's final used column must be fully transparent.

## Row Purposes

- `idle`: neutral breathing/blinking loop; use as the reduced-motion first frame.
- `running-right`: locomotion to the right; 8-frame loop should read directionally.
- `running-left`: mirrored or redrawn locomotion to the left; do not simply reuse right-facing frames unless the design is symmetric.
- `waving`: greeting or attention gesture; clear start, raised gesture, return.
- `jumping`: anticipation, lift, peak, descent, settle.
- `failed`: error/sad/deflated reaction; readable but not visually noisy.
- `waiting`: patient idle variant; glance, small bounce, or prop motion.
- `running`: generic/front-facing or in-place run loop.
- `review`: focused/inspecting/thinking loop suitable for review state.
