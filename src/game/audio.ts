/**
 * Procedural Web Audio synthesis:
 *  - Twin pod turbine synth + afterburner boost + wind rush + rival Doppler passby
 *  - Landscape & hazard ambience (TODO §1.3): erupting geyser/waterfall roar, sandcrawler tread rumble,
 *    rhythmic rotor/swing-bridge blade whoosh, distant bird calls (per world), herd/giant bellows,
 *    metallic portcullis gate slams, and energy-field plasma zaps.
 */
export interface WorldAudioState {
  themeId: string;
  geyser: number;  // 0..1 proximity to erupting geyser / waterfall / lavafall
  rotor: number;   // 0..1 proximity to spinning rotor / swinging bridge
  rotorHz: number; // blade-pass rate (Hz)
  crawler: number; // 0..1 proximity to sandcrawler
  bird: number;    // 0..1 proximity to bird flock
  herd: number;    // 0..1 proximity to bantha herd / long-necked giant
}

export class AudioFX {
  ctx: AudioContext | null = null;
  master!: GainNode;
  eng1!: OscillatorNode; eng2!: OscillatorNode; engGain!: GainNode; engFilter!: BiquadFilterNode;
  wind!: AudioBufferSourceNode; windGain!: GainNode; windFilter!: BiquadFilterNode;
  boostGain!: GainNode; boostOsc!: OscillatorNode;
  noiseBuf!: AudioBuffer;
  others!: OscillatorNode; othersGain!: GainNode;
  // Continuous proximity-driven world ambience channels
  ventGain!: GainNode; ventFilter!: BiquadFilterNode;
  rotGain!: GainNode; rotFilter!: BiquadFilterNode;
  crawlOsc!: OscillatorNode; crawlGain!: GainNode;
  private rotPhase = 0;
  private nextBirdT = 3;
  private nextHerdT = 6;

  constructor(volume: number) {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx(); this.ctx = ctx;
      this.master = ctx.createGain(); this.master.gain.value = volume * 0.5;
      // Session 11: master bus compressor (glues the layers, prevents clipping when thunder + boost + hits overlap)
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
      this.master.connect(comp); comp.connect(ctx.destination);
      const len = ctx.sampleRate * 2; this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // Player twin-turbine engine
      this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 800; this.engFilter.Q.value = 4;
      this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
      this.eng1 = ctx.createOscillator(); this.eng1.type = 'sawtooth';
      this.eng2 = ctx.createOscillator(); this.eng2.type = 'square';
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      this.eng1.connect(this.engFilter); this.eng2.connect(g2); g2.connect(this.engFilter);
      this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
      this.eng1.start(); this.eng2.start();

      // Slipstream wind
      this.wind = ctx.createBufferSource(); this.wind.buffer = this.noiseBuf; this.wind.loop = true;
      this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 600; this.windFilter.Q.value = 0.6;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
      this.wind.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master); this.wind.start();

      // Boost whine
      this.boostOsc = ctx.createOscillator(); this.boostOsc.type = 'sawtooth'; this.boostGain = ctx.createGain(); this.boostGain.gain.value = 0;
      const bf = ctx.createBiquadFilter(); bf.type = 'highpass'; bf.frequency.value = 900;
      this.boostOsc.connect(bf); bf.connect(this.boostGain); this.boostGain.connect(this.master); this.boostOsc.start();

      // Opponent engine passby
      this.others = ctx.createOscillator(); this.others.type = 'sawtooth'; this.othersGain = ctx.createGain(); this.othersGain.gain.value = 0;
      const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 500;
      this.othersFilter = of; this.others.connect(of); of.connect(this.othersGain); this.othersGain.connect(this.master); this.others.start();

