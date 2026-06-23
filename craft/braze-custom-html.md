# Braze Custom-HTML IAM craft rules

Brand-agnostic technical constraints for Braze Custom-HTML In-App Messages.
Every rule cites the verified BRAZE-DOMAIN.md section that grounds it.
Brand-specific facts (personas, forbidden words, deeplink catalogs,
personalization attributes) belong in `design-systems/<brand>/DESIGN.md`,
not here.

> Source: BRAZE-DOMAIN.md (deep-research verification, 2026-06-23,
> 25 claims 3-vote verified / 0 killed). All claims cite primary
> `braze.com/docs` sources.

---

## 1. `brazeBridge` — the only bridge object (BRAZE-DOMAIN §2.2)

Always use `brazeBridge`. Never use `appboyBridge` — it is deprecated
(deprecation floor: Web SDK 3.3.0+ / Android 14.0.0+ / iOS 4.2.0+).
The deprecated alias still works at runtime but signals technical debt
and will eventually break.

All `brazeBridge` calls must be placed **inside** the `ab.BridgeReady`
callback to guarantee the bridge is ready before any call runs:

```html
<script>
  window.brazeBridge = window.brazeBridge || {};
  brazeBridge.BridgeReady = function (callback) {
    if (document.readyState !== 'loading') {
      callback();
    } else {
      document.addEventListener('ab.BridgeReady', callback);
    }
  };

  brazeBridge.BridgeReady(function () {
    // All brazeBridge calls live here
    document.getElementById('iam-cta-primary').addEventListener('click', function () {
      brazeBridge.logClick('0');
      // deeplink or closeMessage here
    });
  });
</script>
```

**Checklist item** (fails lint): any occurrence of `appboyBridge` in the
generated HTML.

**Checklist item** (fails lint): any `brazeBridge.*` call outside an
`ab.BridgeReady` / `brazeBridge.BridgeReady` callback block.

---

## 2. Click tracking — `logClick` mapping (BRAZE-DOMAIN §2.4)

| Element | Call |
|---|---|
| Button 1 (primary CTA) | `brazeBridge.logClick('0')` |
| Button 2 (secondary CTA) | `brazeBridge.logClick('1')` |
| Body / overlay tap (if tracked) | `brazeBridge.logClick()` — no argument |
| Custom named action | `brazeBridge.logClick('<label>')` |

Custom name constraints:
- Maximum **100 unique names per campaign** across all messages.
- Button ID string: max **255 characters**, alphanumeric + space + dash + underscore only.

Using human-readable labels for analytics is permitted and recommended:
`brazeBridge.logClick('signup-now')` is valid. If a label contains
Liquid output, use only the static prefix portion as the label.

**Checklist item** (fails lint): more than 2 `logClick` calls with
positional ids (`'0'`, `'1'`) in a single HTML file (CTA count overflow).

---

## 3. Android deeplinks — no `closeMessage()` on redirect (BRAZE-DOMAIN §2.3)

On Android, when a button triggers a deeplink or external URL,
**do not call `closeMessage()`** in the same click handler.
The SDK closes the message automatically on redirect; an explicit
`closeMessage()` call interferes, and if the user returns the message
becomes unresponsive.

`closeMessage()` is valid for non-link explicit dismiss actions (e.g. a
dedicated close/X button).

Correct pattern for a CTA with deeplink:

```js
brazeBridge.BridgeReady(function () {
  document.getElementById('iam-cta-primary').addEventListener('click', function () {
    brazeBridge.logClick('0');
    location.href = 'yourapp://action/signup'; // deeplink — no closeMessage()
  });

  document.getElementById('iam-close').addEventListener('click', function () {
    brazeBridge.closeMessage(); // explicit dismiss — OK
  });
});
```

**Checklist item** (fails lint): `closeMessage()` called in the same
event handler block that also sets `location.href` to a deeplink or
external URL.

---

## 4. Image constraints (BRAZE-DOMAIN §1.3, §1.4)

### Permitted formats

PNG, JPEG, GIF only. **WebP is not supported** across all devices and
browsers (BRAZE-DOMAIN §1.3). Convert WebP assets to PNG or JPEG before
embedding or referencing.

