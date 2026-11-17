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
  private lastWaveTickTime = 0;
  private lastLockClickTime = 0;
  private lastWhooshTime = 0;
  private lastClickBurstTime = 0;
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
        this.masterGain.gain.setTargetAtTime(0.48, now, 0.4);
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

  // Layer B — Crisp precision watch-escapement tick synchronized with diagonal block wave activation
  public playWaveTick(wavePos = 0.5, intensity = 0.5): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const nowMs = performance.now();
    if (nowMs - this.lastWaveTickTime < 55) return;
    this.lastWaveTickTime = nowMs;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const baseFreq = 1280 + (1 - wavePos) * 440 + (Math.random() - 0.5) * 60;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.65, t + 0.022);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq * 1.1, t);
    filter.Q.value = 3.5;

    const peak = 0.016 * Math.max(0.25, Math.min(1, intensity));
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.0025);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.026);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.03);
  }

  // Layer C — Tactile stone-and-ice locking click when displaced blocks settle back to rest
  public playBrickLockClick(tone = 0.5, intensity = 0.6): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const nowMs = performance.now();
    if (nowMs - this.lastLockClickTime < 72) return;
    this.lastLockClickTime = nowMs;

    const t = this.ctx.currentTime;
    const amp = Math.max(0.25, Math.min(1, intensity));

    // Low stone thud body
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = 'sine';
    const bodyFreq = 210 + tone * 95;
    bodyOsc.frequency.setValueAtTime(bodyFreq, t);
    bodyOsc.frequency.exponentialRampToValueAtTime(78, t + 0.048);

    bodyGain.gain.setValueAtTime(0.0001, t);
    bodyGain.gain.linearRampToValueAtTime(0.028 * amp, t + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.masterGain);
    bodyOsc.start(t);
    bodyOsc.stop(t + 0.06);

    // High crystalline ice lock transient
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'triangle';
    snapOsc.frequency.setValueAtTime(1920 + tone * 480, t);
    snapOsc.frequency.exponentialRampToValueAtTime(840, t + 0.018);

    snapGain.gain.setValueAtTime(0.0001, t);
    snapGain.gain.linearRampToValueAtTime(0.011 * amp, t + 0.0018);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);

    snapOsc.connect(snapGain);
    snapGain.connect(this.masterGain);
    snapOsc.start(t);
    snapOsc.stop(t + 0.024);
  }

  // Layer F — Soft directional air whoosh during major camera dolly or loop transitions
  public playCameraWhoosh(intensity = 0.5): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const nowMs = performance.now();
    if (nowMs - this.lastWhooshTime < 650) return;
    this.lastWhooshTime = nowMs;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(58, t + 0.52);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, t);

    const peak = 0.024 * Math.max(0.25, Math.min(1, intensity));
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.56);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  // Interactive click shockwave on the 3D particle sculpture: crisp ice impact + scattering micro-clicks
  public playParticleClickBurst(intensity = 0.75): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const nowMs = performance.now();
    if (nowMs - this.lastClickBurstTime < 75) return;
    this.lastClickBurstTime = nowMs;

    const t = this.ctx.currentTime;
    const amp = Math.max(0.3, Math.min(1.2, intensity));

    // Tactile low-mid crystalline impulse
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(240 + Math.random() * 60, t);
    subOsc.frequency.exponentialRampToValueAtTime(84, t + 0.085);
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.linearRampToValueAtTime(0.042 * amp, t + 0.004);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(t);
    subOsc.stop(t + 0.12);

    // Staggered ice-granule scatter micro-clicks
    const freqs = [1180, 1560, 2090, 2640];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const delay = idx * 0.022 + Math.random() * 0.012;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f + (Math.random() - 0.5) * 140, t + delay);
      osc.frequency.exponentialRampToValueAtTime(f * 0.72, t + delay + 0.036);

      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.linearRampToValueAtTime(0.016 * amp * (1 - idx * 0.15), t + delay + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.045);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + delay);
      osc.stop(t + delay + 0.05);
    });
  }

    // Crisp mechanical-ice UI selector click when switching sculptures or clicking arrows
  public playSelectorClick(direction = 1): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const base = direction >= 0 ? 1560 : 1280;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.62, t + 0.036);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.036, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.044);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  // Harmonic crystalline arpeggio tailored to each particle sculpture shape
  public playMorphChord(shapeIndex: number): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const chords: readonly number[][] = [
      [523.25, 659.25, 783.99, 1046.5], // 0: Cartoon playful sparkle major chord
      [440.0, 659.25, 880.0],           // 1: LinkedIn sleek fifth stack
      [587.33, 880.0, 1174.66],         // 2: X crisp crystalline glint
      [392.0, 493.88, 783.99],          // 3: Medium warm resonance
    ];
    const notes = chords[((shapeIndex % chords.length) + chords.length) % chords.length];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const start = t + idx * 0.048;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.028 * (1 - idx * 0.14), start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.46);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  }
}

export const soundController = new HeroSoundController();