      // Geyser / lava-vent / waterfall pressurized roar
      const vSrc = ctx.createBufferSource(); vSrc.buffer = this.noiseBuf; vSrc.loop = true;
      this.ventFilter = ctx.createBiquadFilter(); this.ventFilter.type = 'bandpass'; this.ventFilter.frequency.value = 420; this.ventFilter.Q.value = 1.1;
      this.ventGain = ctx.createGain(); this.ventGain.gain.value = 0;
      vSrc.connect(this.ventFilter); this.ventFilter.connect(this.ventGain); this.ventGain.connect(this.master); vSrc.start(0, 0.4);

      // Rotor / swinging boom rhythmic blade whoosh
      const rSrc = ctx.createBufferSource(); rSrc.buffer = this.noiseBuf; rSrc.loop = true;
      this.rotFilter = ctx.createBiquadFilter(); this.rotFilter.type = 'bandpass'; this.rotFilter.frequency.value = 220; this.rotFilter.Q.value = 2.2;
      this.rotGain = ctx.createGain(); this.rotGain.gain.value = 0;
      rSrc.connect(this.rotFilter); this.rotFilter.connect(this.rotGain); this.rotGain.connect(this.master); rSrc.start(0, 1.1);

      // Sandcrawler low mechanical tread rumble
      this.crawlOsc = ctx.createOscillator(); this.crawlOsc.type = 'sawtooth'; this.crawlOsc.frequency.value = 34;
      const cf = ctx.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 115; cf.Q.value = 3;
      this.crawlGain = ctx.createGain(); this.crawlGain.gain.value = 0;
      this.crawlOsc.connect(cf); cf.connect(this.crawlGain); this.crawlGain.connect(this.master); this.crawlOsc.start();
      this.initLayers(ctx);
    } catch { this.ctx = null; }
  }

  // ---- Session 11 layers: turbine whine, sub-bass, jet roar, slide hiss, rain, wind howl, canyon/tunnel slap-back echo ----
  private whine!: OscillatorNode; private whineGain!: GainNode; private sub!: OscillatorNode; private subGain!: GainNode;
  private roarGain!: GainNode; private roarFilter!: BiquadFilterNode; private slideGain!: GainNode; private slideFilter!: BiquadFilterNode;
  private rainGain!: GainNode; private howlGain!: GainNode; private howlFilter!: BiquadFilterNode; private echoSend!: GainNode;
  private ext = { slide: 0, enclosure: 0, rain: 0, wind: 0 };
  private rival = { closing: 0, pack: 0 }; private thunderBus!: GainNode; private othersFilter!: BiquadFilterNode;
  private others2!: OscillatorNode; private rivalRoarGain!: GainNode; private rivalRoarFilter!: BiquadFilterNode;
  private initLayers(ctx: AudioContext) {
    const noise = (offset: number) => { const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.start(0, offset); return s; };
    const filt = (type: BiquadFilterType, f: number, q: number) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this.echoSend = gain(0); const dl = ctx.createDelay(0.5); dl.delayTime.value = 0.13; const fb = gain(0.38), lp = filt('lowpass', 1800, 0.5);
    this.echoSend.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(this.master);
    this.engGain.connect(this.echoSend);
    this.whine = ctx.createOscillator(); this.whine.type = 'triangle'; this.whineGain = gain(0); const wf = filt('bandpass', 2400, 1.2);
    this.whine.connect(wf); wf.connect(this.whineGain); this.whineGain.connect(this.master); this.whine.start();
    this.sub = ctx.createOscillator(); this.sub.type = 'sine'; this.subGain = gain(0); this.sub.connect(this.subGain); this.subGain.connect(this.master); this.sub.start();
    this.roarFilter = filt('bandpass', 700, 0.7); this.roarGain = gain(0); noise(0.7).connect(this.roarFilter); this.roarFilter.connect(this.roarGain); this.roarGain.connect(this.master); this.roarGain.connect(this.echoSend);
    this.slideFilter = filt('bandpass', 1900, 2.5); this.slideGain = gain(0); noise(1.5).connect(this.slideFilter); this.slideFilter.connect(this.slideGain); this.slideGain.connect(this.master);
    this.rainGain = gain(0); const rh = filt('highpass', 2600, 0.4), rl = filt('lowpass', 9000, 0.3); noise(0.2).connect(rh); rh.connect(rl); rl.connect(this.rainGain); this.rainGain.connect(this.master);
    // thunder gets its own loud bus (dry + echo); rivals get a second harmonic and a jet-roar band
    this.thunderBus = gain(1.7); this.thunderBus.connect(this.master); this.thunderBus.connect(this.echoSend);
    this.others2 = ctx.createOscillator(); this.others2.type = 'square'; const o2g = gain(0.5); this.others2.connect(o2g); o2g.connect(this.othersFilter); this.others2.start();
    this.rivalRoarFilter = filt('bandpass', 900, 0.8); this.rivalRoarGain = gain(0); noise(0.9).connect(this.rivalRoarFilter); this.rivalRoarFilter.connect(this.rivalRoarGain); this.rivalRoarGain.connect(this.master); this.rivalRoarGain.connect(this.echoSend);
    this.howlFilter = filt('bandpass', 320, 3.5); this.howlGain = gain(0); noise(1.2).connect(this.howlFilter); this.howlFilter.connect(this.howlGain); this.howlGain.connect(this.master);
  }
  /** Per-frame driving/weather state: slide 0..1, enclosure 0..1 (canyon/tunnel), rain 0..1, wind 0..1 */
  setEnv(slide: number, enclosure: number, rain: number, wind: number) { const x = this.ext; x.slide = slide; x.enclosure = enclosure; x.rain = rain; x.wind = wind; }
  /** Thunder (Session 13): sharp crack for near strikes → heavy boom → long rolling rumble with 3–4 swells + sub-bass. `vol` 0..1 by distance. */
  thunder(vol: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx, t = ctx.currentTime, v = Math.max(0.2, Math.min(1, vol));
    // schedule of the rolling swells first, so the sources live exactly as long as needed
    const pts: [number, number][] = []; let tt = 0.5; const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) { const a = (0.6 - i * 0.12) * v * (0.7 + Math.random() * 0.6); tt += 0.35 + Math.random() * 0.45; pts.push([tt, Math.max(0.03, a)]); tt += 0.25 + Math.random() * 0.3; pts.push([tt, Math.max(0.015, a * 0.35)]); }
    const dur = tt + 1.2;
    const noise = (type: BiquadFilterType, f0: number, f1: number, d: number) => {
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = 0.6; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); s.connect(f); f.connect(g); g.connect(this.thunderBus); s.start(t, Math.random() * 1.5); s.stop(t + d + 0.1); return g.gain;
    };
    if (v > 0.45) { const c = noise('highpass', 2200, 800, 0.45); c.exponentialRampToValueAtTime(0.85 * v, t + 0.012); c.exponentialRampToValueAtTime(0.001, t + 0.34); }
    const b = noise('lowpass', 1500, 60, dur); b.exponentialRampToValueAtTime(1.15 * v, t + 0.05); b.exponentialRampToValueAtTime(0.42 * v, t + 0.5);
    for (const [pt, a] of pts) b.linearRampToValueAtTime(a, t + pt);
    b.linearRampToValueAtTime(0.0001, t + dur);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(58, t); o.frequency.exponentialRampToValueAtTime(27, t + dur);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.6 * v, t + 0.06); og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.85);
    o.connect(og); og.connect(this.thunderBus); o.start(t); o.stop(t + dur);
  }
  /** A rival pod shooting past: band-passed jet sweep up and down (Doppler-like). */
  flyby(strength: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx, t = ctx.currentTime, a = Math.min(1, strength);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.1; f.frequency.setValueAtTime(380, t); f.frequency.exponentialRampToValueAtTime(1900, t + 0.2); f.frequency.exponentialRampToValueAtTime(420, t + 0.62);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.34 * a, t + 0.18); g.gain.exponentialRampToValueAtTime(0.001, t + 0.66);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + 0.7);
  }
  /** Rival field around the player: closing speed (m/s, + = approaching) for the Doppler shift, pods within 70 m for the pack rumble. */
  setRivals(closing: number, pack: number) { this.rival.closing = closing; this.rival.pack = pack; }
  /** Air-rush sweep for the 90° roll */
  whoosh() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.28);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + 0.4);
  }

  resume() { this.ctx?.resume(); }
  suspend() { this.ctx?.suspend(); }

  update(speed: number, throttle: number, boost: boolean, nearestOther: number, otherSpeed: number, world?: WorldAudioState, dt = 0.016) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 45 + speed * 0.9 + throttle * 20;
    this.eng1.frequency.setTargetAtTime(f, t, 0.05); this.eng2.frequency.setTargetAtTime(f * 1.505, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(500 + speed * 12 + throttle * 600, t, 0.05);
    this.engGain.gain.setTargetAtTime(0.12 + throttle * 0.1, t, 0.08);
    this.windGain.gain.setTargetAtTime(Math.min(0.35, speed / 500), t, 0.1);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 8, t, 0.1);
    this.boostGain.gain.setTargetAtTime(boost ? 0.08 : 0, t, 0.1);
    this.boostOsc.frequency.setTargetAtTime(boost ? 1400 + speed * 4 : 800, t, 0.2);
    // Session 13: rivals are clearly audible – ~3× louder, range 170 m, second harmonic + jet roar, Doppler shift, pack rumble
    const rv = this.rival, near = nearestOther < 170 ? Math.pow(1 - nearestOther / 170, 1.3) : 0;
    const dop = 1 + Math.max(-0.22, Math.min(0.22, rv.closing / 343 * 1.5)), of0 = (50 + otherSpeed * 0.8) * dop;
    this.othersGain.gain.setTargetAtTime(Math.min(0.44, near * 0.36 + Math.min(4, rv.pack) * 0.03), t, 0.08);
    this.others.frequency.setTargetAtTime(of0, t, 0.08); this.others2.frequency.setTargetAtTime(of0 * 1.498, t, 0.08);
    this.othersFilter.frequency.setTargetAtTime(420 + near * 1500, t, 0.1);
    this.rivalRoarGain.gain.setTargetAtTime(near * near * 0.13, t, 0.08); this.rivalRoarFilter.frequency.setTargetAtTime((600 + otherSpeed * 6) * dop, t, 0.1);
    const x = this.ext;
    this.whine.frequency.setTargetAtTime(900 + speed * 14 + throttle * 300, t, 0.08);
    this.whineGain.gain.setTargetAtTime(Math.min(0.034, 0.008 + speed / 6000) * (0.6 + throttle * 0.4), t, 0.1);
    this.sub.frequency.setTargetAtTime(f * 0.5, t, 0.05); this.subGain.gain.setTargetAtTime(0.05 + throttle * 0.05, t, 0.1);
    this.roarGain.gain.setTargetAtTime(throttle * 0.035 + (boost ? 0.11 : 0), t, 0.08);
    this.roarFilter.frequency.setTargetAtTime(500 + speed * 5 + (boost ? 900 : 0), t, 0.1);
    this.slideGain.gain.setTargetAtTime(x.slide * 0.09, t, 0.05); this.slideFilter.frequency.setTargetAtTime(1500 + speed * 6, t, 0.1);
    this.rainGain.gain.setTargetAtTime(x.rain * (0.085 + 0.06 * x.rain) * (1 - x.enclosure * 0.6), t, 0.3);
    this.howlGain.gain.setTargetAtTime(x.wind * 0.07, t, 0.25); this.howlFilter.frequency.setTargetAtTime(260 + x.wind * 320 + Math.sin(t * 0.7) * 70, t, 0.3);
    this.echoSend.gain.setTargetAtTime(x.enclosure * 0.5, t, 0.15);

    if (world) {
      // Geyser / lava-vent / canyon waterfall roar
      this.ventGain.gain.setTargetAtTime(world.geyser * 0.18, t, 0.08);
      this.ventFilter.frequency.setTargetAtTime(world.themeId === 'lava' ? 260 + world.geyser * 220 : 480 + world.geyser * 380, t, 0.1);
      // Rotor rhythmic blade whoosh
      this.rotPhase = (this.rotPhase + dt * Math.max(0.4, world.rotorHz) * Math.PI * 2) % (Math.PI * 2);
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(this.rotPhase), 2.2);
      this.rotGain.gain.setTargetAtTime(world.rotor * (0.04 + 0.18 * pulse), t, 0.03);
      this.rotFilter.frequency.setTargetAtTime(160 + pulse * 260, t, 0.04);
      // Sandcrawler deep rumble
      this.crawlGain.gain.setTargetAtTime(world.crawler * 0.11, t, 0.15);
      this.crawlOsc.frequency.setTargetAtTime(31 + Math.sin(t * 2.3) * 2.5, t, 0.15);
      // Occasional organic bird & herd calls when passing nearby
      if (this.ctx.state === 'running') {
        if (world.bird > 0.18 && t > this.nextBirdT) {
          this.birdCall(world.themeId, Math.min(0.11, world.bird * 0.13));
          this.nextBirdT = t + 3.2 + Math.random() * 5.5;
        }
        if (world.herd > 0.22 && t > this.nextHerdT) {
          this.herdBellow(Math.min(0.12, world.herd * 0.14));
          this.nextHerdT = t + 6.5 + Math.random() * 8.0;
        }
      }
    }
  }

  /** Biome-tuned distant bird call (raptor cry, tropical warble, gull, crystal moth chime) */
  birdCall(themeId: string, vol: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = themeId === 'crystal' ? 'sine' : 'triangle';
    const base = themeId === 'desert' || themeId === 'mesa' || themeId === 'lava' ? 1750 : themeId === 'jungle' ? 2100 : themeId === 'crystal' ? 2600 : 1550;
    const pitch = base * (0.9 + Math.random() * 0.22);
    const dur = themeId === 'jungle' ? 0.26 : 0.42;
    o.frequency.setValueAtTime(pitch, t);
    if (themeId === 'jungle') {
      o.frequency.exponentialRampToValueAtTime(pitch * 1.32, t + 0.1);
      o.frequency.exponentialRampToValueAtTime(pitch * 0.92, t + dur);
    } else {
      o.frequency.exponentialRampToValueAtTime(pitch * 0.62, t + dur);
    }
    g.gain.setValueAtTime(0.0005, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.03);
  }

  /** Low resonant Bantha / long-necked giant bellow */
  herdBellow(vol: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 210; f.Q.value = 2.6;
    const g = this.ctx.createGain();
    const f0 = 82 + Math.random() * 24;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.16, t + 0.28);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.72, t + 0.95);
    g.gain.setValueAtTime(0.0005, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.0);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.05);
  }

  /** Heavy metallic portcullis gate slam */
  gateSlam(vol: number) {
    if (!this.ctx) return;
    this.hit(28 * vol);
    const t = this.ctx.currentTime;
    for (const freq of [138, 312]) {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.35);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.18 * vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.38);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.4);
    }
  }

  /** Plasma hum/zap when grazing the illuminating energy barrier */
  fieldZap(strength: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime; const vol = Math.min(0.22, 0.06 + strength * 0.008);
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(520 + Math.random() * 180, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.22);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.26);
  }

  hit(strength: number) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300 + strength * 30;
    const g = this.ctx.createGain(); const t = this.ctx.currentTime;
    g.gain.setValueAtTime(Math.min(1, 0.2 + strength * 0.02), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + 0.5);
  }
  boom() { this.hit(60); this.beep(60, 0.6, 'sawtooth', 0.4); }
  beep(freq: number, dur = 0.2, type: OscillatorType = 'sine', vol = 0.3) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain(); const t = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  setVolume(v: number) { if (this.ctx) this.master.gain.value = v * 0.5; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}
