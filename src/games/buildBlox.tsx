import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "../types/arcade";
import { Backpack, Slot } from "./buildblox/Backpack";
import { Block, blockOf, definition, itemInfo } from "./buildblox/blocks";
import type { BuildBloxClient } from "./buildblox/client";
import { realmNames } from "./buildblox/protocol";
import type { HudState, Mode } from "./buildblox/protocol";
import "./buildblox/interface.css";

const defaultSeed = "Juniper Vale";
const modeNames: Record<Mode, string> = { survival: "Survival", creative: "Creative", adventure: "Adventure", hardcore: "Hardcore" };
const modeDescriptions: Record<Mode, string> = {
  survival: "Gather supplies, build a shelter, and keep a light on after dark.",
  creative: "Build with a full materials catalog, instant mining, and flight.",
  adventure: "Explore the generated realms with gathering and building restricted.",
  hardcore: "Survive with one life. A fallen world is locked to that character.",
};
const stationBlocks: ReadonlySet<number> = new Set([Block.Bench, Block.Furnace]);

type SessionProps = Pick<GameComponentProps, "settings" | "paused" | "audio" | "onFps" | "onPauseToggle"> & { seed: string; mode: Mode; leave: () => void };

function Meter({ label, value, kind }: { label: string; value: number; kind: string }): React.JSX.Element {
  const amount = Math.max(0, Math.min(20, value));
  return <div className={"bb-meter bb-meter-" + kind}>
    <span>{label}</span>
    <span className="bb-meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={20} aria-valuenow={Math.round(amount)}>
      <span style={{ width: amount * 5 + "%" }} />
    </span>
    <b>{Math.round(amount)}</b>
  </div>;
}

function Guide({ close }: { close: () => void }): React.JSX.Element {
  return <section className="bb-panel bb-guide" role="dialog" aria-modal="true" aria-label="Field guide">
    <header className="bb-panel-header"><h2>Field guide</h2><button className="bb-secondary" type="button" onClick={close}>Close</button></header>
    <dl>
      <div><dt>Move, jump, sprint</dt><dd>WASD · Space · Shift</dd></div>
      <div><dt>Look, mine, place</dt><dd>Mouse · Left click · Right click</dd></div>
      <div><dt>Use, eat, backpack</dt><dd>F · Q · E</dd></div>
      <div><dt>Select a hotbar slot</dt><dd>1–9 or scroll</dd></div>
      <div><dt>Creative flight</dt><dd>G · Space up · Ctrl down</dd></div>
      <div><dt>Pause</dt><dd>P or Esc</dd></div>
    </dl>
    <p>Mine timber to craft boards and a starting pick. Use a workbench for advanced recipes and gates. A Rift Gate leads to Underdeep. A Sky Gate leads to Skyreach.</p>
  </section>;
}

