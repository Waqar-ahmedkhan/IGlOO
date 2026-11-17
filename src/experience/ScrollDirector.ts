import { useSyncExternalStore } from 'react';
import { clamp } from '../utils/noise';
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

// 60fps imperative scroll controller signals (never causes per-frame React re-renders)
export const scrollDirector = {
  scrollProgress: 0,
  targetScroll: 0,
  velocity: 0,
  direction: 1 as 1 | -1,
  stateName: 'hero-rest' as ScrollStateName,
  paused: false,

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      this.velocity = 0;
      this.targetScroll = this.scrollProgress;
    }
  },

  applyWheelImpulse(deltaY: number) {
    if (this.paused) return;
    const step = clamp(deltaY * 0.00028, -0.045, 0.045);
    this.velocity = clamp(this.velocity + step * 1.15, -0.26, 0.26);
    if (Math.abs(step) > 1e-5) {
      this.direction = step > 0 ? 1 : -1;
    }
  },

  applyTouchImpulse(deltaY: number) {
    if (this.paused) return;
    const step = clamp(deltaY * 0.00055, -0.05, 0.05);
    this.velocity = clamp(this.velocity + step * 1.1, -0.24, 0.24);
    if (Math.abs(step) > 1e-5) {
      this.direction = step > 0 ? 1 : -1;
    }
  },

  applyKeyStep(delta: number) {
    if (this.paused) return;
    this.velocity = clamp(this.velocity + delta * 0.38, -0.24, 0.24);
    this.targetScroll = clamp(this.targetScroll + delta * 0.45, 0, EXPERIENCE_MAX_SCROLL);
    this.direction = delta >= 0 ? 1 : -1;
  },

  setImmediate(p: number) {
    const clamped = clamp(p, 0, EXPERIENCE_MAX_SCROLL);
    this.velocity = 0;
    this.targetScroll = clamped;
    this.scrollProgress = clamped;
    this.stateName = classifyScrollState(clamped);
    syncSnapshot();
  },

  reset() {
    this.paused = false;
    this.setImmediate(0);
  },

  step(dt: number, reducedMotion: boolean) {
    if (this.paused) {
      this.velocity = 0;
      return;
    }

    // Integrate velocity into target with smooth frame-rate-independent friction
    if (Math.abs(this.velocity) > 0.00008) {
      this.targetScroll = clamp(this.targetScroll + this.velocity * dt * 2.4, 0, EXPERIENCE_MAX_SCROLL);
      const friction = reducedMotion ? 10.5 : 5.4;
      this.velocity *= Math.exp(-friction * dt);
    } else {
      this.velocity = 0;
    }

    const prev = this.scrollProgress;
    const dampLambda = reducedMotion ? 12.0 : 5.8;
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
