# The cockpit camera enlarges the cockpit instead of lowering the near plane

The camera "Cockpit" sits in the pilot's head and shows the racer's own cockpit from inside (user decision 2026-11-21). Dashboard, levers and hands are 0.3–0.6 m from the eye, inside the camera's 0.8 m near plane. Instead of lowering the near plane (it costs depth precision over the 9.5 km draw distance; Session 17 already ruled that out) the player model scales the cockpit group by `viewScale` (1.4–3.2) about the eye point: the picture is identical, but every part now lies beyond the near plane. The pilot's head, torso and upper arms are hidden by ending the draw range of each cockpit bucket before the pilot's triangles (they are merged last), so the view costs no extra draw.

## Consequences

- World objects between 0.8 m and the enlarged cockpit (rain, dust) can draw in front of cockpit parts that would really hide them.
- The enlarged cockpit casts no shadow while the view is on.
- A pod whose cockpit sits very close to its engines needs a fixed, smaller `cockpit.viewScale` in its layout (Tyr Vespa: 1.9).
