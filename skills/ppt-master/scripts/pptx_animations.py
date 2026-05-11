#!/usr/bin/env python3
"""
PPT Master - PPTX Animation Module

Provides XML generation for slide transition effects and entrance animations.

Supported transition effects:
    - fade: Fade in/out
    - push: Push
    - wipe: Wipe
    - split: Split
    - strips: Strips (diagonal wipe)
    - cover: Cover
    - random: Random

Supported entrance animations (per-element):
    appear, fade, fly, cut, zoom, wipe, split, blinds, checkerboard,
    dissolve, random_bars, peek, wheel, box, circle, diamond, plus,
    strips, wedge, stretch, expand, swivel

Animation modes used by the builder:
    - single effect name (one of the above) — apply to every element
    - 'mixed'  — first element fades, the rest cycle through a curated visible pool
    - 'random' — pick a random effect from the same visible pool per element

Dependencies: None (pure XML generation)

Usage:
    python3 scripts/pptx_animations.py --demo
    python3 scripts/pptx_animations.py --list
"""

import argparse
from typing import Optional, Dict, Any


# ============================================================================
# Transition effect definitions
# ============================================================================

TRANSITIONS: Dict[str, Dict[str, Any]] = {
    'fade': {
        'name': 'Fade',
        'element': 'fade',
        'attrs': {},
    },
    'push': {
        'name': 'Push',
        'element': 'push',
        'attrs': {'dir': 'r'},  # Push from right
    },
    'wipe': {
        'name': 'Wipe',
        'element': 'wipe',
        'attrs': {'dir': 'r'},  # Wipe from right
    },
    'split': {
        'name': 'Split',
        'element': 'split',
        'attrs': {'orient': 'horz', 'dir': 'out'},
    },
    'strips': {
        'name': 'Strips',
        'element': 'strips',
        'attrs': {'dir': 'rd'},  # Diagonal wipe from bottom-right
    },
    'cover': {
        'name': 'Cover',
        'element': 'cover',
        'attrs': {'dir': 'r'},
    },
    'random': {
        'name': 'Random',
        'element': 'random',
        'attrs': {},
    },
}

def create_transition_xml(
    effect: str = 'fade',
    duration: float = 0.5,
    advance_after: Optional[float] = None
) -> str:
    """
    Generate a slide transition effect XML fragment

    Args:
        effect: Transition effect name (fade/push/wipe/split/strips/cover/random)
        duration: Transition duration (seconds, precise to milliseconds)
        advance_after: Auto-advance interval (seconds); None means manual advance

    Returns:
        A <p:transition> element string insertable into slide XML
    """
    if effect not in TRANSITIONS:
        effect = 'fade'

    trans_info = TRANSITIONS[effect]
    element_name = trans_info['element']
    attrs = trans_info['attrs']

    # Build dur attribute (milliseconds, precise control via Office 2010 extension)
    dur_ms = int(duration * 1000)
    dur_attr = f' p14:dur="{dur_ms}" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"'

    # Build auto-advance attribute
    adv_attr = ''
    if advance_after is not None:
        adv_tm = int(advance_after * 1000)  # Convert to milliseconds
        adv_attr = f' advTm="{adv_tm}"'

    # Build effect element attributes
    effect_attrs = ' '.join(f'{k}="{v}"' for k, v in attrs.items())
    if effect_attrs:
        effect_attrs = ' ' + effect_attrs

    # Generate XML
    return f'''  <p:transition{dur_attr}{adv_attr}>
    <p:{element_name}{effect_attrs}/>
  </p:transition>'''


# ============================================================================
# Entrance animation definitions
# ============================================================================

