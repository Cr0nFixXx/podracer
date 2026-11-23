import { PRESETS, type GfxSettings, type Profile } from '../game/settings';
import { Btn, Panel, Slider, Toggle } from './common';

type Upd = (fn: (p: Profile) => Profile) => void;
/** Changing one of these keeps the selected preset; everything else switches it to "Benutzerdefiniert". */
const KEEP: (keyof GfxSettings)[] = ['fov', 'showFps', 'bloomStrength', 'backend'];

/** All graphics panels (shared by the settings screen and the pause menu). Render inside a 3-column grid. */
export function GfxPanels({ profile, update }: { profile: Profile; update: Upd }) {
  const g = profile.gfx;
  const set = <K extends keyof GfxSettings>(k: K, v: GfxSettings[K]) => update(p => ({ ...p, gfx: { ...p.gfx, [k]: v, preset: KEEP.includes(k) ? p.gfx.preset : 'custom' } }));
  const preset = (n: keyof typeof PRESETS) => update(p => ({ ...p, gfx: { ...p.gfx, ...PRESETS[n], preset: n } }));
  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  return (
    <>
      <div className="col-span-3 flex flex-wrap gap-2 items-center">
        <span className="font-display text-amber-300 text-sm tracking-[0.3em] uppercase mr-2">Voreinstellung</span>
        {(['low', 'medium', 'high', 'ultra'] as const).map(n => <Btn key={n} active={g.preset === n} onClick={() => preset(n)}>{{ low: 'Niedrig', medium: 'Mittel', high: 'Hoch', ultra: 'Ultra' }[n]}</Btn>)}
        {g.preset === 'custom' && <span className="text-xs text-cyan-300 uppercase tracking-widest ml-2">Benutzerdefiniert</span>}
        <span className="ml-auto text-[11px] text-stone-400 uppercase tracking-widest">Renderer: {g.backend === 'webgl' ? 'WebGL2 erzwungen' : webgpu ? 'WebGPU HDR-Pipeline' : 'WebGL2 Fallback'}</span>
      </div>
      <Panel title="Auflösung & Geometrie">
        <Slider label="Render-Skalierung" value={g.renderScale} min={0.5} max={1.5} step={0.05} onChange={v => set('renderScale', v)} fmt={v => Math.round(v * 100) + '%'} />
        <Slider label="Textur-Filter (Anisotrop)" value={g.anisotropy ?? 8} min={1} max={16} step={1} onChange={v => set('anisotropy', [1, 4, 8, 16].reduce((b, x) => Math.abs(x - v) < Math.abs(b - v) ? x : b))} fmt={v => v + 'x'} />
        <Slider label="Texturauflösung" value={g.texRes} min={512} max={2048} step={512} onChange={v => set('texRes', v === 1536 ? 2048 : v)} fmt={v => v >= 2048 ? '2048 (UHD)' : String(v)} />
        <Slider label="Geometrie-Detail" value={g.geometry} min={1} max={3} step={1} onChange={v => set('geometry', v)} fmt={v => ['Niedrig', 'Hoch', 'Ultra (High-Poly)'][v - 1]} />
        <Slider label="Detaildichte" value={g.detail} min={0.2} max={1.6} step={0.1} onChange={v => set('detail', v)} fmt={v => Math.round(v * 100) + '%'} />
        <Slider label="Sichtweite" value={g.drawDistance} min={0.5} max={1.5} step={0.1} onChange={v => set('drawDistance', v)} fmt={v => Math.round(v * 100) + '%'} />
        <Slider label="LOD-Distanz (Landschaft)" value={g.lodBias ?? 1} min={0.5} max={2} step={0.1} onChange={v => set('lodBias', v)} fmt={v => Math.round(v * 100) + '%'} />
        <Slider label="Gegner-Pod-Detail (Sichtweite)" value={g.podDetail ?? 1} min={0.5} max={3} step={0.1} onChange={v => set('podDetail', v)} fmt={v => Math.round(48 * v) + ' m'} />
        <Slider label="Sichtfeld (FOV)" value={g.fov} min={60} max={100} step={1} onChange={v => set('fov', v)} fmt={v => v + '°'} />
      </Panel>
      <Panel title="Beleuchtung & Material">
        <Slider label="Schattenqualität" value={g.shadows} min={0} max={3} step={1} onChange={v => set('shadows', v)} fmt={v => ['Aus', '1024 · 195 m', '1536 · 245 m', '2048 · 295 m'][v]} />
        <Slider label="Shader-Details" value={g.shaderDetail ?? 1} min={0} max={2} step={1} onChange={v => set('shaderDetail', v)} fmt={v => ['Niedrig', 'Mittel', 'Hoch'][v]} />
        <Slider label="Tessellation" value={g.tessellation ?? 1} min={0} max={2} step={1} onChange={v => set('tessellation', v)} fmt={v => ['Aus', 'Mittel', 'Hoch'][v]} />
        <Slider label="Partikel" value={g.particles} min={0.2} max={1.5} step={0.1} onChange={v => set('particles', v)} fmt={v => Math.round(v * 100) + '%'} />
        <Slider label="Wetter-Effekte" value={g.weatherFx ?? 2} min={0} max={2} step={1} onChange={v => set('weatherFx', v)} fmt={v => ['Aus', 'Reduziert', 'Voll'][v]} />
        <Slider label="Volumetrie (Nebel, Lichtkegel)" value={g.volumetrics ?? 2} min={0} max={2} step={1} onChange={v => set('volumetrics', v)} fmt={v => ['Aus', 'Einfach', 'Voll'][v]} />
        <Toggle label="Kaskaden-Schatten (weit)" value={!!g.csm} onChange={v => set('csm', v)} />
        <Toggle label="Parallax-Occlusion-Mapping" value={g.parallax} onChange={v => set('parallax', v)} />
        <Toggle label="Bump-Mapping" value={g.bumpMapping ?? true} onChange={v => set('bumpMapping', v)} />
        <Toggle label="Static Batching" value={g.batching ?? true} onChange={v => set('batching', v)} />
        <Toggle label="WebGL2 erzwingen (statt WebGPU)" value={g.backend === 'webgl'} onChange={v => set('backend', v ? 'webgl' : 'auto')} />
      </Panel>
      <Panel title="Effekte & Ton">
        <Toggle label="Spiegelungen (Screen Space Reflections)" value={g.ssr} onChange={v => set('ssr', v)} />
        <Slider label="Spiegelungs-Auflösung" value={g.reflRes ?? 0.75} min={0.35} max={1} step={0.05} onChange={v => set('reflRes', v)} fmt={v => Math.round(v * 100) + '%'} />
        <Toggle label="Ambient Occlusion" value={g.ao} onChange={v => set('ao', v)} />
        <Toggle label="God Rays" value={g.godRays} onChange={v => set('godRays', v)} />
        <Toggle label="Linseneffekte (Blendung, Regentropfen)" value={g.lensFx ?? true} onChange={v => set('lensFx', v)} />
        <Toggle label="Geschwindigkeits-Unschärfe" value={g.motionBlur} onChange={v => set('motionBlur', v)} />
        <Toggle label="Kino-Shader (CA, Grading, Vignette)" value={g.cinematic} onChange={v => set('cinematic', v)} />
        <Toggle label="Bloom" value={g.bloom} onChange={v => set('bloom', v)} />
        <Slider label="Bloom-Stärke" value={g.bloomStrength ?? 0.5} min={0} max={1.5} step={0.05} onChange={v => update(p => ({ ...p, gfx: { ...p.gfx, bloomStrength: v } }))} fmt={v => Math.round(v * 100) + '%'} />
        <div className="text-[11px] uppercase tracking-widest text-stone-300 mt-1 mb-1.5">Kantenglättung</div>
        <div className="flex gap-2 mb-2">{(['none', 'fxaa', 'smaa'] as const).map(a => <Btn key={a} active={g.aa === a} onClick={() => set('aa', a)}>{a === 'none' ? 'Aus' : a.toUpperCase()}</Btn>)}</div>
        <Toggle label="FPS anzeigen" value={g.showFps} onChange={v => set('showFps', v)} />
        <Slider label="Lautstärke" value={profile.volume} min={0} max={1} step={0.05} onChange={v => update(p => ({ ...p, volume: v }))} fmt={v => Math.round(v * 100) + '%'} />
      </Panel>
    </>
  );
}
