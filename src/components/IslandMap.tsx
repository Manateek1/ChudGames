import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CaretRight, Play, SpeakerHigh, SpeakerSlash, X } from "@phosphor-icons/react";
import { gameMap, gameRegistry } from "../games/registry";
import { coverFor, featuredIds } from "../launcher/catalog";
import { gameUrl } from "../launcher/navigation";
import { drive, landmarks, spawnCar, stopAt, type Car, type StopId } from "../launcher/islandRoads";
import { startDriveAudio } from "../launcher/driveAudio";
import { GameThumbnail } from "./GameThumbnail";

const directions = {
  up: { codes: ["ArrowUp", "KeyW"], label: "Accelerate", icon: ArrowUp },
  down: { codes: ["ArrowDown", "KeyS"], label: "Brake or reverse", icon: ArrowDown },
  left: { codes: ["ArrowLeft", "KeyA"], label: "Steer left", icon: ArrowLeft },
  right: { codes: ["ArrowRight", "KeyD"], label: "Steer right", icon: ArrowRight },
};
type Direction = keyof typeof directions;
const directionFor = (code: string) => Object.entries(directions).find(([, item]) => item.codes.includes(code))?.[0];
const arcadeGames = gameRegistry.filter(game => !featuredIds.includes(game.id));

export function IslandMap({ readCar, parkCar, paused, soundAllowed, reducedMotion }: {
  readCar: () => Car; parkCar: (car: Car) => void; paused: boolean; soundAllowed: boolean; reducedMotion: boolean;
}) {
  const sprite = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const firstArcadeLink = useRef<HTMLAnchorElement>(null);
  const position = useRef<Car>(spawnCar());
  const keys = useRef(new Set<string>());
  const audio = useRef<ReturnType<typeof startDriveAudio> | null>(null);
  const [nearby, setNearby] = useState<StopId | null>(null);
  const [selection, select] = useState<StopId | null | undefined>(undefined);
  const [sound, setSound] = useState(false);
  const active = selection === undefined ? nearby : selection;
  const game = active ? gameMap.get(active) : undefined;

  const interact = useEffectEvent(() => {
    if (game && game.isAvailable !== false) window.location.hash = gameUrl("map", game.id);
    else if (active === "arcade") firstArcadeLink.current?.focus();
  });

  useEffect(() => {
    if (!sound || !soundAllowed || paused) return;
    const engine = startDriveAudio();
    audio.current = engine;
    return () => {
      engine.stop();
      audio.current = null;
    };
  }, [sound, soundAllowed, paused]);

  useEffect(() => {
    const held = keys.current;
    const car = position.current;
    Object.assign(car, readCar(), { speed: 0 });
    const clear = () => { held.clear(); car.speed = 0; };
    function keyboard(event: KeyboardEvent) {
      if (paused || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      const direction = directionFor(event.code);
      if (direction) {
        event.preventDefault();
        if (event.type === "keyup") held.delete(event.code);
        else {
          held.add(event.code);
          if (!event.repeat) {
            select(undefined);
            stage.current?.focus({ preventScroll: true });
          }
        }
      } else if (event.code === "Enter" && event.type === "keydown" && !event.repeat) {
        if (event.target instanceof Element && event.target.closest("a, button, summary")) return;
        event.preventDefault();
        interact();
      }
    }
    let frame = 0;
    let previous = performance.now();
    let previousStop: StopId | null | undefined;
    let previousX = NaN, previousY = NaN, previousHeading = NaN;
    const pressed = (direction: Direction) =>
      held.has(direction) || directions[direction].codes.some(code => held.has(code));
    function tick(now: number) {
      const dt = Math.min(0.04, (now - previous) / 1000);
      previous = now;
      if (!paused && !document.hidden) {
        drive(car, Number(pressed("up")) - Number(pressed("down")), Number(pressed("right")) - Number(pressed("left")), dt);
        audio.current?.update(car.speed);
      }
      if (sprite.current && (car.x !== previousX || car.y !== previousY || car.heading !== previousHeading)) {
        sprite.current.style.left = `${car.x / 10}%`;
        sprite.current.style.top = `${car.y / 10}%`;
        sprite.current.style.transform = `translate(-50%, -50%) rotate(${car.heading}rad)`;
        previousX = car.x;
        previousY = car.y;
        previousHeading = car.heading;
      }
      const stop = stopAt(car);
      if (stop !== previousStop) { setNearby(stop); previousStop = stop; }
      frame = requestAnimationFrame(tick);
    }
    function visibility() {
      if (document.hidden) { clear(); setSound(false); }
    }
    frame = requestAnimationFrame(tick);
    window.addEventListener("keydown", keyboard);
    window.addEventListener("keyup", keyboard);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      clear();
      parkCar(car);
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("keyup", keyboard);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [readCar, parkCar, paused]);

  return <section className="island-view" aria-label="Drive the island">
    <div className="island-scene">
      <div className="island-stage" tabIndex={0} ref={stage} aria-label="Island roads. Drive with WASD or arrow keys. Enter opens a nearby game.">
        <img className="island-art" src="/island/island.webp" alt="An island road winds between a mountain circuit, a coastal fort, a voxel village, and a harbor arcade." draggable={false} />
        <img className="island-car" ref={sprite} src="/island/polestar-5.webp" alt="Silver Polestar 5" draggable={false} />
        {landmarks.map(stop => <button key={stop.id} className="island-pin" type="button"
          aria-label={`Explore ${stop.title}`} aria-pressed={active === stop.id}
          style={{ left: `${stop.point.x / 10}%`, top: `${stop.point.y / 10}%` }}
          onClick={() => { position.current.speed = 0; select(stop.id); stage.current?.focus({ preventScroll: true }); }}>
          {stop.title}
        </button>)}
      </div>
      {active && <aside className="stop-panel" aria-label="Selected destination">
        <button className="panel-close" type="button" aria-label="Close destination" onClick={() => {
          select(null); stage.current?.focus({ preventScroll: true });
        }}><X /></button>
        {game ? <>
          <h2>{game.title}</h2><p>{game.shortDescription}</p>
          <div className="stop-art"><GameThumbnail renderer={coverFor(game)} reducedMotion={reducedMotion} /></div>
          {game.isAvailable === false ? <p>Temporarily unavailable</p> :
            <a className="orange-button" href={gameUrl("map", game.id)} aria-label={`Play ${game.title}`}><Play weight="fill" /> Play</a>}
          {game.isAvailable !== false && <small className="stop-key"><kbd>Enter</kbd> to play</small>}
        </> : <>
          <h2>Harbor arcade</h2>
          <div className="arcade-stops">{arcadeGames.map((item, index) => item.isAvailable !== false &&
            <a key={item.id} ref={index === 0 ? firstArcadeLink : undefined} href={gameUrl("map", item.id)}>{item.title}<CaretRight /></a>)}</div>
        </>}
      </aside>}
    </div>
    <div className="map-dashboard">
      <span className="key-hint"><kbd>W A S D</kbd> or <kbd>↑ ↓ ← →</kbd> Drive</span>
      <div className="drive-pad" role="group" aria-label="Driving controls">
        {(["left", "right", "down", "up"] as const).map(direction => {
          const { icon: Icon, label } = directions[direction];
          return <button key={direction} type="button" aria-label={label}
            onPointerDown={event => {
              event.currentTarget.setPointerCapture(event.pointerId);
              select(undefined); keys.current.add(direction);
            }}
            onLostPointerCapture={() => keys.current.delete(direction)}
            onPointerUp={() => keys.current.delete(direction)}
            onPointerCancel={() => keys.current.delete(direction)}><Icon /></button>;
        })}
      </div>
      <div className="drive-settings">
        <button type="button" disabled={!soundAllowed} title={soundAllowed ? "Toggle spaceship sound" : "Enable sound in Settings"}
          aria-pressed={sound && soundAllowed} onClick={() => setSound(on => !on)}>
          {sound && soundAllowed ? <SpeakerHigh /> : <SpeakerSlash />} Sound {sound && soundAllowed ? "on" : "off"}
        </button>
        <button type="button" onClick={() => {
          Object.assign(position.current, spawnCar()); keys.current.clear(); select(undefined);
          stage.current?.focus({ preventScroll: true });
        }}><ArrowCounterClockwise /> Reset car</button>
      </div>
    </div>
  </section>;
}