#
# 'filter' values must be valid PowerPoint <p:animEffect filter=".."/> strings
# (see ECMA-376 §19.5.10 ST_TLAnimateEffectTransition / filter dictionary).
# Effects with filter=None render as plain "Appear" (visibility flip only).
#
ANIMATIONS: Dict[str, Dict[str, Any]] = {
    'appear':   {'name': 'Appear',   'filter': None, 'presetID': 1, 'presetSubtype': 0},
    'fade':     {'name': 'Fade',     'filter': 'fade', 'presetID': 10, 'presetSubtype': 0},
    'fly':      {'name': 'Fly In',   'filter': 'slide(fromBottom)', 'presetID': 2, 'presetSubtype': 4},
    'cut':      {'name': 'Cut In',   'filter': 'slide(fromLeft)', 'presetID': 42, 'presetSubtype': 8},
    'zoom':     {'name': 'Zoom',     'filter': 'image', 'presetID': 23, 'presetSubtype': 0},
    'wipe':     {'name': 'Wipe',     'filter': 'wipe(left)', 'presetID': 22, 'presetSubtype': 1},
    'split':    {'name': 'Split',    'filter': 'barn(inVertical)', 'presetID': 16, 'presetSubtype': 21},
    'blinds':   {'name': 'Blinds',   'filter': 'blinds(horizontal)', 'presetID': 3, 'presetSubtype': 10},
    'checkerboard': {'name': 'Checkerboard', 'filter': 'checkerboard(across)', 'presetID': 5, 'presetSubtype': 6},
    'dissolve': {'name': 'Dissolve', 'filter': 'dissolve', 'presetID': 9, 'presetSubtype': 0},
    'random_bars': {'name': 'Random Bars', 'filter': 'randombar(horizontal)', 'presetID': 14, 'presetSubtype': 10},
    'peek':     {'name': 'Peek',     'filter': 'wipe(down)', 'presetID': 12, 'presetSubtype': 4},
    'wheel':    {'name': 'Wheel',    'filter': 'wheel(4)', 'presetID': 21, 'presetSubtype': 0},
    'box':      {'name': 'Box',      'filter': 'box(in)', 'presetID': 4, 'presetSubtype': 0},
    'circle':   {'name': 'Circle',   'filter': 'circle(in)', 'presetID': 6, 'presetSubtype': 0},
    'diamond':  {'name': 'Diamond',  'filter': 'diamond(in)', 'presetID': 8, 'presetSubtype': 0},
    'plus':     {'name': 'Plus',     'filter': 'plus(in)', 'presetID': 13, 'presetSubtype': 0},
    'strips':   {'name': 'Strips',   'filter': 'strips(downRight)', 'presetID': 18, 'presetSubtype': 12},
    'wedge':    {'name': 'Wedge',    'filter': 'wedge', 'presetID': 20, 'presetSubtype': 0},
    'stretch':  {'name': 'Stretch',  'filter': 'stretch(across)', 'presetID': 17, 'presetSubtype': 0},
    'expand':   {'name': 'Expand',   'filter': 'stretch(across)', 'presetID': 50, 'presetSubtype': 0},
    'swivel':   {'name': 'Swivel',   'filter': 'wheel(1)', 'presetID': 19, 'presetSubtype': 0},
}

# Pool used by 'mixed' / 'random' modes. Excludes 'appear' because it has no
# visible motion; mixed handles the first title-like element as fade separately.
_MIXED_POOL = [
    'blinds', 'checkerboard', 'dissolve', 'fly', 'cut',
    'random_bars', 'box', 'split', 'strips', 'wedge', 'wheel',
    'wipe', 'expand', 'fade', 'swivel', 'zoom',
]


