// ===== Gamepad in the menus (2026-11-23, user request) – the part that touches the page =====
// One hook, mounted once in `App`: it polls the first gamepad every frame, moves the browser focus between the controls of whatever
// screen is showing and presses them for the player. It needs no knowledge of the screens: every visible `button`, `select` and
// slider that is not covered by an overlay is a target. A screen can mark three roles with data attributes (`Btn pad="…"`):
//   data-pad-default   gets the focus when the screen appears        data-pad-back   pressed by B
//   data-pad-start     pressed by Start
// The pure parts (reading the pad, repeating, choosing the neighbour) are in `padNav.ts`; rules in docs/regeln/ui.md.
import { useEffect } from 'react';
import { PadRepeater, nextFocus, readPadNav, stepRange, type NavDir, type NavEvent, type PadSnapshot } from './padNav';

type El = HTMLElement;
const SEL = 'button, select, input[type="range"], [data-pad-focus]';

/** Every control the player can reach right now: enabled, visible, and on top (a pause menu covers what lies below it). */
export function padTargets(): El[] {
  const out: El[] = [];
  for (const el of document.querySelectorAll<El>(SEL)) {
    if ((el as HTMLButtonElement).disabled) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== el && !el.contains(top) && !top.contains(el)) continue;
    out.push(el);
  }
  return out;
}
const rectsOf = (els: El[]) => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const isRange = (el: Element): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === 'range';
const isSelect = (el: Element): el is HTMLSelectElement => el instanceof HTMLSelectElement;
/** What a control is called (for messages of the test harness). */
const labelOf = (e: El) => (e.getAttribute('aria-label') || (isRange(e) ? e.closest('label')?.textContent : '') || e.textContent || e.tagName).trim();
/** The control that gets the focus first: the screen's `data-pad-default`, else the one nearest the top left corner. */
const defaultTarget = (els: El[]) => els.find(e => e.dataset.padDefault !== undefined) ?? [...els].sort((a, b) => { const p = a.getBoundingClientRect(), q = b.getBoundingClientRect(); return p.top - q.top || p.left - q.left; })[0];
const focusEl = (el: El | undefined) => el?.focus({ preventScroll: true });

