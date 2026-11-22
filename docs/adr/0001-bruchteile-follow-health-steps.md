# Bruchteile follow engine health steps

A Bruchteil breaks when its engine side's health falls through a fixed step (50 / 35 / 20 %). It has no health of its own and comes back only on respawn; repair restores health, not parts. We chose this over per-part health because it stays readable on the HUD (three lamps per side), deterministic for the node CI simulation and cheap for the AI, and because the user wanted mild damage with parts that stay gone until respawn (2026-11-21).

## Considered options

- **Per-part health with hits on the part itself**: rejected. Needs part-level collision, is hard to balance and opaque to the player.
- **Parts return on repair**: rejected by the user ("gone until respawn").
