---
title: Poor bed adhesion
summary: The first layer will not stay stuck — the print comes loose, gets dragged around the plate, or never forms a continuous layer at all.
alsoKnownAs: ["not sticking", "first layer problems", "print came loose", "spaghetti"]
severity: print-ending
updated: 2026-08-06
commonness: 3
---

## What it looks like

Either the print detaches — sometimes immediately, sometimes hours in, leaving a tangle of extruded plastic often called spaghetti — or the first layer never forms properly: visible gaps between the lines, extrusions that look round rather than flattened, edges that lift as soon as they are laid down.

## Why it happens

A first layer sticks because molten plastic is pressed into the microscopic texture of the build surface and allowed to cool while in contact with it. Three things break that: the surface is contaminated, the nozzle is too far away to press anything in, or the material and the surface are simply a bad pair.

The contamination case is the most common and the most misdiagnosed. **Skin oil from handling parts is the usual culprit, and isopropyl alcohol does not remove it** — IPA dissolves the oil and spreads it into a thinner, more even film rather than lifting it off. Dish soap and warm water do lift it. This is why "I cleaned it with IPA and it still won't stick" is such a frequent complaint.

The pairing case catches people moving between materials. Adhesion is a property of the material *and* the surface together, not of the material alone. PETG bonds to bare smooth PEI so aggressively that removing the part can tear the sheet, while nylon barely sticks to PEI at all.

## Telling it apart

| If you see | It is probably |
|---|---|
| Gaps between first-layer lines | Nozzle too high |
| First layer translucent and smeared | Nozzle too low |
| Sticks fine, corners lift later | [Warping](/defects/warping/), not adhesion |
| Sticks so well it damages the sheet | Wrong surface for the material — also an adhesion fault |

## What to change

Do the first one before you touch a setting. It costs two minutes and it is the answer more often than everything below it combined.
