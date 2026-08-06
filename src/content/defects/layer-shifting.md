---
title: Layer shifting
summary: The print suddenly offsets sideways partway up and every layer above continues from the wrong position.
alsoKnownAs: ["layer shift", "offset layers", "print shifted", "stepped print"]
severity: print-ending
updated: 2026-08-06
commonness: 5
---

## What it looks like

A clean horizontal step in the side of the print. Everything below it is correct, everything above is displaced in one direction, and the offset never corrects itself. Sometimes there are several steps at different heights.

## Why it happens

The printer has no idea where the head actually is. It counts steps sent to the motors and trusts that each one moved the axis. When a belt skips a tooth or a motor misses steps, the head ends up somewhere the controller does not know about — and since there is no feedback, every subsequent layer is built from the wrong origin.

Four things cause it, and they need different fixes:

- **A loose belt** lets the pulley skip under acceleration.
- **A collision** — usually the nozzle striking a curled corner — physically knocks the axis out of position. This one is a downstream symptom: the real defect is [warping](/defects/warping/), and tightening belts will not help.
- **Too much acceleration** demands more torque than the motor can deliver.
- **Insufficient driver current**, or a stepper hot enough to lose torque thermally.

The collision case is worth checking first because it is diagnosable from the print itself: look at the layer immediately below the shift. If a corner was already lifting there, you have your answer.

## Telling it apart

| If you see | It is probably |
|---|---|
| One sharp step, everything above offset | Layer shifting |
| Repeating waves after corners | [Ringing](/defects/ringing/) |
| Gradual lean rather than a step | Frame or gantry not square |
| Shift at the same height every time | Something in the model or a collision, not random skipping |

A shift that happens at the *same height* on repeated attempts is almost never a random skipped step — it is a collision with a specific feature.

## What to change
