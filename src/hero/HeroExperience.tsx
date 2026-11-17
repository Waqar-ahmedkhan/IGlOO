import { useEffect, useMemo, useRef } from 'react';
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
import { heroStore, hudBridge, introStage } from './heroStore';
import { soundController } from './SoundController';
import { clamp } from '../utils/noise';
import type { PerformanceProfile } from '../utils/performance';
import { scrollDirector } from '../experience/ScrollDirector';
import { computeHeroExitSignals, type HeroExitSignals } from '../experience/HeroExitAnimation';
import { createFrostTransitionMaterial } from '../shaders/frostTransitionMaterial';
import { AtmosphericScene } from '../scenes/AtmosphericScene';
import { getProjectByPathname, type PortfolioProjectId } from '../portfolio/projects';
import { portfolioHudBridge, portfolioStore } from '../portfolio/portfolioStore';

interface HeroSceneStageProps {
  profile: PerformanceProfile;
  heroCamera: THREE.PerspectiveCamera;
  pointerNdcRef: React.MutableRefObject<THREE.Vector2>;
  pointerActiveRef: React.MutableRefObject<boolean>;
  scrollProgressRef: React.MutableRefObject<number>;
  exitSignalsRef: React.MutableRefObject<HeroExitSignals>;
  smokeIntensityRef: React.MutableRefObject<number>;
}

function HeroSceneStage({
  profile,
  heroCamera,
  pointerNdcRef,
  pointerActiveRef,
  scrollProgressRef,
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
  const pointerNdcRef = useRef(new THREE.Vector2(0, 0));
  const pointerActiveRef = useRef(false);
  const scrollProgressRef = useRef(0);
  const smokeIntensityRef = useRef(0.35);
  const lastDissolveRef = useRef(0);

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

  useMemo(() => {
    const quad = new THREE.Mesh(quadGeom, frostMat);
    quad.frustumCulled = false;
    quadScene.add(quad);
  }, [quadScene, quadGeom, frostMat]);

  // Allocate & resize reusable render targets cleanly
  useEffect(() => {
    const rtType = gl.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const w = Math.max(1, Math.floor(size.width * viewport.dpr));
    const h = Math.max(1, Math.floor(size.height * viewport.dpr));

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
  }, [gl, size.width, size.height, viewport.dpr]);

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

  // Initialize & launch GSAP 6.5s intro timeline once both scenes compile cleanly (or deep-link straight to project)
  useEffect(() => {
    const introWasComplete = heroStore.getState().introComplete;
    const controller = createIntroTimeline(profile.reducedMotion);
    timelineRef.current = controller;

    const raf = requestAnimationFrame(() => {
      try {
        gl.compile(heroScene, heroCamera);
        gl.compile(atmoScene, atmoCamera);
      } catch {
        // Non-fatal driver compile guard
      }
      heroStore.setState({ assetsReady: true });

      const deepLinked =
        typeof window !== 'undefined' ? getProjectByPathname(window.location.pathname) : null;
      if (deepLinked) {
        controller.skip();
        scrollDirector.setImmediate(deepLinked.focusScroll);
        scrollProgressRef.current = deepLinked.focusScroll;
        portfolioStore.openProject(deepLinked.id, { pushHistory: false });
      } else if (introWasComplete) {
        controller.skip();
      } else {
        controller.start();
      }
    });

    const onPopState = () => {
      const targetProject = getProjectByPathname(window.location.pathname);
      if (targetProject) {
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
      cancelAnimationFrame(raf);
      window.removeEventListener('popstate', onPopState);
      controller.dispose();
      timelineRef.current = null;
    };
  }, [gl, heroScene, atmoScene, heroCamera, atmoCamera, profile.reducedMotion, timelineRef]);

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
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
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
    const dt = Math.min(delta, 0.05);

    if (heroStore.getState().introComplete) {
      scrollDirector.step(dt, profile.reducedMotion);
    }

    const p = scrollDirector.scrollProgress;
    scrollProgressRef.current = p;

    const exit = computeHeroExitSignals(p, profile.reducedMotion);
    exitSignalsRef.current = exit;
    smokeIntensityRef.current = exit.smokeIntensity;

    const prevScroll = heroStore.getState().heroScroll;
    if (Math.abs(prevScroll - clamp(p / 0.45, 0, 1)) > 0.002) {
      heroStore.setState({ heroScroll: clamp(p / 0.45, 0, 1) });
    }

    if (Math.abs(lastDissolveRef.current - exit.uiDissolve) > 0.006) {
      lastDissolveRef.current = exit.uiDissolve;
      hudBridge.uiDissolve = exit.uiDissolve;
      hudBridge.emit();
    }

    const frostBell = Math.sin(exit.frostProgress * Math.PI);
    soundController.updateExperienceAtmosphere(
      p,
      exit.activation,
      frostBell,
      scrollDirector.velocity,
      portfolioHudBridge.detailBlend,
    );

    const rtHero = rtHeroRef.current;
    const rtAtmo = rtAtmoRef.current;

    if (exit.frostProgress <= 0.002 || !rtHero || !rtAtmo) {
      gl.setRenderTarget(null);
      gl.render(heroScene, heroCamera);
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
          scrollProgressRef={scrollProgressRef}
          exitSignalsRef={exitSignalsRef}
          smokeIntensityRef={smokeIntensityRef}
        />,
        heroScene,
        { camera: heroCamera, scene: heroScene },
      )}

      {createPortal(
        <AtmosphericScene
          camera={atmoCamera}
          pointerNdcRef={pointerNdcRef}
          pointerActiveRef={pointerActiveRef}
          scrollProgressRef={scrollProgressRef}
          reducedMotion={profile.reducedMotion}
        />,
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
