import { useEffect, useRef } from 'react';
import { ScrambleText } from './ScrambleText';
import { getProjectById } from '../portfolio/projects';
import { portfolioStore, usePortfolioSelector } from '../portfolio/portfolioStore';

/**
 * Spacious, visually quiet dark blue-black project detail interface
 * activated when clicking an ice crystal or visiting a direct project route.
 * Keeps the centered 3D crystal visible while revealing scrambled copy,
 * compact monospaced specs, verified bracketed links, and upper-right [ CLOSE ].
 */
export function ProjectDetailOverlay() {
  const selectedProjectId = usePortfolioSelector((s) => s.selectedProjectId);
  const project = getProjectById(selectedProjectId);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (project) {
      const timer = window.setTimeout(() => {
        closeBtnRef.current?.focus({ preventScroll: true });
      }, 180);
      return () => window.clearTimeout(timer);
    }
  }, [project]);

  if (!project) return null;

  return (
    <section
      className="detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${project.name} Project Details`}
    >
      {/* Translucent oversized typography drifting quietly in dark background */}
      <div className="detail-watermark" aria-hidden="true">
        {project.watermark}
      </div>

      {/* Upper-right technical Close button */}
      <button
        ref={closeBtnRef}
        type="button"
        className="detail-close-btn bracket-btn"
        aria-label="Close project details"
        onClick={() => portfolioStore.closeProject()}
      >
        <span className="bracket-char" aria-hidden="true">
          [
        </span>
        <ScrambleText text="CLOSE" active triggerKey={project.id} delayMs={60} durationMs={320} />
        <span className="bracket-char" aria-hidden="true">
          ]
        </span>
      </button>

      {/* Spacious left editorial block */}
      <div className="detail-left">
        <div className="detail-kicker">
          <ScrambleText
            text={`////// ${project.code}`}
            active
            triggerKey={project.id}
            delayMs={40}
            durationMs={380}
          />
        </div>
        <h1 className="detail-title">
          <ScrambleText
            text={project.name}
            active
            triggerKey={project.id}
            delayMs={90}
            durationMs={460}
          />
        </h1>
        <div className="detail-category">
          <ScrambleText
            text={project.category}
            active
            triggerKey={project.id}
            delayMs={130}
            durationMs={420}
          />
        </div>
        <div className="detail-hairline" aria-hidden="true" />
        <p className="detail-summary">
          <ScrambleText
            text={project.summary}
            active
            triggerKey={project.id}
            delayMs={170}
            durationMs={640}
          />
        </p>
      </div>

      {/* Spacious right technical specs & verified bracketed external links */}
      <div className="detail-right">
        <dl className="detail-specs">
          {project.specs.map((spec, idx) => (
            <div key={spec.label} className="detail-spec-row">
              <dt className="detail-spec-key">{spec.label}</dt>
              <dd className="detail-spec-val">
                <ScrambleText
                  text={spec.value}
                  active
                  triggerKey={project.id}
                  delayMs={140 + idx * 55}
                  durationMs={420}
                />
              </dd>
            </div>
          ))}
        </dl>

        {project.links.length > 0 && (
          <nav className="detail-links" aria-label="Verified project links">
            <div className="detail-hairline detail-hairline-right" aria-hidden="true" />
            <div className="detail-links-row">
              {project.links.map((link, idx) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bracket-btn detail-link-btn"
                >
                  <span className="bracket-char" aria-hidden="true">
                    [
                  </span>
                  <ScrambleText
                    text={`${link.label} ↗`}
                    active
                    triggerKey={project.id}
                    delayMs={240 + idx * 70}
                    durationMs={420}
                  />
                  <span className="bracket-char" aria-hidden="true">
                    ]
                  </span>
                </a>
              ))}
            </div>
          </nav>
        )}
      </div>
    </section>
  );
}