/** Sets the value the way a user would (React listens to the event, and compares with the value it last saw). */
function setValue(el: HTMLInputElement | HTMLSelectElement, value: string, ev: 'input' | 'change') {
  const set = Object.getOwnPropertyDescriptor(isSelect(el) ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
  if (set) set.call(el, value); else el.value = value;
  el.dispatchEvent(new Event(ev, { bubbles: true }));
}
function stepSelect(el: HTMLSelectElement, dir: 1 | -1, wrap: boolean) {
  const opts = [...el.options]; let i = el.selectedIndex;
  for (let k = 0; k < opts.length; k++) {
    i += dir; if (i < 0 || i >= opts.length) { if (!wrap) return; i = (i + opts.length) % opts.length; }
    if (!opts[i].disabled) { setValue(el, opts[i].value, 'change'); return; }
  }
}

/** One step of the pad on the page. Exported for the test harness (`window.__padNav`). */
export function padAct(ev: NavEvent) {
  const els = padTargets(); if (!els.length) return;
  if (ev === 'b') { els.find(e => e.dataset.padBack !== undefined)?.click(); return; }
  if (ev === 'start') { els.find(e => e.dataset.padStart !== undefined)?.click(); return; }
  const cur = els.indexOf(document.activeElement as El);
  if (cur < 0) { focusEl(defaultTarget(els)); return; } // (the first press only shows where the focus is)
  const el = els[cur];
  if (ev === 'a') { if (isSelect(el)) stepSelect(el, 1, true); else if (!isRange(el)) el.click(); return; }
  if (ev === 'left' || ev === 'right') {
    if (isRange(el)) { const v = stepRange(parseFloat(el.value), parseFloat(el.min || '0'), parseFloat(el.max || '100'), parseFloat(el.step || '1'), ev === 'right' ? 1 : -1); if (v !== parseFloat(el.value)) setValue(el, String(v), 'input'); return; }
    if (isSelect(el)) { stepSelect(el, ev === 'right' ? 1 : -1, false); return; }
  }
  const dir: NavDir = ev === 'lb' ? 'left' : ev === 'rb' ? 'right' : ev;
  const n = nextFocus(rectsOf(els), cur, dir); if (n >= 0) focusEl(els[n]);
}

/** For the test harness: which controls can be reached from the default one with the pad (sliders and lists: left / right belong to
 *  the value, LB / RB move on). Returns the labels of the controls that cannot be reached. */
export function padUnreachable(): string[] {
  const els = padTargets(); if (!els.length) return [];
  const rects = rectsOf(els), seen = new Set<number>([els.indexOf(defaultTarget(els))]), todo = [...seen];
  while (todo.length) {
    const i = todo.pop()!;
    for (const d of ['up', 'down', 'left', 'right'] as NavDir[]) { const n = nextFocus(rects, i, d); if (n >= 0 && !seen.has(n)) { seen.add(n); todo.push(n); } } // (left / right from a slider = LB / RB)
  }
  return els.map((e, i) => seen.has(i) ? '' : labelOf(e).slice(0, 40) || e.tagName).filter(Boolean);
}

/** For the test harness: the presses that lead from the focused control to the first one whose label contains `match` (null = no
 *  way). From a slider or a list the sideways moves are LB / RB – exactly what the player has to press. */
export function padPath(match: string): NavEvent[] | null {
  const els = padTargets(), start = els.indexOf(document.activeElement as El), goal = els.findIndex(e => labelOf(e).toLowerCase().includes(match.toLowerCase()));
  if (start < 0 || goal < 0) return null;
  const rects = rectsOf(els), from = new Map<number, [number, NavEvent]>(), todo = [start], seen = new Set([start]);
  while (todo.length) {
    const i = todo.shift()!; if (i === goal) break;
    const side = isRange(els[i]) || isSelect(els[i]);
    for (const d of ['up', 'down', 'left', 'right'] as NavDir[]) { const n = nextFocus(rects, i, d); if (n >= 0 && !seen.has(n)) { seen.add(n); from.set(n, [i, side && d === 'left' ? 'lb' : side && d === 'right' ? 'rb' : d]); todo.push(n); } }
  }
  if (!seen.has(goal)) return null;
  const out: NavEvent[] = []; for (let i = goal; i !== start;) { const [p, ev] = from.get(i)!; out.unshift(ev); i = p; }
  return out;
}

/** Mount once. While the pad is in use the body carries the class `pad-nav` (focus ring and legend, index.css); it goes when the
 *  mouse moves. `document.body.dataset.padCapture` (set by the gamepad binding dialog) silences the navigation. */
export function usePadNav() {
  useEffect(() => {
    const rep = new PadRepeater(); let raf = 0, prev: PadSnapshot | undefined, lastCheck = 0, mx = -1, my = -1;
    const body = document.body;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      let gp: Gamepad | null = null; for (const g of navigator.getGamepads ? navigator.getGamepads() : []) if (g) { gp = g; break; }
      if (!gp) { prev = undefined; rep.reset(); return; }
      if (body.dataset.padCapture) { prev = undefined; rep.reset(); return; }
      const snap = readPadNav(gp, prev); prev = snap;
      const evs = rep.step(snap, now);
      if (evs.length) { body.classList.add('pad-nav'); for (const ev of evs) padAct(ev); }
      // a new screen appeared (or the focused control went away): put the focus on its default control, so that the next press acts
      if (body.classList.contains('pad-nav') && now - lastCheck > 160) {
        lastCheck = now;
        const a = document.activeElement as El | null;
        if (!a || a === body || !a.isConnected || a.getClientRects().length === 0) { const els = padTargets(); if (els.length) focusEl(defaultTarget(els)); }
      }
    };
    const onMouse = (e: MouseEvent) => { if (mx < 0 || Math.abs(e.screenX - mx) + Math.abs(e.screenY - my) > 3) { if (mx >= 0) body.classList.remove('pad-nav'); mx = e.screenX; my = e.screenY; } };
    raf = requestAnimationFrame(tick); window.addEventListener('mousemove', onMouse);
    (window as unknown as Record<string, unknown>).__padNav = { act: padAct, targets: padTargets, unreachable: padUnreachable, path: padPath, label: labelOf }; // test handle (tools/harness/ppad.mjs)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMouse); body.classList.remove('pad-nav'); };
  }, []);
}

/** The line at the bottom of the window that names the buttons – visible only while the pad is in use (index.css). */
export function PadLegend() {
  return <div className="pad-legend" aria-hidden="true"><b>A</b> Auswählen · <b>B</b> Zurück · <b>◀ ▶</b> Wert ändern · <b>LB / RB</b> Spalte wechseln · <b>Start</b> Los / Weiter</div>;
}
