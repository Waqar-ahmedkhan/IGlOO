import { useEffect, useRef, useState } from 'react';

import { scrollDirector, useScrollStateSelector } from '../experience/ScrollDirector';
import { soundController } from '../hero/SoundController';
import { sculptureBridge } from './Sculpture';
import {
  selection,
  names,
  badges,
  destinations,
  setSocialSelection,
  subscribeSelection,
} from './social';

export function SocialSelector() {
  const [active, setActive] = useState(selection.index);
  const visible = useScrollStateSelector(s => s.stateName === 'particle-stage');
  const touch = useRef({ x: 0, y: 0 });
  const choose = (index: number, dir = 1) => {
    const next = setSocialSelection(index);
    setActive(next);
    sculptureBridge.triggerBurst();
    soundController.playSelectorClick(dir);
    soundController.playParticleClickBurst(0.8);
  };
  useEffect(() => subscribeSelection(setActive), []);
  useEffect(() => {
    if (!visible) return;
    setActive(selection.index);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowLeft' ? -1 : 1;
      choose(selection.index + dir, dir);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touch.current.x;
      const dy = event.changedTouches[0].clientY - touch.current.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        const dir = dx < 0 ? 1 : -1;
        choose(selection.index + dir, dir);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [visible]);
  if (!visible) return null;
  return <>
    <nav className="social-selector" aria-label="Social sculpture">
      <button
        type="button"
        className="sculpture-arrow previous"
        aria-label="Previous sculpture"
        onClick={() => choose(active - 1, -1)}
      >
        <svg viewBox="0 0 64 20" aria-hidden="true"><path d="M63 14H2L13 3" /></svg>
      </button>

      <div className="social-dock-wrap">
        <div className="social-dock-caption" aria-hidden="true">CLICK DOTS OR CHANNELS TO MORPH</div>
        <div className="social-dock">
          {names.map((label, index) => (
            <button
              key={label}
              type="button"
              className="social-pill"
              aria-pressed={active === index}
              onClick={() => choose(index, index > active ? 1 : -1)}
            >
              <span className="social-pill-glyph" aria-hidden="true">{badges[index]}</span>
              <span>{label}</span>
            </button>
          ))}
          <span className="social-dock-divider" aria-hidden="true" />
          <a
            className="social-visit-link"
            href={destinations[active]}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${names[active]} in new tab`}
            onClick={() => {
              sculptureBridge.triggerBurst();
              soundController.playParticleClickBurst(0.95);
            }}
          >
            <span>VISIT</span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      <button
        type="button"
        className="sculpture-arrow next"
        aria-label="Next sculpture"
        onClick={() => choose(active + 1, 1)}
      >
        <svg viewBox="0 0 64 20" aria-hidden="true"><path d="M1 14H62L51 3" /></svg>
      </button>
    </nav>
    <button
      type="button"
      className="loop-surface-hint"
      aria-label="Loop back to surface"
      onClick={() => {
        soundController.playSelectorClick(1);
        scrollDirector.triggerLoop();
      }}
    >
      <span className="scroll-hint-line" aria-hidden="true" />
      <span>{'// SCROLL TO LOOP'}</span>
    </button>
  </>;
}
