import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../utils/performance';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+-*#';

interface ScrambleTextProps {
  text: string;
  active?: boolean;
  triggerKey?: string | number;
  delayMs?: number;
  durationMs?: number;
  className?: string;
}

/**
 * Restrained character scramble + subtle technical reveal for IBM Plex Mono labels.
 */
export function ScrambleText({
  text,
  active = true,
  triggerKey = '',
  delayMs = 0,
  durationMs = 460,
  className,
}: ScrambleTextProps) {
  const [rendered, setRendered] = useState(text);

  useEffect(() => {
    if (!active) {
      setRendered('');
      return;
    }

    if (prefersReducedMotion()) {
      setRendered(text);
      return;
    }

    const mountAt = performance.now();
    const safeDuration = Math.max(120, durationMs);
    const startAt = mountAt + delayMs;
    let rafId = 0;
    let finishTimer = 0;

    const tick = () => {
      const now = performance.now();
      const elapsed = now - startAt;
      if (elapsed < 0) {
        const preStep = Math.floor(Math.abs(elapsed) / 65);
        let masked = '';
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          masked += ch === ' ' || ch === '\n' ? ch : GLYPHS[(i * 5 + preStep) % GLYPHS.length];
        }
        setRendered(masked);
        rafId = requestAnimationFrame(tick);
        return;
      }

      const revealRatio = Math.min(1, elapsed / safeDuration);
      if (revealRatio >= 1) {
        setRendered(text);
        return;
      }

      const revealedCount = Math.floor(revealRatio * text.length);
      const stepCount = Math.floor(elapsed / 38);
      let out = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === ' ' || ch === '\n') {
          out += ch;
        } else if (i < revealedCount) {
          out += ch;
        } else {
          out += GLYPHS[(i * 7 + stepCount * 3) % GLYPHS.length];
        }
      }
      setRendered(out);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    finishTimer = window.setTimeout(() => {
      cancelAnimationFrame(rafId);
      setRendered(text);
    }, delayMs + safeDuration + 45);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(finishTimer);
    };
  }, [text, active, triggerKey, delayMs, durationMs]);

  return <span className={className}>{rendered}</span>;
}
