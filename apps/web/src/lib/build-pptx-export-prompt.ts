export function buildPptxExportPrompt(fileName: string): string {
  const baseTitle = fileName.replace(/\.html?$/i, '') || fileName;

  return (
    `Export @${fileName} as an editable PPTX file titled "${baseTitle}".\n\n` +
    `Save it in the current project folder (this conversation's working directory) as ` +
    `\`${baseTitle}.pptx\`.\n\n` +
    `Prefer the checked-in \`skills/pptx-html-fidelity-audit\` flow when that repo path is ` +
    `accessible here and the environment can run it. In that case, use \`python-pptx\` ` +
    `(preferred — full XML control), apply the footer-rail + cursor-flow discipline from ` +
    `\`skills/pptx-html-fidelity-audit/SKILL.md\` Step 4, preserve \`<em>\` / \`<i>\` as ` +
    `\`italic=True\` on Latin runs only, set the \`<a:latin>\` and \`<a:ea>\` typeface ` +
    `slots explicitly, and gate the result with \`python ` +
    `skills/pptx-html-fidelity-audit/scripts/verify_layout.py "${baseTitle}.pptx"\`.\n\n` +
    `Editable fidelity requirements: reproduce the browser deck as editable PowerPoint ` +
    `objects, not as full-slide screenshots. Create text as editable text boxes with stable ` +
    `font slots, line heights, weights, colors, alignment, and rich text emphasis; create ` +
    `cards, bullets, progress rails, chart bars, borders, rounded rectangles, and simple ` +
    `background layers as native PPTX shapes. Resolve CSS \`color-mix()\`, gradients, ` +
    `rgba/opacity, shadows, and borders into explicit Office-compatible fills/effects where ` +
    `possible. Use localized raster images only for isolated effects that PowerPoint cannot ` +
    `represent natively; do not rasterize an entire slide unless you explicitly report that ` +
    `the slide could not be made materially editable.\n\n` +
    `Font and layout discipline: map CSS font stacks to Office-safe fonts with Chinese text ` +
    `using \`PingFang SC\`, \`Microsoft YaHei\`, or \`Noto Sans CJK SC\` in the \`<a:ea>\` ` +
    `slot and Latin text using the requested Latin face in \`<a:latin>\`. If a requested font ` +
    `is unavailable, choose a stable fallback before sizing text. Measure text boxes from the ` +
    `browser-rendered layout when possible, size boxes to avoid reflow, and disable any PPTX ` +
    `autofit behavior that enlarges text or changes the layout.\n\n` +
    `Asset discipline: resolve every local and relative artifact image before export, embed ` +
    `each referenced image once, and verify all PPTX relationship targets exist. Do not ignore ` +
    `missing images or path-resolution errors; report them as export failures because they ` +
    `cause visually incorrect and hard-to-edit slides.\n\n` +
    `If that audited repo flow is genuinely unavailable, use any other PPTX-capable toolchain ` +
    `that is actually available in this environment. Do not refuse solely because a specific ` +
    `library, skill, or verifier is unavailable. If \`python-pptx\`, PptxGenJS, or a PPTX ` +
    `verification helper is missing, try another available approach instead. Only report that ` +
    `editable export is impossible if no available toolchain here can produce materially ` +
    `editable slides.\n\n` +
    `After creating the file, run the strongest validation that is actually available in this ` +
    `environment and report: (1) the on-disk path, (2) whether editable export succeeded, ` +
    `(3) which validation you ran, and (4) a 1-line fidelity summary. If the only possible ` +
    `output would be a mostly rasterized or image-heavy deck, do not present that as a ` +
    `successful editable export — explicitly report that materially editable export was not ` +
    `possible in the current environment. Do not claim the fidelity is verified if you could ` +
    `not run a real validation step.`
  );
}
