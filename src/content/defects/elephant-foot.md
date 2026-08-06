---
title: Elephant foot
summary: The bottom few layers bulge outward, leaving a flared base that will not sit flat and throws off dimensions where it matters most.
alsoKnownAs: ["first layer bulge", "flared base", "squished first layer", "elephant's foot"]
severity: structural
updated: 2026-08-06
commonness: 6
---

## What it looks like

The base of the print is wider than the rest of it. Usually only the first one or two layers are affected, giving a distinct lip you can feel with a fingernail. Parts do not sit flush against a surface, and anything that needs to fit into a hole or slot at the bottom will not.

## Why it is worth caring about

On a decorative print this is cosmetic. On a functional one it is not: the bottom of a part is very often the mating face, and a 0.2 mm flare is enough to stop a press fit or leave a component rocking. This is the defect most likely to be dismissed as trivial and then to ruin an assembly.

## Why it happens

Two mechanisms, and they compound:

The first is **mechanical**. A first layer is supposed to be squashed — that is what forces plastic into the surface texture and makes it stick. Squash it too hard and the excess has nowhere to go except sideways.

The second is **thermal**. A bed hot enough to hold the lowest layers above their softening point means those layers never fully set, and the accumulating weight of the part above slowly spreads them. This is why elephant foot sometimes appears on tall prints and not on short ones with identical settings.

There is a genuine tension here: the settings that guarantee adhesion are the same ones that cause elephant foot. If you are fighting both at once, the compensation setting exists precisely for that case — it corrects the dimension without touching a first layer that is finally sticking.

## Telling it apart

| If you see | It is probably |
|---|---|
| Bulge on the bottom 1–2 layers only | Elephant foot |
| Bottom layer wider *and* translucent | Nozzle far too low |
| Corners lifted upward instead of spread | [Warping](/defects/warping/) |
| Every layer too wide | Over-extrusion or flow calibration |

## What to change
