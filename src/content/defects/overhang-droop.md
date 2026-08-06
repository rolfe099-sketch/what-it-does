---
title: Overhang droop
summary: Downward-facing surfaces sagging, curling or trailing loose strands where the plastic had nothing underneath it to rest on.
alsoKnownAs: ["sagging overhangs", "drooping", "curling overhangs", "bad bridges", "overhang curl"]
severity: cosmetic
updated: 2026-08-06
commonness: 9
---

## What it looks like

Sloped or horizontal undersides that are rough, sagging or visibly drooping. Bridges across gaps that dip in the middle or fall away entirely. Curled edges where an overhang begins, sometimes curling far enough upward for the nozzle to strike them — at which point a cosmetic problem becomes a [layer shift](/defects/layer-shifting/).

## Why it happens

Each layer is normally supported by the one below. On an overhang, part of the extrusion is laid into open air, and it has to solidify before gravity pulls it down. Whether it succeeds is a race between cooling and sag.

The 45° rule is a useful approximation: below that angle each layer is still supported by more than half of the one beneath it and behaves normally. Above it, an increasing fraction of every extrusion is unsupported, and past roughly 60° most machines need either support material or a different orientation.

There is a conflict built into the fix. Overhangs want maximum cooling. High-temperature materials want minimal cooling for [layer bonding](/defects/layer-separation/). **Good overhangs in ABS are therefore genuinely difficult rather than a settings oversight** — you are trading one defect for another, and the right answer is usually to reorient the part so the trade never has to be made.

## Telling it apart

| If you see | It is probably |
|---|---|
| Rough undersides on sloped faces | Overhang droop |
| A flat span sagging in the middle | Bridging — same cause, same fixes |
| Curl severe enough to hit the nozzle | Overhang droop escalating into a collision |
| Rough undersides where support touched | Support scarring, not droop |

## What to change

Reorienting the part is listed last but is often the best answer. It is free, it needs no support material, and it produces a better surface than any amount of tuning.