function Session({ seed, mode, settings, paused, audio, onFps, onPauseToggle, leave }: SessionProps): React.JSX.Element {
  const mount = useRef<HTMLDivElement>(null);
  const client = useRef<BuildBloxClient | null>(null);
  const [state, setState] = useState<HudState | null>(null);
  const [panel, setPanel] = useState<"pack" | "guide" | null>(null);
  const [active, setActive] = useState(false);
  const [saved, setSaved] = useState<boolean>();
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const world = useRef({ quality: settings.graphicsQuality, paused });
  const wasStable = useRef<HudState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("./buildblox/client").then(({ BuildBloxClient }) => {
      if (cancelled || !mount.current) return;
      const runtime = new BuildBloxClient(mount.current, seed, mode, world.current.quality, {
        onState: (next) => {
          const last = wasStable.current;
          if (last) {
            if (next.health < last.health) audio.hit();
            else if (next.xp > last.xp) audio.power();
          }
          wasStable.current = next;
          setState(next);
        },
        onError: setError,
        onFps,
        onSave: setSaved,
        onInventory: () => setPanel((value) => value === "pack" ? null : "pack"),
        onInteract: (next) => {
          if (stationBlocks.has(blockOf(next.targetCode)) || next.station === "trader" && !next.target) setPanel("pack");
        },
        onCapture: setActive,
      });
      client.current = runtime;
      runtime.setPaused(world.current.paused);
    }).catch(() => {
      if (!cancelled) setError("BuildBlox could not start its 3D renderer. Check that WebGL is enabled in your browser.");
    });
    return () => {
      cancelled = true;
      client.current?.dispose();
      client.current = null;
      wasStable.current = null;
    };
  }, [seed, mode, onFps, audio]);

  useEffect(() => {
    world.current.quality = settings.graphicsQuality;
    client.current?.setQuality(settings.graphicsQuality);
  }, [settings.graphicsQuality]);
  useEffect(() => {
    world.current.paused = paused;
    client.current?.setPaused(paused);
  }, [paused]);
  useEffect(() => {
    client.current?.setBlocked(Boolean(panel) || Boolean(error));
  }, [panel, error]);

  const leaveWorld = (): void => {
    if (!client.current) return leave();
    setLeaving(true);
    void client.current.save().finally(leave);
  };

  const useTarget = (): void => {
    client.current?.action("interact");
    if (state && (stationBlocks.has(blockOf(state.targetCode)) || state.station === "trader" && !state.target)) setPanel("pack");
  };
  const capture = (): void => {
    void audio.unlock();
    client.current?.capture();
  };
  const held = state?.inventory[state.selected];
  const target = state && state.target ? definition(state.targetCode).name : null;

  return <div className="buildblox bb-session">
    <div className="bb-world" ref={mount} />
    {!state && !error && <div className="bb-cover">
      <div className="bb-loading" role="status"><span className="bb-loading-dot" /><strong>Generating terrain</strong><span>{seed}</span></div>
    </div>}
    {state && <>
      <header className="bb-hud-top">
        <div className="bb-location">
          <p className="bb-kicker">{modeNames[mode]}{state.flying ? " · Flying" : ""}</p>
          <h2>{realmNames[state.realm]}</h2>
          <p>{state.biome} <span aria-hidden="true">·</span> Day {1 + Math.floor(state.tick / 24000)}</p>
        </div>
        <div className="bb-status">
          <div className="bb-hud-actions">
            <button type="button" onClick={() => setPanel("guide")}>Guide</button>
            <button type="button" onClick={() => setPanel("pack")}>Backpack <kbd>E</kbd></button>
            <button type="button" onClick={onPauseToggle} aria-label="Pause BuildBlox">Ⅱ</button>
          </div>
        </div>
      </header>
      <div className="bb-crosshair" aria-hidden="true">
        <span />
        {target && active && !panel && <div className="bb-target">
          {target}
          {state.mining > 0 && <progress max={1} value={state.mining} />}
        </div>}
      </div>
      <footer className="bb-hud-bottom">
        {state.notice && !panel && <div className="bb-toast" role="status">{state.notice}</div>}
        <span className="bb-held-name">{held ? itemInfo(held.id).name : "Empty hand"}</span>
        {mode !== "creative" && <div className="bb-vitals">
          <Meter label="Health" value={state.health} kind="health" />
          <span className="bb-xp" aria-label={state.xp + " experience points"}>{state.xp} XP</span>
          <Meter label="Food" value={state.hunger} kind="food" />
        </div>}
        <div className="bb-hotbar" aria-label="Hotbar">
          {Array.from({ length: 9 }, (_, index) => <Slot key={index} stack={state.inventory[index]} number={index + 1}
            selected={state.selected === index} onClick={() => client.current?.send({ type: "select", slot: index })} />)}
        </div>
        <div className="bb-save-line">
          <span>{saved === true ? "Saved on this device" : saved === false ? "Local save unavailable" : seed}</span>
          <button type="button" onClick={leaveWorld} disabled={leaving}>{leaving ? "Saving…" : "Change world"}</button>
        </div>
      </footer>
      {active && !panel && !paused && !state.dead && <div className="bb-touch" aria-label="Touch controls">
        <div className="bb-dpad">
          {([["KeyW", "↑"], ["KeyA", "←"], ["KeyS", "↓"], ["KeyD", "→"]] as const).map(([code, label]) =>
            <button type="button" key={code} aria-label={"Move " + label}
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); client.current?.key(code, true); }}
              onLostPointerCapture={() => client.current?.key(code, false)}>{label}</button>)}
        </div>
        <div className="bb-touch-actions">
          <button type="button" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); client.current?.mine(true); }}
            onLostPointerCapture={() => client.current?.mine(false)}>Mine</button>
          <button type="button" onClick={() => client.current?.action("place")}>Place</button>
          <button type="button" onClick={useTarget}>Use</button>
          <button type="button" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); client.current?.key("Space", true); }}
            onLostPointerCapture={() => client.current?.key("Space", false)}>Jump</button>
          <button type="button" onClick={() => client.current?.action(mode === "creative" ? "flight" : "eat")}>{mode === "creative" ? "Fly" : "Eat"}</button>
          {mode === "creative" && <button type="button" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); client.current?.key("ControlLeft", true); }}
            onLostPointerCapture={() => client.current?.key("ControlLeft", false)}>Down</button>}
        </div>
      </div>}
      {!active && !panel && !paused && !state.dead && !error && <div className="bb-entry">
        <button type="button" className="bb-primary" onClick={capture}>Explore world <span aria-hidden="true">↗</span></button>
        <span className="bb-desktop-hint">WASD to move · Mouse to look</span>
        <span className="bb-touch-hint">Drag the world to look around</span>
      </div>}
      {panel && !paused && !state.dead && !error && <div className="bb-dialog-layer">
        {panel === "pack" ? <Backpack state={state} mode={mode} send={(message) => client.current?.send(message)} close={() => setPanel(null)} /> :
          <Guide close={() => setPanel(null)} />}
      </div>}
      {state.dead && <div className="bb-dialog-layer"><section className="bb-panel bb-message">
        <p className="bb-kicker">{modeNames[mode]}</p>
        <h2>{mode === "hardcore" ? "Your trail ended" : "You fell"}</h2>
        <p>{mode === "hardcore" ? "This character’s world is closed. Start again with a different seed." : "Return to the trailhead and keep exploring."}</p>
        {mode !== "hardcore" && <button type="button" className="bb-primary" onClick={() => client.current?.action("respawn")}>Respawn</button>}
        <button type="button" className="bb-secondary" onClick={leaveWorld} disabled={leaving}>Change world</button>
      </section></div>}
    </>}
    {error && <div className="bb-dialog-layer"><section className="bb-panel bb-message" role="alert">
      <h2>World unavailable</h2><p>{error}</p><button className="bb-secondary" type="button" onClick={leave}>Return to worlds</button>
    </section></div>}
  </div>;
}

