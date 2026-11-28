import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Books, GlobeHemisphereWest, Plus } from "@phosphor-icons/react";
import type { GameComponentProps } from "../types/arcade";
import { legacyWorldKeys } from "./buildblox/storage";
import { bindMenuGamepad } from "./tideworld/menuGamepad";
import { Handbook } from "./tideworld/Handbook";
import { listLocalWorlds, loadLocalWorld, type LocalWorldInfo, type Mode } from "./tideworld/session";
import { parseSeed, type ExpeditionStart, type ExpeditionSave } from "./tideworld/expeditionData";
import "./tideworld/tideworld.css";

const Play = lazy(() => import("./tideworld/Play"));
const Legacy = lazy(() =>
  import("./buildblox/LegacyBuildBlox").then((m) => ({ default: m.LegacyBuildBlox })),
);
type Screen = "home" | "new" | "load" | "book";

export function BuildBlox(props: GameComponentProps) {
  const [screen, screenTo] = useState<Screen>("home"),
    [start, enter] = useState<ExpeditionStart | null>(null);
  const [legacy, setLegacy] = useState(""),
    [legacyKeys, setLegacyKeys] = useState<string[]>([]);
  const [locals, setLocals] = useState<LocalWorldInfo[]>([]);
  const [name, setName] = useState(""),
    [seed, setSeed] = useState(""),
    [mode, setMode] = useState<Mode>(props.mode === "building" ? "building" : "survival");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true),
    lock = useRef(false);
  useEffect(bindMenuGamepad, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (start || legacy) return;
    let cancelled = false;
    Promise.all([listLocalWorlds(), legacyWorldKeys()])
      .then(([w, k]) => {
        if (!cancelled) {
          setLocals(w);
          setLegacyKeys(k);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [start, legacy, screen]);
  const go = (s: Screen) => {
    setError("");
    screenTo(s);
  };
  const load = async (fn: () => Promise<ExpeditionStart>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await fn();
      if (alive.current) {
        enter(next);
        void props.audio.unlock();
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const create = () =>
    void load(async () => {
      const s = parseSeed(seed),
        n = name.trim() || "Tidewater camp";
      return { info: { id: crypto.randomUUID(), name: n, seed: s, mode } };
    });
  const leave = () => {
    enter(null);
    setLegacy("");
    go("home");
  };
  if (legacy) {
    const i = legacy.indexOf(":");
    return (
      <Suspense fallback={<p>Opening legacy world…</p>}>
        <Legacy
          {...props}
          mode={legacy.slice(0, i)}
          initialSeed={legacy.slice(i + 1)}
          onReturn={leave}
        />
      </Suspense>
    );
  }
  if (start)
    return (
      <Suspense
        fallback={
          <div className="tw tw-loading" role="status">
            Loading the expedition…
          </div>
        }
      >
        <Play {...props} start={start} leave={leave} />
      </Suspense>
    );
  return (
    <section className={"tw tw-title tw-" + screen} aria-label="BuildBlox world selection">
      <div className="tw-title-art" aria-hidden="true" />
      <div className="tw-title-inner">
        {screen === "home" ? (
          <div className="tw-title-menu">
            <h1>
              Build<span>Blox</span>
            </h1>
            <p className="tw-intro">Build a workshop on the tide. Explore the world beneath it.</p>
            <button className="tw-primary" onClick={() => go("new")}>
              <Plus /> New world <ArrowRight />
            </button>
            <button onClick={() => go("load")}>
              <GlobeHemisphereWest /> Saved worlds <ArrowRight />
            </button>
            <button onClick={() => go("book")}>
              <Books /> Player handbook <ArrowRight />
            </button>
          </div>
        ) : (
          <div className={"tw-sheet " + (screen === "book" ? "tw-wide" : "")}>
            <button className="tw-back" disabled={busy} onClick={() => go("home")}>
              <ArrowLeft /> Worlds
            </button>
            <h2>{{ new: "New world", load: "Saved worlds", book: "Player handbook" }[screen]}</h2>
            {screen === "new" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  create();
                }}
              >
                <div className="tw-fields">
                  <label>
                    World name
                    <input
                      value={name}
                      maxLength={48}
                      placeholder="Tidewater camp"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    Seed <small>optional</small>
                    <input
                      inputMode="numeric"
                      value={seed}
                      maxLength={20}
                      placeholder="Random 64-bit seed"
                      onChange={(e) => setSeed(e.target.value)}
                    />
                  </label>
                </div>
                <fieldset>
                  <legend>World mode</legend>
                  <div className="tw-modes">
                    {(["survival", "building"] as const).map((m) => (
                      <button type="button" aria-pressed={mode === m} key={m} onClick={() => setMode(m)}>
                        <strong>{m === "survival" ? "Survival" : "Building"}</strong>
                        <span>
                          {m === "survival"
                            ? "Gather, craft and keep warm."
                            : "Fly and build with every material."}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button className="tw-primary" disabled={busy}>
                  {busy ? "Opening world…" : "Create world"} <ArrowRight />
                </button>
              </form>
            )}
            {screen === "load" && (
              <div className="tw-list">
                {!locals.length && !legacyKeys.length && (
                  <>
                    <p>No saved worlds on this device yet.</p>
                    <button onClick={() => go("new")}>
                      Create a world <Plus />
                    </button>
                  </>
                )}
                {locals.map((w) => (
                  <button
                    disabled={busy}
                    key={w.id}
                    onClick={() =>
                      void load(async () => {
                        const s = await loadLocalWorld<ExpeditionSave>(w.id);
                        if (!s) throw Error("World save is missing.");
                        return { info: s.info, saved: s.data, recovered: s.recovered };
                      })
                    }
                  >
                    <span>
                      {w.name}
                      <small>
                        {w.mode} · Seed {w.seed}
                      </small>
                    </span>
                    <ArrowRight />
                  </button>
                ))}
                {legacyKeys.map((k) => (
                  <button key={k} onClick={() => setLegacy(k)}>
                    <span>
                      {k.slice(k.indexOf(":") + 1)}
                      <small>Legacy world · {k.split(":")[0]}</small>
                    </span>
                    <ArrowRight />
                  </button>
                ))}
              </div>
            )}
            {screen === "book" && <Handbook />}
            {error && (
              <p role="alert" className="tw-error">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
