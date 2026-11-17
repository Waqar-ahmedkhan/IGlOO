import { useEffect, useRef } from 'react';
import { ScrambleText } from './ScrambleText';
import { getProjectById } from '../portfolio/projects';
import {
  portfolioHudBridge,
  portfolioStore,
  usePortfolioSelector,
} from '../portfolio/portfolioStore';
import { useHeroSelector } from '../hero/heroStore';
import { useScrollStateSelector } from '../experience/ScrollDirector';

/**
 * 60fps imperative SVG leader lines + scrambled monospaced annotations
 * tethered visually in screen space to Crystal 1 (Pudgy Penguins) and Crystal 2 (Overpass),
 * plus the subtle viewport dot-matrix calibration grid matching the atmospheric void.
 */
export function PortfolioHUD() {
  const heroScroll = useHeroSelector((s) => s.heroScroll);
  const activeHudProjectId = usePortfolioSelector((s) => s.activeHudProjectId);
  const activeHudNonce = usePortfolioSelector((s) => s.activeHudNonce);
  const selectedProjectId = usePortfolioSelector((s) => s.selectedProjectId);
  const hoveredProjectId = usePortfolioSelector((s) => s.hoveredProjectId);
  const inParticleStage = useScrollStateSelector((s) => s.stateName === 'particle-stage');

  const activeProject = getProjectById(activeHudProjectId);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const tlPolylineRef = useRef<SVGPolylineElement | null>(null);
  const tlDotRef = useRef<SVGCircleElement | null>(null);
  const brLineRef = useRef<SVGLineElement | null>(null);
  const brDotRef = useRef<SVGCircleElement | null>(null);
  const tlLabelRef = useRef<HTMLDivElement | null>(null);
  const trLabelRef = useRef<HTMLDivElement | null>(null);
  const brLabelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const proj = portfolioHudBridge.projection;
      const container = containerRef.current;
      if (!container) return;

      if (!proj || !proj.visible || proj.opacity <= 0.01) {
        container.style.opacity = '0';
        container.style.visibility = 'hidden';
        return;
      }

      container.style.visibility = 'visible';
      container.style.opacity = proj.opacity.toFixed(3);

      if (tlPolylineRef.current) {
        tlPolylineRef.current.setAttribute(
          'points',
          `${proj.topLeftEndX.toFixed(1)},${proj.topLeftEndY.toFixed(1)} ${proj.topLeftElbowX.toFixed(1)},${proj.topLeftElbowY.toFixed(1)} ${proj.topLeftAnchorX.toFixed(1)},${proj.topLeftAnchorY.toFixed(1)}`,
        );
      }
      if (tlDotRef.current) {
        tlDotRef.current.setAttribute('cx', proj.topLeftAnchorX.toFixed(1));
        tlDotRef.current.setAttribute('cy', proj.topLeftAnchorY.toFixed(1));
      }

      if (brLineRef.current) {
        brLineRef.current.setAttribute('x1', proj.bottomRightAnchorX.toFixed(1));
        brLineRef.current.setAttribute('y1', proj.bottomRightAnchorY.toFixed(1));
        brLineRef.current.setAttribute('x2', proj.bottomRightEndX.toFixed(1));
        brLineRef.current.setAttribute('y2', proj.bottomRightEndY.toFixed(1));
      }
      if (brDotRef.current) {
        brDotRef.current.setAttribute('cx', proj.bottomRightAnchorX.toFixed(1));
        brDotRef.current.setAttribute('cy', proj.bottomRightAnchorY.toFixed(1));
      }

      if (tlLabelRef.current) {
        tlLabelRef.current.style.transform = `translate3d(${proj.topLeftEndX.toFixed(1)}px, ${(proj.topLeftEndY - 34).toFixed(1)}px, 0)`;
      }
      if (trLabelRef.current) {
        trLabelRef.current.style.transform = `translate3d(${proj.topRightX.toFixed(1)}px, ${(proj.topRightY - 14).toFixed(1)}px, 0)`;
      }
      if (brLabelRef.current) {
        brLabelRef.current.style.transform = `translate3d(${proj.bottomRightEndX.toFixed(1)}px, ${(proj.bottomRightEndY - 34).toFixed(1)}px, 0) translateX(-100%)`;
      }
    };

    sync();
    return portfolioHudBridge.subscribe(sync);
  }, []);

  const gridOpacity =
    heroScroll > 0.72
      ? selectedProjectId || inParticleStage
        ? 0.14
        : Math.min(1, (heroScroll - 0.72) / 0.25)
      : 0;

  return (
    <>
      {/* Subtle spatial calibration dot grid visible in Phase 2 atmospheric void */}
      <div
        className="calibration-dot-grid"
        aria-hidden="true"
        style={{ opacity: gridOpacity }}
      />

      {/* 60fps imperative leader lines & floating technical crystal labels */}
      <div
        ref={containerRef}
        className="crystal-hud-layer"
        data-hovered={
          activeProject && hoveredProjectId === activeProject.id ? 'true' : 'false'
        }
        style={{ opacity: 0, visibility: 'hidden' }}
      >
        <svg className="crystal-leader-svg" aria-hidden="true">
          <polyline
            ref={tlPolylineRef}
            fill="none"
            stroke="rgba(255, 255, 255, 0.86)"
            strokeWidth="1"
          />
          <circle ref={tlDotRef} r="2" fill="#FFFFFF" />
          <line
            ref={brLineRef}
            stroke="rgba(255, 255, 255, 0.86)"
            strokeWidth="1"
          />
          <circle ref={brDotRef} r="2" fill="#FFFFFF" />
        </svg>

        {activeProject && (
          <>
            {/* Upper-left label: PORTFOLIO_CO_01 / NAME */}
            <div ref={tlLabelRef} className="crystal-label-tl">
              <div className="crystal-code">
                <ScrambleText
                  text={activeProject.code}
                  active={Boolean(activeProject)}
                  triggerKey={`${activeProject.id}-${activeHudNonce}`}
                  delayMs={20}
                  durationMs={400}
                />
              </div>
              <div className="crystal-name">
                <ScrambleText
                  text={activeProject.name}
                  active={Boolean(activeProject)}
                  triggerKey={`${activeProject.id}-${activeHudNonce}`}
                  delayMs={75}
                  durationMs={460}
                />
              </div>
            </div>

            {/* Upper-right thermal telemetry readout */}
            <div ref={trLabelRef} className="crystal-label-tr" aria-hidden="true">
              <div>
                <span className="crystal-temp-key">TEMP</span>
                <span className="crystal-temp-val">
                  <ScrambleText
                    text={activeProject.tempMain}
                    active={Boolean(activeProject)}
                    triggerKey={`${activeProject.id}-${activeHudNonce}`}
                    delayMs={110}
                    durationMs={420}
                  />
                </span>
              </div>
              <div className="crystal-temp-sub">
                <ScrambleText
                  text={activeProject.tempSub}
                  active={Boolean(activeProject)}
                  triggerKey={`${activeProject.id}-${activeHudNonce}`}
                  delayMs={150}
                  durationMs={420}
                />
              </div>
            </div>

            {/* Lower-right date + interactive CLICK TO EXPLORE button */}
            <div ref={brLabelRef} className="crystal-label-br">
              <div className="crystal-date">
                <ScrambleText
                  text={activeProject.dateLabel}
                  active={Boolean(activeProject)}
                  triggerKey={`${activeProject.id}-${activeHudNonce}`}
                  delayMs={100}
                  durationMs={420}
                />
              </div>
              <button
                type="button"
                className="crystal-explore-btn"
                aria-label={`Explore ${activeProject.name}`}
                onMouseEnter={() => portfolioStore.setHoveredProject(activeProject.id)}
                onMouseLeave={() => portfolioStore.setHoveredProject(null)}
                onClick={() => portfolioStore.openProject(activeProject.id)}
              >
                <ScrambleText
                  text="CLICK TO EXPLORE"
                  active={Boolean(activeProject)}
                  triggerKey={`${activeProject.id}-${activeHudNonce}`}
                  delayMs={140}
                  durationMs={480}
                />
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