### Size limit

Recommended ≈ 500 KB, hard maximum **5 MB** (BRAZE-DOMAIN §1.3).

### Per-format aspect ratios (BRAZE-DOMAIN §1.4)

| IAM type | Variant | Ratio | High-res / minimum |
|---|---|---|---|
| Modal | image-only | 1:1 | 1200×2000 px / 600×600 px |
| Modal | with text | 29:10 | 1450×500 px / 600×205 px |
| Fullscreen | portrait + text | 6:5 | 1200×1000 px |
| Fullscreen | portrait image-only | 3:5 | 1200×2000 px |
| Fullscreen | landscape + text | 10:3 | 2000×600 px |
| Slideup | — | 1:1 | 150×150 px / 50×50 px min |

> Slideup HTML constraint: HTML IAM is a full-blocking WebView — it
> occupies the entire screen. Slideup (non-blocking by intent) produced
> as HTML creates a UX mismatch: looks like a toast but blocks all app
> interaction. Recommend native Braze slideup instead (BRAZE-DOMAIN §1.1).

**Checklist item** (fails lint): any `<img>` or inline image source with
a `.webp` extension or a data URI whose MIME type is `image/webp`.

---

## 5. CTA button count limit (BRAZE-DOMAIN §1.2)

Maximum **2 CTA buttons** per IAM (body-text + two analytics-enabled
buttons is the Braze modal/fullscreen limit). Slideup typically takes 1.

**Checklist item** (fails lint): more than 2 `<button>` or clickable
`<a>` elements styled as CTAs inside the IAM body.

---

## 6. JS execution gate — Web SDK flag (BRAZE-DOMAIN §2.1)

Custom HTML IAM JavaScript executes **only when** the Web SDK is
initialised with:

```js
braze.initialize('YOUR-API-KEY', { allowUserSuppliedJavascript: true });
```

This flag replaces the deprecated `enableHtmlInAppMessages`. It is a
Web SDK-specific flag — do not assume the same flag applies identically
to iOS/Android native SDKs.

**SDK version floors for HTML IAM upload-with-preview**:
- Swift SDK 5.0.0+
- Web SDK 2.5.0+
- Android SDK 8.0.0+

Users on older SDK versions are **silently excluded** (they receive no
message and no error). This is a caveat to note in handoff documentation;
it cannot be fixed in the HTML itself.

> Not a lint rule (cannot be checked inside the HTML artifact). Document
> this constraint in campaign handoff notes.

---

## 7. Single-file inline — no external resources

All CSS and JavaScript must be **inline** in the single HTML file. No
`<link rel="stylesheet">` to external files and no `<script src="...">`.
Braze Custom HTML does not support external resource loading.

Fonts: if the brand requires custom web fonts, embed the font as a
base64 data URI inside an inline `<style>` block.

**Checklist item** (fails lint): any `<link rel="stylesheet" href="...">` or
`<script src="...">` with a non-`data:` URL.

---

## 8. `id="iam-..."` on all body elements (inspector source-sync)

Every element inside `<body>` — `<div>`, `<button>`, `<h1>`–`<h6>`,
`<p>`, `<span>`, `<a>`, `<img>`, `<svg>` — must carry an
`id="iam-..."` attribute. This is required for Open Design's editor
inspector to locate and reverse-sync text/style edits back to the HTML
source.

Naming convention:
- Container: `iam-overlay`, `iam-modal`, `iam-sheet`, `iam-fullscreen`
- Sub-sections: `iam-modal-header`, `iam-modal-body`
- Close button: `iam-close`, icon svg: `iam-close-icon`
- Main icon wrapper: `iam-icon`, icon svg: `iam-{semantic}-svg`
- Text nodes: `iam-header`, `iam-body`, `iam-subbody`
- Divider: `iam-divider`
- CTAs: `iam-cta-primary`, `iam-cta-secondary`
- Semantic components: `iam-time-label`, `iam-checklist`, `iam-item-{n}`

SVG rule: assign `id` to the `<svg>` element itself. Do **not** assign
`id` to child `<path>`, `<rect>`, `<circle>` — the inspector operates
at svg level, not shape level.

