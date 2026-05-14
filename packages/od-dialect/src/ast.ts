/**
 * ODML (Open Design Markup Language) — AST types.
 *
 * Single source of truth for what's legal in ODML output. The Layer 1 skill
 * validator and the Layer 3 SwiftUI translator both import from here. If they
 * ever diverge on the AST shape, integration breaks; this file is the contract.
 *
 * Plan: `calm-floating-fern` §4 (vocabulary), §11 (precursor).
 */

// =============================================================================
// Token enums — every styling value in ODML MUST be one of these (or a bind).
// =============================================================================

export const OD_COLORS = [
  'bg',
  'bg-elevated',
  'bg-overlay',
  'fg',
  'fg-muted',
  'fg-subtle',
  'accent',
  'accent-fg',
  'success',
  'warning',
  'danger',
  'border',
  'border-strong',
] as const;
export type ODColor = (typeof OD_COLORS)[number];

export const OD_SPACING = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const;
export type ODSpacing = (typeof OD_SPACING)[number];

export const OD_RADIUS = ['none', 'sm', 'md', 'lg', 'xl', 'full'] as const;
export type ODRadius = (typeof OD_RADIUS)[number];

export const OD_TEXT_STYLES = [
  'display',
  'title',
  'headline',
  'body',
  'caption',
  'mono',
] as const;
export type ODTextStyle = (typeof OD_TEXT_STYLES)[number];

export const OD_ICON_SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
export type ODIconSize = (typeof OD_ICON_SIZES)[number];

export const OD_AVATAR_SIZES = ['sm', 'md', 'lg'] as const;
export type ODAvatarSize = (typeof OD_AVATAR_SIZES)[number];

export const OD_BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'destructive'] as const;
export type ODButtonVariant = (typeof OD_BUTTON_VARIANTS)[number];

export const OD_BUTTON_SIZES = ['sm', 'md', 'lg'] as const;
export type ODButtonSize = (typeof OD_BUTTON_SIZES)[number];

export const OD_BADGE_VARIANTS = ['neutral', 'success', 'warning', 'danger'] as const;
export type ODBadgeVariant = (typeof OD_BADGE_VARIANTS)[number];

export const OD_KEYBOARDS = ['default', 'email', 'number', 'decimal'] as const;
export type ODKeyboard = (typeof OD_KEYBOARDS)[number];

export const OD_PROGRESS_STYLES = ['bar', 'ring'] as const;
export type ODProgressStyle = (typeof OD_PROGRESS_STYLES)[number];

export const OD_STACK_DIRECTIONS = ['vertical', 'horizontal', 'z'] as const;
export type ODStackDirection = (typeof OD_STACK_DIRECTIONS)[number];

export const OD_ALIGNMENTS = ['leading', 'center', 'trailing'] as const;
export type ODAlignment = (typeof OD_ALIGNMENTS)[number];

export const OD_JUSTIFY = ['start', 'center', 'end', 'space-between'] as const;
export type ODJustify = (typeof OD_JUSTIFY)[number];

export const OD_DIRECTIONS_ALL = ['vertical', 'horizontal'] as const;
export type ODScrollDirection = (typeof OD_DIRECTIONS_ALL)[number];

export const OD_ORIENTATIONS = ['horizontal', 'vertical'] as const;
export type ODOrientation = (typeof OD_ORIENTATIONS)[number];

export const OD_SAFE_AREAS = ['all', 'top', 'bottom', 'none'] as const;
export type ODSafeArea = (typeof OD_SAFE_AREAS)[number];

export const OD_IMAGE_ASPECTS = ['square', 'portrait', 'landscape', 'fill'] as const;
export type ODImageAspect = (typeof OD_IMAGE_ASPECTS)[number];

// =============================================================================
// Behaviour references — bind paths and action names are typed strings.
// =============================================================================

export interface ODBindPath {
  /** Dotted path into the screen view model state, e.g. `"workout.name"` or
   *  `"{workout}.name"` inside an <od-list item="workout"> template. */
  readonly path: string;
}

