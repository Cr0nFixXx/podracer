import { useEffect, useMemo, useRef, useState } from 'react';
import { DIFFICULTIES, PILOTS, PODS, STAT_KEYS, STAT_LABELS, THEMES, TRACKS, type StatKey } from '../game/data';
import { PRESETS, effectiveStats, type GfxSettings, type Profile } from '../game/settings';
import { buildTrack, type TrackData } from '../game/trackBuilder';
import { CAMERA_NAMES, fmt } from '../game/Game';
import { Btn, Panel, Slider, StatBar, Toggle } from './common';
import PodPreview from './PodPreview';
import bg from '../assets/menu-bg.jpg';

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
    <div className="relative w-full h-full flex">
      <Background />
      <div className="relative z-10 flex flex-col justify-center pl-[8vw] w-full md:w-1/2">
        <div className="font-display text-amber-400/80 tracking-[0.6em] text-xs mb-3">OUTER RIM CHAMPIONSHIP</div>
        <h1 className="font-display text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-300 to-orange-600 leading-none drop-shadow-[0_0_40px_rgba(251,146,60,0.35)]">PODRACER</h1>
        <div className="font-display text-xl md:text-2xl text-amber-100/90 tracking-[0.4em] mt-2 mb-12">HYPERSPEED LEGENDS</div>
        <div className="flex flex-col gap-3 w-72">
          <Btn big onClick={() => go('setup')}>Rennen starten</Btn>
          <Btn big onClick={() => go('garage')}>Hangar & Tuning</Btn>
          <Btn big onClick={() => go('settings')}>Einstellungen</Btn>
        </div>
        <div className="mt-12 text-stone-400 text-xs tracking-widest uppercase">Aktueller Pod: <span className="text-amber-300">{pod.name}</span></div>
      </div>
      <div className="hidden md:block relative z-10 w-1/2 h-full">
        <PodPreview podId={profile.podId} colors={profile.custom[profile.podId].colors} className="w-full h-full" />
      </div>
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
        const t = (a.y - minY) / (maxY - minY);
        ctx.strokeStyle = a.gap ? 'rgba(255,60,60,0.9)' : path.id ? '#ffd27a' : `hsl(${40 - t * 30}, 90%, ${55 + t * 25}%)`;
        ctx.lineWidth = path.id ? 2 : 4; ctx.setLineDash(path.id ? [3, 3] : []);
        ctx.beginPath(); ctx.moveTo(X(a.x), Z(a.z)); ctx.lineTo(X(bb.x), Z(bb.z)); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    const st = td.main.samples[td.startIdx]; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(st.x), Z(st.z), 6, 0, Math.PI * 2); ctx.fill();
    if (!td.main.closed) { const f = td.main.samples[td.finishIdx]; ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(X(f.x), Z(f.z), 6, 0, Math.PI * 2); ctx.fill(); }
  }, [id]);
  return <canvas ref={ref} width={520} height={400} className={className} />;
}