**Checklist item** (fails lint): any `<div>`, `<button>`, `<p>`, `<span>`,
`<h1>`–`<h6>`, `<a>`, `<img>`, or `<svg>` inside `<body>` that lacks
an `id` attribute starting with `iam-`.

---

## Lint checklist summary

This file's rules are currently enforced via manual self-review
(main agent reads this list and checks the generated HTML). A
machine-readable lint-artifact harness does not yet exist in this repo.
Until one does, the agent MUST run through this list before calling
`od braze produce`.

| # | Rule | BRAZE-DOMAIN ref | Fail condition |
|---|---|---|---|
| 1 | No `appboyBridge` | §2.2 | `appboyBridge` present in HTML |
| 2 | brazeBridge inside BridgeReady | §2.2 | Direct call outside callback |
| 3 | logClick positional for buttons | §2.4 | Button 1 not `'0'`, button 2 not `'1'` |
| 4 | CTA ≤ 2 | §1.2 | More than 2 CTA buttons |
| 5 | No closeMessage on deeplink | §2.3 | closeMessage + location.href in same handler |
| 6 | No WebP images | §1.3 | `.webp` src or `image/webp` data URI |
| 7 | Image ≤ 5 MB | §1.3 | Base64 data URI decodes > 5 MB |
| 8 | Aspect ratio per format | §1.4 | Modal+text not 29:10, etc. |
| 9 | No external CSS/JS | §2 constraint | `<link>` or `<script src>` with http URL |
| 10 | All body elements have `id="iam-..."` | inspector contract | Missing id on any body element |

### Compliant HTML (passes all checks)

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <style>
    /* All CSS inline — no external stylesheet */
    .overlay { position:fixed; inset:0; background:rgba(0,0,0,.45);
                display:flex; align-items:center; justify-content:center; }
    .modal   { width:calc(100% - 40px); max-width:400px; border-radius:20px;
                padding:28px 20px; background:#fff; }
    .btn-primary:active { transform:scale(.98); }
  </style>
</head>
<body>
  <div id="iam-overlay" class="overlay" role="dialog" aria-modal="true">
    <div id="iam-modal" class="modal">
      <button id="iam-close" aria-label="닫기">✕</button>
      <h1 id="iam-header">헤드라인</h1>
      <p id="iam-body">본문 메시지</p>
      <button id="iam-cta-primary" class="btn-primary">지금 시작하기</button>
      <button id="iam-cta-secondary" class="btn-secondary">다음에 할게요</button>
    </div>
  </div>
  <script>
    window.brazeBridge = window.brazeBridge || {};
    brazeBridge.BridgeReady = function (cb) {
      if (document.readyState !== 'loading') { cb(); }
      else { document.addEventListener('ab.BridgeReady', cb); }
    };
    brazeBridge.BridgeReady(function () {
      document.getElementById('iam-cta-primary').addEventListener('click', function () {
        brazeBridge.logClick('0');           // Button 1 → '0' (BRAZE-DOMAIN §2.4)
        location.href = 'yourapp://signup'; // deeplink — no closeMessage (§2.3)
      });
      document.getElementById('iam-cta-secondary').addEventListener('click', function () {
        brazeBridge.logClick('1');           // Button 2 → '1' (BRAZE-DOMAIN §2.4)
        brazeBridge.closeMessage();          // explicit dismiss on non-deeplink (§2.3)
      });
      document.getElementById('iam-close').addEventListener('click', function () {
        brazeBridge.closeMessage();
      });
    });
  </script>
</body>
</html>
```

### Non-compliant HTML (fails checks 1, 5, 10)

```html
<!-- FAIL: appboyBridge (deprecated — §2.2) -->
<script>appboyBridge.logClick('buy');</script>

<!-- FAIL: closeMessage on deeplink handler — Android unresponsive risk (§2.3) -->
<button onclick="brazeBridge.logClick('0'); location.href='app://x'; brazeBridge.closeMessage();">CTA</button>

<!-- FAIL: element without id — inspector source-sync breaks -->
<p class="body-text">메시지 본문</p>
```