export interface ODActionRef {
  /** Kebab-case identifier the screen view model implements as a closure. */
  readonly name: string;
  /** Extra `data-*` attributes passed to the action as parameters. */
  readonly data?: Readonly<Record<string, string>>;
}

/**
 * Some attributes accept either a token literal OR a bind expression
 * (e.g. `<od-progress value="0.5">` and `<od-progress value="bind:workout.progress">`).
 */
export type ODValueOrBind<T> =
  | { readonly kind: 'literal'; readonly value: T }
  | { readonly kind: 'bind'; readonly path: string };

// =============================================================================
// Source position — every node carries enough info for line/col error reports.
// =============================================================================

export interface ODSourcePosition {
  readonly line: number; // 1-indexed
  readonly col: number; // 1-indexed
}

export interface ODSourceSpan {
  readonly start: ODSourcePosition;
  readonly end: ODSourcePosition;
}

// =============================================================================
// Tag union — every element in ODML is exactly one of these.
// =============================================================================

export type ODTagName =
  | 'od-screen'
  | 'od-stack'
  | 'od-grid'
  | 'od-scroll'
  | 'od-card'
  | 'od-spacer'
  | 'od-divider'
  | 'od-text'
  | 'od-icon'
  | 'od-image'
  | 'od-avatar'
  | 'od-badge'
  | 'od-progress'
  | 'od-button'
  | 'od-input'
  | 'od-toggle'
  | 'od-list'
  | 'od-nav-bar'
  | 'od-tab-bar'
  | 'od-sheet';

export const OD_TAG_NAMES: readonly ODTagName[] = [
  'od-screen',
  'od-stack',
  'od-grid',
  'od-scroll',
  'od-card',
  'od-spacer',
  'od-divider',
  'od-text',
  'od-icon',
  'od-image',
  'od-avatar',
  'od-badge',
  'od-progress',
  'od-button',
  'od-input',
  'od-toggle',
  'od-list',
  'od-nav-bar',
  'od-tab-bar',
  'od-sheet',
];

// -----------------------------------------------------------------------------
// Containers
// -----------------------------------------------------------------------------

export interface ODScreen {
  readonly kind: 'od-screen';
  readonly background?: ODColor;
  readonly safeArea?: ODSafeArea;
  readonly children: readonly ODElement[];
  readonly span: ODSourceSpan;
}

export interface ODStack {
  readonly kind: 'od-stack';
  readonly direction: ODStackDirection;
  readonly spacing?: ODSpacing;
  readonly padding?: ODSpacing;
  readonly align?: ODAlignment;
  readonly justify?: ODJustify;
  readonly children: readonly ODElement[];
  readonly span: ODSourceSpan;
}

export interface ODGrid {
  readonly kind: 'od-grid';
  readonly columns: number;
  readonly spacing?: ODSpacing;
  readonly children: readonly ODElement[];
  readonly span: ODSourceSpan;
}

export interface ODScroll {
  readonly kind: 'od-scroll';
  readonly direction: ODScrollDirection;
  readonly children: readonly ODElement[];
  readonly span: ODSourceSpan;
}

export interface ODCard {
  readonly kind: 'od-card';
  readonly padding?: ODSpacing;
  readonly radius?: ODRadius;
  readonly background?: ODColor;
  readonly children: readonly ODElement[];
  readonly span: ODSourceSpan;
}

export interface ODSpacerEl {
  readonly kind: 'od-spacer';
  readonly span: ODSourceSpan;
}

export interface ODDivider {
  readonly kind: 'od-divider';
  readonly orientation?: ODOrientation;
  readonly span: ODSourceSpan;
}

// -----------------------------------------------------------------------------
// Content
// -----------------------------------------------------------------------------

export interface ODText {
  readonly kind: 'od-text';
  readonly style: ODTextStyle;
  readonly color?: ODColor;
  readonly align?: ODAlignment;
  /** Inline text content. Mutually exclusive with `bind`. */
  readonly text?: string;
  /** Bind to a string in the view-model. Mutually exclusive with `text`. */
  readonly bind?: ODBindPath;
  readonly span: ODSourceSpan;
}

