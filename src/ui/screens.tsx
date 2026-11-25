import { Fit } from './Fit';
import { GfxPanels } from './GfxPanels';
import { KeyBindings, PadBindings } from './KeyBindings';
import { resolveEnvironment, sanitizeEnv, timeOptionsFor, weatherOptionsFor, type TimeOfDay, type WeatherKind } from '../game/environment';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DIFFICULTIES, PILOTS, PODS, STAT_KEYS, STAT_LABELS, THEMES, TRACKS, type StatKey } from '../game/data';
import { effectiveStats, KIT_SLOTS, LIVERY_PATTERNS, MAX_LAPS, MAX_OPPONENTS, PAINT_FINISHES, PART_COLOR, type PaintFinish, type PodKit, type Profile } from '../game/settings';
import { buildTrack, type TrackData } from '../game/trackBuilder';
import { damageModel } from '../game/podDamage';
import { CAMERA_NAMES, fmt } from '../game/Game';
import { Btn, Panel, Slider, StatBar } from './common';
import PodPreview from './PodPreview';
import bg from '../assets/menu-bg.jpg';

/** Curated livery presets (primary, secondary, engine glow + pattern & finish) */
const LIVERIES: { name: string; colors: [string, string, string]; pattern: number; finish: PaintFinish }[] = [
  { name: 'Boonta Gold', colors: ['#d8a21c', '#24201c', '#ffd24a'], pattern: 1, finish: 1 },
  { name: 'Tarnkappe', colors: ['#1c2028', '#424c5c', '#4ad2ff'], pattern: 4, finish: 2 },
  { name: 'Hutt-Kartell', colors: ['#527426', '#d2aa4c', '#b4ff5a'], pattern: 2, finish: 0 },
  { name: 'Imperial', colors: ['#dce0e8', '#1e222a', '#ff4a4a'], pattern: 3, finish: 0 },
  { name: 'Mos Espa Rost', colors: ['#a8502a', '#dfd0b2', '#ff9a3a'], pattern: 0, finish: 2 },
  { name: 'Naboo Chrom', colors: ['#cfd8e6', '#d8a828', '#68e8ff'], pattern: 1, finish: 1 },
  { name: 'Gletscher', colors: ['#cfe8f8', '#2466cc', '#7fe8ff'], pattern: 4, finish: 0 },
  { name: 'Apex-Rallye', colors: ['#c21c22', '#f2eee6', '#ffb347'], pattern: 5, finish: 0 },
];

type Upd = (fn: (p: Profile) => Profile) => void;

