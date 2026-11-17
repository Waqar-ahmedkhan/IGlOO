import { computeAtmosphere } from '../experience/atmosphere';

/**
 * Restrained procedural Web Audio API soundscape for the arctic hero & intro.
 * Always defaults to OFF and never initializes audio before explicit user gesture.
 */
class HeroSoundController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private musicGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private resonanceGain: GainNode | null = null;
  private subAirGain: GainNode | null = null;
  private enabled = false;
  private lastHoverTime = 0;
  private lastTickTime = 0;
  private lastAtmosphereTime = -1;
  private particleMotion = 0;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public async setEnabled(next: boolean): Promise<boolean> {
    this.enabled = next;

    if (next) {
      this.ensureInitialized();
      if (this.ctx && this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      if (this.ctx && this.masterGain) {
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setTargetAtTime(0.3, now, 0.45);
      }
    } else if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.25);
    }

    return this.enabled;
  }

  private ensureInitialized(): void {
    if (this.ctx || typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    this.masterGain = master;

    // 1. Low-frequency ambient arctic wind
    const bufferSize = ctx.sampleRate * 3;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.055;
    }

    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 230;
    windFilter.Q.value = 1.25;
    this.windFilter = windFilter;

    const windLfo = ctx.createOscillator();
    windLfo.frequency.value = 0.09;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 85;
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windFilter.frequency);
    windLfo.start();

    const windGain = ctx.createGain();
    windGain.gain.value = 0.38;
    this.windGain = windGain;

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();

    // 2. Gentle atmospheric polar harmonic music pad
    const musicGain = ctx.createGain();
    musicGain.gain.value = 0.085;
    this.musicGain = musicGain;

    const musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 320;
    this.musicFilter = musicFilter;
    musicGain.connect(musicFilter);
    musicFilter.connect(master);

    [65.41, 98.0, 146.83, 196.0].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = idx === 0 ? 0.45 : idx === 1 ? 0.24 : 0.12;
      osc.connect(g);
      g.connect(musicGain);
      osc.start();
    });

    // 3. Crystalline resonance shimmer (scales subtly during State B brick activation)
    const resonanceGain = ctx.createGain();
    resonanceGain.gain.value = 0.0001;
    this.resonanceGain = resonanceGain;
    resonanceGain.connect(master);

    [523.25, 783.99, 1046.5].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.025;
      osc.connect(g);
      g.connect(resonanceGain);
      osc.start();
    });

    // 4. Low-frequency camera withdrawal & frost wind air bed
    const subAirGain = ctx.createGain();
    subAirGain.gain.value = 0.0001;
    this.subAirGain = subAirGain;
    subAirGain.connect(master);

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = 49.0;
    subOsc.connect(subAirGain);
    subOsc.start();
  }

  public setParticleMotion(intensity: number): void {
    this.particleMotion = Math.max(0, Math.min(1, intensity));
  }

  public updateExperienceAtmosphere(scroll: number, activation: number, frost: number, velocity: number, detail: number): void {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    // AudioParam automation needs no more than 30 updates/sec; ramps interpolate between them.
    if (t - this.lastAtmosphereTime < 1 / 30) return;
    this.lastAtmosphereTime = t;
    const targets = computeAtmosphere(scroll, activation, frost, velocity, detail, this.particleMotion);
    this.windGain?.gain.setTargetAtTime(targets.wind, t, 0.25);
    this.windFilter?.frequency.setTargetAtTime(targets.windFrequency, t, 0.25);
    this.musicGain?.gain.setTargetAtTime(targets.music, t, 0.35);
    this.musicFilter?.frequency.setTargetAtTime(targets.musicFrequency, t, 0.35);
    this.resonanceGain?.gain.setTargetAtTime(targets.resonance, t, 0.22);
    this.subAirGain?.gain.setTargetAtTime(targets.subAir, t, 0.28);
  }

  // Light crystalline construction ticks during wireframe assembly
  public playConstructionTick(pitchOffset = 0): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const nowMs = performance.now();
    if (nowMs - this.lastTickTime < 140) return;
    this.lastTickTime = nowMs;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1120 + pitchOffset * 420, t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.014, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  // Soft rising tonal swell during brick materialization (2.9-4.4s)
  public playMaterializeSwell(durationSec = 1.4): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(130.81, t);
    osc.frequency.exponentialRampToValueAtTime(261.63, t + durationSec);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.045, t + durationSec * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationSec + 0.3);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 460;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + durationSec + 0.35);
  }

  // Small bright harmonic chime when igloo geometry finishes assembling
  public playAssemblyResolve(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 987.77].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.055);

      gain.gain.setValueAtTime(0.0001, t + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.022, t + i * 0.055 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.055 + 0.65);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + i * 0.055);
      osc.stop(t + i * 0.055 + 0.7);
    });
  }

  // Subtle hover chime for affected upper ice blocks
  public playBrickHoverChime(intensity = 0.5): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const nowMs = performance.now();
    if (nowMs - this.lastHoverTime < 165) return;
    this.lastHoverTime = nowMs;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const notes = [783.99, 880.0, 1046.5, 1174.66, 1318.51];
    osc.frequency.setValueAtTime(notes[Math.floor(Math.random() * notes.length)], t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.022 * Math.max(0.25, intensity), t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  public playCrystalHoverShimmer(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const nowMs = performance.now();
    if (nowMs - this.lastHoverTime < 220) return;
    this.lastHoverTime = nowMs;

    const t = this.ctx.currentTime;
    const notes = [1174.66, 1396.91, 1567.98, 1760.0];
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(notes[Math.floor(Math.random() * notes.length)], t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.014, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  public playDetailEnter(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    [130.81, 196.0, 293.66].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(idx === 0 ? 0.036 : 0.016, t + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 1.0);
    });
  }

  public playDetailExit(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, t);
    osc.frequency.exponentialRampToValueAtTime(261.63, t + 0.32);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.02, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.38);
  }
}

export const soundController = new HeroSoundController();
