---
title: Warping
summary: Corners and edges curling up off the bed as the part cools, lifting the print out of shape or off the plate entirely.
alsoKnownAs: ["curling", "lifting", "corner lift", "banana effect"]
severity: print-ending
updated: 2026-08-06
commonness: 2
---

## What it looks like

The bottom of the part is no longer flat. Corners rise off the plate, long edges bow upward into a shallow banana, and in the worst case the whole print detaches mid-job and gets dragged around the bed.

Warping shows up first at **corners**, because that is where stress concentrates. A part that is lifting evenly all the way round is usually an adhesion problem instead.

## Why it happens

Every thermoplastic shrinks as it cools. In a printed part the bottom layers are held flat and warm by the bed while the layers above cool and contract. Those upper layers pull inward, the bottom cannot follow, and the resulting stress peels the corners upward.

This is why warping is a **material property before it is a settings problem**. PLA shrinks around 0.3% and barely warps. ABS shrinks nearly 0.8% and will warp in an open printer almost regardless of what you do. You are not doing anything wrong by finding ABS difficult on an open machine — it is difficult on an open machine.

The other half of the explanation is airflow. A draught across one side of the part cools that side faster, and the part curls toward the cold. A printer next to an open window or in the path of a room fan will warp parts that would have been fine two metres away.

## Telling it apart

| If you see | It is probably |
|---|---|
| Corners lifting, middle still stuck | Warping |
| Whole part loose, no curl | [Poor bed adhesion](/defects/poor-bed-adhesion/) |
| Part flat but split horizontally | [Layer separation](/defects/layer-separation/) |
| Bulge at the very bottom only | [Elephant foot](/defects/elephant-foot/) |

Warping and layer separation share a cause — thermal stress — and often appear together on high-shrinkage materials. Fixing the draught usually improves both.

## What to change