export function Background({ dim = 0.55 }: { dim?: number }) {
  return (
    <div className="absolute inset-0 -z-0 overflow-hidden">
      <img src={bg} className="absolute inset-0 w-full h-full object-cover scale-110 animate-[kenburns_40s_ease-in-out_infinite_alternate]" alt="" />
      <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, rgba(0,0,0,${dim + 0.3}) 0%, rgba(0,0,0,${dim}) 50%, rgba(0,0,0,${dim + 0.2}) 100%)` }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.7)_100%)]" />
    </div>
  );
}

export function MainMenu({ profile, go }: { profile: Profile; go: (s: string) => void }) {
  const pod = PODS.find(p => p.id === profile.podId)!;
  return (
    <div className="relative w-full h-full overflow-hidden">
      <Background />
      <Fit>
      <div className="relative z-10 flex flex-1 min-h-0">
      {/* 2026-11-23: at 16:9 the title is wider than this half and read "PODRACE": the gradient of `bg-clip-text` is painted only inside
          the heading's box (→ `w-max` on the h1), and the pod preview lay on top of the overflow (→ `relative z-20` here) */}
      <div className="relative z-20 flex flex-col justify-center pl-24 w-1/2">
        <div className="font-display text-amber-400/80 tracking-[0.6em] text-xs mb-3">OUTER RIM CHAMPIONSHIP</div>
        <h1 className="w-max font-display text-6xl @3xl:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-300 to-orange-600 leading-none drop-shadow-[0_0_40px_rgba(251,146,60,0.35)]">PODRACER</h1>
        <div className="font-display text-xl @3xl:text-2xl text-amber-100/90 tracking-[0.4em] mt-2 mb-12">HYPERSPEED LEGENDS</div>
        <div className="flex flex-col gap-3 w-72">
          <Btn big pad="default start" onClick={() => go('setup')}>Rennen starten</Btn>
          <Btn big onClick={() => go('garage')}>Hangar & Tuning</Btn>
          <Btn big onClick={() => go('settings')}>Einstellungen</Btn>
        </div>
        <div className="mt-12 text-stone-400 text-xs tracking-widest uppercase">Aktueller Pod: <span className="text-amber-300">{pod.name}</span></div>
      </div>
      <div className="relative w-1/2">
        {/* the pod as it is built: paint, Style-Teile and the Tuning-Teile of its tuning steps – as in the hangar and in the race (2026-11-25: the menu showed it bare) */}
        <PodPreview podId={profile.podId} colors={profile.custom[profile.podId].colors} pattern={profile.custom[profile.podId].pattern} finish={profile.custom[profile.podId].finish} kit={profile.custom[profile.podId].kit} tune={profile.custom[profile.podId].tuning} partColor={profile.custom[profile.podId].partColor} className="absolute inset-0" />
      </div>
      </div>
      </Fit>
    </div>
  );
}

const trackCache = new Map<string, TrackData>();
function getTrack(id: string) { if (!trackCache.has(id)) trackCache.set(id, buildTrack(TRACKS.find(t => t.id === id)!)); return trackCache.get(id)!; }

function TrackMap({ id, className }: { id: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const td = getTrack(id); const c = ref.current!; const ctx = c.getContext('2d')!;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const b = td.bounds; const pad = 18; const s = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxZ - b.minZ));
    const ox = (W - (b.maxX - b.minX) * s) / 2, oz = (H - (b.maxZ - b.minZ) * s) / 2;
    const X = (x: number) => W - (ox + (x - b.minX) * s), Z = (z: number) => oz + (z - b.minZ) * s;
    const minY = b.minY, maxY = Math.max(b.maxY, minY + 1);
    for (const path of td.paths) {
      for (let i = 0; i < path.samples.length - 4; i += 4) {
        const a = path.samples[i], bb = path.samples[i + 4];
        if (path.id === 0 && a.bridge) continue; // bridges drawn cleanly on top below
        const t = (a.y - minY) / (maxY - minY);
        ctx.strokeStyle = a.gap ? 'rgba(255,60,60,0.9)' : path.isCave ? '#67e8f9' : path.id ? '#ffd27a' : `hsl(${40 - t * 30}, 90%, ${52 + t * 26}%)`;
        ctx.lineWidth = path.id ? 2.2 : 4; ctx.setLineDash(path.id ? [3, 3] : []);
        ctx.beginPath(); ctx.moveTo(X(a.x), Z(a.z)); ctx.lineTo(X(bb.x), Z(bb.z)); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // Overdraw elevated viaduct bridges with dark casing so self-crossings are unmistakable
    const ms = td.main.samples;
    for (const [col, lw] of [['rgba(0,0,0,0.92)', 8], ['#7dd3fc', 4.4]] as const) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      for (let i = 0; i < ms.length - 4; i += 4) {
        if (!ms[i].bridge) continue;
        ctx.beginPath(); ctx.moveTo(X(ms[i].x), Z(ms[i].z)); ctx.lineTo(X(ms[i + 4].x), Z(ms[i + 4].z)); ctx.stroke();
      }
    }
    const st = td.main.samples[td.startIdx]; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(st.x), Z(st.z), 6, 0, Math.PI * 2); ctx.fill();
    if (!td.main.closed) { const f = td.main.samples[td.finishIdx]; ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(X(f.x), Z(f.z), 6, 0, Math.PI * 2); ctx.fill(); }
  }, [id]);
  return <canvas ref={ref} width={520} height={400} className={className} />;
}

export function RaceSetup({ profile, update, go, start }: { profile: Profile; update: Upd; go: (s: string) => void; start: () => void }) {
  const r = profile.race;
  const [filter, setFilter] = useState<'all' | 'circuit' | 'sprint'>('all');
  const [planet, setPlanet] = useState('all'); const planets = [...new Set(TRACKS.map(t => t.planet))];
  const track = TRACKS.find(t => t.id === r.trackId)!;
  const theme = THEMES[track.theme];
  const set = (k: keyof Profile['race'], v: number | string) => update(p => ({ ...p, race: { ...p.race, [k]: v } }));
  const td = useMemo(() => getTrack(track.id), [track.id]);
  const best = profile.best[track.id];
  return (
    <div className="relative w-full h-full overflow-hidden">
      <Background dim={0.7} />
      <Fit>
      <div className="relative z-10 flex-1 flex flex-col min-h-0 w-full p-6 max-w-[1720px] mx-auto">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="font-display text-3xl text-amber-200 tracking-[0.3em]">RENNEN</h2>
          <Btn pad="back" onClick={() => go('menu')}>‹ Zurück</Btn>
        </div>
        <div className="grid grid-cols-[330px_1fr_330px] gap-4 flex-1 min-h-0">
          <Panel title="Strecken">
            <div className="flex gap-2 mb-4">{(['all', 'circuit', 'sprint'] as const).map(f => <Btn key={f} active={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'Alle' : f === 'circuit' ? 'Rundkurs' : 'Sprint'}</Btn>)}</div>
            <select value={planet} onChange={e => setPlanet(e.target.value)} aria-label="Planet" className="w-full bg-black/60 border border-stone-600 text-amber-100 p-2 mb-3 text-sm">
              <option value="all">Alle Planeten</option>
              {planets.map(pl => <option key={pl} value={pl}>{pl}</option>)}
            </select>
            <div className="flex flex-col gap-1">
              {TRACKS.filter(t => (filter === 'all' || t.type === filter) && (planet === 'all' || t.planet === planet)).map(t => (
                <button key={t.id} onClick={() => set('trackId', t.id)} title={`${t.planet} · ${t.type === 'circuit' ? 'Rundkurs' : 'Sprint'}`} className={`text-left px-2.5 py-[3px] border transition flex items-center gap-2 ${t.id === r.trackId ? 'border-amber-300 bg-amber-400/15' : 'border-stone-700 bg-black/30 hover:border-amber-500/60'}`}>
                  <span className={`w-1.5 h-4 shrink-0 ${t.type === 'circuit' ? 'bg-cyan-400' : 'bg-rose-400'}`} />
                  <span className="font-display text-amber-100 tracking-wider text-[13px] truncate flex-1 min-w-0">{t.name}</span>
                  <span className="text-[9px] text-stone-400 uppercase tracking-wider truncate max-w-[84px]">{t.planet}</span>
                  <span className="text-amber-400 text-[10px] shrink-0">{'◆'.repeat(t.difficulty)}<span className="text-stone-700">{'◆'.repeat(5 - t.difficulty)}</span></span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title={track.name}>
            <div className="relative h-[330px] w-full rounded overflow-hidden" style={{ background: `radial-gradient(ellipse at 30% 20%, ${theme.skyHorizon}33, ${theme.skyTop}22 60%, #000a)` }}>
              <TrackMap id={track.id} className="w-full h-full" />
              <div className="absolute top-3 left-3 text-[10px] uppercase tracking-widest text-stone-300 bg-black/50 px-2 py-1">● Start {track.type === 'sprint' && <span className="text-green-400 ml-2">● Ziel</span>} <span className="text-amber-300 ml-2">┅ Abkürzung</span> {td.crossings.length > 0 && <span className="text-sky-300 ml-2">▬ Brücke</span>} {td.paths.some(p => p.isCave) && <span className="text-cyan-300 ml-2">┅ Höhle</span>} <span className="text-red-400 ml-2">▬ Sprung</span></div>
            </div>
            <p className="text-stone-300 mt-4 leading-relaxed">{track.desc}</p>
            <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3 mt-4 text-center">
              {[['Länge', (td.main.length / 1000).toFixed(2) + ' km'], ['Sprünge', String(track.ramps.length)], ['Abkürzungen', String(td.paths.length - 1)], ['Bestzeit', best ? fmt(best) : '—']].map(([a, b]) => (
                <div key={a} className="bg-black/40 border border-stone-700 p-2"><div className="text-[10px] uppercase tracking-widest text-stone-400">{a}</div><div className="font-display text-amber-200 text-lg">{b}</div></div>
              ))}
            </div>
          </Panel>
          <Panel title="Renneinstellungen">
            {track.type === 'circuit' ? <Slider label="Runden" value={r.laps} min={1} max={MAX_LAPS} step={1} onChange={v => set('laps', v)} /> : <div className="text-[11px] uppercase tracking-widest text-stone-400 mb-3">Sprint – Punkt zu Punkt</div>}
            <Slider label="Gegner" value={r.opponents} min={0} max={MAX_OPPONENTS} step={1} onChange={v => set('opponents', v)} />
            <div className="text-[11px] uppercase tracking-widest text-stone-300 mb-2">Schwierigkeit</div>
            <div className="grid grid-cols-2 gap-2 mb-4">{DIFFICULTIES.map((d, i) => <Btn key={d.id} active={r.difficulty === i} onClick={() => set('difficulty', i)}>{d.name}</Btn>)}</div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-stone-300 mb-2">Tageszeit</div>
                <select value={sanitizeEnv(track.theme, r.timeOfDay, r.weather)[0]} onChange={e => set('timeOfDay', e.target.value as TimeOfDay)} className="w-full bg-black/60 border border-stone-600 text-amber-100 p-2 text-sm">
                  {timeOptionsFor(track.theme).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </div>
              <div>
                {/* 2026-11-22: climate, time of day and weather change how fast the engines heat up while boosting – shown beside the label
                    (no line of its own: the setup screen has no height to spare at 1280 × 720) */}
                {(() => {
                  const [tod, wx] = sanitizeEnv(track.theme, r.timeOfDay, r.weather), hf = resolveEnvironment(THEMES[track.theme], tod, wx).fx.heat, pct = Math.round(Math.abs(hf - 1) * 100);
                  return <div className="flex justify-between items-baseline text-[11px] uppercase tracking-widest text-stone-300 mb-2">
                    <span>Wetter</span>
                    <span data-heat-env={hf.toFixed(2)} className={`normal-case tracking-normal ${pct < 3 ? 'text-stone-500' : hf < 1 ? 'text-cyan-300' : 'text-orange-300'}`}
                      title={pct < 3 ? 'Klima, Tageszeit und Wetter ändern die Boost-Hitze hier nicht.' : hf < 1 ? `Kühle Luft: die Triebwerke heizen beim Boosten ${pct} % langsamer auf und kühlen schneller ab.` : `Heiße Luft: die Triebwerke heizen beim Boosten ${pct} % schneller auf und kühlen langsamer ab.`}>
                      Boost-Hitze {pct < 3 ? '±0' : `${hf < 1 ? '−' : '+'}${pct}`} %</span>
                  </div>;
                })()}
                <select value={sanitizeEnv(track.theme, r.timeOfDay, r.weather)[1]} onChange={e => set('weather', e.target.value as WeatherKind)} className="w-full bg-black/60 border border-stone-600 text-amber-100 p-2 text-sm">
                  {weatherOptionsFor(track.theme).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="text-[11px] uppercase tracking-widest text-stone-300 mb-2">Startkamera</div>
            <select value={r.camera} onChange={e => set('camera', parseInt(e.target.value))} className="w-full bg-black/60 border border-stone-600 text-amber-100 p-2 mb-5 text-sm">
              {CAMERA_NAMES.map((c, i) => <option key={c} value={i}>{c}</option>)}
            </select>
            <div className="border-t border-stone-700 pt-4 mb-4">
              <div className="text-[11px] uppercase tracking-widest text-stone-400">Dein Pod</div>
              <div className="font-display text-amber-200 text-lg">{PODS.find(p => p.id === profile.podId)!.name}</div>
              <button onClick={() => go('garage')} className="text-xs text-cyan-300 hover:underline">Pod wechseln / tunen ›</button>
            </div>
            <Btn big pad="default start" className="w-full" onClick={start}>▶ Start</Btn>
          </Panel>
        </div>
      </div>
      </Fit>
    </div>
  );
}

const SWATCHES = ['#c2263f', '#d07a1c', '#e8c24a', '#27a36d', '#2d6fd6', '#8a3ad6', '#e6e6ee', '#3a3a3a', '#7a4a2a', '#1fb5c8', '#ff5ad1', '#9fff5a'];

export function Garage({ profile, update, go }: { profile: Profile; update: Upd; go: (s: string) => void }) {
  const [sel, setSel] = useState(profile.podId);
  const pod = PODS.find(p => p.id === sel)!;
  const pilot = PILOTS.find(p => p.id === pod.pilotId)!;
  const custom = profile.custom[sel];
  const eff = effectiveStats(sel, custom);
  const setCustom = (c: typeof custom) => update(p => ({ ...p, custom: { ...p.custom, [sel]: c } }));
  const setColor = (i: number, v: string) => { const cols = [...custom.colors] as [string, string, string]; cols[i] = v; setCustom({ ...custom, colors: cols }); };
  const setTune = (k: StatKey, v: number) => setCustom({ ...custom, tuning: { ...custom.tuning, [k]: Math.max(0, Math.min(5, v)) } });
  const setKit = (k: keyof PodKit, v: number) => setCustom({ ...custom, kit: { fins: 0, intake: 0, nozzle: 0, canopy: 0, paint: 0, ...(custom.kit ?? {}), [k]: v } });
  const [tab, setTab] = useState<'lack' | 'teile'>('lack');
  // Schadens-Vorschau: engine health of the preview pod (both sides) and the racer's Bruchteile per step
  const [health, setHealth] = useState(100);
  const breaks = useMemo(() => [50, 35, 20].map(step => ({ step, label: [...new Set(damageModel(sel).parts.filter(b => b.step === step).map(b => b.label))].join(' / ') })), [sel]);
  return (
    <div className="relative w-full h-full overflow-hidden">
      <Background dim={0.75} />
      <Fit>
      <div className="relative z-10 flex-1 flex flex-col min-h-0 w-full p-6 max-w-[1720px] mx-auto">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="font-display text-3xl text-amber-200 tracking-[0.3em]">HANGAR</h2>
          <div className="flex gap-2"><Btn active={profile.podId === sel} onClick={() => update(p => ({ ...p, podId: sel }))}>{profile.podId === sel ? '✓ Ausgewählt' : 'Diesen Pod fahren'}</Btn><Btn pad="back" onClick={() => go('menu')}>‹ Zurück</Btn></div>
        </div>
        <div className="grid grid-cols-[230px_1fr_320px] gap-4 flex-1 min-h-0">
          <Panel title="Racer">
            {/* one line per racer: 14 rows fit the panel without scrolling (pod name left, pilot right) */}
            <div className="flex flex-col gap-1">
              {PODS.map(p => (
                <button key={p.id} onClick={() => setSel(p.id)} data-pad-default={p.id === sel ? '' : undefined} className={`text-left px-2.5 py-[5px] border transition flex items-center gap-2 ${p.id === sel ? 'border-amber-300 bg-amber-400/15' : 'border-stone-800 bg-black/30 hover:border-amber-500/50'}`}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: profile.custom[p.id].colors[0], boxShadow: `0 0 8px ${p.colors[2]}` }} />
                  <span className="font-display text-[13px] leading-4 text-amber-100 whitespace-nowrap">{p.name}</span>
                  <span className="flex-1 text-right text-[9px] leading-4 text-stone-400 whitespace-nowrap overflow-hidden text-ellipsis">{PILOTS.find(x => x.id === p.pilotId)!.name.split(' ')[0]}</span>
                  {profile.podId === p.id && <span className="text-amber-300 text-[10px] leading-4">●</span>}
                </button>
              ))}
            </div>
          </Panel>
          <div className="flex flex-col gap-4 min-h-0">
            <div className="relative flex-1 min-h-[210px] border border-amber-500/20 bg-black/40 clip-corner overflow-hidden">
              <PodPreview podId={sel} colors={custom.colors} pattern={custom.pattern} finish={custom.finish} kit={custom.kit} tune={custom.tuning} partColor={custom.partColor} health={health} className="absolute inset-0" />
              <div className="absolute top-3 left-4 pointer-events-none">
                <div className="font-display text-2xl text-amber-100">{pod.name}</div>
                <div className="text-stone-300 text-xs max-w-md">{pod.desc}</div>
              </div>
              <div className="absolute bottom-2.5 right-3 text-[10px] uppercase tracking-widest text-stone-400">Ziehen · Mausrad Zoom</div>
              {/* Schadens-Vorschau: what this racer loses at 50 / 35 / 20 % engine health */}
              <div className="absolute bottom-2 left-3 w-[250px]" data-damage-preview>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-stone-300">
                  <span className="shrink-0">Schadens-Vorschau</span>
                  <input type="range" min={0} max={100} step={5} value={100 - health} onChange={e => setHealth(100 - parseInt(e.target.value))} className="flex-1 min-w-0 accent-red-500" aria-label="Schadens-Vorschau" />
                  <span className={`shrink-0 w-9 text-right tabular-nums ${health < 50 ? 'text-red-300' : 'text-stone-300'}`}>{health} %</span>
                </div>
                <div className="mt-0.5 text-[9px] leading-[1.35] text-stone-400">
                  {breaks.map(b => <div key={b.step} className={health < b.step ? 'text-red-300' : ''}><span className="inline-block w-8 tabular-nums">{b.step} %</span>{b.label}</div>)}
                </div>
              </div>
            </div>
            <Panel title="Lackierung & Design">
              {/* two tabs in the same panel: paint (Lack) and Style-Teile (Teile) */}
              <div className="flex items-center gap-1 -mt-1 mb-2">
                {(['lack', 'teile'] as const).map(t => (
                  <button key={t} data-tab={t} onClick={() => setTab(t)} className={`px-3 py-0.5 border text-[10px] uppercase tracking-widest ${tab === t ? 'border-amber-300 bg-amber-400/15 text-amber-200' : 'border-stone-700 text-stone-400 hover:border-stone-400'}`}>{t === 'lack' ? 'Lack' : 'Teile'}</button>
                ))}
              </div>
              {tab === 'lack' ? (<>
              <div className="grid grid-cols-3 gap-3">
                {['Primär', 'Sekundär', 'Glühen'].map((l, i) => (
                  <div key={l}>
                    <div className="flex items-center justify-between mb-1"><span className="text-[10px] uppercase tracking-widest text-stone-300">{l}</span><input type="color" value={custom.colors[i]} onChange={e => setColor(i, e.target.value)} className="w-6 h-6 bg-transparent cursor-pointer" /></div>
                    <div className="flex flex-wrap gap-1">{SWATCHES.map(s => <button key={s} onClick={() => setColor(i, s)} className={`w-5 h-5 border ${custom.colors[i] === s ? 'border-white scale-110' : 'border-black/50'}`} style={{ background: s }} />)}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 mt-2.5">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] uppercase tracking-widest text-stone-400 mr-1">Muster</span>
                  {LIVERY_PATTERNS.map((pn, i) => (
                    <button key={pn} onClick={() => setCustom({ ...custom, pattern: i })} className={`px-1.5 py-0.5 border text-[10px] ${custom.pattern === i ? 'border-amber-300 bg-amber-400/15 text-amber-200' : 'border-stone-700 text-stone-300 hover:border-stone-400'}`}>{pn}</button>
                  ))}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {PAINT_FINISHES.map((fn, i) => (
                    <button key={fn} onClick={() => setCustom({ ...custom, finish: i as PaintFinish })} className={`px-1.5 py-0.5 border text-[10px] ${(custom.finish ?? 0) === i ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200' : 'border-stone-700 text-stone-400 hover:border-stone-400'}`}>{fn}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {LIVERIES.map(l => (
                  <button key={l.name} onClick={() => setCustom({ ...custom, colors: [...l.colors] as [string, string, string], pattern: l.pattern, finish: l.finish })} title={l.name}
                    className={`flex items-center gap-1.5 px-1.5 py-1 border text-[10px] ${custom.colors.join() === l.colors.join() && custom.pattern === l.pattern ? 'border-amber-400 text-amber-200' : 'border-stone-700 text-stone-300 hover:border-stone-400'}`}>
                    <span className="flex">{l.colors.map((c, i) => <span key={i} className="w-3 h-3 border border-black/50" style={{ background: c }} />)}</span>{l.name}
                  </button>
                ))}
                <button onClick={() => setCustom({ ...custom, colors: [...pod.colors] as [string, string, string], pattern: undefined, finish: 0 })}
                  className={`px-1.5 py-1 border text-[10px] ${custom.colors.join() === pod.colors.join() && custom.pattern === undefined && (custom.finish ?? 0) === 0 ? 'border-amber-400 text-amber-200' : 'border-stone-700 text-stone-300 hover:border-stone-400'}`}>Werk</button>
              </div>
              </>) : (
              <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
                {KIT_SLOTS.map(sl => (
                  <div key={sl.key} className={sl.key === 'paint' ? 'col-span-2 flex items-end gap-4' : undefined}>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-stone-300 mb-1">{sl.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {sl.choices.map((c, i) => (
                          <button key={c} data-kit={`${sl.key}:${i}`} onClick={() => setKit(sl.key, i)} className={`px-1.5 py-0.5 border text-[10px] ${(custom.kit?.[sl.key] ?? 0) === i ? 'border-amber-300 bg-amber-400/15 text-amber-200' : 'border-stone-700 text-stone-300 hover:border-stone-400'}`}>{c}</button>
                        ))}
                      </div>
                    </div>
                    {/* the own colour of the add-on parts: picker and swatches, shown with „Eigene Farbe" (2026-11-25) */}
                    {sl.key === 'paint' && (custom.kit?.paint ?? 0) === 3 && (
                      <div className="flex items-center gap-1.5" data-part-color>
                        <input type="color" aria-label="Farbe der Teile" value={custom.partColor ?? PART_COLOR} onChange={e => setCustom({ ...custom, partColor: e.target.value })} className="w-6 h-6 bg-transparent cursor-pointer" />
                        <div className="flex flex-wrap gap-1">{SWATCHES.map(sw => <button key={sw} onClick={() => setCustom({ ...custom, partColor: sw })} className={`w-5 h-5 border ${(custom.partColor ?? PART_COLOR) === sw ? 'border-white scale-110' : 'border-black/50'}`} style={{ background: sw }} />)}</div>
                      </div>
                    )}
                  </div>
                ))}
                <div className="col-span-2 flex items-center justify-between gap-3 text-[10px] text-stone-500">
                  <span>Style-Teile ändern nur das Aussehen. Tuning-Teile wachsen mit den Tuning-Stufen rechts: ab Stufe 2 klein, ab Stufe 4 groß. „Lack der Teile" färbt die Gehäuse beider.</span>
                  <button onClick={() => setCustom({ ...custom, kit: undefined })} className={`shrink-0 px-1.5 py-1 border ${custom.kit && Object.values(custom.kit).some(v => v > 0) ? 'border-stone-700 text-stone-300 hover:border-stone-400' : 'border-amber-400 text-amber-200'}`}>Alles Werk</button>
                </div>
              </div>
              )}
            </Panel>
          </div>
          <div className="flex flex-col gap-5">
            <Panel title="Pilot">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center font-display text-xl text-black" style={{ background: pilot.color }}>{pilot.name[0]}</div>
                <div><div className="font-display text-amber-100 text-lg">{pilot.name}</div><div className="text-xs text-stone-400">{pilot.species} · Können {Math.round(pilot.skill * 100)} · Aggression {Math.round(pilot.aggression * 100)}</div></div>
              </div>
            </Panel>
            <Panel title="Leistung & Tuning">
              {STAT_KEYS.map(k => (
                <div key={k} className="flex items-center gap-3">
                  <div className="flex-1"><StatBar label={STAT_LABELS[k]} value={pod.stats[k]} bonus={eff[k] - pod.stats[k]} /></div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setTune(k, custom.tuning[k] - 1)} className="w-6 h-6 bg-stone-800 hover:bg-stone-700 text-amber-200">−</button>
                    <div className="flex gap-0.5">{[0, 1, 2, 3, 4].map(i => <span key={i} className={`w-1.5 h-4 ${i < custom.tuning[k] ? 'bg-cyan-400' : 'bg-stone-700'}`} />)}</div>
                    <button onClick={() => setTune(k, custom.tuning[k] + 1)} className="w-6 h-6 bg-stone-800 hover:bg-stone-700 text-amber-200">+</button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 mt-3">
                <Btn onClick={() => setCustom({ ...custom, tuning: Object.fromEntries(STAT_KEYS.map(k => [k, 5])) as Record<StatKey, number> })}>Alles Max</Btn>
                <Btn onClick={() => setCustom({ ...custom, tuning: Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Record<StatKey, number> })}>Zurücksetzen</Btn>
              </div>
              <p className="text-[11px] text-stone-500 mt-2">Alle Teile freigeschaltet. Jede Stufe verbessert den Wert um 5 %.</p>
            </Panel>
          </div>
        </div>
      </div>
      </Fit>
    </div>
  );
}

export function SettingsScreen({ profile, update, go }: { profile: Profile; update: Upd; go: (s: string) => void }) {
  const [tab, setTab] = useState<'gfx' | 'keys'>('gfx');
  return (
    <div className="relative w-full h-full overflow-hidden">
      <Background dim={0.8} />
      <Fit>
      <div className="relative z-10 flex-1 flex flex-col min-h-0 w-full p-6 max-w-[1720px] mx-auto">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="font-display text-3xl text-amber-200 tracking-[0.3em]">EINSTELLUNGEN</h2>
          <div className="flex gap-2"><Btn active={tab === 'gfx'} onClick={() => setTab('gfx')}>Grafik &amp; Ton</Btn><Btn active={tab === 'keys'} onClick={() => setTab('keys')}>Steuerung</Btn><Btn pad="back" onClick={() => go('menu')}>‹ Zurück</Btn></div>
        </div>
        <div className="grid grid-cols-3 gap-4 content-start">
          {tab === 'gfx' && <GfxPanels profile={profile} update={update} />}
          {tab === 'keys' && <Panel title="Steuerung" className="col-span-3">
            <KeyBindings profile={profile} update={update} />
            <PadBindings profile={profile} update={update} />
          </Panel>}
        </div>
      </div>
      </Fit>
    </div>
  );
}
