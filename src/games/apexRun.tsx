import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "../types/arcade";
import type { ApexRuntime, Telemetry } from "./apex/runtime";
import { formatTime } from "./apex/race";
import { loadApexSettings, persistSettings } from "./apex/settings";
import type { ApexSettings, Quality } from "./apex/settings";
import { mapPoints, TRACK_LENGTH } from "./apex/track";
import "./apexRun.css";

const emptyHud: Telemetry = {
  phase: "menu",
  speed: 0,
  rpm: 950,
  gear: 1,
  time: 0,
  best: Infinity,
  sector: 0,
  progress: 0,
  x: 0,
  z: 0,
  heading: 0,
  countdown: 3,
  message: "",
  fps: 60,
  calls: 0,
  triangles: 0,
  camera: "Chase",
  newBest: false,
  resolution: 1,
  storageFailed: false,
};
export const ApexRun = (props: GameComponentProps): React.JSX.Element => {
  const viewport = useRef<HTMLDivElement>(null),
    mount = useRef<HTMLDivElement>(null),
    runtime = useRef<ApexRuntime | null>(null),
    callbacks = useRef(props);
  const [settings, setSettings] = useState(() =>
    loadApexSettings(
      props.settings.graphicsQuality,
      props.settings.reducedMotion ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  );
  const settingsRef = useRef(settings);
  const [debug, setDebug] = useState(false);
  const [notice, setNotice] = useState("");
  const [hud, setHud] = useState(emptyHud),
    [panel, setPanel] = useState<"settings" | "controls" | "car" | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0),
    [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    callbacks.current = props;
  }, [props]);
  useEffect(() => {
    settingsRef.current = settings;
    runtime.current?.applySettings({
      ...settings,
      sound: settings.sound && props.settings.sound,
      reducedMotion: settings.reducedMotion || props.settings.reducedMotion,
    });
    persistSettings(settings);
  }, [settings, props.settings.sound, props.settings.reducedMotion]);
  useEffect(() => {
    let canceled = false;
    const element = mount.current;
    if (!element) return;
    void import("./apex/runtime")
      .then(({ ApexRuntime }) => {
        if (canceled) return;
        try {
          const current = callbacks.current;
          runtime.current = new ApexRuntime(
            element,
            {
              ...settingsRef.current,
              sound: settingsRef.current.sound && current.settings.sound,
            },
            {
              input: current.input,
              difficulty: current.difficulty,
              onHud: setHud,
              onScore: (score) => callbacks.current.onScore(score),
              onFps: (fps) => callbacks.current.onFps(fps),
              onPause: () => callbacks.current.onPauseToggle(),
              onFinish: (result) => callbacks.current.onGameOver(result),
              onError: setError,
            },
          );
          runtime.current.setPaused(current.paused);
          setReady(true);
        } catch (e) {
          setError(
            `Unable to start 3D graphics. ${e instanceof Error ? e.message : "Please try restarting the game."}`,
          );
        }
      })
      .catch(() =>
        setError("The game could not load. Check your connection and retry."),
      );
    return () => {
      canceled = true;
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, [props.input, props.difficulty, epoch]);
  useEffect(() => {
    runtime.current?.setPaused(props.paused);
  }, [props.paused]);
  useEffect(() => {
    const change = () =>
      setFullscreen(document.fullscreenElement === viewport.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    const toggle = (e: KeyboardEvent) => {
      if (e.code === "F8" && !e.repeat) {
        e.preventDefault();
        setDebug((value) => !value);
      }
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, []);
  const changeSetting = <K extends keyof ApexSettings>(
    key: K,
    value: ApexSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await viewport.current?.requestFullscreen();
    } catch {
      setNotice(
        "Fullscreen is unavailable in this browser window. The game can still run here.",
      );
    }
  };
  const start = () => {
    setPanel(null);
    if (props.paused) props.onPauseToggle();
    runtime.current?.start();
  };
  const controls = (
    <dl className="apex-controls-list">
      <div>
        <dt>W / ↑</dt>
        <dd>Accelerate</dd>
      </div>
      <div>
        <dt>S / ↓</dt>
        <dd>Brake · hold to reverse</dd>
      </div>
      <div>
        <dt>A D / ← →</dt>
        <dd>Steer</dd>
      </div>
      <div>
        <dt>SPACE</dt>
        <dd>Handbrake</dd>
      </div>
      <div>
        <dt>C</dt>
        <dd>Change camera</dd>
      </div>
      <div>
        <dt>R</dt>
        <dd>Recover to sector · +3 sec</dd>
      </div>
      <div>
        <dt>ESC / P</dt>
        <dd>Pause / resume</dd>
      </div>
    </dl>
  );
  return (
    <div
      className="apex-game"
      ref={viewport}
      aria-label="Apex Run mountain time attack"
    >
      <div ref={mount} className="apex-canvas" />
      <div className="apex-vignette" />
      {!ready && !error && (
        <div className="apex-loading" role="status">
          <span className="apex-wordmark">
            APEX<span>RUN</span>
          </span>
          <div className="apex-load-line" />
          <p>Preparing Solstice Pass</p>
        </div>
      )}
      {ready && (
        <>
          <div className="apex-topline">
            <span className="apex-wordmark small">
              APEX<span>RUN</span>
            </span>
            <span className="apex-location">
              SOLSTICE PASS <i /> GOLDEN HOUR
            </span>
            <div className="apex-tools">
              <button
                onClick={() => runtime.current?.changeCamera()}
                title="Change camera (C)"
                aria-label="Change camera"
              >
                {hud.camera}
              </button>
              {document.fullscreenEnabled && (
                <button
                  onClick={() => void toggleFullscreen()}
                  aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {fullscreen ? "Window" : "Fullscreen"}
                </button>
              )}
              {hud.phase !== "menu" && (
                <button
                  onClick={props.onPauseToggle}
                  aria-label={props.paused ? "Resume race" : "Pause race"}
                >
                  {props.paused ? "Resume" : "Pause"}
                </button>
              )}
            </div>
          </div>
          {hud.phase === "menu" && !panel && (
            <div className="apex-menu">
              <p className="apex-eyebrow">THE MOUNTAIN IS YOURS.</p>
              <h1>
                Find your
                <br />
                <em>limit.</em>
              </h1>
              <p className="apex-menu-description">
                One car. One perfect lap.
                <br />
                Chase the light through Solstice Pass.
              </p>
              <button className="apex-primary" onClick={start}>
                DRIVE NOW <span aria-hidden="true">↗</span>
              </button>
              <nav aria-label="Apex Run menu">
                <button onClick={() => setPanel("car")}>Car</button>
                <button onClick={() => setPanel("settings")}>Settings</button>
                <button onClick={() => setPanel("controls")}>
                  How to play
                </button>
              </nav>
              <div className="apex-route-info">
                <span>
                  <strong>{(TRACK_LENGTH / 1000).toFixed(2)}</strong> KM CIRCUIT
                </span>
                <span>
                  <strong>08</strong> SECTORS
                </span>
                <span>
                  <strong>01</strong> PERFECT LAP
                </span>
              </div>
            </div>
          )}
          {hud.phase === "menu" && !panel && (
            <div className="apex-car-caption">
              <span>SOLSTICE GT</span>
              <p>Rear-wheel drive / 6-speed / twin turbo</p>
            </div>
          )}
          {(hud.phase === "race" || hud.phase === "countdown") && (
            <div className="apex-hud">
              <div className="apex-timing">
                <span>TIME ATTACK</span>
                <strong aria-label="Race time">{formatTime(hud.time)}</strong>
                <p>
                  PERSONAL BEST <b>{formatTime(hud.best)}</b>
                </p>
                <div className="apex-sector">
                  <span>
                    SECTOR{" "}
                    {String(Math.min(8, hud.sector + 1)).padStart(2, "0")} / 08
                  </span>
                  <div>
                    <i
                      style={{ width: `${Math.min(100, hud.progress * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="apex-minimap">
                <svg viewBox="0 0 150 180" aria-label="Circuit map">
                  <polyline
                    points={mapPoints}
                    fill="none"
                    stroke="rgba(0,0,0,.4)"
                    strokeWidth="6"
                  />
                  <polyline
                    points={mapPoints}
                    fill="none"
                    stroke="#dfdfce"
                    strokeWidth="2"
                  />
                  <circle cx={280 / 4.5} cy={420 / 4.5} r="3" fill="#eab26f" />
                  <g
                    transform={`translate(${(hud.x + 280) / 4.5} ${(hud.z + 420) / 4.5}) rotate(${(-hud.heading * 180) / Math.PI})`}
                  >
                    <path
                      d="M 0 5 L -3.5 -4 L 0 -2 L 3.5 -4 Z"
                      fill="#f4be7c"
                      stroke="#111"
                      strokeWidth=".6"
                    />
                  </g>
                </svg>
                <span>SOLSTICE PASS</span>
              </div>
              <div className="apex-speedometer">
                <div className="apex-rpm">
                  {Array.from({ length: 28 }, (_, i) => (
                    <i
                      key={i}
                      className={
                        (hud.rpm / 8000) * 28 > i
                          ? i > 23
                            ? "hot"
                            : "lit"
                          : ""
                      }
                    />
                  ))}
                </div>
                <div className="apex-speed">
                  <span className="apex-gear">
                    {hud.gear < 0 ? "R" : hud.gear}
                    <small>GEAR</small>
                  </span>
                  <strong aria-label="Speed">
                    {hud.speed.toString().padStart(3, "0")}
                  </strong>
                  <span className="apex-unit">KM/H</span>
                </div>
                <div className="apex-assists">
                  <span>
                    {settings.assists && props.difficulty !== "hard"
                      ? "STABILITY ASSIST"
                      : "SPORT HANDLING"}
                  </span>
                  <span>ABS</span>
                </div>
              </div>
              <div className="apex-driving-hint">
                WASD DRIVE <i /> SPACE HANDBRAKE <i /> R RECOVER
              </div>
              {hud.message && (
                <div className="apex-message" role="status">
                  {hud.message}
                </div>
              )}
              {hud.phase === "countdown" && (
                <div className="apex-countdown" role="status">
                  <span>MAKE IT COUNT</span>
                  <strong key={hud.countdown}>{hud.countdown}</strong>
                </div>
              )}
            </div>
          )}
          {hud.phase === "finish" && !panel && (
            <div className="apex-finish">
              <p className="apex-eyebrow">
                {hud.newBest ? "A NEW PERSONAL BEST" : "LAP COMPLETE"}
              </p>
              <h2>
                That’s your
                <br />
                <em>benchmark.</em>
              </h2>
              <strong>{formatTime(hud.time)}</strong>
              <p>
                {hud.storageFailed
                  ? "Best run kept for this session. Browser storage is unavailable."
                  : hud.newBest
                    ? "Your ghost is ready. Give it something to chase."
                    : `Personal best ${formatTime(hud.best)}. There’s more in it.`}
              </p>
              <button className="apex-primary" onClick={start}>
                RACE AGAIN <span aria-hidden="true">↗</span>
              </button>
              <button
                className="apex-text-button"
                onClick={() => setPanel("settings")}
              >
                Tune settings
              </button>
            </div>
          )}
          {props.paused && hud.phase !== "finish" && !panel && (
            <div className="apex-overlay">
              <div className="apex-panel">
                <p className="apex-eyebrow">TAKE A BREATH</p>
                <h2>Paused.</h2>
                <button className="apex-primary" onClick={props.onPauseToggle}>
                  RESUME DRIVE
                </button>
                <button onClick={start}>Restart time attack</button>
                <button onClick={() => setPanel("settings")}>Settings</button>
                <button onClick={() => setPanel("controls")}>
                  How to play
                </button>
              </div>
            </div>
          )}
          {panel && (
            <div className="apex-overlay">
              <div className="apex-panel">
                <div className="apex-panel-heading">
                  <h2>
                    {panel === "settings"
                      ? "Your setup."
                      : panel === "car"
                        ? "Solstice GT."
                        : "Own the road."}
                  </h2>
                  <button
                    onClick={() => setPanel(null)}
                    aria-label="Close panel"
                  >
                    ✕
                  </button>
                </div>
                {panel === "settings" && (
                  <>
                    <label className="apex-setting">
                      Graphics
                      <select
                        aria-label="Graphics"
                        value={settings.quality}
                        onChange={(e) =>
                          changeSetting("quality", e.target.value as Quality)
                        }
                      >
                        {["low", "medium", "high", "ultra"].map((q) => (
                          <option key={q} value={q}>
                            {q[0].toUpperCase() + q.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="apex-setting-note">
                      Resolution adapts to keep driving responsive.
                    </p>
                    {(
                      [
                        ["assists", "Stability assist"],
                        ["sound", "Engine & world audio"],
                        ["reducedMotion", "Reduced camera motion"],
                        ["ghost", "Personal best ghost"],
                      ] as const
                    ).map(([key, label]) => (
                      <label className="apex-setting" key={key}>
                        {label}
                        <input
                          type="checkbox"
                          checked={settings[key]}
                          onChange={(e) => changeSetting(key, e.target.checked)}
                        />
                      </label>
                    ))}
                    {props.difficulty === "hard" && (
                      <p className="apex-setting-note">
                        Hard difficulty uses sport handling with stability
                        assist disabled.
                      </p>
                    )}
                  </>
                )}
                {panel === "car" && (
                  <>
                    <p className="apex-panel-copy">
                      An original grand tourer built for the mountain. Sculpted
                      aero, rear-wheel drive, and a six-speed automatic.
                    </p>
                    <label className="apex-setting">
                      Body colour
                      <input
                        type="color"
                        value={settings.paint}
                        onChange={(e) => changeSetting("paint", e.target.value)}
                      />
                    </label>
                    <div className="apex-paints">
                      {[
                        "#c73d26",
                        "#c9b887",
                        "#285951",
                        "#9baeb8",
                        "#24292e",
                      ].map((color) => (
                        <button
                          key={color}
                          aria-label={`Paint ${color}`}
                          aria-pressed={settings.paint === color}
                          style={{ background: color }}
                          onClick={() => changeSetting("paint", color)}
                        />
                      ))}
                    </div>
                  </>
                )}
                {panel === "controls" && (
                  <>
                    {controls}
                    <p className="apex-panel-copy">
                      Brake before the corner, ease into the apex, then
                      accelerate out. Pass all eight sectors in order. Recovery
                      adds three seconds.
                    </p>
                    <p className="apex-setting-note">
                      Gamepad: left stick steer · RT accelerate · LT brake · A
                      handbrake · Y camera · X recover · Menu pause.
                    </p>
                  </>
                )}
                <button className="apex-primary" onClick={() => setPanel(null)}>
                  BACK TO{" "}
                  {props.paused
                    ? "PAUSE"
                    : hud.phase === "finish"
                      ? "RESULTS"
                      : "CAR"}
                </button>
              </div>
            </div>
          )}
          {(props.settings.showFps || debug) && (
            <output className="apex-debug">
              {hud.fps} FPS · {hud.calls} draws ·{" "}
              {(hud.triangles / 1000).toFixed(0)}k tris · {settings.quality} ·{" "}
              {Math.round(hud.resolution * 100)}% adaptive
            </output>
          )}
          {(hud.phase === "race" || hud.phase === "countdown") &&
            !props.paused && (
              <div className="apex-touch">
                {(
                  [
                    ["left", "←"],
                    ["right", "→"],
                    ["action", "Slide"],
                    ["down", "Brake"],
                    ["up", "Gas"],
                  ] as const
                ).map(([action, label]) => (
                  <button
                    key={action}
                    aria-label={label}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      props.input.setVirtual(action, true);
                    }}
                    onPointerUp={() => props.input.setVirtual(action, false)}
                    onPointerCancel={() =>
                      props.input.setVirtual(action, false)
                    }
                    onLostPointerCapture={() =>
                      props.input.setVirtual(action, false)
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
        </>
      )}
      {notice && (
        <div className="apex-notice" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="apex-overlay" role="alert">
          <div className="apex-panel">
            <h2>Let’s reset.</h2>
            <p>{error}</p>
            <button
              className="apex-primary"
              onClick={() => {
                setError("");
                setReady(false);
                setEpoch((n) => n + 1);
              }}
            >
              RELOAD GAME
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
