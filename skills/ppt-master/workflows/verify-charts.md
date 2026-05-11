---
description: Verify chart coordinates against the design spec using svg_position_calculator.py
---

# Verify Charts Workflow

> Standalone post-generation step. Run after a deck containing data charts has finished SVG generation, before post-processing & export. Catches the 10–50 px coordinate errors AI models routinely introduce when mapping data to pixel positions.

This workflow is **independent**: it reads `design_spec.md` and the generated SVGs, then runs the calculator script — no upstream conversation context required. Safe to invoke in a fresh session.

## When to Run

- The deck contains one or more data visualization charts of types supported by a **single** `svg_position_calculator.py calc` invocation. The supported set is fixed by the calculator's CLI subcommands (`bar`, `line`, `pie`, `radar`) and their single-series model — see Step 1 for the exact `charts_index.json` keys.
- SVGs are generated to `<project_path>/svg_output/` and `svg_quality_checker.py` has passed.
- Post-processing (`finalize_svg.py`, `svg_to_pptx.py`) has **not yet** run.

Composite/derived chart types (multi-series, stacked, signed-delta, mirrored, dual-axis, cumulative-overlay) cannot be calibrated by one calc call and are out of scope. Same for non-XY visualizations (treemap / gauge / funnel / heatmap / matrix / bubble / box plot) and infographics / diagrams / frameworks / maps.

---

## Step 1: Build the page list from the design spec

Read `<project_path>/design_spec.md` §VII Visualization Reference List (authoritative deck plan; cross-check against §IX page outline) and **filter strictly to the calculator-supported set below**. Anything outside this set is out of scope — do NOT include it in the list, even if §VII labels it as a chart.

| Calculator subcommand | In-scope `charts_index.json` keys | Notes |
|-----------------------|-----------------------------------|-------|
| `calc bar`   | `bar_chart`, `horizontal_bar_chart` | Use `--horizontal` for the latter. Single series only. |
| `calc line`  | `line_chart`, `area_chart`, `scatter_chart` | Area uses line output as the top boundary, then closes to `y_max`. |
| `calc pie`   | `pie_chart`, `donut_chart` | Donut: pass `--inner-radius`. |
| `calc radar` | `radar_chart` | Separate subcommand — not under `calc pie`. |

