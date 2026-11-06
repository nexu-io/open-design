/**
 * Height of one audio automation lane.
 *
 * Its own module because both the row layout and the lane itself need it, and
 * putting it in either would have the layout importing a component or the
 * component's constant living somewhere it is not used.
 *
 * Taller than a keyframe lane because it carries a value axis rather than a row
 * of diamonds: a fader envelope drawn 28px high cannot be aimed. 48 was still
 * too tight in use — the drawing area is the height minus 6px of padding either
 * side, so 48 left 36px for the whole 0..1 fader and a breakpoint's 11px grab
 * disc covered a third of the axis. 72 leaves 60px, which is what makes a value
 * aimable and two points at similar values separately grabbable.
 */
export const AUTOMATION_LANE_H = 72;
