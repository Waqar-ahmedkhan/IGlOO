import { useEffect, useRef } from 'react';
import { introStage, useHeroSelector } from '../hero/heroStore';

/**
 * 0.0-0.5s empty #A0A5B1 opening state with a tiny central loading mark
 * that dissolves as the 3D construction line network ignites.
 */
export function LoadingScreen() {
  const assetsReady = useHeroSelector((s) => s.assetsReady);
  const replayNonce = useHeroSelector((s) => s.replayNonce);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const syncMark = () => {
      if (overlayRef.current) {
        const op = assetsReady ? introStage.loadingMarkOpacity : 1;
        overlayRef.current.style.opacity = op.toFixed(3);
        overlayRef.current.style.visibility = op > 0.02 ? 'visible' : 'hidden';
      }
      if (introStage.loadingMarkOpacity > 0.01 || !assetsReady) {
        raf = requestAnimationFrame(syncMark);
      }
    };
    raf = requestAnimationFrame(syncMark);
    return () => cancelAnimationFrame(raf);
  }, [assetsReady, replayNonce]);

  return (
    <div ref={overlayRef} className="loading-overlay" aria-hidden="true">
      <div className="loading-mark" />
    </div>
  );
}
