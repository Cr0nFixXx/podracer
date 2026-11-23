import { useEffect, useState } from 'react';
import type { Profile } from '../game/settings';
import { ACTIONS, KEY_PRESETS, RESERVED, bindKey, bindPad, defaultPad, keysLabel, normalizeKeys, normalizePad, padLabel, readPadBind, type Action, type KeyMap, type PadMap } from '../game/keymap';

type Upd = (fn: (p: Profile) => Profile) => void;

/** Rebindable controls: click an action, press a key. Esc cancels. A key bound to a new action is removed from its old one. */
export function KeyBindings({ profile, update }: { profile: Profile; update: Upd }) {
  const keys = normalizeKeys(profile.keys);
  const [listen, setListen] = useState<Action | null>(null);
  const setKeys = (k: KeyMap) => update(p => ({ ...p, keys: k }));
  useEffect(() => {
    if (!listen) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.code !== 'Escape' && !RESERVED.has(e.code)) setKeys(bindKey(keys, listen, e.code));
      setListen(null);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  });
  const same = (a: KeyMap, b: KeyMap) => ACTIONS.every(([k]) => a[k].join() === b[k].join());
  const unbound = ACTIONS.filter(([a]) => keys[a].length === 0);
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {(Object.keys(KEY_PRESETS) as (keyof typeof KEY_PRESETS)[]).map(id => (
          <button key={id} onClick={() => { setListen(null); setKeys(JSON.parse(JSON.stringify(KEY_PRESETS[id].keys)) as KeyMap); }}
            className={`px-3 py-1.5 text-xs border ${same(keys, KEY_PRESETS[id].keys) ? 'border-amber-400 text-amber-200 bg-amber-900/30' : 'border-stone-600 text-stone-300 hover:border-amber-500'}`}>{KEY_PRESETS[id].name}</button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-2 text-sm">{/* 13 actions = four rows since the reset key: the rows sit closer so that the screen still fits 720 px (pui.mjs) */}
        {ACTIONS.map(([a, label]) => (
          <button key={a} onClick={() => setListen(listen === a ? null : a)} data-action={a}
            className={`flex items-center gap-3 bg-black/40 border p-2 text-left ${listen === a ? 'border-amber-400' : keys[a].length ? 'border-stone-800 hover:border-stone-500' : 'border-red-500/70'}`}>
            <kbd className="font-display text-amber-300 text-xs bg-stone-800 px-2 py-1 min-w-[90px] text-center">{listen === a ? 'Taste drücken …' : keysLabel(keys[a])}</kbd>
            <span className="text-stone-300 text-xs">{label}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-stone-500 mt-3">
        Aktion anklicken, dann Taste drücken (Esc bricht ab). Pause bleibt fest auf Esc / P.
        {unbound.length > 0 && <span className="text-red-400"> Ohne Taste: {unbound.map(u => u[1]).join(', ')}.</span>}
      </p>
    </div>
  );
}

/** Session 16 – gamepad mapping: click an action, then press a button or push a stick on the pad. Start (pause) stays fixed. */
export function PadBindings({ profile, update }: { profile: Profile; update: Upd }) {
  const pad = normalizePad(profile.pad);
  const [listen, setListen] = useState<Action | null>(null);
  const [found, setFound] = useState(false);
  const setPad = (m: PadMap) => update(p => ({ ...p, pad: m }));
  useEffect(() => {
    let raf = 0, armed = false; // armed: wait until everything is released, so the click that opened the dialog is not captured
    const tick = () => {
      const gp = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find(g => !!g) ?? null;
      setFound(!!gp);
      if (gp && listen) { const b = readPadBind(gp); if (!b) armed = true; else if (armed) { setPad(bindPad(pad, listen, b)); setListen(null); return; } }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="font-display text-amber-300 text-sm tracking-[0.3em] uppercase">Gamepad</span>
        <span className={`text-[11px] ${found ? 'text-emerald-300' : 'text-stone-500'}`}>{found ? 'verbunden' : 'nicht erkannt – eine Taste am Gamepad drücken'}</span>
        <button onClick={() => { setListen(null); setPad(defaultPad()); }} className="ml-auto px-3 py-1.5 text-xs border border-stone-600 text-stone-300 hover:border-amber-500">Standard</button>
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-2 text-sm">{/* 13 actions = four rows since the reset key: the rows sit closer so that the screen still fits 720 px (pui.mjs) */}
        {ACTIONS.map(([a, label]) => (
          <button key={a} onClick={() => setListen(listen === a ? null : a)} data-pad={a}
            className={`flex items-center gap-3 bg-black/40 border p-2 text-left ${listen === a ? 'border-amber-400' : pad[a].length ? 'border-stone-800 hover:border-stone-500' : 'border-red-500/70'}`}>
            <kbd className="font-display text-cyan-300 text-xs bg-stone-800 px-2 py-1 min-w-[90px] text-center">{listen === a ? 'drücken …' : padLabel(pad[a])}</kbd>
            <span className="text-stone-300 text-xs">{label}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-stone-500 mt-2">Aktion anklicken, dann Taste drücken oder Stick bewegen. Trigger und Sticks bleiben analog. Pause bleibt auf Start.</p>
    </div>
  );
}
