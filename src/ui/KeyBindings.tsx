import { useEffect, useState } from 'react';
import type { Profile } from '../game/settings';
import { ACTIONS, KEY_PRESETS, RESERVED, bindKey, keysLabel, normalizeKeys, type Action, type KeyMap } from '../game/keymap';

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
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
