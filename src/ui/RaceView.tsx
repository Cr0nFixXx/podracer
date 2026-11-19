import { keysLabel, normalizeKeys, type Action } from '../game/keymap';
import { useEffect, useRef, useState } from 'react';
import { Game, fmt, type HudState, type RaceResult } from '../game/Game';
import { THEMES, TRACKS } from '../game/data';
import type { Profile } from '../game/settings';
import { Btn } from './common';
import { Fit } from './Fit';
import { GfxPanels } from './GfxPanels';
import { Background } from './screens';

interface Props { profile: Profile; update: (fn: (p: Profile) => Profile) => void; onExit: () => void; onBest: (trackId: string, t: number) => void; }

export default function RaceView({ profile, update, onExit, onBest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [loading, setLoading] = useState<{ p: number; msg: string } | null>({ p: 0, msg: 'Starte …' });
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [results, setResults] = useState<RaceResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const [showGfx, setShowGfx] = useState(false);
  const startGfx = useRef(profile.gfx);
  // HUD scales with the window (reference 1280 × 720) so nothing overlaps on small or very large screens
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => { const on = () => setVp({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  const hs = Math.max(0.45, Math.min(1.6, Math.min(vp.w / 1280, vp.h / 720)));
  // graphics changes from the pause menu: live ones are applied at once, the rest needs a restart of the race
  useEffect(() => { gameRef.current?.applyLiveGfx(profile.gfx, profile.volume); }, [profile.gfx, profile.volume]);
  const needRestart = (Object.keys({ ...startGfx.current, ...profile.gfx }) as (keyof typeof profile.gfx)[]).some(k => !Game.LIVE_GFX.includes(k) && startGfx.current[k] !== profile.gfx[k]);
  const track = TRACKS.find(t => t.id === profile.race.trackId)!;

  useEffect(() => {
    const g = new Game(ref.current!, profile, {
      onHud: setHud,
      onLoading: (p, msg) => setLoading({ p, msg }),
      onReady: () => setLoading(null),
      onPause: setPaused,
      onFinish: (r) => {
        setResults(r);
        const me = r.find(x => x.isPlayer);
        if (me && me.time && TRACKS.find(t => t.id === profile.race.trackId)) onBest(profile.race.trackId, me.time);
      },
    });
    gameRef.current = g; startGfx.current = profile.gfx;
    (window as unknown as { __podracer?: Game }).__podracer = g; // debug / test handle
    g.start().catch(e => { console.error(e); setError(String(e?.message ?? e)); });
    return () => { g.dispose(); gameRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => { if (gameRef.current) gameRef.current.minimap = mapRef.current; });

  const restart = () => { setShowGfx(false); setResults(null); setHud(null); setPaused(false); setLoading({ p: 0, msg: 'Starte neu …' }); setRunId(x => x + 1); };
  const theme = THEMES[track.theme];
  const h = hud;
  const km = normalizeKeys(profile.keys); const kl = (a: Action) => keysLabel(km[a]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none">
      <div ref={ref} className="absolute inset-0" />

      {h && !loading && !results && (
        <div className="absolute left-0 top-0 pointer-events-none text-white" style={{ fontFamily: 'Orbitron, sans-serif', width: vp.w / hs, height: vp.h / hs, transform: `scale(${hs})`, transformOrigin: 'top left' }}>
          {/* ===== top status bar (original style) ===== */}
          <div className="absolute top-0 inset-x-0 h-16">
            <div className="absolute inset-x-0 top-0 h-9" style={{ background: 'linear-gradient(180deg,#1d6ea8 0%,#0c3d66 60%,rgba(8,30,52,0.0) 100%)' }} />
            <svg className="absolute inset-x-0 top-0 w-full h-16" viewBox="0 0 1440 64" preserveAspectRatio="none">
              <path d="M0 30 L470 30 L520 52 L920 52 L970 30 L1440 30" fill="none" stroke="#9fd8ff" strokeWidth="2" opacity="0.85" />
              <path d="M0 34 L468 34 L518 56 L922 56 L972 34 L1440 34" fill="none" stroke="#9fd8ff" strokeWidth="1" opacity="0.4" />
            </svg>
            <div className="absolute top-1 left-6 text-center leading-none">
              <div className="text-3xl font-black italic tracking-wider" style={{ textShadow: '0 2px 0 #06243f' }}>{h.sprint ? '—' : `${h.lap}/${h.laps}`}</div>
              <div className="text-[11px] tracking-[0.4em] text-sky-100/80">{h.sprint ? 'SPRINT' : 'LAP'}</div>
            </div>
            <div className="absolute top-1 left-1/2 -translate-x-1/2 text-center leading-none">
              <div className="text-3xl font-black italic tracking-widest tabular-nums" style={{ textShadow: '0 2px 0 #06243f' }}>{fmt(h.time).replace(/^0:/, '0:')}</div>
              <div className="text-[11px] tracking-[0.45em] text-sky-100/80">TIME</div>
            </div>
            <div className="absolute top-1 right-6 text-center leading-none">
              <div className="text-3xl font-black italic tracking-wider" style={{ textShadow: '0 2px 0 #06243f' }}>{h.place}/{h.total}</div>
              <div className="text-[11px] tracking-[0.4em] text-sky-100/80">POS</div>
            </div>
          </div>

          {/* ===== track map (top right) ===== */}
          <div className="absolute top-20 right-4 w-44 h-36 bg-black/35 border border-sky-200/30">
            <canvas ref={mapRef} width={176} height={144} className="w-full h-full" />
          </div>

          {h.env && <div className="absolute top-[14.4rem] right-4 w-44 text-right text-[10px] tracking-[0.2em] text-sky-100/75 uppercase" style={{ textShadow: '0 1px 2px #000' }}>{h.env}</div>}

          {/* ===== engine damage (bottom left, original style) ===== */}
          <div className="absolute bottom-6 left-5 flex gap-3">
            {[{ v: h.hpL, label: 'L' }, { v: h.hpR, label: 'R' }].map((e, i) => (
              <div key={i} className="w-16 h-24 rounded-md border-2 border-cyan-300/70 bg-black/30 relative overflow-hidden">
                <div className="absolute inset-x-0 bottom-0" style={{ height: `${e.v}%`, background: e.v > 60 ? 'linear-gradient(#d9ff6a,#7fbf2a)' : e.v > 30 ? 'linear-gradient(#ffe27a,#d9a13a)' : 'linear-gradient(#ffb0a0,#d94a3a)' }} />
                <div className="absolute inset-0 flex flex-col justify-between py-1 items-center">
                  {[0, 1, 2].map(r => <div key={r} className="w-10 h-5 border border-black/40 rounded-sm" />)}
                </div>
              </div>
            ))}
          </div>

          {/* ===== flight attitude (roll / lift-dive / slide charge) ===== */}
          <div className="absolute bottom-6 left-44 w-28">
            <svg viewBox="0 0 112 96" className="w-full">
              <circle cx="56" cy="44" r="35" fill="rgba(0,0,0,0.32)" stroke="rgba(125,211,252,0.6)" strokeWidth="2" />
              <line x1="20" y1="44" x2="92" y2="44" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
              <line x1="56" y1="12" x2="56" y2="18" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
              <g transform={`rotate(${h.roll * 90} 56 44) translate(0 ${-h.pitch * 11})`}>
                <line x1="32" y1="44" x2="80" y2="44" stroke={Math.abs(h.roll) > 0.5 ? '#fbbf24' : '#67e8f9'} strokeWidth="3" strokeLinecap="round" />
                <circle cx="33" cy="44" r="6" fill="#0c4a6e" stroke="#7dd3fc" strokeWidth="2" />
                <circle cx="79" cy="44" r="6" fill="#0c4a6e" stroke="#7dd3fc" strokeWidth="2" />
                <circle cx="56" cy="49" r="4" fill="#fff" />
              </g>
              {h.pitch > 0.15 && <path d="M56 2 l-7 9 h14 z" fill="#86efac" />}
              {h.pitch < -0.15 && <path d="M56 86 l-7 -9 h14 z" fill="#fca5a5" />}
              <rect x="16" y="89" width="80" height="5" rx="2" fill="rgba(0,0,0,0.45)" />
              <rect x="16" y="89" width={80 * h.slideCharge} height="5" rx="2" fill={h.slideCharge >= 0.28 ? '#fbbf24' : '#7dd3fc'} />
            </svg>
            <div className="text-center text-[9px] tracking-[0.3em] text-white/75 mt-0.5">{h.sliding ? 'SLIDE' : Math.abs(h.roll) > 0.5 ? 'ROLLE' : h.pitch > 0.15 ? (h.airborne ? 'GLEITEN' : 'ANHEBEN') : h.pitch < -0.15 ? (h.airborne ? 'ABTAUCHEN' : 'NEIGEN') : 'FLUGLAGE'}</div>
          </div>

          {/* ===== speed + boost gauge (bottom right) ===== */}
          <div className="absolute bottom-6 right-40 w-64 h-44">
            <svg viewBox="0 0 240 175" className="w-full h-full">
              <defs>
                <linearGradient id="arc" x1="0" x2="1"><stop offset="0" stopColor="#7d5bd6" /><stop offset="0.55" stopColor="#4aa8e8" /><stop offset="1" stopColor="#ff6a8a" /></linearGradient>
              </defs>
              <path d="M34 96 a 86 86 0 1 1 172 0" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="16" strokeLinecap="round" />
              <path d="M34 96 a 86 86 0 1 1 172 0" fill="none" stroke="url(#arc)" strokeWidth="14" strokeLinecap="round"
                strokeDasharray={`${Math.min(1, h.speed / 900) * 220} 400`} />
              {h.boosting && <path d="M34 96 a 86 86 0 1 1 172 0" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.8" strokeDasharray="220 400" />}
              <circle cx="196" cy="30" r="10" fill={h.overheat ? '#ff4040' : h.boosting ? '#39e07a' : '#14661f'} stroke="#9affb0" strokeWidth="2" />
            </svg>
            <div className="absolute left-[92px] top-[78px] w-[84px] text-center rounded-full border-2 border-sky-300/80 bg-sky-950/60 py-0.5">
              <span className="text-3xl font-black italic text-cyan-300 tabular-nums">{h.speed}</span>
            </div>
            {/* boost heat: fills while boosting, hatched zone = danger, MAX = overheat; after overheating boost is locked until the READY mark */}
            <div className="absolute left-3 right-3 bottom-0">
              <div className="flex justify-between text-[9px] tracking-[0.25em] mb-0.5">
                <span className={h.overheat ? 'text-red-400 animate-pulse' : h.boosting ? 'text-cyan-200' : 'text-white/70'}>{h.overheat ? 'ÜBERHITZT' : h.boosting ? 'BOOST' : 'BOOST-HITZE'}</span>
                <span className="text-white/70 tabular-nums">{Math.round(Math.min(1, h.heat) * 100)}%</span>
              </div>
              <div className="relative h-3 bg-black/55 border border-sky-300/50 rounded-sm overflow-hidden">
                <div className="absolute inset-y-0 right-0" style={{ left: '80%', background: 'repeating-linear-gradient(135deg, rgba(248,113,113,0.6) 0 4px, rgba(0,0,0,0) 4px 8px)' }} />
                <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(1, h.heat) * 100}%`, background: h.overheat ? '#ef4444' : h.heat > 0.8 ? 'linear-gradient(90deg,#38bdf8,#fbbf24 65%,#ef4444)' : h.heat > 0.5 ? 'linear-gradient(90deg,#38bdf8,#fbbf24)' : '#38bdf8' }} />
                {h.overheat && <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: '55%' }} />}
              </div>
              <div className="relative h-3 text-[8px] tracking-[0.2em]">
                {h.overheat && <span className="absolute -translate-x-1/2 text-white" style={{ left: '55%' }}>BEREIT</span>}
                <span className="absolute right-0 text-red-300">MAX</span>
              </div>
            </div>

          </div>

          {/* ===== messages ===== */}
          {h.sprint && <div className="absolute top-20 left-6 text-sm tracking-[0.3em]">{Math.round(h.progress * 100)}%</div>}
          {h.countdown > 0 && h.countdown <= 3.2 && (
            <div className="absolute inset-0 flex items-center justify-center"><div className="text-[176px] font-black italic text-amber-300" style={{ textShadow: '0 0 32px rgba(251,191,36,0.75), 0 4px 0 #3b1806' }}>{Math.ceil(h.countdown)}</div></div>
          )}
          {h.message && <div className="absolute top-[26%] w-full text-center text-5xl font-black italic tracking-[0.15em] text-amber-200" style={{ textShadow: '0 0 20px rgba(251,191,36,0.68), 0 3px 0 #3b1806' }}>{h.message}</div>}
          {h.wrongWay && <div className="absolute top-[40%] w-full text-center text-3xl font-black text-red-500 animate-pulse tracking-[0.3em]">⚠ FALSCHE RICHTUNG</div>}
          {h.zeroG && !h.wrongWay && <div className="absolute top-[18%] w-full text-center text-2xl font-black text-cyan-300 animate-pulse tracking-[0.4em]">⚠ SCHWERELOSIGKEIT</div>}
          {h.overheat && <div className="absolute top-[46%] w-full text-center text-xl font-black text-orange-400 animate-pulse tracking-[0.25em]">ÜBERHITZT</div>}
          <div className="absolute bottom-2 right-6 text-[10px] tracking-[0.25em] text-white/60">{profile.gfx.showFps ? `${h.fps} FPS · ${h.backend}` : ''}</div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
          <Background dim={0.65} />
          <div className="relative z-10 text-center">
            <div className="font-display text-amber-400/80 tracking-[0.5em] text-xs mb-2">{theme.name.toUpperCase()} · {track.type === 'circuit' ? 'RUNDKURS' : 'SPRINT'}</div>
            <div className="font-display text-5xl text-amber-100 mb-8 tracking-widest">{track.name}</div>
            <div className="w-96 h-2 bg-white/10 overflow-hidden mx-auto"><div className="h-full bg-gradient-to-r from-amber-600 to-amber-300 transition-all" style={{ width: `${loading.p * 100}%` }} /></div>
            <div className="mt-3 text-stone-300 text-sm tracking-widest">{loading.msg}</div>
            <div className="mt-10 text-stone-400 text-xs max-w-md mx-auto leading-relaxed">Tipp: Boost erhitzt die Triebwerke. Lass rechtzeitig los, bevor sie Feuer fangen – {kl('airbrake')} = Luftbremse, mit Lenken ein Slide durch Haarnadeln. {kl('pitchUp')} anheben (weiter springen), {kl('pitchDown')} neigen (schneller landen), {kl('rollLeft')} / {kl('rollRight')} 90°-Rolle durch enge Lücken.</div>
            {error && <div className="mt-6 text-red-400 text-sm max-w-lg">Fehler: {error}<div className="mt-3"><Btn onClick={onExit}>Zurück</Btn></div></div>}
          </div>
        </div>
      )}

      {paused && !results && (
        <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm">
          <Fit>
            {!showGfx ? (
              <div className="flex flex-col gap-3 w-72 text-center m-auto py-10">
                <div className="font-display text-4xl text-amber-200 tracking-[0.4em] mb-6">PAUSE</div>
                <Btn big onClick={() => gameRef.current?.setPaused(false)}>Weiter</Btn>
                <Btn big onClick={() => { gameRef.current?.cycleCamera(); }}>Kamera wechseln</Btn>
                <Btn big onClick={() => setShowGfx(true)}>Grafik-Einstellungen</Btn>
                <Btn big onClick={restart}>Neustart</Btn>
                <Btn big onClick={onExit}>Rennen beenden</Btn>
                {needRestart && <div className="text-[11px] text-amber-300 mt-2">Geänderte Grafik-Einstellungen wirken erst nach „Neustart".</div>}
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 w-full p-6 max-w-[1720px] mx-auto">
                <div className="flex items-center justify-between mb-4 gap-4">
                  <h2 className="font-display text-2xl text-amber-200 tracking-[0.3em]">GRAFIK</h2>
                  <div className="text-[11px] text-stone-300 flex-1">Sofort wirksam: alle Effekte, Schatten, Kantenglättung, Partikel, Sichtweite, LOD, Render-Skalierung, Sichtfeld, Lautstärke. Neustart nötig: Texturen, Geometrie/Detaildichte, Tessellation, Material-Optionen, Kaskaden-Schatten, Volumetrie, Renderer.</div>
                  {needRestart && <Btn onClick={restart}>↻ Übernehmen &amp; neu starten</Btn>}
                  <Btn onClick={() => setShowGfx(false)}>‹ Zurück</Btn>
                </div>
                <div className="grid grid-cols-3 gap-4 content-start"><GfxPanels profile={profile} update={update} /></div>
              </div>
            )}
          </Fit>
        </div>
      )}

      {results && (
        <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-md">
          <Fit><div className="w-full max-w-3xl m-auto p-6">
            <div className="font-display text-amber-400/80 tracking-[0.5em] text-xs text-center">{track.name.toUpperCase()}</div>
            <div className="font-display text-5xl text-center text-amber-200 tracking-[0.3em] mb-8">ERGEBNIS</div>
            <div className="bg-black/50 border border-amber-500/25 clip-corner">
              {results.map(r => (
                <div key={r.place} className={`flex items-center gap-4 px-5 py-2.5 border-b border-white/5 ${r.isPlayer ? 'bg-amber-400/15' : ''}`}>
                  <span className={`font-display text-2xl w-10 ${r.place === 1 ? 'text-amber-300' : r.place <= 3 ? 'text-stone-200' : 'text-stone-500'}`}>{r.place}</span>
                  <span className="w-3 h-3 rounded-full" style={{ background: r.color }} />
                  <span className="flex-1"><span className={`block font-semibold ${r.isPlayer ? 'text-amber-200' : 'text-white'}`}>{r.name}</span><span className="block text-xs text-stone-400">{r.pod}</span></span>
                  {r.bestLap && <span className="text-xs text-stone-400 tabular-nums">Beste Runde {fmt(r.bestLap)}</span>}
                  <span className="font-display tabular-nums text-lg text-white w-32 text-right">{fmt(r.time)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-center mt-8">
              <Btn big onClick={restart}>Nochmal</Btn>
              <Btn big onClick={onExit}>Hauptmenü</Btn>
            </div>
          </div></Fit>
        </div>
      )}
    </div>
  );
}
