import { useSyncExternalStore } from 'react';
import { scrollDirector } from '../experience/ScrollDirector';
import { heroStore } from '../hero/heroStore';
import { soundController } from '../hero/SoundController';
import { getProjectById, getProjectByPathname, type PortfolioProjectId } from './projects';

export interface CrystalHudProjection {
  projectId: PortfolioProjectId;
  visible: boolean;
  opacity: number;
  centerX: number;
  centerY: number;
  // Upper-left leader line (PORTFOLIO_CO_XX / NAME)
  topLeftAnchorX: number;
  topLeftAnchorY: number;
  topLeftElbowX: number;
  topLeftElbowY: number;
  topLeftEndX: number;
  topLeftEndY: number;
  // Upper-right telemetry readout (TEMP)
  topRightX: number;
  topRightY: number;
  // Lower-right leader line (D XX.XX.XXXX / CLICK TO EXPLORE)
  bottomRightAnchorX: number;
  bottomRightAnchorY: number;
  bottomRightEndX: number;
  bottomRightEndY: number;
}

export const portfolioHudBridge = {
  projection: null as CrystalHudProjection | null,
  detailBlend: 0,
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

export interface PortfolioState {
  selectedProjectId: PortfolioProjectId | null;
  hoveredProjectId: PortfolioProjectId | null;
  activeHudProjectId: PortfolioProjectId | null;
  activeHudNonce: number;
}

const initialState: PortfolioState = {
  selectedProjectId: null,
  hoveredProjectId: null,
  activeHudProjectId: null,
  activeHudNonce: 0,
};

let state: PortfolioState = { ...initialState };
const listeners = new Set<() => void>();

function emitState() {
  listeners.forEach((l) => l());
}

export const portfolioStore = {
  getState(): PortfolioState {
    return state;
  },

  setState(partial: Partial<PortfolioState>): void {
    let changed = false;
    for (const key of Object.keys(partial) as (keyof PortfolioState)[]) {
      if (state[key] !== partial[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    state = { ...state, ...partial };
    emitState();
  },

  setHoveredProject(id: PortfolioProjectId | null): void {
    if (state.hoveredProjectId === id) return;
    state = { ...state, hoveredProjectId: id };
    heroStore.setState({ pointerInteractive: id !== null });
    if (id !== null) {
      soundController.playCrystalHoverShimmer();
    }
    emitState();
  },

  setActiveHudProject(id: PortfolioProjectId | null): void {
    if (state.activeHudProjectId === id) return;
    state = {
      ...state,
      activeHudProjectId: id,
      activeHudNonce: id !== null ? state.activeHudNonce + 1 : state.activeHudNonce,
    };
    emitState();
  },

  openProject(id: PortfolioProjectId, options: { pushHistory?: boolean } = {}): void {
    const project = getProjectById(id);
    if (!project) return;
    const { pushHistory = true } = options;

    if (state.selectedProjectId !== id) {
      state = {
        ...state,
        selectedProjectId: id,
        hoveredProjectId: null,
      };
      scrollDirector.setPaused(true);
      heroStore.setState({ pointerInteractive: false });
      soundController.playDetailEnter();
      emitState();
    }

    if (pushHistory && typeof window !== 'undefined') {
      if (window.location.pathname !== project.route) {
        window.history.pushState({ projectId: id }, '', project.route);
      }
    }
  },

  closeProject(options: { pushHistory?: boolean } = {}): void {
    if (!state.selectedProjectId) return;
    const { pushHistory = true } = options;

    state = {
      ...state,
      selectedProjectId: null,
      hoveredProjectId: null,
      activeHudNonce: state.activeHudNonce + 1,
    };
    scrollDirector.setPaused(false);
    heroStore.setState({ pointerInteractive: false });
    soundController.playDetailExit();
    emitState();

    if (pushHistory && typeof window !== 'undefined') {
      if (window.location.pathname !== '/') {
        window.history.pushState({}, '', '/');
      }
    }
  },

  syncFromLocation(pathname: string): PortfolioProjectId | null {
    const project = getProjectByPathname(pathname);
    if (project) {
      this.openProject(project.id, { pushHistory: false });
      return project.id;
    }
    this.closeProject({ pushHistory: false });
    return null;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function usePortfolioSelector<T>(selector: (s: PortfolioState) => T): T {
  return useSyncExternalStore(
    portfolioStore.subscribe,
    () => selector(portfolioStore.getState()),
    () => selector(initialState),
  );
}
