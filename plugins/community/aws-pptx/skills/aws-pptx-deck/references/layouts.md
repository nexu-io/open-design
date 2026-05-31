# AWS slide layouts — paste-ready skeletons

Each block below is a `<section class="slide">` ready to drop into the deck framework. Replace every `[REPLACE]` with real copy. The first slide of the deck must carry `class="slide active s-cover"`; subsequent slides use `class="slide s-..."` (no `active`).

The framework auto-counts slides, paints `.active`, and toggles visibility — you only fill the inside.

---

## 1. Cover

```html
<section class="slide active s-cover" data-screen-label="01 Cover">
  <div class="cover-body">
    <div class="kicker">[SESSION CODE] · [TRACK]</div>
    <h1 class="display">[Deck title — sentence case, ≤ 8 words]</h1>
    <div class="meta">
      <span>[Speaker, title]</span>
      <span>[Event · Year]</span>
      <span class="session-code">[SESSION CODE]</span>
    </div>
  </div>
  <div class="accent-bar"></div>
</section>
```

---

## 2. Agenda

```html
<section class="slide s-agenda" data-screen-label="02 Agenda">
  <div class="slide-pad">
    <div class="kicker">Agenda</div>
    <h2 class="headline">[What we'll cover]</h2>
    <ol>
      <li>[Topic one]</li>
      <li>[Topic two]</li>
      <li>[Topic three]</li>
      <li>[Topic four]</li>
      <li>[Topic five]</li>
      <li>[Topic six]</li>
    </ol>
    <div class="footer">
      <span class="session">[SESSION CODE]</span>
      <span>aws.amazon.com</span>
    </div>
  </div>
</section>
```

---

## 3. Section divider

```html
<section class="slide s-section" data-screen-label="03 Section">
  <div>
    <div class="section-num">Section [NN]</div>
    <h2 class="section-title">[Section title]</h2>
    <div class="section-rule"></div>
  </div>
</section>
```

---

## 4. Content (bullets only — agenda / summary / explainer)

```html
<section class="slide s-content" data-screen-label="04 Content">
  <div class="slide-pad">
    <div class="kicker">[KICKER]</div>
    <h2 class="headline">[Slide headline]</h2>
    <ul>
      <li>[Bullet one — ≤ 15 words per line]</li>
      <li>[Bullet two]</li>
      <li>[Bullet three]</li>
      <li>[Bullet four]</li>
    </ul>
    <div class="footer">
      <span class="session">[SESSION CODE]</span>
      <span>aws.amazon.com</span>
    </div>
  </div>
</section>
```

---

## 5. Two-Column (image/diagram + bullets) — DEFAULT for technical/business slides

```html
<section class="slide s-two" data-screen-label="05 Two-Column">
  <div class="left">
    <!-- Replace with <img src="assets/diagrams/<name>.svg" alt="…"> when drawio output is ready -->
    <div class="placeholder">[DIAGRAM] · drawio · 1700×900</div>
  </div>
  <div class="right">
    <div class="kicker">[KICKER]</div>
    <h2 class="headline">[Slide headline]</h2>
    <ul>
      <li><b>[Term]</b> — [explanation, ≤ 15 words per line]</li>
      <li><b>[Term]</b> — [explanation]</li>
      <li><b>[Term]</b> — [explanation]</li>
      <li><b>[Term]</b> — [explanation]</li>
    </ul>
  </div>
  <div class="footer">
    <span class="session">[SESSION CODE]</span>
    <span>aws.amazon.com</span>
  </div>
</section>
```

Use `class="slide s-two split-7-5"` if the visual deserves more weight.

---

## 6. Architecture (full-bleed diagram)

```html
<section class="slide s-arch" data-screen-label="06 Architecture">
  <div class="arch-head">
    <div>
      <div class="kicker">Architecture</div>
      <h2 class="headline">[What this architecture solves]</h2>
    </div>
    <p class="body" style="max-width:36ch;">[One-line context — what's deployed and why]</p>
  </div>
  <div class="arch-stage">
    <!-- Drop the drawio export here:
         <img src="assets/diagrams/landing-zone.svg" alt="…">
         When the diagram isn't ready yet, leave the placeholder in place. -->
    <div class="arch-placeholder">drawio · 1700 × 900 · landing-zone.svg</div>
  </div>
  <div class="footer">
    <span class="session">[SESSION CODE]</span>
    <span>Diagram: drawio export · arrows #9BA7B6 · Arial 12pt labels</span>
  </div>
</section>
```

---

## 7. Demo / Code

```html
<section class="slide s-demo" data-screen-label="07 Demo">
  <div class="slide-pad">
    <div class="kicker">Demo</div>
    <h2 class="headline">[What we're showing]</h2>
    <div class="code-stage" aria-label="code">
      <div class="ln"><span><span class="kw">resource</span> <span class="st">"aws_s3_bucket"</span> <span class="st">"data"</span> {</span></div>
      <div class="ln"><span>  bucket = <span class="st">"acme-prod-data"</span></span></div>
      <div class="ln"><span>  acl    = <span class="st">"private"</span></span></div>
      <div class="ln"><span>}</span></div>
      <div class="ln"><span><span class="cm"># Encrypted, versioned, replicated cross-region.</span></span></div>
    </div>
    <div class="footer">
      <span class="session">[SESSION CODE]</span>
      <span>Consolas / Monaco · 16pt</span>
    </div>
  </div>
</section>
```

