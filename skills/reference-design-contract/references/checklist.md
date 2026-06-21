# Reference Design Contract checklist

Use this checklist before final handoff.

## P0 gates

- [ ] `DESIGN.md` exists and uses the nine standard Open Design headings.
- [ ] `design-contract.md` names the target artifact, audience, and evidence used.
- [ ] Every reference is split into `Keep`, `Change`, and `Do not copy`.
- [ ] Inferences are labeled; unverified brand facts are not presented as truth.
- [ ] The contract picks one coherent visual stance instead of a menu of moods.
- [ ] `implementation-handoff.md` is short enough to paste into the next generation run.
- [ ] Anti-patterns include exact things to avoid, not only vague phrases.
- [ ] The final response tells the user which files were produced and what to run next.

## Quality bar

The contract should let a second agent build the first artifact without asking:

- What is the product or surface?
- What should be preserved from the references?
- What must not be copied?
- What colors, type, spacing, and component rules are binding?
- What would make the first artifact fail review?

If any of those answers are missing, revise the contract before handing off.
