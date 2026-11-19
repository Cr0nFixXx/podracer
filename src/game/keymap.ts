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
