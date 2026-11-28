import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Backpack, BookOpen, Compass, Gear, Hammer, Info } from "@phosphor-icons/react";
import type { GameComponentProps } from "../../types/arcade";
import type { ExpeditionStart } from "./expeditionData";
import { Runtime } from "./runtime";
import { Panels, Slot } from "./Panels";
import { BLOCKS } from "./world/blocks";
import { ITEMS } from "./systems/catalog";
import { readOptions, type Action } from "./controls";
import type { Panel } from "./expedition";

function Meter({ name, n }: { name: string; n: number }) {
  return (
    <div className="tw-meter" data-meter={name}>
      <div>
        <span>{name}</span>
        <strong>{Math.max(0, Math.ceil(n))}</strong>
      </div>
      <div
        role="meter"
        aria-label={name}
        aria-valuenow={Math.max(0, Math.ceil(n))}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: Math.max(0, Math.min(100, n)) + "%" }} />
      </div>
    </div>
  );
}
export default function Play({
  start,
  leave,
  settings,
  paused,
  onFps,
  onPauseToggle,
}: GameComponentProps & { start: ExpeditionStart; leave: () => void }) {
  const host = useRef<HTMLDivElement>(null),
    game = useRef<Runtime | null>(null);
  const [rt, setRuntime] = useState<Runtime | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null),
    [error, fail] = useState(""),
    [, render] = useState(0);
  const current = useRef({ settings, paused, onFps, onPauseToggle });
  useEffect(() => {
    current.current = { settings, paused, onFps, onPauseToggle };
    game.current?.settings(paused, settings.sound, settings.music);
  }, [settings, paused, onFps, onPauseToggle]);
  useEffect(() => {
    let mounted = true;
    let rt: Runtime | undefined;
    // Delay construction past StrictMode's setup probe so the renderer only attaches once.
    queueMicrotask(() => {
      if (!mounted || !host.current) return;
      const live = current.current;
      try {
        rt = new Runtime(
          host.current,
          start,
          readOptions(live.settings.reducedMotion),
          { paused: live.paused, sound: live.settings.sound, music: live.settings.music },
          {
            update: () => {
              if (mounted) render((v) => v + 1);
            },
            fps: (n) => current.current.onFps(n),
            panel: setPanel,
            pause: () => current.current.onPauseToggle(),
            error: fail,
          },
        );
        game.current = rt;
        setRuntime(rt);
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    });
    return () => {
      mounted = false;
      rt?.dispose();
      game.current = null;
    };
  }, [start]);
  const g = rt?.game;
  const close = () => {
    rt?.open(null);
    rt?.capture();
  };
  useEffect(() => {
    if (!panel || !rt) return;
    const listener = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if ((e.code === "Escape" || e.code === rt.options.keys.pack) && !e.repeat) {
        e.preventDefault();
        e.stopImmediatePropagation();
        rt.open(null);
        rt.capture();
      }
    };
    document.addEventListener("keydown", listener, true);
    return () => document.removeEventListener("keydown", listener, true);
  }, [panel, rt]);
  const refresh = () => render((v) => v + 1);
  const touchButton = (label: string, action: Action | "mine") => (
    <button
      key={label}
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        if (!rt) return;
        if (action === "mine") rt.controls.mining = true;
        else rt.controls.key(action, true);
      }}
      onLostPointerCapture={() => {
        if (!rt) return;
        if (action === "mine") rt.controls.mining = false;
        else rt.controls.key(action, false);
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="tw tw-play" style={{ "--tw-scale": rt?.options.uiScale ?? 1 } as CSSProperties}>
      <div
        ref={host}
        className="tw-canvas"
        role="region"
        aria-label="First-person voxel world"
        tabIndex={0}
      />
      {error ? (
        <div className="tw-overlay">
          <div className="tw-panel" role="alert">
            <h2>World unavailable</h2>
            <p>{error}</p>
            <button onClick={leave}>Return to worlds</button>
          </div>
        </div>
      ) : !rt || !g ? (
        <div className="tw-loading" role="status">
          Generating region…
        </div>
      ) : (
        <>
          <div className="tw-tophud">
            <div className="tw-location">
              <strong>{start.info.name}</strong>
              <small>
                {g.world.biome(Math.floor(g.body.x), Math.floor(g.body.z)).replaceAll("_", " ")} ·{" "}
                {g.weather}
              </small>
            </div>
            <div className="tw-compass" aria-label="Compass">
              <Compass />
              <strong>
                {["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(g.heading / 45) % 8]}
              </strong>
              {Math.round(g.heading)}°
              {g.compassMarker && (
                <small>
                  {g.compassMarker.name} ·{" "}
                  {Math.round(Math.hypot(g.compassMarker.x - g.body.x, g.compassMarker.z - g.body.z))}m ·{" "}
                  {Math.round(
                    ((Math.atan2(g.compassMarker.x - g.body.x, g.body.z - g.compassMarker.z) * 180) /
                      Math.PI +
                      360) %
                      360,
                  )}
                  °
                </small>
              )}
            </div>
          </div>
          <div className="tw-hudtools">
            {(
              [
                ["pack", Backpack, "Inventory"],
                ["world", Info, "World info"],
                ["settings", Gear, "Field settings"],
                ["handbook", BookOpen, "Handbook"],
                ...(g.building ? ([["build", Hammer, "Project tools"]] as const) : []),
              ] as const
            ).map(([p, Icon, label]) => (
              <button aria-label={label} title={label} key={p} onClick={() => rt.open(p)}>
                <Icon />
              </button>
            ))}
          </div>
          {rt.hurt && !rt.options.reducedFlashes && <div className="tw-hurt" aria-hidden="true" />}
          {!panel && (
            <div className="tw-aim">
              <i style={{ "--progress": g.progress * 360 + "deg" } as CSSProperties} />
              <span>
                {g.targetCreature
                  ? g.targetCreature.species.replaceAll("_", " ")
                  : g.target
                    ? BLOCKS[g.target.id]?.title
                    : ""}
              </span>
              {g.target &&
                [
                  "workbench",
                  "kiln",
                  "smelter",
                  "stove",
                  "storage_drawer",
                  "camp_cot",
                  "marker_stand",
                  "switch",
                  "sensor",
                  "timer",
                  "relay",
                  "lamp",
                  "sluice",
                  "pump",
                  "recovery_crate",
                ].includes(g.target.id) && <small>E · Interact</small>}
            </div>
          )}
          <div className="tw-vitals">
            <Meter name="Health" n={g.body.health} />
            <Meter name="Stamina" n={g.body.stamina} />
            <Meter name="Warmth" n={g.body.warmth} />
          </div>
          <div className="tw-belt">
            <span>{g.held ? (ITEMS[g.held.id]?.title ?? g.held.id) : "Empty hand"}</span>
            <div>
              {g.inventory.slots.slice(0, 7).map((s, i) => (
                <Slot
                  key={i}
                  n={i}
                  stack={s}
                  selected={g.selected === i}
                  onClick={() => {
                    g.select(i);
                    refresh();
                  }}
                />
              ))}
            </div>
          </div>
          {g.notice && !panel && (
            <div className="tw-feedback" role="status">
              {g.notice}
            </div>
          )}
          {rt.subtitle && !panel && <div className="tw-subtitle">{rt.subtitle}</div>}
          {!rt.controls.captured && !panel && !paused && g.body.health > 0 && (
            <div className="tw-enter">
              <button
                className="tw-primary"
                onClick={(e) =>
                  rt.capture(
                    e.nativeEvent instanceof PointerEvent
                      ? e.nativeEvent.pointerType === "touch"
                      : undefined,
                  )
                }
              >
                Explore world →
              </button>
            </div>
          )}
          {rt.controls.captured && !panel && !paused && (
            <div className="tw-touch">
              <div>
                {touchButton("↑", "forward")}
                {touchButton("←", "left")}
                {touchButton("↓", "back")}
                {touchButton("→", "right")}
              </div>
              <div>
                {touchButton("Jump", "jump")}
                {touchButton("Crouch", "squat")}
                {touchButton("Mine", "mine")}
                <button onClick={() => g.place()}>Place</button>
                <button onClick={() => g.interact()}>Use</button>
                {g.building && <button onClick={() => rt.open("palette")}>Palette</button>}
              </div>
            </div>
          )}
          {panel && !paused && (
            <Panels
              key={panel}
              rt={rt}
              panel={panel}
              close={close}
              leave={leave}
              refresh={refresh}
              prefs={(o) => {
                rt.setOptions(o);
                try {
                  localStorage.setItem("buildblox.controls.1", JSON.stringify(o));
                } catch {
                  /* session settings remain active */
                }
                refresh();
              }}
            />
          )}
          {g.body.health <= 0 && !panel && (
            <div className="tw-overlay">
              <section className="tw-panel">
                <h2>Recover at camp</h2>
                <p>
                  {g.cause} · Your belt and worn equipment travel with you.{" "}
                  {g.crateMarker
                    ? "Recovery crate at " +
                      [g.crateMarker.x, g.crateMarker.y, g.crateMarker.z].join(", ") +
                      "."
                    : "Your pack was empty."}{" "}
                  Return to {g.respawnMarker?.name ?? "origin camp"}.
                </p>
                <button
                  className="tw-primary"
                  onClick={() => {
                    g.respawn();
                    refresh();
                  }}
                >
                  Respawn
                </button>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
