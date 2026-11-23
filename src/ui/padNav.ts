// ===== Gamepad in the menus (2026-11-23, user request: „Controller-Support auch im Menü") – the parts without a DOM =====
// `usePadNav.ts` polls the gamepad, moves the browser focus with these functions and clicks for the player. Kept free of the DOM
// so that the unit checks (`padnav:`) can run them in node.
//
// Buttons are fixed (the standard layout of the Gamepad API), they are not the rebindable driving controls:
//   D-pad / left stick  move the focus (on a slider or a selection list: left / right change the value)
//   A (0)               press the focused control          B (1)   back
//   LB (4) / RB (5)     move the focus left / right also from a slider (to the next column)
//   Start (9)           the screen's main action: start the race, resume

export type NavDir = 'up' | 'down' | 'left' | 'right';
export type NavEvent = NavDir | 'a' | 'b' | 'lb' | 'rb' | 'start';
/** A control on the screen: left, top, width, height in pixels. */
export interface NavRect { x: number; y: number; w: number; h: number }
export interface PadSnapshot { up: boolean; down: boolean; left: boolean; right: boolean; a: boolean; b: boolean; lb: boolean; rb: boolean; start: boolean }
type PadLike = { buttons: readonly { pressed: boolean; value?: number }[]; axes: readonly number[]; mapping?: string };

/** The stick counts as a direction beyond 55 % and lets go below 35 % (no flutter at the edge). */
const STICK_ON = 0.55, STICK_OFF = 0.35;

/** What the pad says right now. `prev` (the snapshot of the frame before) gives the stick its hysteresis. The stronger stick axis
 *  wins – a diagonal push is one direction, never two. The D-pad buttons 12 … 15 count only in the standard layout: on other pads
 *  those numbers are something else (the left stick works on all of them). */
export function readPadNav(gp: PadLike, prev?: PadSnapshot): PadSnapshot {
  const b = (i: number) => { const x = gp.buttons[i]; return !!x && (x.pressed || (x.value ?? 0) > 0.5); };
  const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0, horiz = Math.abs(ax) >= Math.abs(ay);
  const on = (v: number, was: boolean | undefined) => v > (was ? STICK_OFF : STICK_ON);
  const std = gp.mapping === 'standard';
  return {
    left: (horiz && on(-ax, prev?.left)) || (std && b(14)), right: (horiz && on(ax, prev?.right)) || (std && b(15)),
    up: (!horiz && on(-ay, prev?.up)) || (std && b(12)), down: (!horiz && on(ay, prev?.down)) || (std && b(13)),
    a: b(0), b: b(1), lb: b(4), rb: b(5), start: b(9),
  };
}

const DIRS: NavDir[] = ['up', 'down', 'left', 'right'];
const BTNS = ['a', 'b', 'lb', 'rb', 'start'] as const;

/** Turns snapshots into steps: a button gives one event per press; a held direction gives one at once, then repeats after
 *  `delay` ms every `rate` ms. Nothing counts until the pad has been let go once (`reset()` – the press that opened a menu, bound a
 *  button or paused the race must not act in the menu as well). */
export class PadRepeater {
  private armed = false; private prev: PadSnapshot | null = null; private dir: NavDir | null = null; private next = 0;
  constructor(private delay = 380, private rate = 130) {}
  reset() { this.armed = false; this.prev = null; this.dir = null; }
  step(s: PadSnapshot, tMs: number): NavEvent[] {
    const any = DIRS.some(d => s[d]) || BTNS.some(k => s[k]);
    if (!this.armed) { if (!any) { this.armed = true; this.prev = s; } return []; }
    const out: NavEvent[] = [], p = this.prev;
    for (const k of BTNS) if (s[k] && !(p && p[k])) out.push(k);
    // one direction at a time: the one held longest stays until it is let go
    if (this.dir && !s[this.dir]) this.dir = null;
    if (!this.dir) { const d = DIRS.find(q => s[q]); if (d) { this.dir = d; this.next = tMs + this.delay; out.push(d); } }
    else if (tMs >= this.next) { this.next = tMs + this.rate; out.push(this.dir); }
    this.prev = s;
    return out;
  }
}

/** Where the focus goes from control `from` in direction `dir`: the index of the nearest control in that direction, or -1.
 *  "In that direction": its centre and its far edge lie beyond those of the current control (a control inside the current one is
 *  not). "Nearest": the empty space along the direction, plus three times the sideways distance when the two do not share a row /
 *  column – so the focus crosses an empty middle to the control at the same height instead of jumping to a corner. */
export function nextFocus(rects: NavRect[], from: number, dir: NavDir): number {
  const c = rects[from]; if (!c) return -1;
  const horiz = dir === 'left' || dir === 'right', fwd = dir === 'right' || dir === 'down';
  const c0 = horiz ? c.x : c.y, c1 = c0 + (horiz ? c.w : c.h), k0 = horiz ? c.y : c.x, k1 = k0 + (horiz ? c.h : c.w), cMid = (c0 + c1) / 2, kMid = (k0 + k1) / 2;
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === from) continue;
    const r = rects[i], m0 = horiz ? r.x : r.y, m1 = m0 + (horiz ? r.w : r.h), n0 = horiz ? r.y : r.x, n1 = n0 + (horiz ? r.h : r.w), mid = (m0 + m1) / 2;
    if (fwd ? !(mid > cMid + 1 && m1 > c1 + 1) : !(mid < cMid - 1 && m0 < c0 - 1)) continue;
    const gap = Math.max(0, fwd ? m0 - c1 : c0 - m1), overlap = Math.min(n1, k1) - Math.max(n0, k0), off = overlap > 0 ? 0 : -overlap;
    // (among controls of the same row / column the one whose near edge is closest to the current near edge wins: a wide row above
    //  three cells leads to the first cell, the cells lead back to the wide row)
    const score = gap + off * 3 + (overlap > 0 ? 0 : 40) + Math.abs(n0 - k0) * 0.05 + Math.abs((n0 + n1) / 2 - kMid) * 0.02;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** A slider's value one step up (`dir` 1) or down (-1): clamped to the range, on the step grid, without rounding dust (0.30000000000000004). */
export function stepRange(value: number, min: number, max: number, step: number, dir: 1 | -1): number {
  const st = step > 0 ? step : (max - min) / 20 || 1;
  const n = Math.round((value - min) / st) + dir, v = Math.max(min, Math.min(max, min + n * st));
  const digits = Math.max(0, Math.min(8, Math.ceil(-Math.log10(st)) + 2));
  return +v.toFixed(digits);
}
