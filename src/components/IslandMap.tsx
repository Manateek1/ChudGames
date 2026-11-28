import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { gameRegistry } from "../games/registry";
import { crossedGate, drive, makeGates, makeRoads, parkOutside, spawnCar, type Car } from "../launcher/islandRoads";
import { startDriveAudio } from "../launcher/driveAudio";
import type { createIslandScene } from "../launcher/islandScene";

const directions = {
  up: { codes: ["ArrowUp", "KeyW"], label: "Accelerate", icon: ArrowUp },
  down: { codes: ["ArrowDown", "KeyS"], label: "Brake or reverse", icon: ArrowDown },
  left: { codes: ["ArrowLeft", "KeyA"], label: "Steer left", icon: ArrowLeft },
  right: { codes: ["ArrowRight", "KeyD"], label: "Steer right", icon: ArrowRight },
};
type Direction = keyof typeof directions;
const controls = Object.entries(directions);
const gates = makeGates(gameRegistry);
const closestRoad = makeRoads(gates);

export function IslandMap({ readCar, parkCar, onLaunch, paused, soundAllowed }: {
  readCar: () => Car; parkCar: (car: Car) => void; onLaunch: (id: string) => void;
  paused: boolean; soundAllowed: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const position = useRef<Car>(spawnCar());
  const keys = useRef(new Set<string>());
  const audio = useRef<ReturnType<typeof startDriveAudio> | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [sound, setSound] = useState(false);
  const [view, setView] = useState<"loading" | "ready" | "unavailable">("loading");
  const [directory, setDirectory] = useState(false);
  const stopped = paused || directory || view !== "ready";
  const canDrive = useEffectEvent(() => !stopped && !document.hidden);
  const closeView = useEffectEvent(() => zoomed);
  const launch = useEffectEvent(onLaunch);

  useEffect(() => {
    if (!sound || !soundAllowed || stopped) return;
    const engine = startDriveAudio();
    audio.current = engine;
    return () => { engine.stop(); audio.current = null; };
  }, [sound, soundAllowed, stopped]);

  useEffect(() => {
    if (stopped) { keys.current.clear(); position.current.speed = 0; }
  }, [stopped]);

  useEffect(() => {
    const host = stage.current!;
    const held = keys.current;
    const car = position.current;
    Object.assign(car, readCar(), { speed: 0 });
    let disposed = false, entering = false, frame = 0;
    let world: ReturnType<typeof createIslandScene> | undefined;
    let previous = performance.now();
    const clear = () => { held.clear(); car.speed = 0; };
    const unavailable = () => {
      clear();
      cancelAnimationFrame(frame);
      setView("unavailable");
    };
    const pressed = (direction: Direction) =>
      held.has(direction) || directions[direction].codes.some(code => held.has(code));

    function keyboard(event: KeyboardEvent) {
      if (event.type === "keyup") { held.delete(event.code); return; }
      if (!canDrive() || entering || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      if (!controls.some(([, control]) => control.codes.includes(event.code))) return;
      event.preventDefault();
      held.add(event.code);
      if (!event.repeat) host.focus({ preventScroll: true });
    }

    function tick(now: number) {
      const dt = Math.min(.05, (now - previous)/1000);
      previous = now;
      const steer = Number(pressed("right")) - Number(pressed("left"));
      if (canDrive()) {
        const { x, z } = car;
        drive(car, Number(pressed("up")) - Number(pressed("down")), steer, dt, closestRoad);
        const gate = crossedGate(x, z, car, gates);
        if (gate) {
          entering = true;
          clear();
          Object.assign(car, parkOutside(gate));
          launch(gate.id);
          return;
        }
        audio.current?.update(car.speed);
      }
      if (!document.hidden) world?.draw(car, steer, pressed("down"), dt, closeView());
      frame = requestAnimationFrame(tick);
    }
    function visibility() {
      clear();
      previous = performance.now();
      if (document.hidden) setSound(false);
    }
    void import("../launcher/islandScene").then(({ createIslandScene }) => {
      if (disposed) return;
      world = createIslandScene(host, gates);
      world.draw(car, 0, false, 0, closeView());
      setView("ready");
      frame = requestAnimationFrame(tick);
    }).catch(() => { if (!disposed) unavailable(); });

    host.addEventListener("webglcontextlost", unavailable, true);
    window.addEventListener("keydown", keyboard);
    window.addEventListener("keyup", keyboard);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clear();
      parkCar(car);
      host.removeEventListener("webglcontextlost", unavailable, true);
      world?.dispose();
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("keyup", keyboard);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [readCar, parkCar]);

  return <section className="island-view" aria-label="Drive the island">
    <div className="island-scene">
      <div className="island-stage" ref={stage} tabIndex={0} role="region"
        aria-label="3D island roads. Drive with WASD or arrow keys. Cross a game's gate to play." />
      <div className="island-hud">
        <p>{view === "loading" ? "Loading island…" : view === "unavailable" ? "3D view unavailable. Choose a game below." : "Drive through a gate to play"}</p>
        {view !== "unavailable" && <button type="button" aria-expanded={directory} onClick={() => setDirectory(open => !open)}>Destinations</button>}
      </div>
      {(directory || view === "unavailable") && <nav className="island-directory" aria-label="Island destinations">
        {gates.map(gate => <button key={gate.id} type="button" onClick={() => onLaunch(gate.id)}>
          <span style={{ background: gate.color }} />{gate.title}<ArrowRight />
        </button>)}
      </nav>}
    </div>
    <div className="map-dashboard">
      <span className="key-hint"><kbd>W A S D</kbd> or <kbd>↑ ↓ ← →</kbd> Drive</span>
      <div className="drive-pad" role="group" aria-label="Driving controls">
        {(["left", "right", "down", "up"] as const).map(direction => {
          const { icon: Icon, label } = directions[direction];
          return <button key={direction} type="button" aria-label={label} disabled={stopped}
            onPointerDown={event => {
              event.currentTarget.setPointerCapture(event.pointerId);
              keys.current.add(direction);
            }}
            onLostPointerCapture={() => keys.current.delete(direction)}
            onPointerUp={() => keys.current.delete(direction)}
            onPointerCancel={() => keys.current.delete(direction)}><Icon /></button>;
        })}
      </div>
      <div className="drive-settings">
        <button type="button" disabled={view !== "ready"} aria-pressed={zoomed} onClick={() => setZoomed(on => !on)}>
          {zoomed ? "Zoom out" : "Zoom in"}
        </button>
        <button type="button" disabled={!soundAllowed || view !== "ready"} aria-pressed={sound && soundAllowed} onClick={() => setSound(on => !on)}>
          {sound && soundAllowed ? <SpeakerHigh /> : <SpeakerSlash />} Sound {sound && soundAllowed ? "on" : "off"}
        </button>
        <button type="button" disabled={view !== "ready"} onClick={() => {
          Object.assign(position.current, spawnCar()); keys.current.clear(); setDirectory(false);
          stage.current?.focus({ preventScroll: true });
        }}><ArrowCounterClockwise /> Reset car</button>
      </div>
    </div>
  </section>;
}
