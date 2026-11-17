import { useEffect, useRef, useState } from 'react';

import { scrollDirector, useScrollStateSelector } from '../experience/ScrollDirector';
import { soundController } from '../hero/SoundController';
import { sculptureBridge } from './Sculpture';
import { selection, names, destinations } from './social';

export function SocialSelector() {
  const [active, setActive] = useState(0);
  const visible = useScrollStateSelector(s => s.stateName === 'particle-stage');
  const touch = useRef({ x: 0, y: 0 });
  const choose = (index: number, dir = 1) => {
    const next = (index + 3) % 3;
    selection.index = next;
    setActive(next);
    sculptureBridge.triggerBurst();
    soundController.playSelectorClick(dir);
    soundController.playParticleClickBurst(0.8);
  };
  useEffect(() => {
    if (!visible) return;
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
  const order = [(active + 2) % 3, active, (active + 1) % 3];
  return <>
    <nav className="social-selector" aria-label="Social sculpture">
      <button className="sculpture-arrow previous" aria-label="Previous sculpture" onClick={() => choose(active - 1, -1)}><svg viewBox="0 0 64 20" aria-hidden="true"><path d="M63 14H2L13 3" /></svg></button>
      {order.map(index => (
        <button
          key={names[index]}
          aria-pressed={active === index}
          onClick={() => {
            if (active === index) {
              sculptureBridge.triggerBurst();
              soundController.playParticleClickBurst(0.95);
              window.open(destinations[index], '_blank', 'noopener,noreferrer');
            } else {
              choose(index, 1);
            }
          }}
        >
          {names[index]}
        </button>
      ))}
      <button className="sculpture-arrow next" aria-label="Next sculpture" onClick={() => choose(active + 1, 1)}><svg viewBox="0 0 64 20" aria-hidden="true"><path d="M1 14H62L51 3" /></svg></button>
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