def create_timing_xml(
    animation: str = 'fade',
    duration: float = 1.0,
    delay: float = 0,
    shape_id: int = 2
) -> str:
    """
    Generate an entrance animation timing XML fragment

    Args:
        animation: Animation effect name (fade/fly/zoom/appear)
        duration: Animation duration (seconds)
        delay: Animation delay (seconds)
        shape_id: Target shape ID (SVG image is typically 2)

    Returns:
        A <p:timing> element string insertable into slide XML
    """
    if animation not in ANIMATIONS:
        animation = 'fade'

    anim_info = ANIMATIONS[animation]
    dur_ms = int(duration * 1000)
    delay_ms = int(delay * 1000)

    # Generate different effect XML depending on animation type
    if anim_info['filter'] is None:
        # appear animation: only sets visibility
        effect_xml = f'''                            <p:set>
                              <p:cBhvr>
                                <p:cTn id="5" dur="1" fill="hold">
                                  <p:stCondLst><p:cond delay="{delay_ms}"/></p:stCondLst>
                                </p:cTn>
                                <p:tgtEl><p:spTgt spid="{shape_id}"/></p:tgtEl>
                                <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
                              </p:cBhvr>
                              <p:to><p:strVal val="visible"/></p:to>
                            </p:set>'''
    else:
        # Other animations: set visibility + animation effect
        filter_name = anim_info['filter']
        pr_attr = ''
        if 'prLst' in anim_info:
            pr_attr = f' prLst="{anim_info["prLst"]}"'

        effect_xml = f'''                            <p:set>
                              <p:cBhvr>
                                <p:cTn id="5" dur="1" fill="hold">
                                  <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                                </p:cTn>
                                <p:tgtEl><p:spTgt spid="{shape_id}"/></p:tgtEl>
                                <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
                              </p:cBhvr>
                              <p:to><p:strVal val="visible"/></p:to>
                            </p:set>
                            <p:animEffect transition="in" filter="{filter_name}"{pr_attr}>
                              <p:cBhvr>
                                <p:cTn id="6" dur="{dur_ms}"/>
                                <p:tgtEl><p:spTgt spid="{shape_id}"/></p:tgtEl>
                              </p:cBhvr>
                            </p:animEffect>'''

    return f'''  <p:timing>
    <p:tnLst>
      <p:par>
        <p:cTn id="1" dur="indefinite" nodeType="tmRoot">
          <p:childTnLst>
            <p:seq concurrent="1" nextAc="none">
              <p:cTn id="2" dur="indefinite" nodeType="mainSeq">
                <p:childTnLst>
                  <p:par>
                    <p:cTn id="3" fill="hold">
                      <p:stCondLst>
                        <p:cond delay="{delay_ms}"/>
                      </p:stCondLst>
                      <p:childTnLst>
                        <p:par>
                          <p:cTn id="4" fill="hold">
                            <p:childTnLst>
{effect_xml}
                            </p:childTnLst>
                          </p:cTn>
                        </p:par>
                      </p:childTnLst>
                    </p:cTn>
                  </p:par>
                </p:childTnLst>
              </p:cTn>
            </p:seq>
          </p:childTnLst>
        </p:cTn>
      </p:par>
    </p:tnLst>
  </p:timing>'''


def _build_effect_xml(
    animation: str,
    shape_id: int,
    duration_ms: int,
    set_id: int,
    eff_id: int,
) -> str:
    """Inner effect block for one target.

    Entrance effects are emitted as one animation pane row per target. Plain
    Appear uses a visibility set; motion/filter effects use animEffect directly
    to avoid duplicate rows for the same shape in PowerPoint.
    """
    anim_info = ANIMATIONS.get(animation, ANIMATIONS['fade'])
    set_block = f'''<p:set>
  <p:cBhvr>
    <p:cTn id="{set_id}" dur="1" fill="hold">
      <p:stCondLst><p:cond delay="0"/></p:stCondLst>
    </p:cTn>
    <p:tgtEl><p:spTgt spid="{shape_id}"/></p:tgtEl>
    <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
  </p:cBhvr>
  <p:to><p:strVal val="visible"/></p:to>
</p:set>'''
    if anim_info['filter'] is None:
        return set_block
    return set_block + f'''
<p:animEffect transition="in" filter="{anim_info["filter"]}">
  <p:cBhvr>
    <p:cTn id="{eff_id}" dur="{duration_ms}"/>
    <p:tgtEl><p:spTgt spid="{shape_id}"/></p:tgtEl>
  </p:cBhvr>
</p:animEffect>'''


