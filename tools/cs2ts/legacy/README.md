# Frozen model definitions for shipped web saves

`v0.98.3.ts` contains verbatim exported class/enum blocks from
`packages/core/src/gen/sts2.ts` at commit `7ed6661`. Keep this file immutable.
The generator appends definitions that public-beta removed, so their original
model IDs still resolve when an existing deck, encounter, or history is read.

The new abstract `BattlewornDummyEventEncounter` keeps its upstream name in the
generated code. The generator renames only the archived class's TypeScript
identifier to `LegacyBattlewornDummyEventEncounter`; its persisted full type
name and model ID remain unchanged.

The generator also adapts archived power/damage/hover-tip calls to beta method
signatures, passing the existing choice context where available. The archive
itself remains a verbatim record of the shipped definitions.

These models are registered for reading old saves. Removed cards keep their
original pool association for rendering, and do not return to beta reward pools.
Fix compatibility in the generator/runtime rather than editing the archive or
the generated output.

`v0.98.3-retained-relics.ts` freezes Lasting Candy and Pumpkin Candle from the
same commit. Their IDs remain in beta, but `CombatsSeen` / `ActiveAct` changed
meaning. The generator gives the archived classes separate runtime type names;
the save reader selects them only for relics carrying the shipped property
names. New acquisitions retain beta behavior, while existing relics keep their
old effects, counters and descriptions after re-saving.

`v0.98.3-power-set-amount.ts` freezes the original `PowerCmd.SetAmount` method
from the same commit. Beta removed this command; the archived Doormaker still
needs its absolute amount semantics when reviving the door. The generator emits
it as `LegacyPowerCmd` and supplies beta's explicit non-interactive choice
context. The frozen method is not a model or save DTO.
