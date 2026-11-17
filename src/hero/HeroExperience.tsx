import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createIntroTimeline, type IntroTimelineController } from './IntroTimeline';
import { SkyEnvironment } from './SkyEnvironment';
import { AtmosphericFog } from './AtmosphericFog';
import { HeroLighting } from './HeroLighting';
import { ForegroundTerrain, IGLOO_WORLD_X_DESKTOP } from './ForegroundTerrain';
import { MountainTerrain } from './MountainTerrain';
import { ConstructionNetwork } from './ConstructionNetwork';
import { IglooBrickInteraction } from './IglooBrickInteraction';
import { SmokyWind } from './SmokyWind';
import { HeroCamera } from './HeroCamera';
import { heroStore, hudBridge, introStage, useHeroSelector } from './heroStore';
import { soundController } from './SoundController';
import { clamp, smoothstep } from '../utils/noise';
import type { PerformanceProfile } from '../utils/performance';
import {
  classifyCyclePhase,
  getCycleProgress,
  scrollDirector,
  useScrollStateSelector,
} from '../experience/ScrollDirector';
import { computeHeroExitSignals, type HeroExitSignals } from '../experience/HeroExitAnimation';
import { createFrostTransitionMaterial } from '../shaders/frostTransitionMaterial';
import { getProjectByPathname, type PortfolioProjectId } from '../portfolio/projects';
import { portfolioHudBridge, portfolioStore } from '../portfolio/portfolioStore';

const AtmosphericScene = lazy(() =>
  import('../scenes/AtmosphericScene').then(module => ({ default: module.AtmosphericScene })),
);

function ScenePrepared({ onReady, onFailure }: { onReady: () => void; onFailure: () => void }) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    let active = true;
    const frame = requestAnimationFrame(() => {
      void gl.compileAsync(scene, camera)
        .then(() => { if (active) onReady(); })
        .catch(() => { if (active) onFailure(); });
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [gl, scene, camera, onReady, onFailure]);

  return null;
}

interface HeroSceneStageProps {
  profile: PerformanceProfile;
  heroCamera: THREE.PerspectiveCamera;
  pointerNdcRef: React.MutableRefObject<THREE.Vector2>;
  pointerActiveRef: React.MutableRefObject<boolean>;
  scrollProgressRef: React.MutableRefObject<number>;
  loopProgressRef: React.MutableRefObject<number>;
  exitSignalsRef: React.MutableRefObject<HeroExitSignals>;
  smokeIntensityRef: React.MutableRefObject<number>;
}

function HeroSceneStage({
  profile,
  heroCamera,
  pointerNdcRef,
  pointerActiveRef,
  scrollProgressRef,
  loopProgressRef,
  exitSignalsRef,
  smokeIntensityRef,
}: HeroSceneStageProps) {
  const { size } = useThree();
  const isMobile = size.width < 768;
  const iglooX = isMobile ? 0.0 : IGLOO_WORLD_X_DESKTOP;

  return (
    <>
      <HeroCamera
        camera={heroCamera}
        iglooX={iglooX}
        pointerNdcRef={pointerNdcRef}
        scrollProgressRef={scrollProgressRef}
        loopProgressRef={loopProgressRef}
        reducedMotion={profile.reducedMotion}
      />

      <SkyEnvironment />
      <AtmosphericFog snowCount={Math.min(900, profile.snowParticleCount)} reducedMotion={profile.reducedMotion} />
      <HeroLighting enableShadows={profile.enableShadows} />

      <ForegroundTerrain segments={profile.terrainSegments} iglooX={iglooX} />
      <MountainTerrain segments={profile.mountainSegments} />

      <ConstructionNetwork iglooX={iglooX} />

      <IglooBrickInteraction
        iglooX={iglooX}
        pointerNdcRef={pointerNdcRef}
        pointerActiveRef={pointerActiveRef}
        scrollProgressRef={scrollProgressRef}
        exitSignalsRef={exitSignalsRef}
        reducedMotion={profile.reducedMotion}
      />

      <SmokyWind
        iglooX={iglooX}
        smokeIntensityRef={smokeIntensityRef}
        reducedMotion={profile.reducedMotion}
      />
    </>
  );
}