export interface ODIcon {
  readonly kind: 'od-icon';
  readonly name: string; // SF Symbol name; not enumerated here — too many
  readonly size?: ODIconSize;
  readonly color?: ODColor;
  readonly span: ODSourceSpan;
}

export interface ODImage {
  readonly kind: 'od-image';
  readonly source: string; // asset name; consumer-validated
  readonly aspect?: ODImageAspect;
  readonly radius?: ODRadius;
  readonly span: ODSourceSpan;
}

export interface ODAvatar {
  readonly kind: 'od-avatar';
  readonly source: string;
  readonly size?: ODAvatarSize;
  readonly span: ODSourceSpan;
}

export interface ODBadge {
  readonly kind: 'od-badge';
  readonly variant: ODBadgeVariant;
  readonly text: string | ODBindPath;
  readonly span: ODSourceSpan;
}

export interface ODProgress {
  readonly kind: 'od-progress';
  readonly value: ODValueOrBind<number>;
  readonly style: ODProgressStyle;
  readonly span: ODSourceSpan;
}

// -----------------------------------------------------------------------------
// Interactive
// -----------------------------------------------------------------------------

export interface ODButton {
  readonly kind: 'od-button';
  readonly variant: ODButtonVariant;
  readonly size?: ODButtonSize;
  readonly action: ODActionRef;
  readonly disabled?: boolean;
  /** Children must be ODText or ODIcon only — validator enforces. */
  readonly children: readonly (ODText | ODIcon)[];
  readonly span: ODSourceSpan;
}

export interface ODInput {
  readonly kind: 'od-input';
  readonly bind: ODBindPath;
  readonly placeholder?: string;
  readonly keyboard?: ODKeyboard;
  readonly secure?: boolean;
  readonly span: ODSourceSpan;
}

export interface ODToggle {
  readonly kind: 'od-toggle';
  readonly bind: ODBindPath;
  readonly label: string;
  readonly span: ODSourceSpan;
}

export interface ODList {
  readonly kind: 'od-list';
  /** Bind to an array in the view-model. */
  readonly bind: ODBindPath;
  /** Identifier used inside the template to reference the per-item record,
   *  e.g. `item="workout"` lets the template say `bind="{workout}.name"`. */
  readonly item: string;
  /** Template — repeated once per element. May reference `{item}.field`. */
  readonly template: readonly ODElement[];
  readonly span: ODSourceSpan;
}

// -----------------------------------------------------------------------------
// Navigation chrome
// -----------------------------------------------------------------------------

export interface ODNavBar {
  readonly kind: 'od-nav-bar';
  readonly title: string;
  readonly leading?: ODActionRef;
  readonly trailing?: ODActionRef;
  readonly span: ODSourceSpan;
}

export interface ODTabBar {
  readonly kind: 'od-tab-bar';
  readonly tabs: readonly string[];
  readonly active: string;
  readonly span: ODSourceSpan;
}

export interface ODSheet {
  readonly kind: 'od-sheet';
  readonly action: ODActionRef;
  /** State path that gates presentation, e.g. `"showWorkoutDetail"`. */
  readonly present: ODBindPath;
  readonly children: readonly ODElement[];
  readonly span: ODSourceSpan;
}

// =============================================================================
// Element union + tree root.
// =============================================================================

export type ODElement =
  | ODScreen
  | ODStack
  | ODGrid
  | ODScroll
  | ODCard
  | ODSpacerEl
  | ODDivider
  | ODText
  | ODIcon
  | ODImage
  | ODAvatar
  | ODBadge
  | ODProgress
  | ODButton
  | ODInput
  | ODToggle
  | ODList
  | ODNavBar
  | ODTabBar
  | ODSheet;

export interface ODTree {
  /** Always exactly one <od-screen> root per ODML document. */
  readonly root: ODScreen;
  /** Raw ODML source — preserved for error messages and diagnostics. */
  readonly source: string;
}

// =============================================================================
// Violations — every rejection has a typed kind + span so the LLM can be
// re-prompted with a precise correction.
// =============================================================================

