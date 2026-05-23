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
