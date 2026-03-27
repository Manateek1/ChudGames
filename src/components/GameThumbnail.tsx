import { useEffect, useRef } from "react";
import { shouldSkipFrame } from "../engine/fps";
import type { ThumbnailRenderer } from "../types/arcade";

interface GameThumbnailProps {
  renderer: ThumbnailRenderer;
  reducedMotion: boolean;
}

export const GameThumbnail = ({ renderer, reducedMotion }: GameThumbnailProps): React.JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const width = 320;
    const height = 180;
    canvas.width = width;
    canvas.height = height;

    let raf = 0;
    const start = performance.now();
    let previous = 0;

    const tick = (time: number): void => {
      if (shouldSkipFrame(time, previous)) {
        if (!reducedMotion) {
          raf = window.requestAnimationFrame(tick);
        }
        return;
      }

      previous = time;
      const elapsed = reducedMotion ? 0 : time - start;
      renderer(ctx, elapsed, width, height);
      if (!reducedMotion) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    tick(start);

    return () => {
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [renderer, reducedMotion]);

  return <canvas ref={canvasRef} className="h-[180px] w-full rounded-[1.2rem] border border-sky-100/14 bg-[rgba(255,255,255,0.05)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]" aria-hidden />;
};