export type ODViolationKind =
  | 'malformed-xml'
  | 'unknown-tag'
  | 'unknown-attribute'
  | 'missing-required-attribute'
  | 'unknown-token'
  | 'literal-rejected'
  | 'text-outside-od-text'
  | 'wrong-root'
  | 'multiple-roots'
  | 'invalid-child'
  | 'extra-content';

export interface ODViolationBase {
  readonly span: ODSourceSpan;
  /** Human-readable message suitable for inclusion in a re-prompt to the LLM. */
  readonly message: string;
  /** Suggested correction, if the violation has a unique fix. */
  readonly suggestion?: string;
}

export interface ODViolationMalformedXml extends ODViolationBase {
  readonly kind: 'malformed-xml';
  readonly detail: string;
}

export interface ODViolationUnknownTag extends ODViolationBase {
  readonly kind: 'unknown-tag';
  readonly tag: string;
}

export interface ODViolationUnknownAttribute extends ODViolationBase {
  readonly kind: 'unknown-attribute';
  readonly tag: ODTagName;
  readonly attribute: string;
}

export interface ODViolationMissingRequiredAttribute extends ODViolationBase {
  readonly kind: 'missing-required-attribute';
  readonly tag: ODTagName;
  readonly attribute: string;
}

export interface ODViolationUnknownToken extends ODViolationBase {
  readonly kind: 'unknown-token';
  readonly tag: ODTagName;
  readonly attribute: string;
  readonly tokenType: 'color' | 'spacing' | 'radius' | 'text-style' | 'icon-size' | 'avatar-size' | 'button-variant' | 'button-size' | 'badge-variant' | 'keyboard' | 'progress-style' | 'stack-direction' | 'alignment' | 'justify' | 'scroll-direction' | 'orientation' | 'safe-area' | 'image-aspect';
  readonly value: string;
}

export interface ODViolationLiteralRejected extends ODViolationBase {
  readonly kind: 'literal-rejected';
  readonly tag: ODTagName;
  readonly attribute: string;
  readonly value: string;
  /** Literal kind detected — used to compose the suggestion. */
  readonly literalKind: 'hex-color' | 'rgba-color' | 'pixel' | 'rem' | 'em' | 'percent' | 'arbitrary-string';
}

export interface ODViolationTextOutsideOdText extends ODViolationBase {
  readonly kind: 'text-outside-od-text';
  readonly parent: ODTagName;
  readonly text: string;
}

export interface ODViolationWrongRoot extends ODViolationBase {
  readonly kind: 'wrong-root';
  readonly got: string;
}

export interface ODViolationMultipleRoots extends ODViolationBase {
  readonly kind: 'multiple-roots';
  readonly count: number;
}

export interface ODViolationInvalidChild extends ODViolationBase {
  readonly kind: 'invalid-child';
  readonly parent: ODTagName;
  readonly child: ODTagName | 'text';
}

export interface ODViolationExtraContent extends ODViolationBase {
  readonly kind: 'extra-content';
  readonly content: string;
}

export type ODViolation =
  | ODViolationMalformedXml
  | ODViolationUnknownTag
  | ODViolationUnknownAttribute
  | ODViolationMissingRequiredAttribute
  | ODViolationUnknownToken
  | ODViolationLiteralRejected
  | ODViolationTextOutsideOdText
  | ODViolationWrongRoot
  | ODViolationMultipleRoots
  | ODViolationInvalidChild
  | ODViolationExtraContent;

// =============================================================================
// Parse / validate result envelopes.
// =============================================================================

export type ODParseResult =
  | { readonly ok: true; readonly tree: ODTree }
  | { readonly ok: false; readonly violations: readonly ODViolation[] };

/**
 * Re-prompt payload sent back to the LLM when the validator rejects output.
 * Skill runner consumes this and constructs a follow-up message that includes
 * the violations so the LLM learns the dialect from sharp, structured failures.
 */
export interface ODValidatorFeedback {
  /** Number of violations across all categories. */
  readonly violationCount: number;
  /** Grouped by kind so the re-prompt can address whole categories at once. */
  readonly violations: readonly ODViolation[];
  /** Suggested corrected ODML when the violations have unique fixes. */
  readonly suggestedFix?: string;
}