export function BuildBlox({ mode: selectedMode, ...props }: GameComponentProps): React.JSX.Element {
  const mode = Object.hasOwn(modeNames, selectedMode) ? selectedMode as Mode : "survival";
  const [draft, setDraft] = useState(defaultSeed);
  const [seed, setSeed] = useState<string | null>(null);
  if (seed) return <Session {...props} seed={seed} mode={mode} leave={() => setSeed(null)} />;
  return <div className="buildblox bb-launch">
    <div className="bb-launch-landscape" />
    <div className="bb-launch-content">
      <p className="bb-kicker">{modeNames[mode]}</p>
      <h1>Build<span>Blox</span></h1>
      <p className="bb-launch-description">{modeDescriptions[mode]}</p>
      <form onSubmit={(event) => { event.preventDefault(); void props.audio.unlock(); setSeed(draft.trim() || defaultSeed); }}>
        <label htmlFor="bb-seed">World seed</label>
        <div className="bb-seed-row">
          <input id="bb-seed" value={draft} maxLength={64} onChange={(event) => setDraft(event.target.value)} />
          <button className="bb-primary" type="submit">Enter world <span aria-hidden="true">↗</span></button>
        </div>
        <p className="bb-muted">Reenter the same seed and mode to resume your local save.</p>
        <p className="bb-muted">Independent voxel graphics demo. Unaffiliated with Minecraft or Mojang.</p>
      </form>
    </div>
  </div>;
}
