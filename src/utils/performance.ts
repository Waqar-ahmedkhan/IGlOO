export type DeviceTier = 'desktop' | 'tablet' | 'mobile';

export interface PerformanceProfile {
  tier: DeviceTier;
  dpr: [number, number];
  sculptureParticleCount: number;
  snowParticleCount: number;
  terrainSegments: number;
  mountainSegments: number;
  enableShadows: boolean;
  enableRenderTargetTransition: boolean;
  renderTargetScale: number;
  introDurationScale: number;
  reducedMotion: boolean;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getDeviceTier(width = typeof window !== 'undefined' ? window.innerWidth : 1440): DeviceTier {
  if (width < 768) return 'mobile';
  if (width < 1440) return 'tablet';
  return 'desktop';
}

export function getPerformanceProfile(): PerformanceProfile {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const tier = getDeviceTier(width);
  const reducedMotion = prefersReducedMotion();
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const lowPower = cores <= 4 && tier !== 'desktop';

  if (tier === 'mobile') {
    return {
      tier,
      dpr: [1, 1.5],
      sculptureParticleCount: lowPower ? 3800 : 5600,
      snowParticleCount: 480,
      terrainSegments: 48,
      mountainSegments: 44,
      enableShadows: false,
      enableRenderTargetTransition: true,
      renderTargetScale: 0.9,
      introDurationScale: reducedMotion ? 0.35 : 0.72,
      reducedMotion,
    };
  }

  if (tier === 'tablet') {
    return {
      tier,
      dpr: [1, 1.75],
      sculptureParticleCount: 10000,
      snowParticleCount: 950,
      terrainSegments: 76,
      mountainSegments: 64,
      enableShadows: true,
      enableRenderTargetTransition: true,
      renderTargetScale: 0.95,
      introDurationScale: reducedMotion ? 0.35 : 0.88,
      reducedMotion,
    };
  }

  return {
    tier,
    dpr: [1, 2],
    sculptureParticleCount: 16500,
    snowParticleCount: 1800,
    terrainSegments: 112,
    mountainSegments: 88,
    enableShadows: true,
    enableRenderTargetTransition: true,
    renderTargetScale: 1,
    introDurationScale: reducedMotion ? 0.35 : 1,
    reducedMotion,
  };
}

export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

/**
 * Tracks rolling frame timing to adapt quality gracefully on slower devices.
 */
export class AdaptiveQualityMonitor {
  private accumTime = 0;
  private frames = 0;
  public qualityScale = 1;
  private onQualityChange?: (scale: number) => void;

  constructor(onQualityChange?: (scale: number) => void) {
    this.onQualityChange = onQualityChange;
  }

  public tick(delta: number): void {
    this.accumTime += delta;
    this.frames += 1;

    if (this.accumTime >= 2.0) {
      const fps = this.frames / this.accumTime;
      let nextScale = this.qualityScale;

      if (fps < 28 && this.qualityScale > 0.65) {
        nextScale = Math.max(0.65, this.qualityScale - 0.15);
      } else if (fps > 52 && this.qualityScale < 1.0) {
        nextScale = Math.min(1.0, this.qualityScale + 0.1);
      }

      if (Math.abs(nextScale - this.qualityScale) > 0.01) {
        this.qualityScale = nextScale;
        this.onQualityChange?.(this.qualityScale);
      }

      this.accumTime = 0;
      this.frames = 0;
    }
  }
}