def create_sequence_timing_xml(
    targets: list,
    duration: float = 0.3,
    trigger: str = 'after-previous',
) -> str:
    """Generate a multi-target entrance sequence.

    Args:
        targets: list of (shape_id, delay_ms, animation_name) tuples, in
            the order they should play. ``delay_ms`` is the gap before
            this element starts, measured from when the previous element
            triggers (only used in ``after-previous`` mode; ignored in
            the other two).
        duration: per-element entrance duration in seconds.
        trigger: PowerPoint-standard Start mode for each element.
            ``'after-previous'`` — first element fires on slide entry,
            rest chain after the previous one with ``delay_ms`` spacing
            (default).
            ``'on-click'`` — one presenter click per element.
            ``'with-previous'`` — all elements start together on slide
            entry.

    Returns:
        A ``<p:timing>`` element string. Returns an empty string when
        ``targets`` is empty.
    """
    if not targets:
        return ''

    if trigger not in ('on-click', 'with-previous', 'after-previous'):
        trigger = 'on-click'

    dur_ms = int(duration * 1000)
    next_id = 3

    if trigger == 'on-click':
        # Each element is an independent click-driven par directly under
        # mainSeq. Three-level nesting per element: outer cTn holds for
        # the click via delay="indefinite", innermost cTn owns the
        # clickEffect + animation children. Each click advances the seq.
        steps = []
        for target in targets:
            shape_id, _delay_ms, animation = target
            if animation not in ANIMATIONS:
                animation = 'fade'
            anim_info = ANIMATIONS[animation]
            preset_id = anim_info.get('presetID', 1)
            preset_subtype = anim_info.get('presetSubtype', 0)
            wrapper_id = next_id
            inner_id = next_id + 1
            leaf_id = next_id + 2
            set_id = next_id + 3
            eff_id = next_id + 4
            next_id += 5
            effect_xml = _build_effect_xml(animation, shape_id, dur_ms, set_id, eff_id)
            steps.append(f'''<p:par>
  <p:cTn id="{wrapper_id}" fill="hold">
    <p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
    <p:childTnLst>
      <p:par>
        <p:cTn id="{inner_id}" fill="hold">
          <p:stCondLst><p:cond delay="0"/></p:stCondLst>
          <p:childTnLst>
            <p:par>
              <p:cTn id="{leaf_id}" presetID="{preset_id}" presetClass="entr" presetSubtype="{preset_subtype}" fill="hold" nodeType="clickEffect">
                <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                <p:childTnLst>
                  {effect_xml}
                </p:childTnLst>
              </p:cTn>
            </p:par>
          </p:childTnLst>
        </p:cTn>
      </p:par>
    </p:childTnLst>
  </p:cTn>
</p:par>''')
        all_steps = '\n              '.join(steps)
    else:
        # with-previous / after-previous: wrap the entire cascade in ONE
        # par so the sequence has a real trigger anchor under mainSeq.
        #
        # Native PowerPoint after-previous export uses two timing layers for
        # each animation row: an outer wrapper owns the timeline offset, while
        # the inner effect cTn stays nodeType="afterEffect" with delay="0".
        # This keeps the animation pane editable as standard "After Previous"
        # rows instead of exposing synthetic per-effect cumulative delays.
        outer_id = next_id
        next_id += 1
        inner_steps = []
        with_wrapper_id = None
        if trigger == 'with-previous':
            with_wrapper_id = next_id
            next_id += 1
        elapsed_ms = 0
        for i, target in enumerate(targets):
            shape_id, delay_ms, animation = target
            if animation not in ANIMATIONS:
                animation = 'fade'
            anim_info = ANIMATIONS[animation]
            preset_id = anim_info.get('presetID', 1)
            preset_subtype = anim_info.get('presetSubtype', 0)

            if trigger == 'with-previous':
                leaf_id = next_id
                set_id = next_id + 1
                eff_id = next_id + 2
                next_id += 3
                effect_xml = _build_effect_xml(animation, shape_id, dur_ms, set_id, eff_id)
                inner_steps.append(f'''<p:par>
                  <p:cTn id="{leaf_id}" presetID="{preset_id}" presetClass="entr" presetSubtype="{preset_subtype}" fill="hold" nodeType="withEffect">
                    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                    <p:childTnLst>
                      {effect_xml}
                    </p:childTnLst>
                  </p:cTn>
                </p:par>''')
            else:
                if i > 0:
                    elapsed_ms += dur_ms + int(delay_ms)
                wrapper_id = next_id
                leaf_id = next_id + 1
                set_id = next_id + 2
                eff_id = next_id + 3
                next_id += 4
                effect_xml = _build_effect_xml(animation, shape_id, dur_ms, set_id, eff_id)
                inner_steps.append(f'''<p:par>
                  <p:cTn id="{wrapper_id}" fill="hold">
                    <p:stCondLst><p:cond delay="{elapsed_ms}"/></p:stCondLst>
                    <p:childTnLst>
                      <p:par>
                        <p:cTn id="{leaf_id}" presetID="{preset_id}" presetClass="entr" presetSubtype="{preset_subtype}" fill="hold" nodeType="afterEffect">
                          <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                          <p:childTnLst>
                            {effect_xml}
                          </p:childTnLst>
                        </p:cTn>
                      </p:par>
                    </p:childTnLst>
                  </p:cTn>
                </p:par>''')

        inner_xml = '\n                '.join(inner_steps)
        if trigger == 'with-previous':
            # Match PowerPoint's native "Start: With Previous" export:
            # one delay=0 wrapper begins on slide entry, and all withEffect
            # rows live under that wrapper so they truly start in parallel.
            inner_xml = f'''<p:par>
                      <p:cTn id="{with_wrapper_id}" fill="hold">
                        <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                        <p:childTnLst>
                          {inner_xml}
                        </p:childTnLst>
                      </p:cTn>
                    </p:par>'''
        if trigger in ('with-previous', 'after-previous'):
            # Match PowerPoint's native slide-entry export: the wrapper waits
            # for mainSeq to begin, then child nodes resolve their Start modes.
            outer_start_conditions = (
                '<p:cond delay="indefinite"/>'
                '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>'
            )
        else:
            outer_start_conditions = '<p:cond delay="0"/>'
        all_steps = f'''<p:par>
                <p:cTn id="{outer_id}" fill="hold">
                  <p:stCondLst>{outer_start_conditions}</p:stCondLst>
                  <p:childTnLst>
                    {inner_xml}
                  </p:childTnLst>
                </p:cTn>
              </p:par>'''

    bld_list = '\n    '.join(
        f'<p:bldP spid="{sid}" grpId="0"/>' for sid, _, _ in targets
    )
    return f'''  <p:timing>
    <p:tnLst>
      <p:par>
        <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
          <p:childTnLst>
            <p:seq concurrent="1" nextAc="seek">
              <p:cTn id="2" dur="indefinite" nodeType="mainSeq">
                <p:childTnLst>
              {all_steps}
                </p:childTnLst>
              </p:cTn>
              <p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>
              <p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>
            </p:seq>
          </p:childTnLst>
        </p:cTn>
      </p:par>
    </p:tnLst>
    <p:bldLst>
    {bld_list}
    </p:bldLst>
  </p:timing>'''


