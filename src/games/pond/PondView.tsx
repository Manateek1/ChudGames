import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowClockwise, Minus, Plus, Sun, MoonStars, CloudSun, Drop } from "@phosphor-icons/react";
import type { AppSettings } from "../../types/arcade";
import { DAY, night, type Farm } from "./farm";
import type { createPond } from "./scene";

export function PondView({
  farm,
  paused,
  settings,
  onFeed,
  onFps,
}: {
  farm: Farm;
  paused: boolean;
  settings: AppSettings;
  onFeed: () => void;
  onFps: (n: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<ReturnType<typeof createPond> | null>(null);
  const [view, setView] = useState<"loading" | "ready" | "lost">("loading");
  const [attempt, setAttempt] = useState(0);
  const sync = useEffectEvent(() => world.current?.sync(farm, paused, settings.reducedMotion));
  const feed = useEffectEvent(onFeed),
    fps = useEffectEvent(onFps);
  useEffect(() => {
    sync();
  }, [farm, paused, settings.reducedMotion]);
  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    const lost = (event: Event) => {
      event.preventDefault();
      world.current?.dispose();
      world.current = null;
      setView("lost");
    };
    el.addEventListener("webglcontextlost", lost, true);
    void import("./scene")
      .then(({ createPond }) => {
        if (disposed) return;
        world.current = createPond(
          el,
          settings.graphicsQuality,
          () => feed(),
          (n) => fps(n),
        );
        sync();
        setView("ready");
      })
      .catch(() => {
        if (!disposed) setView("lost");
      });
    return () => {
      disposed = true;
      el.removeEventListener("webglcontextlost", lost, true);
      world.current?.dispose();
      world.current = null;
    };
  }, [settings.graphicsQuality, attempt]);
  const day = 1 + Math.floor(farm.time / DAY),
    cloudy = day % 3 === 0,
    dark = night(farm);
  const Sky = dark ? MoonStars : cloudy ? CloudSun : Sun;
  return (
    <div className={"pond-view " + (dark ? "pond-night" : "")}>
      <div className="pond-weather">
        <Sky weight="duotone" /> Day {day}
        <span>·</span>
        {dark ? "Night" : cloudy ? "Cloudy" : "Sunny"}
      </div>
      <div className={"pond-health " + (farm.oxygen < 50 ? "pond-health-low" : "")}>
        <Drop weight="duotone" /> Oxygen {Math.round(farm.oxygen)}%
      </div>
      <div
        className="pond-canvas"
        ref={host}
        role="img"
        aria-label="Overhead 3D carp farm. Drag to rotate and tap the water to feed."
      />
      {view === "lost" && (
        <div className="pond-fallback">
          <span>3D view unavailable</span>
          <button
            onClick={() => {
              setView("loading");
              setAttempt((a) => a + 1);
            }}
          >
            Retry 3D
          </button>
        </div>
      )}
      <div className="pond-camera" aria-label="Farm camera">
        <button
          disabled={view !== "ready"}
          aria-label="Rotate farm"
          onClick={() => world.current?.camera(Math.PI / 4, 0)}
        >
          <ArrowClockwise />
        </button>
        <button
          disabled={view !== "ready"}
          aria-label="Zoom out"
          onClick={() => world.current?.camera(0, -0.15)}
        >
          <Minus />
        </button>
        <button
          disabled={view !== "ready"}
          aria-label="Zoom in"
          onClick={() => world.current?.camera(0, 0.15)}
        >
          <Plus />
        </button>
      </div>
    </div>
  );
}