---

## 8. Customer Story (logo + quote + 3 metrics)

```html
<section class="slide s-customer" data-screen-label="08 Customer">
  <div class="logo">[CUSTOMER]</div>
  <p class="quote">[Pull quote — what changed for the customer]</p>
  <div></div>
  <div class="metrics">
    <div class="m"><span class="num">[NN]%</span><span class="label">[Outcome — e.g. infrastructure cost reduction]</span></div>
    <div class="m"><span class="num">[NN]×</span><span class="label">[Outcome — e.g. faster deployment]</span></div>
    <div class="m"><span class="num">[NN]</span><span class="label">[Outcome — e.g. weeks to migrate]</span></div>
  </div>
</section>
```

---

## 9. Comparison / Table

```html
<section class="slide s-table" data-screen-label="09 Comparison">
  <div class="slide-pad">
    <div class="kicker">Comparison</div>
    <h2 class="headline">[What the table answers]</h2>
    <table>
      <thead>
        <tr>
          <th>Workload</th>
          <th>Strategy</th>
          <th>Effort</th>
          <th>Risk</th>
          <th>Wave</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>[App A]</td><td>Rehost</td><td>Low</td><td><span class="pill ok">Low</span></td><td>1</td></tr>
        <tr><td>[App B]</td><td>Replatform</td><td>Medium</td><td><span class="pill warn">Medium</span></td><td>2</td></tr>
        <tr><td>[App C]</td><td>Refactor</td><td>High</td><td><span class="pill risk">High</span></td><td>3</td></tr>
        <tr><td>[App D]</td><td>Retire</td><td>—</td><td><span class="pill info">N/A</span></td><td>1</td></tr>
      </tbody>
    </table>
    <div class="footer">
      <span class="session">[SESSION CODE]</span>
      <span>Header #ED7100 · alt rows · 0.5pt borders</span>
    </div>
  </div>
</section>
```

---

## 10. Summary (3 takeaways)

```html
<section class="slide s-summary" data-screen-label="10 Summary">
  <div class="slide-pad">
    <div class="kicker">Summary</div>
    <h2 class="headline">[What you'll walk away with]</h2>
    <ol>
      <li>
        <span class="h">[Takeaway one]</span>
        <span class="b">[One-line elaboration — ≤ 15 words]</span>
      </li>
      <li>
        <span class="h">[Takeaway two]</span>
        <span class="b">[Elaboration]</span>
      </li>
      <li>
        <span class="h">[Takeaway three]</span>
        <span class="b">[Elaboration]</span>
      </li>
    </ol>
    <div class="footer">
      <span class="session">[SESSION CODE]</span>
      <span>aws.amazon.com</span>
    </div>
  </div>
</section>
```

---

## 11. Resources / CTA

```html
<section class="slide s-resources" data-screen-label="11 Resources">
  <div class="pane">
    <h3>Get started</h3>
    <ul>
      <li>[Quickstart name]<small>aws.amazon.com/[path]</small></li>
      <li>[Workshop name]<small>workshops.aws/[path]</small></li>
      <li>[Solutions Library]<small>aws.amazon.com/solutions</small></li>
    </ul>
  </div>
  <div class="pane">
    <h3>Go deeper</h3>
    <ul>
      <li>[Whitepaper]<small>d1.awsstatic.com/whitepapers/[name].pdf</small></li>
      <li>[Re:Invent talk]<small>youtu.be/[id]</small></li>
      <li>[Reference architecture]<small>aws.amazon.com/architecture</small></li>
    </ul>
  </div>
</section>
```

---

## 12. Q&A

```html
<section class="slide s-qa" data-screen-label="12 Q&A">
  <div>
    <div class="qa-headline">Q<span>&amp;</span>A</div>
    <p class="qa-sub">[Speaker name] · [handle / email] · [SESSION CODE]</p>
  </div>
</section>
```

---

## Choosing a layout (decision rule)

| Slide intent | Layout |
|---|---|
| Title / opener | Cover |
| Show-of-hands list of topics | Agenda |
| Mark a new act / chapter | Section divider |
| Pure narrative / argument | Content (bullets) |
| Technical / business explainer | **Two-Column** (default for `techVsBusiness=tech` or `business`) |
| System / data flow / VPC / multi-account | Architecture |
| Show config / IaC / SDK call | Demo / Code |
| Logo + 3 numbers + quote | Customer Story |
| Compare ≥ 3 options on ≥ 3 axes | Table |
| Closing recap (3 things to remember) | Summary |
| Where to next | Resources / CTA |
| Final slide before walkoff | Q&A |

When uncertain between Content and Two-Column on a technical/business slide, **always pick Two-Column**. Image+text is the deck's default.
