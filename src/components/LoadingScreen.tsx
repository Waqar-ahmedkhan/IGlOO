import { useEffect, useRef } from 'react';
import { introStage, useHeroSelector } from '../hero/heroStore';

/**
 * Real preparation milestones fade into the existing construction introduction.
 */
export function LoadingScreen() {
  const loadingStep = useHeroSelector((s) => s.loadingStep);
  const loadingFailed = useHeroSelector((s) => s.loadingFailed);
  const statuses = ['Preparing the landscape', 'Preparing the light', 'Ready'];
  const status = loadingFailed ? 'The scene could not start. Reload to try again.' : statuses[loadingStep];
  const assetsReady = useHeroSelector((s) => s.assetsReady);
  const replayNonce = useHeroSelector((s) => s.replayNonce);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const syncMark = () => {
      if (overlayRef.current) {
        const op = assetsReady && !loadingFailed ? introStage.loadingMarkOpacity : 1;
        overlayRef.current.style.opacity = op.toFixed(3);
        overlayRef.current.style.visibility = op > 0.02 ? 'visible' : 'hidden';
      }
      if (introStage.loadingMarkOpacity > 0.01 || !assetsReady || loadingFailed) {
        raf = requestAnimationFrame(syncMark);
      }
    };
    raf = requestAnimationFrame(syncMark);
    return () => cancelAnimationFrame(raf);
  }, [assetsReady, replayNonce, loadingFailed]);

  return (
    <div ref={overlayRef} className="loading-overlay" data-failed={loadingFailed}>
      <div className="loading-content" role="status" aria-live="polite">
        <span className="loading-wordmark" aria-hidden="true">IGLOO</span>
        <span className="loading-steps" aria-hidden="true">
          {[0, 1, 2].map(step => <span key={step} data-complete={step <= loadingStep} />)}
        </span>
        <span className="loading-status">{status}</span>
        {loadingFailed && <a className="loading-retry" href={window.location.href}>Reload</a>}
      </div>
    </div>
  );
}
