import gsap from 'gsap';
import { heroStore, introStage } from './heroStore';
import { soundController } from './SoundController';

export interface IntroTimelineController {
  start: () => void;
  replay: () => void;
  seek: (sec: number) => void;
  skip: () => void;
  dispose: () => void;
}

/**
 * Creates a replayable 6.5-second GSAP-controlled cinematic intro timeline matching the
 * 3 construction-to-mountain phases:
 *  0.0-0.5s: Empty #A0A5B1 scene + tiny loading mark
 *  0.5-1.7s: Isometric cubic wireframe lattice + incrementing vertex telemetry
 *  1.7-2.9s: Igloo brick-seam wireframe + glowing luminous dome core + base triangulated ground mesh
 *  2.9-4.4s: Bottom-to-top weathered stone/ice brick materialization with crisp white wireframe seams
 *  4.2-5.7s: Radial terrain & rocky mountain emergence + camera descent from elevated isometric view
 *  5.7-6.5s: Staggered HUD interface scramble & reveal
 */
export function createIntroTimeline(reducedMotion: boolean): IntroTimelineController {
  gsap.ticker.lagSmoothing(0);

  const timeScale = reducedMotion ? 2.8 : 1.0;
  let timeline: gsap.core.Timeline | null = null;
  let uiShown = false;
  let tickStep = 0;

  const resetStages = () => {
    uiShown = false;
    tickStep = 0;
    introStage.elapsedSec = 0;
    introStage.loadingMarkOpacity = 1;
    introStage.networkReveal = 0;
    introStage.networkFade = 1;
    introStage.wireframeReveal = 0;
    introStage.wireframeFade = 1;
    introStage.innerGlow = 0;
    introStage.coreCapBoost = 0;
    introStage.brickReveal = 0;
    introStage.terrainRadius = 0;
    introStage.mountainEmerge = 0;
    introStage.cameraDescend = 0;
    introStage.lightingWarmth = 0;
    introStage.telemetryPct = 11;
    introStage.uiReveal = 0;

    heroStore.setState({
      introComplete: false,
      uiVisible: false,
      heroScroll: 0,
      pointerInteractive: false,
    });
  };

  const buildTimeline = () => {
    timeline?.kill();
    resetStages();

    const tl = gsap.timeline({
      paused: true,
      onUpdate: () => {
        const t = tl.time();
        introStage.elapsedSec = t;
        if (!uiShown && t >= 5.65) {
          uiShown = true;
          heroStore.setState({ uiVisible: true });
        }
      },
      onComplete: () => {
        uiShown = true;
        heroStore.setState({
          uiVisible: true,
          introComplete: true,
        });
      },
    });

    // 0.0-0.5s: Loading mark -> fade out
    tl.to(introStage, { loadingMarkOpacity: 0, duration: 0.35, ease: 'power2.out' }, 0.38);

    // 0.5-1.7s: Isometric cubic wireframe scaffold & triangulated mesh reveal
    tl.to(
      introStage,
      {
        networkReveal: 1,
        duration: 1.25,
        ease: 'power2.inOut',
        onUpdate: () => {
          const step = Math.floor(introStage.networkReveal * 5);
          if (step > tickStep) {
            tickStep = step;
            soundController.playConstructionTick(step * 0.18);
          }
        },
      },
      0.5,
    );

    // Vertex telemetry numbers increment naturally from 11 -> 99 across construction & expansion
    tl.to(introStage, { telemetryPct: 54, duration: 1.75, ease: 'none' }, 0.55);
    tl.to(introStage, { telemetryPct: 99, duration: 2.35, ease: 'power1.out' }, 2.3);

    // 1.7-2.85s: Igloo wireframe + bright luminous core cap + soft inner glow (uploaded_media_0 at ~2.2s)
    tl.to(introStage, { wireframeReveal: 1, duration: 1.05, ease: 'power2.inOut' }, 1.6);
    tl.to(introStage, { coreCapBoost: 1, innerGlow: 0.9, duration: 0.65, ease: 'sine.out' }, 1.75);
    tl.to(introStage, { coreCapBoost: 0, duration: 0.75, ease: 'power2.inOut' }, 2.45);

    // 2.55-3.5s: Bottom-to-top weathered brick materialization finishes smoothly inside white wireframe seams (uploaded_media_1 at ~3.55s)
    tl.call(() => soundController.playMaterializeSwell(1.4), [], 2.65);
    tl.to(introStage, { brickReveal: 1, duration: 0.95, ease: 'power2.inOut' }, 2.55);
    tl.to(introStage, { wireframeFade: 0.72, duration: 0.55, ease: 'power2.out' }, 3.35);
    tl.to(introStage, { wireframeFade: 0.0, duration: 0.85, ease: 'power2.out' }, 4.15);
    tl.to(introStage, { innerGlow: 1.0, duration: 1.1, ease: 'sine.out' }, 2.9);

    // 3.68-5.55s: Radial expanding sculpted rocky terrain -> 5 mountain ridges emerge -> camera descends (uploaded_media_2 at ~4.45s)
    tl.to(introStage, { terrainRadius: 1, duration: 1.9, ease: 'power1.inOut' }, 3.68);
    tl.call(() => soundController.playAssemblyResolve(), [], 4.4);
    tl.to(
      introStage,
      {
        mountainEmerge: 1,
        lightingWarmth: 1,
        duration: 1.45,
        ease: 'power3.out',
      },
      4.3,
    );

    // Camera transitions smoothly from elevated isometric overview down to heroic mountain framing
    tl.to(
      introStage,
      {
        cameraDescend: 1,
        duration: 1.9,
        ease: 'power3.inOut',
      },
      4.35,
    );

    // Fade wider cubic scaffold out cleanly once mountains & terrain settle
    tl.to(introStage, { networkFade: 0.0, duration: 1.15, ease: 'power2.out' }, 4.8);

    // 5.7-6.5s: UI text staggered scramble & reveal
    tl.to(introStage, { uiReveal: 1, duration: 0.8, ease: 'power2.out' }, 5.7);

    tl.timeScale(timeScale);
    timeline = tl;
    return tl;
  };

  return {
    start: () => {
      const tl = buildTimeline();
      tl.play(0);
    },
    replay: () => {
      heroStore.setState((s) => ({ replayNonce: s.replayNonce + 1 }));
      const tl = buildTimeline();
      tl.play(0);
    },
    seek: (sec: number) => {
      const tl = timeline ?? buildTimeline();
      const clamped = Math.max(0, Math.min(6.5, sec));
      tl.pause(clamped, false);
      introStage.elapsedSec = clamped;
      uiShown = clamped >= 5.65;
      heroStore.setState({
        uiVisible: uiShown,
        introComplete: clamped >= 6.49,
      });
    },
    skip: () => {
      timeline?.kill();
      introStage.elapsedSec = 6.5;
      introStage.loadingMarkOpacity = 0;
      introStage.networkReveal = 1;
      introStage.networkFade = 0;
      introStage.wireframeReveal = 1;
      introStage.wireframeFade = 0;
      introStage.innerGlow = 1;
      introStage.coreCapBoost = 0;
      introStage.brickReveal = 1;
      introStage.terrainRadius = 1;
      introStage.mountainEmerge = 1;
      introStage.cameraDescend = 1;
      introStage.lightingWarmth = 1;
      introStage.telemetryPct = 99;
      introStage.uiReveal = 1;
      uiShown = true;
      heroStore.setState({
        uiVisible: true,
        introComplete: true,
      });
    },
    dispose: () => {
      timeline?.kill();
      timeline = null;
    },
  };
}