export function RaceSetup({ profile, update, go, start }: { profile: Profile; update: Upd; go: (s: string) => void; start: () => void }) {
  const r = profile.race;
  const [filter, setFilter] = useState<'all' | 'circuit' | 'sprint'>('all');
  const track = TRACKS.find(t => t.id === r.trackId)!;
  const theme = THEMES[track.theme];
  const set = (k: keyof Profile['race'], v: number | string) => update(p => ({ ...p, race: { ...p.race, [k]: v } }));
  const td = useMemo(() => getTrack(track.id), [track.id]);
  const best = profile.best[track.id];
  return (
    <div className="relative w-full h-full overflow-auto">
      <Background dim={0.7} />
      <div className="relative z-10 p-6 md:p-10 max-w-[1500px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-3xl text-amber-200 tracking-[0.3em]">RENNEN</h2>
          <Btn onClick={() => go('menu')}>‹ Zurück</Btn>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr_340px] gap-5">
          <Panel title="Strecken">
            <div className="flex gap-2 mb-4">{(['all', 'circuit', 'sprint'] as const).map(f => <Btn key={f} active={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'Alle' : f === 'circuit' ? 'Rundkurs' : 'Sprint'}</Btn>)}</div>
            <div className="flex flex-col gap-2">
              {TRACKS.filter(t => filter === 'all' || t.type === filter).map(t => (
                <button key={t.id} onClick={() => set('trackId', t.id)} className={`text-left p-3 border transition clip-corner ${t.id === r.trackId ? 'border-amber-300 bg-amber-400/15' : 'border-stone-700 bg-black/30 hover:border-amber-500/60'}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-display text-amber-100 tracking-wider">{t.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 uppercase tracking-widest ${t.type === 'circuit' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-rose-500/20 text-rose-300'}`}>{t.type === 'circuit' ? 'Rundkurs' : 'Sprint'}</span>
                  </div>
                  <div className="text-[11px] text-stone-400 mt-1 flex justify-between"><span>{t.planet}</span><span className="text-amber-400">{'◆'.repeat(t.difficulty)}<span className="text-stone-700">{'◆'.repeat(5 - t.difficulty)}</span></span></div>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title={track.name}>
            <div className="relative aspect-[1.3] w-full rounded overflow-hidden" style={{ background: `radial-gradient(ellipse at 30% 20%, ${theme.skyHorizon}33, ${theme.skyTop}22 60%, #000a)` }}>
              <TrackMap id={track.id} className="w-full h-full" />
              <div className="absolute top-3 left-3 text-[10px] uppercase tracking-widest text-stone-300 bg-black/50 px-2 py-1">● Start {track.type === 'sprint' && <span className="text-green-400 ml-2">● Ziel</span>} <span className="text-amber-300 ml-2">┅ Abkürzung</span> <span className="text-red-400 ml-2">▬ Sprung</span></div>
            </div>
            <p className="text-stone-300 mt-4 leading-relaxed">{track.desc}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-center">
              {[['Länge', (td.main.length / 1000).toFixed(2) + ' km'], ['Sprünge', String(track.ramps.length)], ['Abkürzungen', String(td.paths.length - 1)], ['Bestzeit', best ? fmt(best) : '—']].map(([a, b]) => (
                <div key={a} className="bg-black/40 border border-stone-700 p-2"><div className="text-[10px] uppercase tracking-widest text-stone-400">{a}</div><div className="font-display text-amber-200 text-lg">{b}</div></div>
              ))}
            </div>
          </Panel>
          <Panel title="Renneinstellungen">
            {track.type === 'circuit' ? <Slider label="Runden" value={r.laps} min={1} max={7} step={1} onChange={v => set('laps', v)} /> : <div className="text-[11px] uppercase tracking-widest text-stone-400 mb-3">Sprint – Punkt zu Punkt</div>}
            <Slider label="Gegner" value={r.opponents} min={0} max={10} step={1} onChange={v => set('opponents', v)} />
            <div className="text-[11px] uppercase tracking-widest text-stone-300 mb-2">Schwierigkeit</div>
            <div className="grid grid-cols-2 gap-2 mb-4">{DIFFICULTIES.map((d, i) => <Btn key={d.id} active={r.difficulty === i} onClick={() => set('difficulty', i)}>{d.name}</Btn>)}</div>
            <div className="text-[11px] uppercase tracking-widest text-stone-300 mb-2">Startkamera</div>
            <select value={r.camera} onChange={e => set('camera', parseInt(e.target.value))} className="w-full bg-black/60 border border-stone-600 text-amber-100 p-2 mb-5 text-sm">
              {CAMERA_NAMES.map((c, i) => <option key={c} value={i}>{c}</option>)}
            </select>
            <div className="border-t border-stone-700 pt-4 mb-4">
              <div className="text-[11px] uppercase tracking-widest text-stone-400">Dein Pod</div>
              <div className="font-display text-amber-200 text-lg">{PODS.find(p => p.id === profile.podId)!.name}</div>
              <button onClick={() => go('garage')} className="text-xs text-cyan-300 hover:underline">Pod wechseln / tunen ›</button>
            </div>
            <Btn big className="w-full" onClick={start}>▶ Start</Btn>
          </Panel>
        </div>
      </div>
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
  return (
    <div className="relative w-full h-full overflow-auto">
      <Background dim={0.75} />
      <div className="relative z-10 p-6 md:p-10 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-3xl text-amber-200 tracking-[0.3em]">HANGAR</h2>
          <div className="flex gap-2"><Btn active={profile.podId === sel} onClick={() => update(p => ({ ...p, podId: sel }))}>{profile.podId === sel ? '✓ Ausgewählt' : 'Diesen Pod fahren'}</Btn><Btn onClick={() => go('menu')}>‹ Zurück</Btn></div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr_320px] gap-5">
          <Panel title="Podracer">
            <div className="flex flex-col gap-1.5">
              {PODS.map(p => (
                <button key={p.id} onClick={() => setSel(p.id)} className={`text-left px-3 py-2 border transition flex items-center gap-3 ${p.id === sel ? 'border-amber-300 bg-amber-400/15' : 'border-stone-800 bg-black/30 hover:border-amber-500/50'}`}>
                  <span className="w-3 h-3 rounded-full" style={{ background: profile.custom[p.id].colors[0], boxShadow: `0 0 8px ${p.colors[2]}` }} />
                  <span className="flex-1"><span className="block font-display text-sm text-amber-100">{p.name}</span><span className="block text-[10px] text-stone-400">{PILOTS.find(x => x.id === p.pilotId)!.name}</span></span>
                  {profile.podId === p.id && <span className="text-amber-300 text-xs">●</span>}
                </button>
              ))}
            </div>
          </Panel>
          <div className="flex flex-col gap-5">
            <div className="relative h-[62vh] min-h-[460px] border border-amber-500/20 bg-black/40 clip-corner overflow-hidden">
              <PodPreview podId={sel} colors={custom.colors} className="absolute inset-0" />
              <div className="absolute top-4 left-5 pointer-events-none">
                <div className="font-display text-3xl text-amber-100">{pod.name}</div>
                <div className="text-stone-300 text-sm max-w-md">{pod.desc}</div>
              </div>
              <div className="absolute bottom-3 right-4 text-[10px] uppercase tracking-widest text-stone-400">Ziehen zum Drehen</div>
            </div>
            <Panel title="Lackierung">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {['Primär', 'Sekundär', 'Triebwerksglühen'].map((l, i) => (
                  <div key={l}>
                    <div className="flex items-center justify-between mb-2"><span className="text-[11px] uppercase tracking-widest text-stone-300">{l}</span><input type="color" value={custom.colors[i]} onChange={e => setColor(i, e.target.value)} className="w-8 h-8 bg-transparent cursor-pointer" /></div>
                    <div className="flex flex-wrap gap-1.5">{SWATCHES.map(s => <button key={s} onClick={() => setColor(i, s)} className={`w-6 h-6 border ${custom.colors[i] === s ? 'border-white scale-110' : 'border-black/50'}`} style={{ background: s }} />)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3"><Btn onClick={() => setCustom({ ...custom, colors: [...pod.colors] as [string, string, string] })}>Werkslackierung</Btn></div>
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
              <p className="text-[11px] text-stone-500 mt-3">Alle Teile freigeschaltet. Jede Stufe verbessert den Wert um 5 %.</p>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsScreen({ profile, update, go }: { profile: Profile; update: Upd; go: (s: string) => void }) {
  const g = profile.gfx;
  const set = <K extends keyof GfxSettings>(k: K, v: GfxSettings[K]) => update(p => ({ ...p, gfx: { ...p.gfx, [k]: v, preset: k === 'fov' || k === 'showFps' || k === 'bloomStrength' || k === 'anisotropy' || k === 'shaderDetail' || k === 'bumpMapping' || k === 'tessellation' ? p.gfx.preset : 'custom' } }));
  const preset = (n: keyof typeof PRESETS) => update(p => ({ ...p, gfx: { ...p.gfx, ...PRESETS[n], preset: n } }));
  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  return (
    <div className="relative w-full h-full overflow-auto">
      <Background dim={0.8} />
      <div className="relative z-10 p-6 md:p-10 max-w-[1300px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-3xl text-amber-200 tracking-[0.3em]">EINSTELLUNGEN</h2>
          <Btn onClick={() => go('menu')}>‹ Zurück</Btn>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Panel title="Grafik-Voreinstellung" className="lg:col-span-3">
            <div className="flex flex-wrap gap-2 items-center">
              {(['low', 'medium', 'high', 'ultra'] as const).map(n => <Btn key={n} active={g.preset === n} onClick={() => preset(n)}>{{ low: 'Niedrig', medium: 'Mittel', high: 'Hoch', ultra: 'Ultra' }[n]}</Btn>)}
              {g.preset === 'custom' && <span className="text-xs text-cyan-300 uppercase tracking-widest ml-2">Benutzerdefiniert</span>}
              <span className="ml-auto text-[11px] text-stone-400 uppercase tracking-widest">Renderer: WebGL 2 HDR-Pipeline · WebGPU {webgpu ? 'erkannt' : 'nicht verfügbar'}</span>
            </div>
          </Panel>
          <Panel title="Auflösung & Geometrie">
            <Slider label="Render-Skalierung" value={g.renderScale} min={0.5} max={1.5} step={0.05} onChange={v => set('renderScale', v)} fmt={v => Math.round(v * 100) + '%'} />
            <Slider label="Textur-Filter (Anisotrop)" value={g.anisotropy ?? 8} min={1} max={16} step={1} onChange={v => set('anisotropy', [1, 4, 8, 16].reduce((b, x) => Math.abs(x - v) < Math.abs(b - v) ? x : b))} fmt={v => v + 'x'} />
            <Slider label="Texturauflösung" value={g.texRes} min={512} max={2048} step={512} onChange={v => set('texRes', v === 1536 ? 2048 : v)} fmt={v => v >= 2048 ? '2048 (UHD)' : String(v)} />
            <Slider label="Geometrie-Detail" value={g.geometry} min={1} max={3} step={1} onChange={v => set('geometry', v)} fmt={v => ['Niedrig', 'Hoch', 'Ultra (High-Poly)'][v - 1]} />
            <Slider label="Detaildichte" value={g.detail} min={0.2} max={1.6} step={0.1} onChange={v => set('detail', v)} fmt={v => Math.round(v * 100) + '%'} />
            <Slider label="Sichtweite" value={g.drawDistance} min={0.5} max={1.5} step={0.1} onChange={v => set('drawDistance', v)} fmt={v => Math.round(v * 100) + '%'} />
            <Slider label="Sichtfeld (FOV)" value={g.fov} min={60} max={100} step={1} onChange={v => set('fov', v)} fmt={v => v + '°'} />
          </Panel>
          <Panel title="Beleuchtung & Material">
            <Slider label="Schattenqualität" value={g.shadows} min={0} max={3} step={1} onChange={v => set('shadows', v)} fmt={v => ['Aus', '1024', '2048', '4096'][v]} />
            <Slider label="Shader-Details" value={g.shaderDetail ?? 1} min={0} max={2} step={1} onChange={v => set('shaderDetail', v)} fmt={v => ['Niedrig', 'Mittel', 'Hoch'][v]} />
            <Toggle label="Bump-Mapping" value={g.bumpMapping ?? true} onChange={v => set('bumpMapping', v)} />
            <Slider label="Tessellation" value={g.tessellation ?? 1} min={0} max={2} step={1} onChange={v => set('tessellation', v)} fmt={v => ['Aus', 'Mittel', 'Hoch'][v]} />
            <Toggle label="Parallax-Occlusion-Mapping" value={g.parallax} onChange={v => set('parallax', v)} />
            <Toggle label="Ambient Occlusion (GTAO)" value={g.ao} onChange={v => set('ao', v)} />
            <Toggle label="Screen Space Reflections" value={g.ssr} onChange={v => set('ssr', v)} />
            <Toggle label="God Rays" value={g.godRays} onChange={v => set('godRays', v)} />
            <Slider label="Partikel" value={g.particles} min={0.2} max={1.5} step={0.1} onChange={v => set('particles', v)} fmt={v => Math.round(v * 100) + '%'} />
          </Panel>
          <Panel title="Post-Processing & Audio">
            <Toggle label="Bloom" value={g.bloom} onChange={v => set('bloom', v)} />
            {g.bloom && <Slider label="Bloom-Stärke" value={g.bloomStrength ?? 0.5} min={0} max={1.5} step={0.05} onChange={v => update(p => ({ ...p, gfx: { ...p.gfx, bloomStrength: v } }))} fmt={v => Math.round(v * 100) + '%'} />}
            <Toggle label="Geschwindigkeits-Unschärfe" value={g.motionBlur} onChange={v => set('motionBlur', v)} />
            <Toggle label="Kino-Shader (CA, Grain, Grading)" value={g.cinematic} onChange={v => set('cinematic', v)} />
            <div className="text-[11px] uppercase tracking-widest text-stone-300 mt-2 mb-2">Kantenglättung</div>
            <div className="flex gap-2 mb-3">{(['none', 'fxaa', 'smaa'] as const).map(a => <Btn key={a} active={g.aa === a} onClick={() => set('aa', a)}>{a === 'none' ? 'Aus' : a.toUpperCase()}</Btn>)}</div>
            <Toggle label="FPS anzeigen" value={g.showFps} onChange={v => set('showFps', v)} />
            <Slider label="Lautstärke" value={profile.volume} min={0} max={1} step={0.05} onChange={v => update(p => ({ ...p, volume: v }))} fmt={v => Math.round(v * 100) + '%'} />
          </Panel>
          <Panel title="Steuerung" className="lg:col-span-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {[['W / ↑', 'Gas'], ['S / ↓', 'Bremse / Rückwärts'], ['A D / ← →', 'Lenken'], ['Shift / Leertaste', 'Boost (erzeugt Hitze)'], ['E / Q / Strg', 'Luftbremse (enge Kurven)'], ['R', 'Reparatur (langsamer)'], ['C', 'Kamera wechseln'], ['Esc / P', 'Pause']].map(([k, a]) => (
                <div key={k} className="flex items-center gap-3 bg-black/40 border border-stone-800 p-2"><kbd className="font-display text-amber-300 text-xs bg-stone-800 px-2 py-1 min-w-[90px] text-center">{k}</kbd><span className="text-stone-300 text-xs">{a}</span></div>
              ))}
            </div>
            <p className="text-[11px] text-stone-500 mt-3">Gamepad: RT Gas · LT Bremse · Linker Stick Lenken · A Boost · B/LB/RB Luftbremse · X Reparatur · Y Kamera</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
