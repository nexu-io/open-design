/**
 * Built-in design direction library.
 *
 * Distilled from huashu-design's "5 schools × 20 philosophies" idea: when
 * the user hasn't specified a brand and selected "Pick a direction for me"
 * in the discovery form, the agent emits a *second* `<question-form>` whose
 * radio options are these 5 schools. Each school carries a concrete spec —
 * fonts, palette in OKLch, mood keywords, real-world references — that the
 * agent then encodes into the active CSS `:root` tokens before generating.
 *
 * The library has TWO purposes:
 *
 *   1. Render-time: the prompt embeds these as choices the user picks from.
 *      One radio click → a deterministic palette + type stack, no model
 *      improvisation.
 *   2. Build-time: once chosen, the agent sees the full spec (palette
 *      values, font stacks, layout posture, mood) inline in its system
 *      prompt and binds the seed template's `:root` to those values.
 *
 * Adding a new direction: append to `DESIGN_DIRECTIONS` and it shows up in
 * the picker automatically. Keep them visually *distinct* — two near-
 * identical directions defeat the purpose.
 */
export interface DesignDirection {
    /** kebab-case id, also the form-option label after `: ` */
    id: string;
    /** Short user-facing label, shown in the radio. ≤ 56 chars including the dash list. */
    label: string;
    /** One-paragraph mood description shown to the user as `help`. */
    mood: string;
    /** References / exemplars — real magazines, products, designers. */
    references: string[];
    /** Headline (display) font stack. CSS-ready. */
    displayFont: string;
    /** Body font stack. CSS-ready. */
    bodyFont: string;
    /** Optional mono override; falls back to ui-monospace. */
    monoFont?: string;
    /** Six palette values in OKLch — bind directly to seed `:root`. */
    palette: {
        bg: string;
        surface: string;
        fg: string;
        muted: string;
        border: string;
        accent: string;
    };
    /** Layout posture cues for the agent. Concrete, not vague. */
    posture: string[];
}
export declare const DESIGN_DIRECTIONS: DesignDirection[];
/**
 * Render the direction-picker form body for emission as a `<question-form>`.
 * Uses the `direction-cards` question type so the UI renders each option
 * as a rich card (palette swatches + type sample + mood blurb + refs)
 * instead of a plain radio. Falls back gracefully — older clients that
 * don't recognise `direction-cards` treat it as text.
 */
export declare function renderDirectionFormBody(): string;
/**
 * The block we splice into the system prompt so the agent has each
 * direction's full spec inline (palette, fonts, posture). Used by the
 * discovery prompt to teach the agent *how* to bind a chosen direction
 * onto the seed template's `:root` variables.
 */
export declare function renderDirectionSpecBlock(): string;
/** Look up a direction by its `label` (what the user sees in the form). */
export declare function findDirectionByLabel(label: string): DesignDirection | undefined;
//# sourceMappingURL=directions.d.ts.map