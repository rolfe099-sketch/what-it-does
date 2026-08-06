---
title: Ringing
summary: Repeating ripples in the surface just after every corner, like an echo of the edge fading across the wall.
alsoKnownAs: ["ghosting", "echoing", "rippling", "resonance", "shadowing"]
severity: cosmetic
updated: 2026-08-06
commonness: 7
---

## What it looks like

Wavy bands on flat surfaces, always immediately **after** a corner or a sharp feature, always decaying as they get further from it. Text and embossed details on a wall get a faint repeated shadow. The ripples run parallel to the feature that caused them.

The decay is the signature. If the pattern fades as it moves away from an edge, it is ringing. If it repeats uniformly across the whole surface with no relationship to corners, it is something else.

## Why it happens

This is mechanical resonance, not a plastic problem. The print head changes direction abruptly, the frame absorbs that impulse and rings like a struck bell, and the nozzle — attached to the vibrating frame — traces that oscillation into the surface it is printing.

The frequency is a property of the machine: its mass, its stiffness, its belts, and whatever it is standing on. **A printer on a flexing desk will ring no matter how good the settings are**, because the resonating system includes the desk. This is worth checking before spending an evening tuning acceleration values that cannot win.

Bed-slingers are typically worse in the Y axis because the entire heated bed and the part have to reverse direction, and that mass grows as the print does — which is why ringing sometimes appears only on tall prints.

## Telling it apart

| If you see | It is probably |
|---|---|
| Ripples after corners, fading with distance | Ringing |
| Even horizontal bands the whole way up | Z banding — a leadscrew or Z-axis problem |
| A sudden one-time offset | [Layer shifting](/defects/layer-shifting/) |
| Rough texture with no pattern | Wet filament or [under-extrusion](/defects/under-extrusion/) |

## What to change

If your firmware supports input shaping, calibrate it and stop there — it removes ringing without giving up speed, which no other fix on this list can claim.
