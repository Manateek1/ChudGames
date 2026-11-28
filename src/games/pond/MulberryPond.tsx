import { useEffect, useState } from "react";
import {
  Barn,
  Basket,
  Bird,
  BookOpen,
  Check,
  Coins,
  Drop,
  Fan,
  Fish,
  FishSimple,
  Leaf,
  LockSimple,
  Plant,
  Tree,
  Waves,
} from "@phosphor-icons/react";
import type { GameComponentProps } from "../../types/arcade";
import {
  clarity,
  fairReady,
  harvestValue,
  MAX_LEVEL,
  orderSize,
  price,
  saleRate,
  stations,
  unlocked,
  type Action,
  type Manure,
} from "./farm";
import { useFarm } from "./useFarm";
import { PondView } from "./PondView";
import "./pond.css";

const icons = [Leaf, FishSimple, Fish, Waves, Bird, Basket, Fan, Tree];
const labels = ["Grass", "Silver", "Bighead", "Common", "Ducks", "Nursery", "Wheel", "Dike"];
const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
export default function MulberryPond({
  paused,
  settings,
  onFps,
  onScore,
  onGameOver,
  audio,
}: GameComponentProps) {
  const { farm: f, away, status, send } = useFarm(paused);
  const [panel, setPanel] = useState<"build" | "care">("build");
  const [notice, setNotice] = useState("");
  const [reading, setReading] = useState<number | null>(null);
  const [seenAway, setSeenAway] = useState(false);
  const owned = stations.filter((s) => f.levels[s.id] > 0).length;
  const [selection, setSelection] = useState<number | null>(null);
  const index = selection ?? Math.min(owned, stations.length - 1),
    station = stations[index],
    level = f.levels[station.id];
  const Icon = icons[index],
    cost = price(f, index);
  const busy = paused || (status !== "ready" && status !== "temporary");
  useEffect(() => {
    onScore(Math.floor(f.sales));
  }, [f.sales, onScore]);
  function perform(a: Action, message: string) {
    if (busy) return;
    const next = send(a);
    if (!next) return;
    void audio.unlock();
    audio.ui();
    setNotice(message);
    if (a.type === "buy" && !level) setSelection(null);
    if (a.type === "fair")
      onGameOver({ won: true, score: Math.floor(f.sales), stats: { run: Math.floor(f.time) } });
  }
  const feed = () => perform({ type: "feed" }, "Fresh grass scattered. Fish sales boosted for 12 seconds.");
  const message =
    status === "visitor"
      ? "Your farm is open in another tab. Close it to play here."
      : status === "temporary"
        ? "Storage is unavailable. This farm lasts for this visit."
        : !seenAway && away > 0
          ? `Your farm earned ${fmt(away)} coins while you were away.`
          : notice;
  return (
    <section className="mulberry" aria-label="Mulberry Pond farm" inert={paused}>
      <header className="pond-head">
        <div className="pond-title">
          <div className="pond-seal">
            <Plant weight="fill" />
          </div>
          <div>
            <small>Season {String(f.seasons + 1).padStart(2, "0")}</small>
            <h2>Mulberry Pond</h2>
          </div>
        </div>
        <div className="pond-wallet">
          <Coins weight="duotone" />
          <div>
            <small>Farm coins</small>
            <strong>{fmt(f.coins)}</strong>
          </div>
          <span>+{saleRate(f).toFixed(1)}/s</span>
        </div>
      </header>
      <div className="pond-body">
        <div className="pond-main">
          <PondView farm={f} paused={paused} settings={settings} onFeed={feed} onFps={onFps} />
          <div className="pond-dock">
            <button disabled={busy || f.fed > 0} onClick={feed}>
              <Leaf weight="duotone" />
              <span>
                {f.fed ? `Feeding · ${f.fed}s` : "Scatter grass"}
                <small>Boost fish sales</small>
              </span>
            </button>
            <button
              disabled={busy || harvestValue(f) < 1}
              onClick={() =>
                perform({ type: "ship" }, `Market crate shipped for ${fmt(harvestValue(f))} coins.`)
              }
            >
              <Basket weight="duotone" />
              <span>
                Ship crate
                <small>
                  {fmt(harvestValue(f))} coins ·{" "}
                  {f.harvest >= orderSize(f) ? "Order filled" : `Fill to ${orderSize(f)} for bonus`}
                </small>
              </span>
            </button>
          </div>
        </div>
        <aside className="pond-ledger">
          <div className="pond-tabs" role="group" aria-label="Farm management">
            <button aria-pressed={panel === "build"} onClick={() => setPanel("build")}>
              <Barn />
              Build
            </button>
            <button aria-pressed={panel === "care"} onClick={() => setPanel("care")}>
              <Drop />
              Pond care
            </button>
          </div>
          {panel === "build" ? (
            <>
              <div className="pond-section-title">
                <h3>Farm ledger</h3>
                <span>
                  {owned} / {stations.length}
                </span>
              </div>
              <div className="pond-stations" role="group" aria-label="Farm stations">
                {stations.map((s, i) => {
                  const Mark = icons[i],
                    available = unlocked(f, i);
                  return (
                    <button
                      key={s.id}
                      aria-label={s.name}
                      aria-pressed={index === i}
                      onClick={() => setSelection(i)}
                      className={!available ? "pond-locked" : ""}
                      title={s.name}
                    >
                      <Mark weight="duotone" />
                      <b>{labels[i]}</b>
                      <small>
                        {f.levels[s.id] ? `Lv ${f.levels[s.id]}` : available ? "Open" : <LockSimple />}
                      </small>
                    </button>
                  );
                })}
              </div>
              <div className="pond-entry">
                <div className="pond-entry-icon">
                  <Icon weight="duotone" />
                </div>
                <small>{level ? `Level ${level} of ${MAX_LEVEL}` : "New station"}</small>
                <h4>{station.name}</h4>
                <p>{station.detail}</p>
                <button
                  className="pond-primary"
                  disabled={busy || !unlocked(f, index) || level >= MAX_LEVEL || f.coins < cost}
                  onClick={() =>
                    perform({ type: "buy", index }, `${station.name} reached level ${level + 1}.`)
                  }
                >
                  {!unlocked(f, index) ? (
                    `Requires ${stations[index - 1].name}`
                  ) : level >= MAX_LEVEL ? (
                    "Fully upgraded"
                  ) : (
                    <>
                      {level ? "Upgrade" : index < 4 ? "Stock" : "Build"}
                      <span>
                        <Coins />
                        {fmt(cost)}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="pond-section-title">
                <h3>Pond care</h3>
                <BookOpen />
              </div>
              <div className="pond-meter">
                <span>
                  Oxygen <b>{Math.round(f.oxygen)}%</b>
                </span>
                <progress max={100} value={f.oxygen} />
              </div>
              <p className="pond-hint">
                {f.oxygen < 50
                  ? "Low oxygen is slowing fish sales. A paddle wheel protects the pond at night."
                  : "Oxygen falls overnight. Cloudy days make the next dawn harder."}
              </p>
              <button
                className="pond-line"
                disabled={busy}
                onClick={() => {
                  setReading(clarity(f));
                  audio.ui();
                }}
              >
                Lower white disc <Drop />
              </button>
              {reading !== null && (
                <p className="pond-hint" role="status">
                  Last reading {reading} in.{" "}
                  {reading < 12
                    ? "Too green. Reduce manure."
                    : reading > 18
                      ? "Too clear. Add nutrients."
                      : "In the 12–18 inch target."}
                </p>
              )}
              {f.levels.ducks > 0 && (
                <label className="pond-setting">
                  Duck manure
                  <select
                    disabled={busy}
                    value={f.manure}
                    onChange={(e) =>
                      perform(
                        { type: "manure", value: Number(e.target.value) as Manure },
                        "Duck manure adjusted.",
                      )
                    }
                  >
                    <option value={0}>Hold back</option>
                    <option value={1}>Standard</option>
                    <option value={2}>Enrich</option>
                  </select>
                </label>
              )}
              <button
                className="pond-line"
                disabled={busy || f.silt < 20}
                onClick={() => perform({ type: "dredge" }, "Silt moved to the banks for mulberry compost.")}
              >
                Dredge silt <span>{Math.floor(f.silt)}%</span>
              </button>
              <p className="pond-hint">Dredge at 20% silt. Bank compost {Math.floor(f.compost)}%.</p>
            </>
          )}
        </aside>
      </div>
      <footer className="pond-footer">
        <div>
          <Plant weight="duotone" />
          <span>
            {owned < 8 ? `Next expansion · ${stations[owned].name}` : "Harvest fair"}
            <small>
              {owned < 8
                ? "Connect all eight stations to enter the harvest fair."
                : `Silk ${Math.min(40, Math.floor(f.silk))}/40 · Coins ${fmt(Math.min(3000, f.coins))}/3,000 · Dredge silt to feed the trees.`}
            </small>
          </span>
        </div>
        {owned === 8 && (
          <button
            disabled={busy || !fairReady(f)}
            className="pond-primary"
            onClick={() => perform({ type: "fair" }, "Fresh season started.")}
          >
            Enter fair · Start next season (+20%)
          </button>
        )}
      </footer>
      {message && (
        <div className="pond-notice" role="status">
          <Check />
          {message}
          {away > 0 && !seenAway && <button onClick={() => setSeenAway(true)}>Dismiss</button>}
        </div>
      )}
    </section>
  );
}