interface ExperienceStageProps {
  profile: PerformanceProfile;
  timelineRef: React.MutableRefObject<IntroTimelineController | null>;
}

function ExperienceStage({ profile, timelineRef }: ExperienceStageProps) {
  const { gl, size, viewport } = useThree();
  const introReady = useHeroSelector(state => state.assetsReady && state.introComplete);
  const onPreparationFailure = useCallback(() => heroStore.setState({ loadingFailed: true }), []);
  const approachingAtmosphere = useScrollStateSelector(state => state.scrollPct >= 12);
  const [mountAtmosphere, setMountAtmosphere] = useState(() => Boolean(getProjectByPathname(window.location.pathname)));
  const atmosphereReady = useRef(false);
  const readySignal = useMemo(() => {
    let resolve = () => {};
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
  }, []);
  const onAtmosphereReady = useCallback(() => {
    atmosphereReady.current = true;
    readySignal.resolve();
  }, [readySignal]);

  useEffect(() => {
    if (mountAtmosphere) return;
    if (approachingAtmosphere) { setMountAtmosphere(true); return; }
    if (!introReady) return;
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(() => setMountAtmosphere(true), { timeout: 1800 });
      else setMountAtmosphere(true);
    }, 700);
    return () => { clearTimeout(timer); if (idle !== undefined) window.cancelIdleCallback(idle); };
  }, [approachingAtmosphere, mountAtmosphere, introReady]);

  const pointerNdcRef = useRef(new THREE.Vector2(0, 0));
  const pointerActiveRef = useRef(false);
  const scrollProgressRef = useRef(0);
  const heroScrollProgressRef = useRef(0);
  const loopProgressRef = useRef(0);
  const smokeIntensityRef = useRef(0.35);
  const lastDissolveRef = useRef(0);
  const lastCycleSyncRef = useRef(-1);
  const dollyWhooshedRef = useRef(false);
  const loopWhooshedRef = useRef(false);

  const exitSignalsRef = useRef<HeroExitSignals>(
    computeHeroExitSignals(0, profile.reducedMotion),
  );

  // Two independent scene graphs + offscreen render targets for real frost transition wipe
  const heroScene = useMemo(() => new THREE.Scene(), []);
  const atmoScene = useMemo(() => new THREE.Scene(), []);
  const heroCamera = useMemo(() => new THREE.PerspectiveCamera(38, 1.6, 0.1, 260), []);
  const atmoCamera = useMemo(() => new THREE.PerspectiveCamera(38, 1.6, 0.1, 100), []);

  const quadScene = useMemo(() => new THREE.Scene(), []);
  const orthoCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const quadGeom = useMemo(() => new THREE.PlaneGeometry(2, 2), []);
  const { material: frostMat, uniforms: frostUniforms } = useMemo(
    () => createFrostTransitionMaterial(),
    [],
  );

  const rtHeroRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const rtAtmoRef = useRef<THREE.WebGLRenderTarget | null>(null);

  useEffect(() => {
    const quad = new THREE.Mesh(quadGeom, frostMat);
    quad.frustumCulled = false;
    quadScene.add(quad);
    return () => { quadScene.remove(quad); };
  }, [quadScene, quadGeom, frostMat]);

  // Allocate & resize reusable render targets cleanly
  useEffect(() => {
    if (!mountAtmosphere) return;
    const rtType = gl.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const w = Math.max(1, Math.floor(size.width * viewport.dpr * profile.renderTargetScale));
    const h = Math.max(1, Math.floor(size.height * viewport.dpr * profile.renderTargetScale));

    if (!rtHeroRef.current || !rtAtmoRef.current) {
      const opts: THREE.RenderTargetOptions = {
        type: rtType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false,
      };
      rtHeroRef.current = new THREE.WebGLRenderTarget(w, h, opts);
      rtAtmoRef.current = new THREE.WebGLRenderTarget(w, h, opts);
    } else {
      rtHeroRef.current.setSize(w, h);
      rtAtmoRef.current.setSize(w, h);
    }
  }, [gl, size.width, size.height, viewport.dpr, profile.renderTargetScale, mountAtmosphere]);

  useEffect(() => {
    return () => {
      rtHeroRef.current?.dispose();
      rtAtmoRef.current?.dispose();
      rtHeroRef.current = null;
      rtAtmoRef.current = null;
      quadGeom.dispose();
      frostMat.dispose();
    };
  }, [quadGeom, frostMat]);

  // Prepare the hero first; project deep links also wait for the atmospheric scene.
  useEffect(() => {
    const introWasComplete = heroStore.getState().introComplete;
    const controller = createIntroTimeline(profile.reducedMotion);
    timelineRef.current = controller;

    let active = true;
    const raf = requestAnimationFrame(() => {
      heroStore.setState({ loadingStep: 1 });
      void gl.compileAsync(heroScene, heroCamera).then(async () => {
        if (!active) return;
        const deepLinked =
          typeof window !== 'undefined' ? getProjectByPathname(window.location.pathname) : null;
        if (deepLinked) {
          await readySignal.promise;
          if (!active) return;
          controller.skip();
          scrollDirector.setImmediate(deepLinked.focusScroll);
          scrollProgressRef.current = deepLinked.focusScroll;
          portfolioStore.openProject(deepLinked.id, { pushHistory: false });
        } else if (introWasComplete) {
          controller.skip();
        } else {
          controller.start();
        }
        heroStore.setState({ assetsReady: true, loadingStep: 2 });
      }).catch(() => { if (active) onPreparationFailure(); });
    });

    const onPopState = () => {
      const targetProject = getProjectByPathname(window.location.pathname);
      if (targetProject) {
        setMountAtmosphere(true);
        controller.skip();
        if (scrollDirector.scrollProgress < 0.45) {
          scrollDirector.setImmediate(targetProject.focusScroll);
          scrollProgressRef.current = targetProject.focusScroll;
        }
        portfolioStore.openProject(targetProject.id, { pushHistory: false });
      } else {
        portfolioStore.closeProject({ pushHistory: false });
      }
    };

    window.addEventListener('popstate', onPopState);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('popstate', onPopState);
      controller.dispose();
      timelineRef.current = null;
    };
  }, [gl, heroScene, atmoScene, heroCamera, atmoCamera, profile.reducedMotion, timelineRef, readySignal, onPreparationFailure]);

  // Velocity-based wheel, touch & keyboard listeners for reversible Phase 1 + Phase 2 scroll choreography
  useEffect(() => {
    let lastTouchY = 0;
    let firstTouchX = 0, firstTouchY = 0;
    let touching = false;

    const updateNdc = (clientX: number, clientY: number) => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      pointerNdcRef.current.set((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
      pointerActiveRef.current = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      updateNdc(e.clientX, e.clientY);
    };
    const onPointerDown = () => {
      if (heroStore.getState().introComplete) {
        scrollDirector.notifyInteraction();
      }
    };
    const onPointerLeave = () => {
      pointerActiveRef.current = false;
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      touching = true;
      firstTouchX = e.touches[0].clientX;
      firstTouchY = e.touches[0].clientY;
      lastTouchY = e.touches[0].clientY;
      updateNdc(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touching || e.touches.length === 0) return;
      const y = e.touches[0].clientY;
      updateNdc(e.touches[0].clientX, y);
      const horizontal = Math.abs(e.touches[0].clientX - firstTouchX) > Math.abs(y - firstTouchY) * 1.4;
      if (!horizontal && heroStore.getState().introComplete && !scrollDirector.paused) {
        scrollDirector.applyTouchImpulse(lastTouchY - y);
      }
      lastTouchY = y;
    };
    const onTouchEnd = () => {
      touching = false;
      pointerActiveRef.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (!heroStore.getState().introComplete) return;
      if (scrollDirector.paused) return;
      e.preventDefault();
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 28;
      else if (e.deltaMode === 2) delta *= window.innerHeight * 0.8;
      scrollDirector.applyWheelImpulse(delta);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && portfolioStore.getState().selectedProjectId) {
        e.preventDefault();
        portfolioStore.closeProject();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        portfolioStore.closeProject();
        scrollDirector.reset();
        timelineRef.current?.replay();
      } else if (heroStore.getState().introComplete && !scrollDirector.paused) {
        if (e.key === 'ArrowDown' || e.key === 'PageDown') {
          e.preventDefault();
          scrollDirector.applyKeyStep(0.12);
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault();
          scrollDirector.applyKeyStep(-0.12);
        }
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [timelineRef]);

  // Expose QA & Phase 1 / Phase 2 inspection hooks on window.__iglooHero
  useMemo(() => {
    if (typeof window !== 'undefined') {
      (
        window as unknown as {
          __iglooHero?: {
            replay: () => void;
            seek: (sec: number) => void;
            skip: () => void;
            setScroll: (p: number) => void;
            getStage: () => unknown;
            getScrollState: () => unknown;
            openProject: (id: PortfolioProjectId) => void;
            closeProject: () => void;
            getPortfolioState: () => unknown;
          };
        }
      ).__iglooHero = {
        replay: () => {
          portfolioStore.closeProject();
          scrollDirector.reset();
          timelineRef.current?.replay();
        },
        seek: (sec: number) => timelineRef.current?.seek(sec),
        skip: () => timelineRef.current?.skip(),
        setScroll: (p: number) => {
          timelineRef.current?.skip();
          scrollDirector.setImmediate(p);
          scrollProgressRef.current = scrollDirector.scrollProgress;
        },
        getStage: () => ({ ...introStage }),
        getScrollState: () => ({
          scrollProgress: scrollDirector.scrollProgress,
          stateName: scrollDirector.stateName,
          velocity: scrollDirector.velocity,
          paused: scrollDirector.paused,
        }),
        openProject: (id: PortfolioProjectId) => {
          timelineRef.current?.skip();
          portfolioStore.openProject(id);
        },
        closeProject: () => {
          portfolioStore.closeProject();
        },
        getPortfolioState: () => ({ ...portfolioStore.getState() }),
      };
    }
  }, [timelineRef]);

  // Master priority=1 render director: advances scroll kinematics + draws active / dual-FBO frost composite
  useFrame((state, delta) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!heroStore.getState().assetsReady) {
      gl.setRenderTarget(null);
      gl.setClearColor('#A0A5B1');
      gl.clear();
      return;
    }
    const dt = Math.min(delta, 0.05);

    if (heroStore.getState().introComplete && (atmosphereReady.current || scrollDirector.scrollProgress < 0.3)) {
      scrollDirector.stepAuto(dt, profile.reducedMotion, atmosphereReady.current);
      scrollDirector.step(dt, profile.reducedMotion);
    }

    if (!atmosphereReady.current && scrollDirector.scrollProgress > 0.3) {
      scrollDirector.scrollProgress = 0.3;
      scrollDirector.velocity = 0;
    }
    const p = scrollDirector.scrollProgress;
    const loopProg = scrollDirector.loopProgress;
    scrollProgressRef.current = p;
    loopProgressRef.current = loopProg;

    const heroP = loopProg > 0.002 ? 0 : p;
    heroScrollProgressRef.current = heroP;

    const exit = computeHeroExitSignals(heroP, profile.reducedMotion, loopProg);
    exitSignalsRef.current = exit;
    smokeIntensityRef.current = exit.smokeIntensity;

    // Trigger Layer F directional camera dolly whoosh during State C pullback & Loop return
    if (p > 0.215 && p < 0.34) {
      if (!dollyWhooshedRef.current && Math.abs(scrollDirector.velocity) > 0.002) {
        dollyWhooshedRef.current = true;
        soundController.playCameraWhoosh(0.5);
      }
    } else if (p < 0.16 || p > 0.38) {
      dollyWhooshedRef.current = false;
    }

    if (loopProg > 0.04) {
      if (!loopWhooshedRef.current) {
        loopWhooshedRef.current = true;
        soundController.playCameraWhoosh(0.65);
      }
    } else {
      loopWhooshedRef.current = false;
    }

    const prevScroll = heroStore.getState().heroScroll;
    const targetHeroScroll = loopProg > 0.002 ? 1 - loopProg : clamp(p / 0.45, 0, 1);
    if (Math.abs(prevScroll - targetHeroScroll) > 0.002) {
      heroStore.setState({ heroScroll: targetHeroScroll });
    }

    const cycleProg = getCycleProgress(p, loopProg);
    const cyclePhase = classifyCyclePhase(cycleProg);
    const effectiveDissolve = loopProg > 0.002 ? exit.uiDissolve : exit.uiDissolve;
    const cycleChanged =
      Math.abs(lastCycleSyncRef.current - cycleProg) > 0.0025 ||
      hudBridge.cyclePhaseIndex !== cyclePhase.index ||
      Math.abs(lastDissolveRef.current - effectiveDissolve) > 0.006;

    if (cycleChanged) {
      lastCycleSyncRef.current = cycleProg;
      lastDissolveRef.current = effectiveDissolve;
      hudBridge.uiDissolve = effectiveDissolve;
      hudBridge.cycleProgress = cycleProg;
      hudBridge.cyclePhaseIndex = cyclePhase.index;
      hudBridge.cyclePhaseCode = cyclePhase.code;
      hudBridge.cyclePhaseLabel = cyclePhase.label;
      hudBridge.autoPlaying = scrollDirector.autoWeight > 0.15;
      hudBridge.emit();
    }

    const loopFrost = loopProg > 0.002 ? smoothstep(0.18, 0.56, loopProg) : 0;
    const activeFrost = loopProg > 0.002 ? loopFrost : exit.frostProgress;
    const frostBell = Math.sin(activeFrost * Math.PI);
    soundController.updateExperienceAtmosphere(
      loopProg > 0.002 ? 1.42 * (1 - loopProg * 0.85) : p,
      exit.activation,
      frostBell,
      scrollDirector.velocity,
      portfolioHudBridge.detailBlend,
    );

    const rtHero = rtHeroRef.current;
    const rtAtmo = rtAtmoRef.current;

    if (loopProg > 0.002 && rtHero && rtAtmo) {
      if (loopProg < 0.18) {
        gl.setRenderTarget(null);
        gl.render(atmoScene, atmoCamera);
      } else if (loopProg >= 0.56) {
        // Reconstructing blocks arc back onto glowing wireframe dome inside heroScene
        gl.setRenderTarget(null);
        gl.render(heroScene, heroCamera);
      } else {
        // Smooth frosted crossfade from swirling upward particles back into reconstructing mountain igloo
        gl.setRenderTarget(rtAtmo);
        gl.clear();
        gl.render(atmoScene, atmoCamera);

        gl.setRenderTarget(rtHero);
        gl.clear();
        gl.render(heroScene, heroCamera);

        frostUniforms.tFrom.value = rtAtmo.texture;
        frostUniforms.tTo.value = rtHero.texture;
        frostUniforms.uProgress.value = loopFrost;
        frostUniforms.uOpticalImpulse.value = Math.sin(loopFrost * Math.PI) * 0.45;
        frostUniforms.uDirection.value = 1;
        frostUniforms.uVelocity.value = 0.07;
        frostUniforms.uTime.value = state.clock.elapsedTime;
        frostUniforms.uAspect.value = size.width / Math.max(1, size.height);

        gl.setRenderTarget(null);
        gl.render(quadScene, orthoCam);
      }
    } else if (exit.frostProgress <= 0.002 || !rtHero || !rtAtmo) {
      if (exit.opticalImpulse > 0.012 && rtHero) {
        // Localized lower-left foreground optical mist & refraction impulse during State C pullback
        gl.setRenderTarget(rtHero);
        gl.clear();
        gl.render(heroScene, heroCamera);

        frostUniforms.tFrom.value = rtHero.texture;
        frostUniforms.tTo.value = rtHero.texture;
        frostUniforms.uProgress.value = 0;
        frostUniforms.uOpticalImpulse.value = exit.opticalImpulse;
        frostUniforms.uDirection.value = scrollDirector.direction;
        frostUniforms.uVelocity.value = scrollDirector.velocity;
        frostUniforms.uTime.value = state.clock.elapsedTime;
        frostUniforms.uAspect.value = size.width / Math.max(1, size.height);

        gl.setRenderTarget(null);
        gl.render(quadScene, orthoCam);
      } else {
        gl.setRenderTarget(null);
        gl.render(heroScene, heroCamera);
      }
    } else if (exit.frostProgress >= 0.998) {
      gl.setRenderTarget(null);
      gl.render(atmoScene, atmoCamera);
    } else {
      // Offscreen dual-scene capture -> jagged crystalline frost transition composite
      gl.setRenderTarget(rtHero);
      gl.clear();
      gl.render(heroScene, heroCamera);

      gl.setRenderTarget(rtAtmo);
      gl.clear();
      gl.render(atmoScene, atmoCamera);

      frostUniforms.tFrom.value = rtHero.texture;
      frostUniforms.tTo.value = rtAtmo.texture;
      frostUniforms.uProgress.value = exit.frostProgress;
      frostUniforms.uOpticalImpulse.value = exit.opticalImpulse;
      frostUniforms.uDirection.value = scrollDirector.direction;
      frostUniforms.uVelocity.value = scrollDirector.velocity;
      frostUniforms.uTime.value = state.clock.elapsedTime;
      frostUniforms.uAspect.value = size.width / Math.max(1, size.height);

      gl.setRenderTarget(null);
      gl.render(quadScene, orthoCam);
    }
  }, 1);

  return (
    <>
      {createPortal(
        <HeroSceneStage
          profile={profile}
          heroCamera={heroCamera}
          pointerNdcRef={pointerNdcRef}
          pointerActiveRef={pointerActiveRef}
          scrollProgressRef={heroScrollProgressRef}
          loopProgressRef={loopProgressRef}
          exitSignalsRef={exitSignalsRef}
          smokeIntensityRef={smokeIntensityRef}
        />,
        heroScene,
        { camera: heroCamera, scene: heroScene },
      )}

      {mountAtmosphere && createPortal(
        <Suspense fallback={null}>
          <AtmosphericScene
            camera={atmoCamera}
            pointerNdcRef={pointerNdcRef}
            pointerActiveRef={pointerActiveRef}
            scrollProgressRef={scrollProgressRef}
            reducedMotion={profile.reducedMotion}
          />
          <ScenePrepared onReady={onAtmosphereReady} onFailure={onPreparationFailure} />
        </Suspense>,
        atmoScene,
        { camera: atmoCamera, scene: atmoScene },
      )}
    </>
  );
}

interface HeroExperienceProps {
  profile: PerformanceProfile;
  timelineRef: React.MutableRefObject<IntroTimelineController | null>;
}

export function HeroExperience({ profile, timelineRef }: HeroExperienceProps) {
  return (
    <div className="webgl-stage">
      <Canvas
        dpr={profile.dpr}
        shadows={profile.enableShadows}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        camera={{ fov: 38, near: 0.1, far: 260, position: [-1.55, 2.52, 11.6] }}
      >
        <ExperienceStage profile={profile} timelineRef={timelineRef} />
      </Canvas>
    </div>
  );
}