def pick_animation_effect(mode: str, idx: int, offset: int = 0) -> str:
    """Resolve a per-element effect name from a mode string.

    - A specific animation name returns itself (no variation).
    - 'mixed': first element fixed to 'fade', rest cycle through ``_MIXED_POOL``
      plus ``offset`` (so titles stay calm while content varies across slides).
    - 'random': uniform random choice from ``_MIXED_POOL``.
    - Unknown mode falls back to 'fade'.
    """
    if mode in ANIMATIONS:
        return mode
    if mode == 'mixed':
        if idx == 0:
            return 'fade'
        return _MIXED_POOL[(idx - 1 + offset) % len(_MIXED_POOL)]
    if mode == 'random':
        import random
        return random.choice(_MIXED_POOL)
    return 'fade'


def get_available_transitions() -> list:
    """Get a list of all available transition effects"""
    return list(TRANSITIONS.keys())


def get_available_animations() -> list:
    """Get a list of all available entrance animations"""
    return list(ANIMATIONS.keys())


def get_transition_help() -> str:
    """Get help text for transition effects"""
    lines = ["Available transition effects:"]
    for key, info in TRANSITIONS.items():
        lines.append(f"  {key}: {info['name']}")
    return '\n'.join(lines)


def get_animation_help() -> str:
    """Get help text for entrance animations"""
    lines = ["Available entrance animations:"]
    for key, info in ANIMATIONS.items():
        lines.append(f"  {key}: {info['name']}")
    return '\n'.join(lines)


def main() -> None:
    """Run the CLI entry point."""
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--demo", action="store_true", help="print sample XML for a fade transition and animation")
    parser.add_argument("--list", action="store_true", help="list available transitions and entrance animations")
    args = parser.parse_args()

    if args.list:
        print(get_transition_help())
        print()
        print(get_animation_help())
        return

    if args.demo:
        print("=== Transition Effect XML Example (fade, 500ms) ===")
        print(create_transition_xml('fade', 0.5))
        print()
        print("=== Entrance Animation XML Example (fade) ===")
        print(create_timing_xml('fade', 1.0))
        return

    parser.print_help()


if __name__ == '__main__':
    main()
