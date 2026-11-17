import { useSyncExternalStore } from 'react';
import { clamp, smoothstep } from '../utils/noise';
import { damp } from '../utils/damping';

export type ScrollStateName =
  | 'hero-rest'
  | 'igloo-activation'
  | 'camera-zoomout'
  | 'frost-entry'
  | 'atmospheric-reveal'
  | 'crystal-1'
  | 'inter-crystal-fog'
  | 'crystal-2'
  | 'ring-entry'
  | 'portal-assembly'
  | 'portal-passage'
  | 'particle-stage';

export const PHASE1_MAX_SCROLL = 0.45;
export const EXPERIENCE_MAX_SCROLL = 1.42;
export const CYCLE_DURATION_SEC = 60;

export interface CyclePhaseInfo {
  index: number;
  code: string;
  label: string;
}

const CYCLE_PHASES: readonly CyclePhaseInfo[] = [
  { index: 1, code: '01 / 06', label: 'THE FROZEN WORLD' },
  { index: 2, code: '02 / 06', label: 'DECONSTRUCTION' },
  { index: 3, code: '03 / 06', label: 'ICE SCULPTURE' },
  { index: 4, code: '04 / 06', label: 'LUMINOUS RINGS' },
  { index: 5, code: '05 / 06', label: 'PARTICLE CLOUD' },
  { index: 6, code: '06 / 06', label: 'RECONSTRUCTION' },
] as const;

export function getCycleProgress(scrollProgress: number, loopProgress: number): number {
  if (loopProgress > 0.001) {
    return clamp(0.833333 + clamp(loopProgress, 0, 1) * 0.166667, 0, 1);
  }
  return clamp((scrollProgress / EXPERIENCE_MAX_SCROLL) * 0.833333, 0, 0.833333);
}

export function classifyCyclePhase(cycleProgress: number): CyclePhaseInfo {
  const idx = Math.min(5, Math.max(0, Math.floor(clamp(cycleProgress, 0, 0.9999) * 6)));
  return CYCLE_PHASES[idx];
}

export interface ScrollStateSnapshot {
  stateName: ScrollStateName;
  scrollPct: number;
  activated: boolean;
}

/**
 * Classifies progress across Phase 1 & Phase 2:
 *  Phase 1:
 *   State A (0.00 - 0.12): hero-rest
 *   State B (0.12 - 0.22): igloo-activation
 *   State C (0.22 - 0.31): camera-zoomout
 *   State D (0.31 - 0.40): frost-entry
 *   State E (0.40 - 0.45): atmospheric-reveal
 *  Phase 2:
 *   (0.45 - 0.62): crystal-1 (Pudgy Penguins)
 *   (0.62 - 0.69): inter-crystal-fog
 *   (0.69 - 0.84): crystal-2 (Overpass)
 *   (0.84 - 0.92): ring-entry (Transition void toward Phase 3)
 */
export function classifyScrollState(p: number): ScrollStateName {
  if (p < 0.12) return 'hero-rest';
  if (p < 0.22) return 'igloo-activation';
  if (p < 0.31) return 'camera-zoomout';
  if (p < 0.4) return 'frost-entry';
  if (p < 0.45) return 'atmospheric-reveal';
  if (p < 0.62) return 'crystal-1';
  if (p < 0.69) return 'inter-crystal-fog';
  if (p < 0.84) return 'crystal-2';
  if (p < 0.92) return 'ring-entry';
  if (p < 1.24) return 'portal-assembly';
  if (p < 1.34) return 'portal-passage';
  return 'particle-stage';
}

/** More input distance for focused models, faster traversal through inter-model gaps. */
export function getScrollPacing(progress: number): number {
  const gapAccel =
    0.42 *
    (smoothstep(0.59, 0.63, progress) * (1 - smoothstep(0.68, 0.72, progress)) +
      smoothstep(0.83, 0.87, progress) * (1 - smoothstep(0.91, 0.94, progress)));
  return 1 - 0.56 * smoothstep(0.23, 0.43, progress)
    + 0.18 * smoothstep(0.9, 1.04, progress)
    - 0.14 * smoothstep(1.31, 1.38, progress)
    + gapAccel;
}

