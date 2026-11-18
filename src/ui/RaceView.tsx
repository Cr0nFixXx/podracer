import { useEffect, useRef, useState } from 'react';
import { Game, fmt, type HudState, type RaceResult } from '../game/Game';
import { THEMES, TRACKS } from '../game/data';
import type { Profile } from '../game/settings';
import { Btn } from './common';
import { Background } from './screens';

interface Props { profile: Profile; onExit: () => void; onBest: (trackId: string, t: number) => void; }

export default function RaceView({ profile, onExit, onBest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [loading, setLoading] = useState<{ p: number; msg: string } | null>({ p: 0, msg: 'Starte …' });
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [results, setResults] = useState<RaceResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
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
    gameRef.current = g;
    g.start().catch(e => { console.error(e); setError(String(e?.message ?? e)); });
    return () => { g.dispose(); gameRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => { if (gameRef.current) gameRef.current.minimap = mapRef.current; });

  const restart = () => { setResults(null); setHud(null); setPaused(false); setLoading({ p: 0, msg: 'Starte neu …' }); setRunId(x => x + 1); };
  const theme = THEMES[track.theme];
  const h = hud;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none">
      <div ref={ref} className="absolute inset-0" />

      {h && !loading && !results && (
        <div className="absolute inset-0 pointer-events-none text-white" style={{ fontFamily: 'Orbitron, sans-serif' }}>
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
            {/* attitude indicator: roll (rotating pod bar), pitch/raise (vertical offset), airbrake sides, slide */}
            <div className="absolute left-[96px] top-[118px] w-[76px] h-[40px] rounded-md border border-sky-300/50 bg-black/45 overflow-hidden">
              <div className="absolute left-1/2 top-1/2 w-[50px] h-[3px] -ml-[25px] bg-cyan-300 rounded transition-none"
                style={{ transform: `translateY(${(-h.pitchC * 9).toFixed(1)}px) rotate(${(-h.roll * 57.3).toFixed(0)}deg)` }}>
                <div className="absolute -left-1 -top-[3px] w-[9px] h-[9px] rounded-full" style={{ background: h.abL ? '#ffb040' : '#4aa8e8' }} />
                <div className="absolute -right-1 -top-[3px] w-[9px] h-[9px] rounded-full" style={{ background: h.abR ? '#ffb040' : '#4aa8e8' }} />
              </div>
              {h.sliding && <div className="absolute inset-x-0 bottom-0 text-[9px] font-black tracking-[0.2em] text-amber-300 text-center">SLIDE</div>}
              {Math.abs(h.roll) > 1.2 && <div className="absolute inset-x-0 top-0 text-[9px] font-black tracking-[0.2em] text-cyan-200 text-center">ROLLE</div>}
            </div>
            <div className="absolute left-[92px] top-[78px] w-[84px] text-center rounded-full border-2 border-sky-300/80 bg-sky-950/60 py-0.5">
              <span className="text-3xl font-black italic text-cyan-300 tabular-nums">{h.speed}</span>
            </div>

          </div>

          {/* ===== messages ===== */}
          {h.sprint && <div className="absolute top-20 left-6 text-sm tracking-[0.3em]">{Math.round(h.progress * 100)}%</div>}
          {h.countdown > 0 && h.countdown <= 3.2 && (
            <div className="absolute inset-0 flex items-center justify-center"><div className="text-[180px] font-black italic text-amber-300 drop-shadow-[0_0_40px_rgba(251,191,36,0.8)]">{Math.ceil(h.countdown)}</div></div>
          )}
          {h.message && <div className="absolute top-[26%] w-full text-center text-5xl font-black italic tracking-[0.15em] text-amber-200 drop-shadow-[0_0_24px_rgba(251,191,36,0.7)]">{h.message}</div>}
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
            <div className="mt-10 text-stone-400 text-xs max-w-md mx-auto leading-relaxed">Tipp: Boost erhitzt die Triebwerke. Lass rechtzeitig los, bevor sie Feuer fangen – nutze in Haarnadeln die kurveninnere Luftbremse (Q/E) oder slide mit der Handbremse (Leertaste). Mit ← / → rollst du dich durch enge Lücken.</div>
            {error && <div className="mt-6 text-red-400 text-sm max-w-lg">Fehler: {error}<div className="mt-3"><Btn onClick={onExit}>Zurück</Btn></div></div>}
          </div>
        </div>
      )}

      {paused && !results && (
        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col gap-3 w-72 text-center">
            <div className="font-display text-4xl text-amber-200 tracking-[0.4em] mb-6">PAUSE</div>
            <Btn big onClick={() => gameRef.current?.setPaused(false)}>Weiter</Btn>
            <Btn big onClick={() => { gameRef.current?.cycleCamera(); }}>Kamera wechseln</Btn>
            <Btn big onClick={restart}>Neustart</Btn>
            <Btn big onClick={onExit}>Rennen beenden</Btn>
          </div>
        </div>
      )}

      {results && (
        <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-3xl">
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
          </div>
        </div>
      )}
    </div>
  );
}
