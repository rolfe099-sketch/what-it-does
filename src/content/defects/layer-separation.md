---
title: Layer separation
summary: Layers that never fused, leaving a part that splits cleanly along a horizontal line under load — or cracks open on the plate while printing.
alsoKnownAs: ["delamination", "cracking", "splitting", "layers not bonding", "weak layers"]
severity: structural
updated: 2026-08-06
commonness: 8
---

## What it looks like

Visible horizontal cracks in the side of the print, often part-way up a tall part. Or a part that looks perfect and then snaps along a layer line the first time it is loaded, with a clean flat break rather than a ragged one.

A clean break along a layer boundary is the diagnostic. Properly bonded layers do not fail that way — they tear through the material.

## Why it matters more than it looks

This is the most dangerous defect on the site, because **it is invisible until the part is under load**. Stringing announces itself. Layer separation produces a print that looks finished, measures correctly, and then fails in a bracket or a mount. If a printed part is doing anything structural, this is the defect to rule out.

## Why it happens

Layers bond by the incoming extrusion partially re-melting the one beneath it. That requires the previous layer to still be hot enough to fuse when the new one arrives. Anything that removes heat too quickly prevents the bond: a nozzle temperature too low, a part cooling fan running hard, a cold draught, or simply a very large layer height that puts little surface area in contact.

For high-shrinkage materials there is a second cause. Cooling plastic contracts, and if the accumulated stress exceeds the bond strength, the part cracks itself open mid-print. This is the same physics as [warping](/defects/warping/) — when the base is stuck down hard enough not to lift, the stress has to go somewhere, and it goes into splitting the walls instead. The two defects trade places depending on how good your bed adhesion is.

## Telling it apart

| If you see | It is probably |
|---|---|
| Clean horizontal break under load | Layer separation |
| Crack appearing during the print on ABS/ASA | Thermal stress — draught or cooling |
| Gaps between lines but layers bonded | [Under-extrusion](/defects/under-extrusion/) |
| Corners lifting rather than splitting | [Warping](/defects/warping/) |

## What to change
