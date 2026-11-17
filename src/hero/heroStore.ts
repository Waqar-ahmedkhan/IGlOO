import { useSyncExternalStore } from 'react';

export interface VertexAnnotation {
  code: string;
  screenX: number;
  screenY: number;
  opacity: number;
}

export interface BrickAnnotation {
  id: number;
  code: string;
  anchorX: number;
  anchorY: number;
  tipX: number;
  tipY: number;
  displacement: number;
}

export type HeroState = {
  assetsReady: boolean;
  loadingStep: 0 | 1 | 2;
  loadingFailed: boolean;
  introComplete: boolean;
  uiVisible: boolean;
  soundEnabled: boolean;
  pointerInteractive: boolean;
  heroScroll: number;
  replayNonce: number;
};

// High-frequency 60fps imperative stage signals driven by GSAP IntroTimeline
export const introStage = {
  elapsedSec: 0,
  loadingMarkOpacity: 1,
  networkReveal: 0, // 0.5 - 1.7s cubic scaffold reveal
  networkFade: 1, // 4.2 - 6.0s fades wider network smoothly
  wireframeReveal: 0, // 1.7 - 2.9s igloo wireframe + seams
  wireframeFade: 1, // 2.9 - 5.4s crisp seam wireframe fades to natural mortar glow
  innerGlow: 0, // 1.6 - 4.4s luminous dome core glow
  coreCapBoost: 0, // 1.7 - 2.9s bright upper-dome glow cap during construction
  brickReveal: 0, // 2.9 - 4.4s bottom-to-top masonry materialization
  terrainRadius: 0, // 2.7 - 5.7s radial terrain & rocky ground expansion
  mountainEmerge: 0, // 4.2 - 5.7s progressive 5-ridge mountain emergence
  cameraDescend: 0, // 4.2 - 6.2s elevated isometric view -> heroic mountain perspective
  lightingWarmth: 0, // 4.4 - 5.7s sun lighting ramp
  telemetryPct: 11, // 11 -> 99 vertex readout counter across intro
  uiReveal: 0, // 5.7 - 6.5s HUD reveal
};

export const hudBridge = {
  vertexAnnotations: [] as VertexAnnotation[],
  brickAnnotations: [] as BrickAnnotation[],
  uiDissolve: 0,
  listeners: new Set<() => void>(),
  emit() {
    this.listeners.forEach((cb) => cb());
  },
  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  },
};

const initialState: HeroState = {
  assetsReady: false,
  loadingStep: 0,
  loadingFailed: false,
  introComplete: false,
  uiVisible: false,
  soundEnabled: false,
  pointerInteractive: false,
  heroScroll: 0,
  replayNonce: 0,
};

let state: HeroState = { ...initialState };
const listeners = new Set<() => void>();

export const heroStore = {
  getState(): HeroState {
    return state;
  },

  setState(partial: Partial<HeroState> | ((prev: HeroState) => Partial<HeroState>)): void {
    const nextPartial = typeof partial === 'function' ? partial(state) : partial;
    let changed = false;
    for (const key of Object.keys(nextPartial) as (keyof HeroState)[]) {
      if (state[key] !== nextPartial[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    state = { ...state, ...nextPartial };
    listeners.forEach((l) => l());
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useHeroSelector<T>(selector: (s: HeroState) => T): T {
  return useSyncExternalStore(
    heroStore.subscribe,
    () => selector(heroStore.getState()),
    () => selector(initialState),
  );
}
