// ===== Session 12: rebindable keyboard controls =====
export type Action = 'thrust' | 'brake' | 'left' | 'right' | 'boost' | 'airbrake' | 'pitchDown' | 'pitchUp' | 'rollLeft' | 'rollRight' | 'repair' | 'view';
export type KeyMap = Record<Action, string[]>; // KeyboardEvent.code values

export const ACTIONS: [Action, string][] = [
  ['thrust', 'Schub'], ['brake', 'Umkehrschub / Bremse'], ['left', 'Links lenken'], ['right', 'Rechts lenken'],
  ['boost', 'Boost'], ['airbrake', 'Luftbremse / Sliden'], ['pitchDown', 'Neigung (Nase runter)'], ['pitchUp', 'Anheben (Nase hoch)'],
  ['rollLeft', 'Rolle nach links'], ['rollRight', 'Rolle nach rechts'], ['repair', 'Reparatur'], ['view', 'Ansicht'],
];

export const KEY_PRESETS: Record<'flight' | 'classic', { name: string; keys: KeyMap }> = {
  flight: {
    name: 'Standard (WASD + Pfeile = Fluglage)',
    keys: { thrust: ['KeyW'], brake: ['KeyS'], left: ['KeyA'], right: ['KeyD'], boost: ['ShiftLeft', 'ShiftRight'], airbrake: ['Space'], pitchDown: ['ArrowUp'], pitchUp: ['ArrowDown'], rollLeft: ['ArrowLeft'], rollRight: ['ArrowRight'], repair: ['KeyR'], view: ['KeyC'] },
  },
  classic: {
    name: 'Klassisch (Pfeile lenken, IJKL = Fluglage)',
    keys: { thrust: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], boost: ['ShiftLeft', 'ShiftRight'], airbrake: ['Space'], pitchDown: ['KeyI'], pitchUp: ['KeyK'], rollLeft: ['KeyJ'], rollRight: ['KeyL'], repair: ['KeyR'], view: ['KeyC'] },
  },
};
export const defaultKeys = (): KeyMap => JSON.parse(JSON.stringify(KEY_PRESETS.flight.keys)) as KeyMap;

/** Fills gaps of a stored (possibly older / partial) key map with the defaults. */
export function normalizeKeys(k?: Partial<KeyMap> | null): KeyMap {
  const d = defaultKeys(); if (!k) return d;
  for (const [a] of ACTIONS) if (Array.isArray(k[a])) d[a] = (k[a] as string[]).filter(c => typeof c === 'string');
  return d;
}
/** Binds `code` to `action` (single key) and removes it from every other action so one key never does two things. */
export function bindKey(keys: KeyMap, action: Action, code: string): KeyMap {
  const out = {} as KeyMap;
  for (const [a] of ACTIONS) out[a] = a === action ? [code] : keys[a].filter(c => c !== code);
  return out;
}
const NAMES: Record<string, string> = { Space: 'Leertaste', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Shift', ShiftRight: 'Shift R', ControlLeft: 'Strg', ControlRight: 'Strg R', AltLeft: 'Alt', AltRight: 'Alt Gr', Enter: 'Enter', Tab: 'Tab', Backspace: '⌫', Comma: ',', Period: '.', Minus: '-', Slash: '/' };
export function keyLabel(code: string) {
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
export const keysLabel = (codes: string[]) => codes.length ? [...new Set(codes.map(keyLabel))].join(' / ') : '—';
/** Codes that must never be bound (pause / browser). */
export const RESERVED = new Set(['Escape', 'KeyP', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight']);

// ---------- Session 16: rebindable gamepad controls ----------
/** A button (index, analog value used when available) or one direction of an axis. */
export type PadBind = { b: number } | { a: number; d: 1 | -1 };
export type PadMap = Record<Action, PadBind[]>;
export const defaultPad = (): PadMap => ({
  thrust: [{ b: 7 }], brake: [{ b: 6 }], left: [{ a: 0, d: -1 }], right: [{ a: 0, d: 1 }], boost: [{ b: 0 }], airbrake: [{ b: 1 }, { b: 4 }, { b: 5 }],
  pitchDown: [{ a: 3, d: -1 }], pitchUp: [{ a: 3, d: 1 }], rollLeft: [{ a: 2, d: -1 }], rollRight: [{ a: 2, d: 1 }], repair: [{ b: 2 }], view: [{ b: 3 }],
});
const isBind = (x: unknown): x is PadBind => !!x && typeof x === 'object' && (typeof (x as { b?: unknown }).b === 'number' || typeof (x as { a?: unknown }).a === 'number');
export function normalizePad(p?: Partial<PadMap> | null): PadMap {
  const d = defaultPad(); if (!p) return d;
  for (const [a] of ACTIONS) if (Array.isArray(p[a])) d[a] = (p[a] as unknown[]).filter(isBind);
  return d;
}
const sameBind = (x: PadBind, y: PadBind) => 'b' in x ? 'b' in y && x.b === y.b : 'a' in y && x.a === y.a && x.d === y.d;
export function bindPad(map: PadMap, action: Action, bind: PadBind): PadMap {
  const out = {} as PadMap;
  for (const [a] of ACTIONS) out[a] = a === action ? [bind] : map[a].filter(x => !sameBind(x, bind));
  return out;
}
/** 0..1 value of an action on this gamepad (analog triggers and sticks stay analog; 15 % dead zone on axes). */
export function padValue(gp: Gamepad, binds: PadBind[]): number {
  let v = 0;
  for (const x of binds) {
    if ('b' in x) { const bt = gp.buttons[x.b]; if (bt) v = Math.max(v, bt.value > 0.05 ? bt.value : bt.pressed ? 1 : 0); }
    else { const ax = (gp.axes[x.a] ?? 0) * x.d; if (ax > 0.15) v = Math.max(v, Math.min(1, (ax - 0.15) / 0.85)); }
  }
  return v;
}
/** First button pressed / stick pushed right now (for the binding dialog). Button 9 (Start = pause) is reserved. */
export function readPadBind(gp: Gamepad): PadBind | null {
  for (let i = 0; i < gp.buttons.length; i++) if (i !== 9 && (gp.buttons[i].pressed || gp.buttons[i].value > 0.6)) return { b: i };
  for (let i = 0; i < gp.axes.length; i++) if (Math.abs(gp.axes[i]) > 0.65) return { a: i, d: gp.axes[i] > 0 ? 1 : -1 };
  return null;
}
const BTN = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-Pad ↑', 'D-Pad ↓', 'D-Pad ←', 'D-Pad →'];
const AXIS = [['L-Stick ←', 'L-Stick →'], ['L-Stick ↑', 'L-Stick ↓'], ['R-Stick ←', 'R-Stick →'], ['R-Stick ↑', 'R-Stick ↓']];
export const padLabel = (binds: PadBind[]) => binds.length ? binds.map(x => 'b' in x ? BTN[x.b] ?? 'Taste ' + x.b : AXIS[x.a]?.[x.d > 0 ? 1 : 0] ?? `Achse ${x.a}${x.d > 0 ? '+' : '−'}`).join(' / ') : '—';
