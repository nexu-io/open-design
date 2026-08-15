---
name: extract-static-html
description: |
  Extract self-contained static HTML from a built web application or React components by inlining CSS and images. Use this skill whenever you need to capture a specific UI state, share a static version of a page, or prepare assets for Stitch upload, even if the user just asks to 'save the HTML' or 'mock the view'.
  (Vendored from the stitch-design plugin of google-labs-code/stitch-skills; original
  skill id `stitch::extract-static-html`. Requires the Stitch MCP server to be configured — see
  https://github.com/google-labs-code/stitch-skills for setup.)
triggers:
  - "extract static html"
  - "save the html"
  - "mock the view"
  - "inline html for stitch"
od:
  mode: utility
  category: web-artifacts
  upstream: "https://github.com/google-labs-code/stitch-skills"
---

# Extract Static HTML

Extract a self-contained static HTML file from any web application.

## Which Strategy to Use

You MUST ask the user to choose which strategy to use before proceeding. Present the options clearly, **recommend Strategy A** as the preferred default, and **provide a brief pros/cons summary** for each option to help them make an informed decision.

| | Strategy A (Puppeteer) | Strategy B (Browser Subagent) |
| :--- | :--- | :--- |
| **When** | App runs locally, no auth wall | Need to interact with page first (click, fill forms) |
| **Fidelity** | **Highest — computed styles resolved** | High — rendered DOM |
| **Setup** | **Zero — no mock needed** | Zero — no mock needed |
| **Framework** | **Any** | Any |
| **Output** | **Writes to file — no size limit** | May truncate in agent context |

> [!WARNING]
> **Checkpoint — User Confirmation Required.**
> You **MUST** ask the user which strategy they prefer before proceeding.
> Present the comparison table above, recommend Strategy A as the default, and
> wait for explicit approval. Do **NOT** make the decision yourself or proceed
> until the user confirms.

***

## Strategy A: Puppeteer Snapshot (Recommended)

Launches headless Chrome, captures the fully rendered DOM, and produces a self-contained HTML file with all CSS inlined and images as base64. Works with **any framework** — no MockPage.jsx needed.

### Prerequisites

- App running locally (e.g., `npm run dev`)
- Node.js with `puppeteer` available (check: `node -e "require('puppeteer')"`)

### Workflow

1.  **Start the App** and note the port.

    > [!WARNING]
    > **Checkpoint — User Confirmation Required.**
    > After starting the local server, you **MUST** pause and ask the user for
    > confirmation before running the snapshot script or launching a browser
    > subagent. Report the URL and port to the user so they can verify the app
    > is running and rendering correctly. Do **NOT** proceed to the snapshot
    > step until the user confirms.

2.  **Run the Snapshot Script**:
    ```bash
    npx tsx <SKILL_DIR>/scripts/snapshot.ts \
      --url http://localhost:5173 \
      --output .stitch/home.html \
      --wait 2000
    ```

3.  **Multiple pages** — run once per route:
    ```bash
    npx tsx <SKILL_DIR>/scripts/snapshot.ts \
      --url http://localhost:5173 --output .stitch/home.html --wait 2000
    npx tsx <SKILL_DIR>/scripts/snapshot.ts \
      --url http://localhost:5173/pricing --output .stitch/pricing.html --wait 2000
    npx tsx <SKILL_DIR>/scripts/snapshot.ts \
      --url http://localhost:5173/dashboard --output .stitch/dashboard.html --wait 2000 --html-class dark
    ```

4.  **Clean Up Dev Server**:
    If a local dev server was started specifically for snapshot extraction, make sure to stop the server process or terminate the background task once extraction is completed.


### Script Flags

| Flag | Default | Description |
| :--- | :--- | :--- |
| `--url` | *(required)* | URL to capture |
| `--output` | *(required)* | Output file path |
| `--wait` | `1000` | Extra wait (ms) after network idle. Increase for lazy-loading apps. |
| `--viewport` | `1280x800` | Viewport size as `WIDTHxHEIGHT` |
| `--html-class` | — | Class(es) for `<html>` element (e.g., `dark`) |
| `--remove-fixed` | `false` | Remove fixed/sticky elements (cookie banners, chat widgets) |
| `--full-height` | `false` | Resize viewport to full scroll height |
| `--title` | — | Override page title (set to the route path, e.g. `/dashboard` or `/settings/profile`) |
| `--auth-script` | — | Path to a JS/TS module that exports a default `async (page) => void` function for authentication |
| `--inline-canvas` | `false` | Convert `<canvas>` elements (ECharts, Chart.js, D3) to base64 `<img>` tags |

### What It Does Automatically

- Captures all CSSOM rules from `document.styleSheets` (preserves dynamic Vite/Tailwind dev styles and CSS-in-JS)
- Inlines all `<link rel="stylesheet">` → `<style>` blocks
- Converts `<img>` `src` **and `srcset`** → base64 data URIs (skips external fonts)
- Inlines same-origin and relative icon font files (`@font-face`) as base64 data URIs so ligatures never render as ASCII text
- Inlines `<source srcset>` URLs as base64
- Removes failed/dead `srcset` entries so the browser falls back to the inlined `src`
- Removes `<script>` tags, Vite HMR dev style blocks (`createHotContext`, `import.meta.hot`), and dev overlays
- Resolves relative CSS `url()` paths before inlining

### Framework Notes

| Framework | Notes |
| :--- | :--- |
| **React + Vite** | Works out of the box. `--wait 1000`. |
| **Next.js** | `--wait 3000` for SSR hydration. URL: `http://localhost:3000`. `<img srcset>` from `/_next/image` is auto-inlined as base64. |
| **Angular (@angular/cli / v17+)** | Works out of the box with `ng serve` (default URL: `http://localhost:4200`). `--wait 2000` for Angular Material / PrimeNG animation hydration and lazy-loaded routes. |
| **Vue / Nuxt** | Works out of the box. |
| **Svelte / SvelteKit** | Works out of the box. |
| **Storybook** | Use story URL: `--url http://localhost:6006/?path=/story/...` |
| **SSR (Webpack)** | May need longer `--wait`. |

### Troubleshooting

| Issue | Solution |
| :--- | :--- |
| Images missing | Increase `--wait` |
| Images show as broken after server stops | Verify `srcset` was inlined — check log for "Inlined N images". If `srcset` URLs failed, they are auto-removed so `src` (inlined) is used. |
| Icons display as text / Serif unstyled font | Ensure `snapshot.ts` captures CSSOM from `document.styleSheets` (step 0) and same-origin icon fonts (`@font-face`) are inlined as base64 data URIs. |
| Next.js `/_next/image` not inlined | Ensure the dev server is running when snapshot runs — the script fetches optimized images from the running server. |
| Dark mode not applied | `--html-class dark` |
| Cookie banner in output | `--remove-fixed` |
| Page requires login | Use `--auth-script ./auth.ts` (see Auth-Gated Pages below) |
| Charts/graphs show as blank boxes | Use `--inline-canvas` to serialize `<canvas>` to base64 `<img>` |
| `Cannot find module 'puppeteer'` | `npm install -g puppeteer` |

### Auth-Gated Pages

For apps with login guards (Vue Router `beforeEach`, React `ProtectedRoute`, etc.), create a small auth script that runs in the Puppeteer session:

```ts
// auth-myapp.ts
import type { Page } from 'puppeteer';

export default async function authenticate(page: Page) {
  // Example 1: Fill and submit a login form
  await page.type('#username', 'admin');
  await page.type('#password', 'password123');
  await page.click('#login-button');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // Example 2: Inject cookies/localStorage directly
  // await page.evaluate(() => {
  //   localStorage.setItem('token', 'mock-jwt-token');
  // });

  // Example 3: Call the app's own login API via module injection (Vue/Vite)
  // await page.evaluate(() => {
  //   return new Promise((resolve) => {
  //     const script = document.createElement('script');
  //     script.type = 'module';
  //     script.textContent = `
  //       import { useUserStore } from '/src/store/modules/user.ts';
  //       import { fetchLogin } from '/src/api/auth.ts';
  //       const res = await fetchLogin({ userName: 'Admin', password: '123456' });
  //       useUserStore().setToken(res.token, res.refreshToken);
  //       window.dispatchEvent(new CustomEvent('auth-done'));
  //     `;
  //     document.head.appendChild(script);
  //     window.addEventListener('auth-done', () => resolve(true), { once: true });
  //   });
  // });
}
```

Then use it:
```bash
npx tsx <SKILL_DIR>/scripts/snapshot.ts \
  --url http://localhost:5173/#/dashboard \
  --output .stitch/dashboard.html \
  --auth-script ./auth-myapp.ts \
  --inline-canvas \
  --wait 5000
