import { useEffect, useRef } from 'react';
import { heroStore, hudBridge, useHeroSelector } from '../hero/heroStore';
import { soundController } from '../hero/SoundController';
import { usePortfolioSelector } from '../portfolio/portfolioStore';
import { ScrambleText } from './ScrambleText';

export const HERO_MANIFESTO_COPY =
  'Our mission is to build the next generation of consumer brands at the intersection of Community, AI, and crypto.';

/**
 * Fixed accessible HUD overlays + 60fps SVG construction vertex & displaced brick annotations.
 * Maintains persistent IGLOO wordmark & Sound toggle across Phase 1 while Manifesto,
 * Copyright, and Scroll instruction dissolve with subtle RGB split into the Frost Wipe (State D).
 */
export function HeroUI() {
  const uiVisible = useHeroSelector((s) => s.uiVisible);
  const soundEnabled = useHeroSelector((s) => s.soundEnabled);
  const heroScroll = useHeroSelector((s) => s.heroScroll);
  const replayNonce = useHeroSelector((s) => s.replayNonce);
  const detailOpen = usePortfolioSelector((s) => Boolean(s.selectedProjectId));

  // 60fps imperative SVG & exit dissolve refs (never trigger React state re-renders)
  const vertexTextRefs = useRef<(SVGTextElement | null)[]>([]);
  const brickPolylineRef = useRef<SVGPolylineElement | null>(null);
  const brickCrossHRefs = useRef<(SVGLineElement | null)[]>([]);
  const brickCrossVRefs = useRef<(SVGLineElement | null)[]>([]);
  const brickTextRefs = useRef<(SVGTextElement | null)[]>([]);
  const copyrightRef = useRef<HTMLDivElement | null>(null);
  const manifestoRef = useRef<HTMLElement | null>(null);
  const scrollHintRef = useRef<HTMLDivElement | null>(null);
  const phaseHudRef = useRef<HTMLDivElement | null>(null);
  const phaseCodeRef = useRef<HTMLSpanElement | null>(null);
  const phaseLabelRef = useRef<HTMLSpanElement | null>(null);
  const progressFillRef = useRef<HTMLSpanElement | null>(null);
  const progressPctRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const verts = hudBridge.vertexAnnotations;
      for (let i = 0; i < 22; i++) {
        const txt = vertexTextRefs.current[i];
        const v = verts[i];
        if (txt && v) {
          txt.setAttribute('x', (v.screenX + 5).toFixed(1));
          txt.setAttribute('y', (v.screenY + 3).toFixed(1));
          txt.textContent = v.code;
          txt.style.opacity = v.opacity.toFixed(2);
        } else if (txt) {
          txt.style.opacity = '0';
        }
      }

      const bricks = hudBridge.brickAnnotations;
      const poly = brickPolylineRef.current;
      if (poly) {
        if (bricks.length >= 2) {
          poly.setAttribute(
            'points',
            bricks.map((b) => `${b.anchorX.toFixed(1)},${b.anchorY.toFixed(1)}`).join(' '),
          );
          poly.style.opacity = '0.78';
        } else {
          poly.style.opacity = '0';
        }
      }

      for (let i = 0; i < 5; i++) {
        const ch = brickCrossHRefs.current[i];
        const cv = brickCrossVRefs.current[i];
        const txt = brickTextRefs.current[i];
        const b = bricks[i];
        if (b && ch && cv && txt) {
          const x = b.anchorX;
          const y = b.anchorY;
          ch.setAttribute('x1', (x - 4).toFixed(1));
          ch.setAttribute('y1', y.toFixed(1));
          ch.setAttribute('x2', (x + 4).toFixed(1));
          ch.setAttribute('y2', y.toFixed(1));
          ch.style.opacity = '0.95';

          cv.setAttribute('x1', x.toFixed(1));
          cv.setAttribute('y1', (y - 4).toFixed(1));
          cv.setAttribute('x2', x.toFixed(1));
          cv.setAttribute('y2', (y + 4).toFixed(1));
          cv.style.opacity = '0.95';

          txt.setAttribute('text-anchor', 'middle');
          txt.setAttribute('x', x.toFixed(1));
          txt.setAttribute('y', (y - 8).toFixed(1));
          txt.textContent = b.code;
          txt.style.opacity = '0.96';
        } else if (ch && cv && txt) {
          ch.style.opacity = '0';
          cv.style.opacity = '0';
          txt.style.opacity = '0';
        }
      }

      // Apply restrained chromatic split & fade to dissolving hero text during State D (Frost Entry)
      const d = hudBridge.uiDissolve;
      const exitOpacity = Math.max(0, 1 - d * 1.15);
      const blurPx = (d * 2.4).toFixed(2);
      const splitPx = (d * 3.5).toFixed(2);
      const shadowStr =
        d > 0.02
          ? `${splitPx}px 0 2px rgba(255,95,90,0.45), -${splitPx}px 0 2px rgba(120,230,255,0.45)`
          : '';

      if (copyrightRef.current) {
        copyrightRef.current.style.opacity = (uiVisible ? exitOpacity : 0).toFixed(3);
        copyrightRef.current.style.filter = d > 0.02 ? `blur(${blurPx}px)` : '';
        copyrightRef.current.style.textShadow = shadowStr;
      }
      if (manifestoRef.current) {
        manifestoRef.current.style.opacity = (uiVisible ? exitOpacity : 0).toFixed(3);
        manifestoRef.current.style.filter = d > 0.02 ? `blur(${blurPx}px)` : '';
        manifestoRef.current.style.textShadow = shadowStr;
      }
      if (scrollHintRef.current) {
        const scrollOpacity = uiVisible && heroScroll < 0.25 ? 0.88 * exitOpacity : 0;
        scrollHintRef.current.style.opacity = scrollOpacity.toFixed(3);
      }

      if (phaseHudRef.current) {
        phaseHudRef.current.style.opacity = uiVisible && !detailOpen ? '1' : '0';
        phaseHudRef.current.dataset.stage = hudBridge.cyclePhaseIndex === 5 ? 'particle' : 'default';
      }
      if (phaseCodeRef.current && phaseCodeRef.current.textContent !== hudBridge.cyclePhaseCode) {
        phaseCodeRef.current.textContent = hudBridge.cyclePhaseCode;
      }
      if (phaseLabelRef.current && phaseLabelRef.current.textContent !== hudBridge.cyclePhaseLabel) {
        phaseLabelRef.current.textContent = hudBridge.cyclePhaseLabel;
      }
      if (progressFillRef.current) {
        progressFillRef.current.style.transform = `scaleX(${hudBridge.cycleProgress.toFixed(4)})`;
      }
      if (progressPctRef.current) {
        const pctStr = `${String(Math.round(hudBridge.cycleProgress * 100)).padStart(2, '0')}%`;
        if (progressPctRef.current.textContent !== pctStr) {
          progressPctRef.current.textContent = pctStr;
        }
      }
    };

    sync();
    return hudBridge.subscribe(sync);
  }, [uiVisible, heroScroll, detailOpen]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    heroStore.setState({ soundEnabled: next });
    void soundController.setEnabled(next).catch(() => {});
  };

  const scrollHintVisible = uiVisible && heroScroll < 0.25;

  return (
    <>
      {/* 60fps Imperative SVG layer for construction vertex numbers & displaced upper-brick leader lines */}
      <svg className="annotation-leader" aria-hidden="true">
        {Array.from({ length: 22 }).map((_, i) => (
          <text
            key={`v-${i}`}
            ref={(el) => {
              vertexTextRefs.current[i] = el;
            }}
            className="leader-svg-el"
            fill="#FFFFFF"
            fontSize="8"
            fontFamily="IBM Plex Mono, monospace"
            letterSpacing="0.08em"
          />
        ))}

        <polyline
          ref={brickPolylineRef}
          className="leader-svg-el leader-svg-line"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1"
        />

        {[0, 1, 2, 3, 4].map((i) => (
          <g key={`b-${i}`}>
            <line
              ref={(el) => {
                brickCrossHRefs.current[i] = el;
              }}
              className="leader-svg-el"
              stroke="#FFFFFF"
              strokeWidth="1"
            />
            <line
              ref={(el) => {
                brickCrossVRefs.current[i] = el;
              }}
              className="leader-svg-el"
              stroke="#FFFFFF"
              strokeWidth="1"
            />
            <text
              ref={(el) => {
                brickTextRefs.current[i] = el;
              }}
              className="leader-svg-el"
              fill="#FFFFFF"
              fontSize="9"
              fontWeight="500"
              fontFamily="IBM Plex Mono, monospace"
              letterSpacing="0.08em"
            />
          </g>
        ))}
      </svg>

      <div className="hud-layer">
        {/* Upper-left: IGLOO + Copyright */}
        <header
          className="header-corner"
          style={{
            opacity: uiVisible ? 1 : 0,
            transform: uiVisible ? 'translateY(0)' : 'translateY(-4px)',
            transition: 'opacity 0.55s ease, transform 0.55s ease',
            pointerEvents: uiVisible ? 'auto' : 'none',
          }}
        >
          <div className="igloo-wordmark">IGLOO</div>
          <div ref={copyrightRef} className="copyright-block">
            <ScrambleText
              text={'// Copyright © 2026\nIgloo, Inc.\nAll Rights Reserved.'}
              active={uiVisible}
              triggerKey={replayNonce}
              delayMs={50}
              durationMs={420}
            />
          </div>
        </header>

        {/* Upper-right: ////// Manifesto (dissolves during Frost Exit) */}
        <aside
          ref={manifestoRef}
          className="manifesto-corner"
          aria-label="Manifesto"
          style={{
            opacity: uiVisible ? 1 : 0,
            transform: uiVisible ? 'translateY(0)' : 'translateY(-4px)',
            transition: 'opacity 0.45s ease 0.06s, transform 0.55s ease 0.06s',
          }}
        >
          <div className="manifesto-label">
            <ScrambleText
              text="////// Manifesto"
              active={uiVisible}
              triggerKey={replayNonce}
              delayMs={90}
              durationMs={340}
            />
          </div>
          <p className="manifesto-copy" style={{ margin: 0 }}>
            <ScrambleText
              text={HERO_MANIFESTO_COPY}
              active={uiVisible}
              triggerKey={replayNonce}
              delayMs={140}
              durationMs={480}
            />
          </p>
        </aside>

        {/* Bottom-left: Scroll instruction + Persistent Sound toggle */}
        <div
          className="bottom-left-controls"
          style={{
            opacity: uiVisible ? 1 : 0,
            transform: uiVisible ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 0.6s ease 0.16s, transform 0.6s ease 0.16s',
            pointerEvents: uiVisible ? 'auto' : 'none',
          }}
        >
          <div
            ref={scrollHintRef}
            className="scroll-hint"
            style={{
              opacity: scrollHintVisible ? 0.88 : 0,
              transition: 'opacity 0.35s ease',
            }}
          >
            <span className="scroll-hint-line" aria-hidden="true" />
            <ScrambleText
              text={'Scroll down to\ndiscover'}
              active={uiVisible}
              triggerKey={replayNonce}
              delayMs={180}
              durationMs={380}
            />
          </div>

          <button
            type="button"
            className="sound-toggle"
            data-active={soundEnabled ? 'true' : 'false'}
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? 'Mute sound' : 'Enable sound'}
            onClick={handleToggleSound}
          >
            <span className="sound-bars" aria-hidden="true">
              <span className="sound-bar" />
              <span className="sound-bar" />
              <span className="sound-bar" />
            </span>
            <span>Sound: {soundEnabled ? 'On' : 'Off'}</span>
          </button>
        </div>

        {/* Bottom-right: Minimal frosted glass phase indicator & ultra-thin cycle progress rail */}
        <div
          ref={phaseHudRef}
          className="cycle-glass-hud"
          data-stage="default"
          aria-hidden="true"
        >
          <div className="cycle-phase-row">
            <span ref={phaseCodeRef} className="cycle-phase-code">01 / 06</span>
            <span ref={phaseLabelRef} className="cycle-phase-label">THE FROZEN WORLD</span>
            <span ref={progressPctRef} className="cycle-phase-pct">00%</span>
          </div>
          <div className="cycle-progress-track">
            <span ref={progressFillRef} className="cycle-progress-fill" />
          </div>
        </div>
      </div>
    </>
  );
}
