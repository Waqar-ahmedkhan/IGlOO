import { useEffect, useMemo, useRef, useState } from 'react';
import { SocialSelector } from './particles/Selector';
import { HeroExperience } from './hero/HeroExperience';
import type { IntroTimelineController } from './hero/IntroTimeline';
import { useHeroSelector } from './hero/heroStore';
import { getPerformanceProfile, isWebGLAvailable } from './utils/performance';
import { HeroUI, HERO_MANIFESTO_COPY } from './components/HeroUI';
import { LoadingScreen } from './components/LoadingScreen';
import { PortfolioHUD } from './components/PortfolioHUD';
import { ProjectDetailOverlay } from './components/ProjectDetailOverlay';

function ArcticCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const pointerInteractive = useHeroSelector((s) => s.pointerInteractive);

  useEffect(() => {
    const el = cursorRef.current;
    if (!el || typeof window === 'undefined') return;

    let targetX = window.innerWidth * 0.5;
    let targetY = window.innerHeight * 0.5;
    let currX = targetX;
    let currY = targetY;
    let visible = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        el.style.opacity = '0';
        return;
      }
      targetX = e.clientX;
      targetY = e.clientY;
      visible = true;
    };

    const onLeave = () => {
      visible = false;
      el.style.opacity = '0';
    };

    const tick = () => {
      currX += (targetX - currX) * 0.25;
      currY += (targetY - currY) * 0.25;
      el.style.transform = `translate3d(${currX.toFixed(1)}px, ${currY.toFixed(1)}px, 0)`;
      el.style.opacity = visible ? '0.82' : '0';
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      className="arctic-cursor"
      data-interactive={pointerInteractive ? 'true' : 'false'}
      aria-hidden="true"
    />
  );
}

function WebGLFallback() {
  return (
    <div
      className="experience-root"
      style={{
        padding: '32px',
        background: 'linear-gradient(180deg, #8690A0 0%, #A0A5B1 55%, #555D70 100%)',
      }}
    >
      <header className="header-corner">
        <div className="igloo-wordmark">IGLOO</div>
        <p className="copyright-block">
          {'// Copyright © 2026\nIgloo, Inc.\nAll Rights Reserved.'}
        </p>
      </header>
      <aside className="manifesto-corner">
        <div className="manifesto-label">////// Manifesto</div>
        <p className="manifesto-copy">{HERO_MANIFESTO_COPY}</p>
      </aside>
    </div>
  );
}

export function App() {
  const webglSupported = useMemo(() => isWebGLAvailable(), []);
  const [profile, setProfile] = useState(() => getPerformanceProfile());
  const timelineRef = useRef<IntroTimelineController | null>(null);

  useEffect(() => {
    const onResize = () => {
      const next = getPerformanceProfile();
      setProfile((prev) => (prev.tier === next.tier ? prev : next));
    };
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = () => setProfile(getPerformanceProfile());
    window.addEventListener('resize', onResize);
    motion.addEventListener('change', onMotionChange);
    return () => {
      window.removeEventListener('resize', onResize);
      motion.removeEventListener('change', onMotionChange);
    };
  }, []);

  if (!webglSupported) {
    return <WebGLFallback />;
  }

  return (
    <div className="experience-root">
      <HeroExperience profile={profile} timelineRef={timelineRef} />
      <HeroUI />
      <PortfolioHUD />
      <ProjectDetailOverlay />
      <LoadingScreen />
      <ArcticCursor />
      <SocialSelector />
    </div>
  );
}

export default App;
