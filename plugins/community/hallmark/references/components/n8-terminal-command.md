### N8 · Terminal command
A nav formatted as a CLI prompt: `> studio --catalog --voice --get▮`. The "links" are command flags. The blinking cursor (`▮`) is allowed *only here* (it has purpose — signals "you'd type next"); never standalone elsewhere on the page. Reads as Vercel CLI docs landing, Charm, Mitchell Hashimoto's site.
*Use when:* the page is a CLI tool, dev-tool docs, or carries the Terminal theme.
*Don't confuse with:* N4 ⌘K-only (which is a palette, not a visible bar).

```html
<header class="nav-term">
  <pre class="nav-term__line"><span class="prompt">&gt;</span> studio <a href="#catalog">--catalog</a> <a href="#voice">--voice</a> <a href="#get">--get</a><span class="caret" aria-hidden="true">▮</span></pre>
</header>
```
```css
.nav-term { padding: var(--space-sm) var(--page-gutter); border-bottom: var(--rule-hair) solid var(--color-rule); }
.nav-term__line { font-family: var(--font-outlier, ui-monospace, "JetBrains Mono", monospace); font-size: var(--text-sm); margin: 0; }
.nav-term__line .prompt { color: var(--color-accent); padding-right: 0.4ch; }
.nav-term__line a { color: var(--color-ink); text-decoration: underline; text-underline-offset: 2px; }
.caret { display: inline-block; width: 1ch; animation: blink 1.05s steps(2) infinite; color: var(--color-accent); }
@keyframes blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .caret { animation: none; opacity: 1; } }
```

*Anti-pattern:* using `>` prompt vocabulary on a non-developer site (a wedding photographer's portfolio with a `> view --gallery` nav reads as set decoration). N8 belongs to genuine terminal / CLI brands only.
