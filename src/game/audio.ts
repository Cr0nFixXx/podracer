export class AudioFX {
  ctx: AudioContext | null = null;
  master!: GainNode;
  eng1!: OscillatorNode; eng2!: OscillatorNode; engGain!: GainNode; engFilter!: BiquadFilterNode;
  wind!: AudioBufferSourceNode; windGain!: GainNode; windFilter!: BiquadFilterNode;
  boostGain!: GainNode; boostOsc!: OscillatorNode;
  noiseBuf!: AudioBuffer;
  others!: OscillatorNode; othersGain!: GainNode;
  constructor(volume: number) {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx(); this.ctx = ctx;
      this.master = ctx.createGain(); this.master.gain.value = volume * 0.5; this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2; this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 800; this.engFilter.Q.value = 4;
      this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
      this.eng1 = ctx.createOscillator(); this.eng1.type = 'sawtooth';
      this.eng2 = ctx.createOscillator(); this.eng2.type = 'square';
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      this.eng1.connect(this.engFilter); this.eng2.connect(g2); g2.connect(this.engFilter);
      this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
      this.eng1.start(); this.eng2.start();
      this.wind = ctx.createBufferSource(); this.wind.buffer = this.noiseBuf; this.wind.loop = true;
      this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 600; this.windFilter.Q.value = 0.6;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
      this.wind.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master); this.wind.start();
      this.boostOsc = ctx.createOscillator(); this.boostOsc.type = 'sawtooth'; this.boostGain = ctx.createGain(); this.boostGain.gain.value = 0;
      const bf = ctx.createBiquadFilter(); bf.type = 'highpass'; bf.frequency.value = 900;
      this.boostOsc.connect(bf); bf.connect(this.boostGain); this.boostGain.connect(this.master); this.boostOsc.start();
      this.others = ctx.createOscillator(); this.others.type = 'sawtooth'; this.othersGain = ctx.createGain(); this.othersGain.gain.value = 0;
      const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 500;
      this.others.connect(of); of.connect(this.othersGain); this.othersGain.connect(this.master); this.others.start();
    } catch { this.ctx = null; }
  }
  resume() { this.ctx?.resume(); }
  suspend() { this.ctx?.suspend(); }
  update(speed: number, throttle: number, boost: boolean, nearestOther: number, otherSpeed: number) {
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
    const og = nearestOther < 80 ? (1 - nearestOther / 80) * 0.12 : 0;
    this.othersGain.gain.setTargetAtTime(og, t, 0.1);
    this.others.frequency.setTargetAtTime(50 + otherSpeed * 0.8, t, 0.1);
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