// 60fps imperative scroll controller signals (never causes per-frame React re-renders)
export const scrollDirector = {
  scrollProgress: 0,
  targetScroll: 0,
  velocity: 0,
  direction: 1 as 1 | -1,
  stateName: 'hero-rest' as ScrollStateName,
  paused: false,
  loopProgress: 0,
  loopTarget: 0,
  loopTransitioning: false,
  autoEnabled: true,
  autoWeight: 1,
  idleElapsed: 3.5,

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      this.velocity = 0;
      this.targetScroll = this.scrollProgress;
    }
  },

  notifyInteraction() {
    this.idleElapsed = 0;
    this.autoWeight = 0;
  },

  setAutoEnabled(enabled: boolean) {
    this.autoEnabled = enabled;
    if (!enabled) this.autoWeight = 0;
  },

  triggerLoop() {
    if (this.paused) return;
    this.scrollProgress = EXPERIENCE_MAX_SCROLL;
    this.targetScroll = EXPERIENCE_MAX_SCROLL;
    this.velocity = 0;
    this.direction = 1;
    this.loopTransitioning = true;
    this.loopTarget = 1.05;
  },

  prepareDirection(impulse: number) {
    if (impulse === 0) return;
    const nextDirection = impulse > 0 ? 1 : -1;
    if (nextDirection !== this.direction) {
      this.velocity = 0;
      this.targetScroll = this.scrollProgress;
      if (nextDirection < 0 && !this.loopTransitioning) {
        this.loopTarget = Math.min(this.loopTarget, this.loopProgress);
      }
    }
    this.direction = nextDirection;
  },

  applyWheelImpulse(deltaY: number) {
    if (this.paused) return;
    this.notifyInteraction();
    this.prepareDirection(deltaY);
    const step = clamp(deltaY * 0.00022, -0.028, 0.028);
    if (this.loopProgress > 0.002 || (deltaY > 0 && this.scrollProgress >= EXPERIENCE_MAX_SCROLL - 0.018)) {
      this.loopTransitioning = false;
      this.loopTarget = clamp(this.loopTarget + step * 3.8, 0, 1.05);
      if (this.loopTarget >= 0.96) {
        this.loopTransitioning = true;
        this.loopTarget = 1.05;
      }
      return;
    }
    this.velocity = clamp(this.velocity + step * 1.15, -0.16, 0.16);
    if (Math.abs(step) > 1e-5) {
      this.direction = step > 0 ? 1 : -1;
    }
  },

  applyTouchImpulse(deltaY: number) {
    if (this.paused) return;
    this.notifyInteraction();
    this.prepareDirection(deltaY);
    const step = clamp(deltaY * 0.00044, -0.032, 0.032);
    if (this.loopProgress > 0.002 || (deltaY > 0 && this.scrollProgress >= EXPERIENCE_MAX_SCROLL - 0.018)) {
      this.loopTransitioning = false;
      this.loopTarget = clamp(this.loopTarget + step * 3.8, 0, 1.05);
      if (this.loopTarget >= 0.96) {
        this.loopTransitioning = true;
        this.loopTarget = 1.05;
      }
      return;
    }
    this.velocity = clamp(this.velocity + step * 1.1, -0.16, 0.16);
    if (Math.abs(step) > 1e-5) {
      this.direction = step > 0 ? 1 : -1;
    }
  },

  applyKeyStep(delta: number) {
    if (this.paused) return;
    this.notifyInteraction();
    this.prepareDirection(delta);
    if (delta > 0 && this.scrollProgress >= EXPERIENCE_MAX_SCROLL - 0.018) {
      this.triggerLoop();
      return;
    }
    this.velocity = clamp(this.velocity + delta * 0.3, -0.16, 0.16);
    this.targetScroll = clamp(this.targetScroll + delta * 0.45 * getScrollPacing(this.targetScroll), 0, EXPERIENCE_MAX_SCROLL);
    this.direction = delta >= 0 ? 1 : -1;
  },

  wrapLoopSmooth() {
    this.velocity = 0;
    this.loopProgress = 0;
    this.loopTarget = 0;
    this.loopTransitioning = false;
    this.targetScroll = 0;
    this.scrollProgress = 0;
    this.direction = 1;
    this.stateName = classifyScrollState(0);
    syncSnapshot();
  },

  setImmediate(p: number) {
    const clamped = clamp(p, 0, EXPERIENCE_MAX_SCROLL);
    this.velocity = 0;
    this.loopProgress = 0;
    this.loopTarget = 0;
    this.loopTransitioning = false;
    this.targetScroll = clamped;
    this.scrollProgress = clamped;
    this.stateName = classifyScrollState(clamped);
    syncSnapshot();
  },

  reset() {
    this.paused = false;
    this.idleElapsed = 3.5;
    this.autoWeight = 1;
    this.setImmediate(0);
  },

  stepAuto(dt: number, reducedMotion: boolean, canAdvancePastHero: boolean) {
    if (this.paused || !this.autoEnabled || reducedMotion) {
      this.autoWeight = 0;
      return;
    }
    this.idleElapsed += dt;
    const idleReady = this.idleElapsed >= 2.8 ? 1 : 0;
    this.autoWeight = damp(this.autoWeight, idleReady, 1.35, dt);
    if (this.autoWeight < 0.01) return;

    // Brisk 30s continuous cycle: ~24s across Phases 01-05 + ~6s across Phase 06
    if (this.scrollProgress >= EXPERIENCE_MAX_SCROLL - 0.004 || this.loopTarget > 0.001) {
      this.direction = 1;
      const loopRate = (1.0 / 6.0) * this.autoWeight;
      this.loopTarget = clamp(this.loopTarget + loopRate * dt, 0, 1.02);
      if (this.loopTarget >= 0.995) {
        this.loopTransitioning = true;
      }
      return;
    }

    // Glide briskly through inter-model fog gaps so models flow closely together
    const inGapCorridor =
      (this.scrollProgress > 0.31 && this.scrollProgress < 0.44) ||
      (this.scrollProgress > 0.6 && this.scrollProgress < 0.7) ||
      (this.scrollProgress > 0.83 && this.scrollProgress < 0.93);
    const gapBoost = inGapCorridor ? 2.25 : 1.0;
    const baseRate = (EXPERIENCE_MAX_SCROLL / 24.0) * gapBoost * this.autoWeight;
    const maxTarget = canAdvancePastHero ? EXPERIENCE_MAX_SCROLL : 0.28;
    this.direction = 1;
    this.targetScroll = clamp(this.targetScroll + baseRate * dt, 0, maxTarget);
  },

  step(dt: number, reducedMotion: boolean) {
    if (this.paused) {
      this.velocity = 0;
      return;
    }

    if (this.loopTarget > 0 || this.loopProgress > 0.0001) {
      if (!this.loopTransitioning && this.autoWeight < 0.05 && this.velocity <= 0.0005 && this.idleElapsed < 0.25 && this.direction < 0) {
        this.loopTarget = damp(this.loopTarget, 0, 6.5, dt);
      }
      const loopLambda = reducedMotion ? 11.0 : 5.4;
      this.loopProgress = damp(this.loopProgress, Math.min(1, this.loopTarget), loopLambda, dt);
      if ((this.loopTransitioning || this.loopTarget >= 0.992) && this.loopProgress >= 0.992) {
        this.wrapLoopSmooth();
        return;
      }
      if (!this.loopTransitioning && this.loopProgress < 0.001 && this.loopTarget < 0.001) {
        this.loopProgress = 0;
        this.loopTarget = 0;
      }
    }

    // Integrate velocity into target with smooth frame-rate-independent friction
    if (Math.abs(this.velocity) > 0.00008) {
      const friction = reducedMotion ? 10.5 : 7;
      const decay = Math.exp(-friction * dt);
      const travel = this.velocity * (1 - decay) / friction;
      this.targetScroll = clamp(this.targetScroll + travel * 2.4 * getScrollPacing(this.targetScroll), 0, EXPERIENCE_MAX_SCROLL);
      this.velocity *= decay;
    } else {
      this.velocity = 0;
    }

    const prev = this.scrollProgress;
    const dampLambda = reducedMotion ? 14.0 : 6.8;
    this.scrollProgress = damp(this.scrollProgress, this.targetScroll, dampLambda, dt);
    if (Math.abs(this.scrollProgress - this.targetScroll) < 0.00005) {
      this.scrollProgress = this.targetScroll;
    }

    if (Math.abs(this.scrollProgress - prev) > 1e-5) {
      this.direction = this.scrollProgress >= prev ? 1 : -1;
    }

    const nextState = classifyScrollState(this.scrollProgress);
    const pct = Math.round((this.scrollProgress / EXPERIENCE_MAX_SCROLL) * 100);
    const activated = this.scrollProgress >= 0.12;

    if (
      nextState !== currentSnapshot.stateName ||
      pct !== currentSnapshot.scrollPct ||
      activated !== currentSnapshot.activated
    ) {
      this.stateName = nextState;
      currentSnapshot = {
        stateName: nextState,
        scrollPct: pct,
        activated,
      };
      listeners.forEach((l) => l());
    }
  },
};

let currentSnapshot: ScrollStateSnapshot = {
  stateName: 'hero-rest',
  scrollPct: 0,
  activated: false,
};
const listeners = new Set<() => void>();

function syncSnapshot() {
  const next: ScrollStateSnapshot = {
    stateName: scrollDirector.stateName,
    scrollPct: Math.round((scrollDirector.scrollProgress / EXPERIENCE_MAX_SCROLL) * 100),
    activated: scrollDirector.scrollProgress >= 0.12,
  };
  currentSnapshot = next;
  listeners.forEach((l) => l());
}

export function useScrollStateSelector<T>(selector: (s: ScrollStateSnapshot) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(currentSnapshot),
    () => selector(currentSnapshot),
  );
}