```

The script navigates to the `--url` first (which may redirect to login), runs your auth function, then **re-navigates** to the original `--url` with the authenticated session.

***

## Strategy B: Browser Subagent Capture

Use when you need to **interact with the page** (click buttons, fill forms, navigate tabs) before capturing. The browser subagent gives you full control but output may truncate for large pages.

### Workflow

1.  **Start the App** locally.
2.  **Navigate** using a browser subagent.
3.  **Interact** as needed (click, scroll, fill forms).
4.  **Extract DOM**: `document.documentElement.outerHTML`

    > [!WARNING]
    > Large pages may truncate. To handle this:
    > - Remove `<style>` tags before extraction: `document.querySelectorAll('style').forEach(el => el.remove())`
    > - Re-add styles statically (Tailwind CDN link, source CSS)
5.  **Save** to file.

***

## Appendix: Static Fallback (MockPage.jsx)

> [!NOTE]
> This method is a **last resort** for when the app cannot run locally (broken deps, missing backend, auth walls with no bypass). It requires manually flattening React components into a single JSX file. **Prefer Strategy A whenever possible.**

### When to Use

- App can't run locally at all
- Page requires auth with no mock/bypass
- You need a specific UI state that's impossible to reach by navigation (error screens, empty states)

### Quick Reference

```bash
npx tsx <SKILL_DIR>/scripts/extract_inline_html.ts \
  --index-css src/css/App.css \
  --extra-css index.html \
  --outdir .stitch \
  --page src/MockPage.jsx:Page.html:"Page Title"
```

**Key flags**: `--no-tailwind` (non-Tailwind apps), `--html-class dark` (dark mode), `--css-files` (extra CSS files).

**Auto-detection**: Tailwind config is auto-detected. `@apply` directives automatically use `<style type="text/tailwindcss">`.

### MockPage.jsx Rules

1. **Include the full layout** — header, sidebar, footer (read `App.js` first)
2. **Flatten all conditionals** — pick one state, remove all ternaries and `&&` guards
3. **Hardcode all data** — replace `{variable}` with concrete values, unroll `.map()` loops
4. **Preserve logos** — use `<img>` with local paths (post-process will inline them)
5. **Remove floating elements** — cookie banners, chat widgets, feedback buttons

### Post-Processing

Inline local images:
```bash
npx tsx <SKILL_DIR>/scripts/post_process.ts \
  .stitch/Page.html --base-dir <app-directory>
```
