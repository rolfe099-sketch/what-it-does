---
title: Under-extrusion
summary: Less plastic coming out than the slicer asked for — thin, gappy walls, missing sections of layer, and parts that are weak for their size.
alsoKnownAs: ["not enough plastic", "gaps in walls", "thin lines", "missing extrusion", "skipped extrusion"]
severity: structural
updated: 2026-08-06
commonness: 4
---

## What it looks like

Walls with visible gaps between adjacent lines. Layers that are noticeably thinner than the ones around them. Top surfaces that never close. Occasionally whole sections of a layer simply absent.

The important distinction is **uniform versus intermittent**. A wall that is consistently a little thin points at calibration. A wall that is fine for 20 mm, gappy for 5 mm, then fine again points at something interrupting the flow — moisture, a partial clog, or an extruder losing grip.

## Why it happens

The slicer calculates a volume of plastic per millimetre of movement and commands the extruder to push that much filament. Under-extrusion means the commanded volume did not arrive. Something between the spool and the build plate is not keeping up.

The order of likelihood is: the filament is wet, the plastic is not fully molten, the nozzle is partly blocked, or the extruder is slipping. Flow rate — the setting most people reach for first — is genuinely last, because it is a *calibration value*. Raising it to compensate for a partial clog produces a print that is over-extruded the moment you clean the nozzle.

There is a speed dimension too. A hotend has a maximum volumetric flow rate: the fastest it can melt plastic. Ask for more and you get under-extrusion no matter what the settings say. **Under-extrusion that appears only on fast prints is nearly always this**, and the fix is more heat or less speed rather than more flow.

## Telling it apart

| If you see | It is probably |
|---|---|
| Uniformly thin walls | Flow rate calibration |
| Intermittent gaps, popping sounds | Wet filament |
| Gets steadily worse during a print | Partial clog or heat creep |
| Only on fast sections | Volumetric flow limit — raise temperature or slow down |
| Clicking from the extruder | Slipping or a jam |

## What to change
