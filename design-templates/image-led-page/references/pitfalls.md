# Pitfalls

Failure modes that generated imagery produces reliably. Each one has shipped
in a finished-looking page. They are listed in the order they tend to bite.

## 1. The model renames your product

**Symptom.** A generated UI screenshot comes back polished, well-composed, and
carrying a product name nobody chose — a plausible neighbour of the real one.
The page ships advertising someone else's brand.

**Why.** A prompt that says "a dashboard for a monitoring product" leaves the
logotype undetermined, and an image model never renders an empty logo slot.

**Fix.** Quote every string that must appear, and forbid the rest:

```text
The word "ACME" appears as the logo. All labels are in German.
No other brand name appears anywhere in the image.
```

The one exception is a screen belonging to a fictional customer inside your
product — there a foreign name is correct, so say which name.

## 2. A generated screenshot invents facts

**Symptom.** The hero shot shows `99.98% uptime`, four-and-a-half stars, or an
ISO badge. Nobody wrote those; the model filled the composition.

**Why.** Dashboards, review cards, and packaging are dense with numbers in the
training data, so the model produces numbers.

**Fix.** Either name the exact figures in the prompt because they are true, or
instruct the image to carry no numerals, ratings, or certification marks at
all. Reject and regenerate anything that arrives with an unverified claim —
including one that happens to be flattering.

## 3. Navigation specificity eats the header button

**Symptom.** Every button on the page is fine except the one in the header,
which is white text on its own light background, or the reverse.

**Why.** `.nav a { color: var(--muted) }` and `.btn-primary { color: #fff }`
have the same specificity, so source order decides. The nav rule usually comes
later. Nothing in the markup looks wrong and the linter has nothing to flag.

**Fix.** Bind the exception explicitly and check it visually:

```css
.nav a.btn-primary { color: #fff; }
```

Check every button that sits on a coloured surface, not only the header — this
is a cascade problem, and headers are just where it surfaces most.

## 4. Relative asset paths vanish in single-file contexts

**Symptom.** The page is perfect in its own folder and image-less everywhere
else — pasted into a canvas, deployed as one file, mailed to a reviewer.

**Why.** `assets/hero.png` resolves against the document's location. Move the
document and the images stay behind.

**Fix.** For any context where the HTML travels alone, inline the images as
`data:` URIs. Then prove it: copy the file into an empty directory, open it
there, and confirm every image still renders.

## 5. A screenshot taken from the wrong directory lies

**Symptom.** A verification screenshot shows the page in Times New Roman with
browser-default colours. The obvious conclusion — the fonts and tokens are
broken — is wrong.

**Why.** The check copy was written somewhere convenient (a temp directory)
instead of beside the original, so its relative stylesheet link resolved to
nothing. The page was never broken; the screenshot was.

**Fix.** Write check copies **into the same directory as the page**, named so
they are obvious (`_check-1.html`), and delete them afterwards. Before
reporting any styling defect from a screenshot, confirm the stylesheet
actually loaded.

## 6. The screenshot is not the width you asked for

**Symptom.** A mobile screenshot looks like a narrow desktop layout, or content
is cropped at the right edge with no error.

**Why.** Headless browsers do not always honour very small window widths, and
they report success either way.

**Fix.** Read the produced image's actual pixel width before drawing
conclusions from it. If it does not match the request, the shot is not evidence
about mobile.

## 7. Exit code 0 is not proof of a finished file

**Symptom.** A build step reports success. The page is half-written: a
truncated section, three of nine images placed, no closing tag.

**Why.** Agents and CLIs report their own process status, not whether the
artifact they were asked for is complete.

**Fix.** Assert on the artifact. Does it end with `</html>`? Does it reference
every slot in the manifest? Does `od lint` parse it? Those are the checks that
answer the question the exit code only appears to answer.

## 8. Generated images are far too heavy to ship

**Symptom.** A nine-image page weighs 20 MB. It looks fine on the machine that
built it.

**Why.** Image models return large lossless files. That is the right default
for a source asset and the wrong one for a web page.

**Fix.** Before handoff, resize to the largest dimension the layout actually
uses and convert to a lossy format — keeping PNG only where transparency is
load-bearing, since flattening a cut-out onto JPEG gives it a white box. Then
update the references in the markup to the new filenames.
