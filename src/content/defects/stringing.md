---
title: Stringing
summary: Fine hairs of plastic strung between separate parts of the model, left behind when the nozzle travels through open air.
alsoKnownAs: ["oozing", "wisping", "hairy prints", "cobwebbing", "spider webs"]
severity: cosmetic
updated: 2026-08-06
commonness: 1
---

## What it looks like

Thin strands of plastic bridging the gaps between towers, across the inside of holes, or between separate objects on the plate. They are usually easy to pull off by hand, which is why stringing is filed as cosmetic rather than structural — but on a part with fine detail or many small features, cleaning up can take longer than the print did.

The tell is that the strands run **between** features rather than being part of them, and they follow the paths the nozzle travelled rather than anything in the model.

## Why it happens

Molten plastic in the nozzle is under pressure. When the nozzle lifts and moves without printing, that pressure has to go somewhere, and what it does is push a thread of plastic out of the tip that trails behind the head like sugar off a spoon.

Retraction exists to relieve that pressure by pulling filament backwards before a travel move. Stringing means the pressure was not relieved — either because retraction was too small, or because something is generating pressure that retraction cannot pull back.

That second case is the one people miss. **Water in the filament boils in the melt zone**, and steam pressure does not care how far you retracted. This is why a spool that printed cleanly in January strings badly in July with identical settings, and it is the reason the first fix below is not a setting at all.

## Telling it apart

| If you see | It is probably |
|---|---|
| Fine hairs between features, easy to remove | Stringing |
| Small blobs at a consistent point on each layer | [Blobs and zits](/defects/blobs-and-zits/) — a seam problem, not an ooze problem |
| Rough, popping sounds while printing, bubbly surface | Wet filament, which also causes stringing — dry it |
| Thick strands that are part of the wall | Over-extrusion, not stringing |

## What to change

The fixes below are ordered. Work down the list rather than changing several things at once — if you change three settings and the strings go, you have learned nothing about which one mattered and you will be back here next time.