**Verifiable via repeated calls + cumulative precompute** (see [Stacked recipe](#stacked-recipe) below):

- `stacked_bar_chart`, `stacked_area_chart` — include in the Step 1 list, mark `type=stacked-bar` / `type=stacked-area`, and verify per the recipe.

**Out of scope** (no single-call model and no clean repeat-call recipe — skip silently):

- Multi-series / signed / paired / dual-axis bar & line: `grouped_bar_chart`, `butterfly_chart`, `waterfall_chart`, `bullet_chart`, `dumbbell_chart`, `pareto_chart`, `dual_axis_line_chart`
- Non-XY data visualizations: `treemap_chart`, `gauge_chart`, `progress_bar_chart`, `funnel_chart`, `matrix_2x2`, `bubble_chart`, `heatmap_chart`, `box_plot_chart`, `kpi_cards`
- Everything in the `process` / `strategy` / `architecture` / `infographic` / `table` categories of `charts_index.json`

Resulting list:

```
P03 03_market_share.svg  type=bar
P07 07_growth.svg        type=line
P11 11_share_split.svg   type=pie
```

If §VII is absent (legacy project / free-structure deck), skip this workflow and report: "design_spec.md has no §VII — chart pages cannot be enumerated authoritatively, verify-charts skipped". Do NOT fall back to guessing from SVG content; that reintroduces the silent-skip failure this workflow was built to eliminate.

If the filtered list is empty, output `verify-charts: spec declares no calculator-supported chart pages, nothing to verify` and stop.

---

## Step 2: Per page — read SVG, run calculator, compare, update

For each page in the Step 1 list:

1. Read `<project_path>/svg_output/<page>.svg`.
2. Locate the plot-area definition:
   - Preferred: `<!-- chart-plot-area: ... -->` marker placed by Executor (see [executor-base.md §3.1](../references/executor-base.md)). Read coordinates directly.
   - If missing: derive the plot area from the SVG's axis lines (rectangular charts) or center/radius elements (radial charts). Then **add the marker back to the SVG** so future runs are not paying this cost again.
3. Read the data series from the SVG's `<text>` label/value elements.
4. **Read axis tick labels (bar charts only).** Locate the `<text>` elements along the value axis — these are the X-axis labels for horizontal bars, or Y-axis labels for vertical bars. Extract the first and last tick values to determine the axis range (e.g. `0%` to `120%` → range `0,120`). Pass this range as `--value-range "0,120"` to the calculator. If the SVG has no explicit tick labels (data labels only, no grid), omit `--value-range` and let the calculator auto-normalize — but flag the receipt as `scale=auto (no ticks)`.
5. Run the matching calculator command:

   ```bash
   # bar_chart / horizontal_bar_chart (add --horizontal for the latter)
   # IMPORTANT: always pass --value-range from axis tick labels (step 4)
   python3 skills/ppt-master/scripts/svg_position_calculator.py calc bar \
     --data "Label1:Value1,Label2:Value2" --area "x_min,y_min,x_max,y_max" \
     --bar-width 120 --value-range "0,axis_max"

   # line_chart / area_chart / scatter_chart — area uses line output as the top boundary, then closes to y_max
   python3 skills/ppt-master/scripts/svg_position_calculator.py calc line \
     --data "x1:y1,x2:y2,..." --area "x_min,y_min,x_max,y_max" --y-range "0,max"

   # pie_chart
   python3 skills/ppt-master/scripts/svg_position_calculator.py calc pie \
     --data "Slice1:Value1,Slice2:Value2" --center "cx,cy" --radius 200

   # donut_chart (pie with inner-radius)
   python3 skills/ppt-master/scripts/svg_position_calculator.py calc pie \
     --data "Slice1:Value1,Slice2:Value2" --center "cx,cy" --radius 200 --inner-radius 120

   # radar_chart (separate subcommand)
   python3 skills/ppt-master/scripts/svg_position_calculator.py calc radar \
     --data "Dim1:Value1,Dim2:Value2,Dim3:Value3" --center "cx,cy" --radius 200
   ```

   Area chart fill path closes to the bottom edge of the plot area:

   ```svg
   M first_x,first_y ... L last_x,last_y L last_x,y_max L first_x,y_max Z
   ```

6. **Scale-aware comparison.** Compare calculator output against the SVG's existing coordinates. Before declaring a mismatch, verify that the calculator output header shows `Value scale: axis ticks (...)` matching the SVG's drawn axis. If it shows `auto (max*1.1)` for a chart that has explicit axis ticks, the calculator was invoked without `--value-range` — go back to step 4 and re-run with the correct range. **Do NOT update the SVG with mismatched-scale output.** Only update SVG attributes when the scale is confirmed to match and coordinates genuinely differ. Update by hand (do NOT use regex / bulk replacement — coordinates are positional and easy to swap incorrectly).

After updating any page, re-run the quality checker on the project to confirm nothing broke:

```bash
python3 skills/ppt-master/scripts/svg_quality_checker.py <project_path>
```

---

## Stacked recipe

`stacked_bar_chart` and `stacked_area_chart` are not single-call but reduce cleanly to repeated calls on existing primitives. The operator already had to compute cumulative values to draw the SVG — verify-charts reuses them.

**Stacked bar** — for N stacked series on the same x categories, run `calc bar` N times. Pass each segment's **height** as the data value, and shift `--area`'s `y_max` down by the sum of all lower segments for that category. Compare each segment's `(x, y, width, height)` against the SVG.

```bash
# Example: two-series stack at category "Q1" with bottom=30, top=20, plot area y from 100 to 500
# Run 1 — bottom segment (origin = baseline)
python3 skills/ppt-master/scripts/svg_position_calculator.py calc bar \
  --data "Q1:30,Q2:..." --area "x_min,100,x_max,500" \
  --bar-width 80 --value-range "0,axis_max"
# Run 2 — top segment (origin shifted up by bottom segment's height in pixels)
python3 skills/ppt-master/scripts/svg_position_calculator.py calc bar \
  --data "Q1:20,Q2:..." --area "x_min,100,x_max,<500 - bottom_height_px>" \
  --bar-width 80 --value-range "0,axis_max"
```

**Stacked area** — for N stacked series, run `calc line` N times on **cumulative** y-values (series 1 raw; series 2 = series1+series2; …). Each call yields the top boundary of one band. Each band's SVG path closes to the **previous** band's top boundary (not to `y_max`).

If a stack page's segment positions don't reduce to this recipe (e.g., negative segments, percent-stacked with non-100 totals), mark it `manual-verify` in the receipt and inspect by hand — do not silently pass.

---

## Step 3: Per-page receipt

Output one line per page from the Step 1 list. Receipt count MUST equal Step 1 list length — that is the gate-closing artifact.

```
verify-charts: 03_market_share.svg | type=bar          | scale=0-100 (from ticks) | calc=ran | svg=updated
verify-charts: 07_growth.svg       | type=line         | scale=N/A                | calc=ran | svg=unchanged (already accurate)
verify-charts: 11_share_split.svg  | type=pie          | scale=N/A                | calc=ran | svg=updated | marker=added (was missing)
verify-charts: 14_revenue_mix.svg  | type=stacked-bar  | scale=0-200 (from ticks) | calc=ran×3 | svg=updated (per Stacked recipe)
verify-charts: 15_unit_economics.svg | type=stacked-area | scale=N/A | manual-verify | reason=percent-stacked, recipe does not apply
```

---

## After verification

Continue with post-processing & export ([SKILL.md Step 7](../SKILL.md)):

```bash
python3 skills/ppt-master/scripts/total_md_split.py <project_path>
python3 skills/ppt-master/scripts/finalize_svg.py <project_path>
python3 skills/ppt-master/scripts/svg_to_pptx.py <project_path>
```
