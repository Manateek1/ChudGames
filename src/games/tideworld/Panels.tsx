import { useState } from "react";
import {
  ITEMS,
  RECIPES,
  cancelJob,
  collectStation,
  fuelStation,
  loadStationInput,
  withdrawStationSlot,
  queueJob,
  type Processor,
  type Stack,
} from "./systems";
import { Survey } from "./Survey";
import { Handbook } from "./Handbook";
import { itemArt } from "./itemArt";
import { cellKey } from "./expeditionData";
import type { Runtime } from "./runtime";
import { defaultKeys, type Action, type Options } from "./controls";
import type { Panel } from "./expedition";

export function Item({ id }: { id: string }) {
  return <img className="tw-item" src={itemArt(id)} alt="" draggable={false} />;
}
export function Slot({
  stack,
  n,
  selected,
  onClick,
  label,
  onShift,
}: {
  stack: Stack | null;
  n?: number;
  selected?: boolean;
  onClick: () => void;
  label?: string;
  onShift?: () => void;
}) {
  const title = stack ? (ITEMS[stack.id]?.title ?? stack.id) : "Empty";
  return (
    <button
      type="button"
      className={"tw-slot" + (selected ? " tw-selected" : "")}
      aria-label={(label ?? (n !== undefined ? "Belt " + (n + 1) : "Slot")) + " · " + title}
      title={title + (stack?.durability ? " · " + stack.durability + " durability" : "")}
      onClick={(e) => (e.shiftKey && onShift ? onShift() : onClick())}
    >
      {n !== undefined && <small>{n + 1}</small>}
      {stack && (
        <>
          <Item id={stack.id} />
          {stack.count > 1 && <b>{stack.count}</b>}
          {stack.durability !== undefined && (
            <i
              style={{
                width:
                  (stack.durability / (ITEMS[stack.id]?.durability ?? stack.durability)) * 100 + "%",
              }}
            />
          )}
        </>
      )}
    </button>
  );
}
const titles: Record<Panel, string> = {
  rest: "Rest at camp",
  pack: "Field pack",
  palette: "Build palette",
  station: "Workshop",
  drawer: "Storage",
  inspector: "Cell inspector",
  marker: "Survey marker",
  settings: "Field settings",
  handbook: "Player handbook",
  world: "World information",
  build: "Project tools",
};

export function Panels({
  rt,
  panel,
  refresh,
  close,
  leave,
  prefs,
}: {
  rt: Runtime;
  panel: Panel;
  refresh: () => void;
  close: () => void;
  leave: () => void;
  prefs: (o: Options) => void;
}) {
  const g = rt.game,
    inv = g.inventory,
    anchor = g.anchor,
    block = anchor ? g.world.get(anchor.x, anchor.y, anchor.z) : "air";
  const [from, pick] = useState<number | null>(null),
    [half, split] = useState(false),
    [find, search] = useState(""),
    [group, filter] = useState("Structure");
  const registered = anchor && g.markers.find((m) => cellKey(m) === cellKey(anchor));
  const [color, setColor] = useState(registered?.color ?? "#76d2bb"),
    [visible, setVisible] = useState(registered?.visible ?? true);
  const [marker, setMarker] = useState(registered?.name ?? ""),
    [busy, setBusy] = useState(false),
    [remap, bind] = useState<Action | null>(null);
  const act = (fn: () => void) => {
    fn();
    refresh();
  };
  const move = (a: number, b: number, n?: number) => {
    inv.move(a, b, n);
  };
  const slotAction = (i: number) => {
    if (from === null) {
      if (inv.slots[i]) pick(i);
      return;
    }
    if (from !== i)
      move(from, i, half ? Math.max(1, Math.floor((inv.slots[from]?.count ?? 1) / 2)) : undefined);
    pick(null);
    refresh();
  };
  const processor =
    ["kiln", "smelter", "stove"].includes(block) && panel === "station" ? (block as Processor) : null;
  const station = processor && anchor ? g.ecology.station(anchor, processor) : null;
  const atStation = (action: "queue" | "fuel" | "collect" | "cancel", value?: string | number) => {
    if (!station || !anchor) return;
    const ok =
      action === "queue"
        ? queueJob(station, String(value), inv)
        : action === "fuel"
          ? fuelStation(station, inv, Number(value))
          : action === "cancel"
            ? cancelJob(station, Number(value), inv)
            : collectStation(station, inv);
    g.message(ok ? "Station updated." : "Check the ingredients, fuel and output space.");
    refresh();
  };
  const entryAt = (i: number) => inv.slots[i];
  const stock = (start: number, count: number) =>
    Array.from({ length: count }, (_, j) => {
      const i = start + j;
      return (
        <Slot
          key={i}
          stack={entryAt(i)}
          n={i < 7 ? i : undefined}
          label={i >= 35 ? (i === 35 ? "Clothing" : "Equipment") : undefined}
          selected={from === i}
          onClick={() => slotAction(i)}
          onShift={() => {
            const dest = inv.slots.findIndex((s, k) => !s && (i < 7 ? k >= 7 && k < 35 : k < 7));
            if (dest >= 0) {
              move(i, dest);
              refresh();
            }
          }}
        />
      );
    });
  const opt = rt.options;
  const range = (
    label: string,
    k:
      | "fov"
      | "sensitivity"
      | "uiScale"
      | "brightness"
      | "effects"
      | "ambience"
      | "music"
      | "voice"
      | "interfaceVolume",
    min: number,
    max: number,
    step: number,
  ) => (
    <label className="tw-slider" key={k}>
      {label}
      <output>{opt[k]}</output>
      <input
        aria-label={label}
        type="range"
        value={opt[k]}
        min={min}
        max={max}
        step={step}
        onChange={(e) => prefs({ ...opt, [k]: Number(e.target.value) })}
      />
    </label>
  );
  const paletteGroups = ["Structure", "Landscape", "Devices", "Equipment"];
  const palette = Object.values(ITEMS).filter((item) => {
    const category =
      /^(lamp|switch|wire|relay|timer|sensor|pump|water_wheel|sluice|lift_platform|kiln|smelter|stove|anchor)$/.test(
        item.id,
      )
        ? "Devices"
        : /^(loam|slate|basalt|sand|peat|reed|brush|red_clay|alder_log|pine_log|foliage|kelp|fungus|gravel|snow_crust|salt_crust|ore_|quartz)/.test(
              item.id,
            )
          ? "Landscape"
          : item.group === "Block"
            ? "Structure"
            : "Equipment";
    return (
      !["air", "foundation", "recovery_crate"].includes(item.id) &&
      (find ? item.title.toLowerCase().includes(find.toLowerCase()) : category === group)
    );
  });
  const boat = g.ecology.skiffs.find(
    (b) => Math.hypot(b.x - g.body.x, b.y - g.body.y, b.z - g.body.z) < 3,
  );
  const holder = anchor && g.drawers[cellKey(anchor)];
  const device = anchor && g.ecology.devices.at(anchor);
  const changeDevice = (patch: Parameters<typeof g.ecology.devices.configure>[1]) => {
    if (!anchor) return;
    act(() => {
      if (g.ecology.devices.configure(anchor, patch) && patch.face !== undefined)
        g.world.setFacing(anchor.x, anchor.y, anchor.z, patch.face);
    });
  };
  return (
    <div className="tw-overlay">
      <section
        className={"tw-panel tw-panel-" + panel}
        role="dialog"
        aria-modal="true"
        aria-label={titles[panel]}
      >
        <header>
          <h2>{panel === "station" ? (ITEMS[block]?.title ?? "Workshop") : titles[panel]}</h2>
          <button onClick={close}>Close</button>
        </header>
        {(panel === "pack" || panel === "station" || panel === "drawer") && (
          <div className="tw-workspace">
            <div>
              <h3>Belt</h3>
              <div className="tw-slots">{stock(0, 7)}</div>
              <h3>Pack</h3>
              <div className="tw-slots">{stock(7, 28)}</div>
              <h3>Clothing &amp; equipment</h3>
              <div className="tw-tools">
                {stock(35, 2)}
                <button aria-pressed={half} onClick={() => split(!half)}>
                  Split stack
                </button>
              </div>
              {from !== null && entryAt(from) && (
                <div className="tw-tools">
                  <span>{ITEMS[entryAt(from)!.id]?.title ?? entryAt(from)!.id}</span>
                  <button
                    onClick={() => {
                      inv.equip(from);
                      pick(null);
                      refresh();
                    }}
                  >
                    Equip
                  </button>
                  <button
                    onClick={() => {
                      g.dropSlot(from);
                      pick(null);
                      refresh();
                    }}
                  >
                    Drop one
                  </button>
                </div>
              )}
            </div>
            <div>
              {panel === "pack" && boat && (
                <>
                  <h3>Skiff cargo</h3>
                  <div className="tw-slots">
                    {boat.cargo.map((s, i) => (
                      <Slot
                        key={i}
                        stack={s}
                        onClick={() =>
                          act(() => {
                            g.ecology.transport.cargo(boat.id, inv, g.body, i, true, boat.revision ?? 0);
                          })
                        }
                      />
                    ))}
                  </div>
                  <button
                    disabled={from === null}
                    onClick={() =>
                      act(() => {
                        if (from !== null)
                          g.ecology.transport.cargo(
                            boat.id,
                            inv,
                            g.body,
                            from,
                            false,
                            boat.revision ?? 0,
                          );
                      })
                    }
                  >
                    Stow selected stack
                  </button>
                  <button
                    onClick={() =>
                      act(() =>
                        g.message(
                          g.ecology.transport.recover(g.body, inv, "local") ?? "No nearby skiff.",
                        ),
                      )
                    }
                  >
                    Retrieve skiff
                  </button>
                </>
              )}
              {panel === "drawer" && holder ? (
                <>
                  <h3>Stored items</h3>
                  <div className="tw-slots">
                    {holder.slots.map((stack, i) => (
                      <Slot stack={stack} key={i} onClick={() => act(() => g.transferDrawer(i, true))} />
                    ))}
                  </div>
                  {block === "recovery_crate" ? (
                    <button
                      onClick={() => {
                        holder.slots.forEach((_, i) => g.transferDrawer(i, true));
                        if (!g.drawers[cellKey(anchor!)]) close();
                        else refresh();
                      }}
                    >
                      Recover items
                    </button>
                  ) : (
                    <button
                      disabled={from === null}
                      onClick={() => {
                        if (from !== null) g.transferDrawer(from, false);
                        pick(null);
                        refresh();
                      }}
                    >
                      Store selected stack
                    </button>
                  )}
                </>
              ) : (
                <>
                  <h3>
                    {panel === "pack" ? "Quick Assembly" : station ? "Processing" : "Workbench assembly"}
                  </h3>
                  {station && (
                    <div className="tw-station">
                      <p>
                        Fuel ·{" "}
                        {station.fuel
                          ? station.fuel.count + " " + ITEMS[station.fuel.id].title
                          : "Empty"}{" "}
                        · {station.burn} heat ticks
                      </p>
                      <div className="tw-tools">
                        {station.input.map((s, i) => (
                          <Slot
                            key={i}
                            stack={s}
                            label={"Input " + (i + 1)}
                            onClick={() =>
                              act(() => {
                                withdrawStationSlot(station, inv, i);
                              })
                            }
                          />
                        ))}
                      </div>
                      <div className="tw-tools">
                        <button
                          onClick={() =>
                            act(() => {
                              if (!loadStationInput(station, inv, from ?? g.selected))
                                g.message("Select an ingredient first.");
                            })
                          }
                        >
                          Load ingredient
                        </button>
                        <button
                          disabled={!station.fuel}
                          onClick={() =>
                            act(() => {
                              withdrawStationSlot(station, inv, "fuel");
                            })
                          }
                        >
                          Remove fuel
                        </button>
                      </div>
                      <button onClick={() => atStation("fuel", from ?? g.selected)}>
                        Add selected fuel
                      </button>
                      <button onClick={() => atStation("collect")}>Collect output</button>
                      {station.queue.map((job, i) => (
                        <div key={i}>
                          {ITEMS[job.output.id].title} ·{" "}
                          {job.remaining ? Math.ceil(job.remaining / 30) + "s" : "Waiting for output"}{" "}
                          <button onClick={() => atStation("cancel", i)}>Cancel</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="tw-recipes">
                    {RECIPES.filter((r) => r.station === (panel === "pack" ? "quick" : block)).map(
                      (r) => (
                        <button
                          key={r.id}
                          disabled={!inv.canCraft(r) && !station}
                          onClick={() => {
                            if (station) atStation("queue", r.id);
                            else
                              act(() =>
                                g.message(
                                  inv.craft(r.id, panel === "pack" ? "quick" : "workbench")
                                    ? "Crafted " + ITEMS[r.output.id].title
                                    : "Check the materials and free space.",
                                ),
                              );
                          }}
                        >
                          <Item id={r.output.id} />
                          <span>
                            <strong>
                              {ITEMS[r.output.id].title}
                              {r.output.variant ? " · " + r.output.variant : ""} ×{r.output.count}
                            </strong>
                            <small>
                              {r.ingredients
                                .map(
                                  (q) => q.count + " " + q.ids.map((id) => ITEMS[id].title).join(" / "),
                                )
                                .join(" + ")}
                            </small>
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {panel === "palette" && (
          <>
            <div className="tw-radial" role="group" aria-label="Material categories">
              {paletteGroups.map((v, i) => (
                <button
                  key={v}
                  className={"tw-rad-" + i}
                  aria-pressed={group === v}
                  onClick={() => {
                    filter(v);
                    search("");
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
            <label>
              Find a material
              <input
                value={find}
                onChange={(e) => search(e.target.value)}
                placeholder="Search catalog"
              />
            </label>
            <div className="tw-materials">
              {palette.map((item) => (
                <button
                  key={item.id}
                  title={item.description}
                  onClick={() => {
                    if (g.building) {
                      g.inventory.grant(g.selected, item.id);
                      g.message(item.title + " selected");
                      close();
                    } else {
                      const i = inv.slots.slice(0, 35).findIndex((s) => s?.id === item.id);
                      if (i < 0) g.message("Collect this material first.");
                      else {
                        if (i < 7) g.select(i);
                        else move(i, g.selected);
                        close();
                      }
                    }
                    refresh();
                  }}
                >
                  <Item id={item.id} />
                  {item.title}
                </button>
              ))}
            </div>
          </>
        )}
        {panel === "build" && (
          <>
            <div className="tw-tools">
              {(["place", "paint", "fill", "replace"] as const).map((t) => (
                <button
                  key={t}
                  aria-pressed={g.tool === t}
                  onClick={() =>
                    act(() => {
                      g.tool = t;
                      g.corner = null;
                      g.preview = null;
                    })
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            {g.tool === "paint" && (
              <label>
                Finish
                <select
                  value={g.paint}
                  onChange={(e) =>
                    act(() => {
                      g.paint = e.target.value;
                    })
                  }
                >
                  {[
                    "cream",
                    "ochre",
                    "copper",
                    "red",
                    "plum",
                    "indigo",
                    "teal",
                    "charcoal",
                    "slate_brick",
                    "basalt_brick",
                    "alder",
                    "pine",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p>
              {g.tool === "place"
                ? "Right click a face to place the selected block."
                : g.tool === "paint"
                  ? "Right click a finished panel, tile or step to paint it."
                  : "Right click two corners to preview the " + g.tool + "."}
            </p>
            {g.preview && (
              <div>
                <p>
                  {cellKey(g.preview.from)} → {cellKey(g.preview.to)} · {g.preview.cells.length} cells
                </p>
                <p>{g.preview.cells.find((c) => c.blocked)?.blocked}</p>
                <button
                  className="tw-primary"
                  disabled={!g.preview.cells.length || g.preview.cells.some((c) => !!c.blocked)}
                  onClick={() => {
                    g.applyFill();
                    close();
                  }}
                >
                  Apply {g.preview.cells.length} cells
                </button>
                <button
                  onClick={() => {
                    g.cancelFill();
                    close();
                  }}
                >
                  Cancel selection
                </button>
              </div>
            )}
          </>
        )}
        {panel === "inspector" && anchor && (
          <>
            <p>
              {block} · {cellKey(anchor)}
            </p>
            <p>
              Facing {["North", "East", "South", "West"][(g.world.facings[cellKey(anchor)] ?? 0) & 3]} ·
              Connections {g.ecology.devices.connectionMask(anchor).toString(2).padStart(4, "0")} · Light{" "}
              {g.ecology.light(g.sys, anchor, g.tick)}/15 · Fluid{" "}
              {g.ecology.fluids.read(g.sys, anchor).level}/8 ·{" "}
              {g.ecology.lit(anchor.x, anchor.y, anchor.z) ? "Emitting light" : "No lamp emission"}
            </p>
            {block === "anchor" && (
              <div className="tw-tools">
                <button
                  onClick={() =>
                    act(() =>
                      g.message(
                        g.ecology.transport.toggleAnchor(anchor, "local") ?? "No skiff within reach.",
                      ),
                    )
                  }
                >
                  Tie or release skiff
                </button>
                <button
                  onClick={() =>
                    act(() =>
                      g.message(g.ecology.transport.detachRope(anchor, inv) ?? "No attached rope."),
                    )
                  }
                >
                  Retrieve rope
                </button>
              </div>
            )}
            {device && (
              <>
                <p>
                  {device.overLimit ? "Wire network exceeds its node budget. " : ""}Signal{" "}
                  {device.high ? "high" : "low"} · Input {device.powered ? "high" : "low"}
                </p>
                <div className="tw-fields">
                  <label>
                    Output face
                    <select
                      value={device.face}
                      onChange={(e) => changeDevice({ face: Number(e.target.value) as 0 | 1 | 2 | 3 })}
                    >
                      {["North", "East", "South", "West"].map((v, i) => (
                        <option key={v} value={i}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Relay delay
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={device.delay}
                      onChange={(e) => changeDevice({ delay: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Timer period
                    <input
                      type="number"
                      min={6}
                      max={300}
                      value={device.period}
                      onChange={(e) => changeDevice({ period: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Sensor threshold
                    <input
                      type="number"
                      min={0}
                      max={15}
                      value={device.threshold}
                      onChange={(e) => changeDevice({ threshold: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Sense
                    <select
                      value={device.sense}
                      onChange={(e) => changeDevice({ sense: e.target.value as typeof device.sense })}
                    >
                      {["depth", "light", "container", "entity"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label className="tw-check">
                    <input
                      type="checkbox"
                      checked={device.invert}
                      onChange={(e) => changeDevice({ invert: e.target.checked })}
                    />{" "}
                    Invert signal
                  </label>
                </div>
              </>
            )}
          </>
        )}
        {panel === "rest" && (
          <>
            <p>Your cot is sheltered.</p>
            <button
              className="tw-primary"
              onClick={() => {
                g.restUntilMorning();
                close();
              }}
            >
              Rest until morning
            </button>
          </>
        )}
        {panel === "marker" && (
          <>
            <label>
              Marker name
              <input
                value={marker}
                maxLength={32}
                placeholder="Camp"
                onChange={(e) => setMarker(e.target.value)}
              />
            </label>
            <label>
              Marker color
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <label className="tw-check">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />{" "}
              Show on compass and map
            </label>
            <button className="tw-primary" onClick={() => act(() => g.register(marker, color, visible))}>
              Set recovery point
            </button>
          </>
        )}
        {panel === "handbook" && <Handbook />}
        {panel === "settings" && (
          <>
            <div className="tw-ranges">
              {range("Horizontal field of view", "fov", 55, 115, 1)}
              {range("Look sensitivity", "sensitivity", 0.25, 3, 0.05)}
              {range("Interface scale", "uiScale", 0.75, 1.4, 0.05)}
              {range("Brightness", "brightness", 0.7, 1.5, 0.05)}
              {range("Effects", "effects", 0, 1, 0.05)}
              {range("Ambience", "ambience", 0, 1, 0.05)}
              {range("Music", "music", 0, 1, 0.05)}
              {range("Interface sounds", "interfaceVolume", 0, 1, 0.05)}
              {range("Voice", "voice", 0, 1, 0.05)}
            </div>
            {(["bob", "subtitles", "reducedFlashes"] as const).map((k, i) => (
              <label className="tw-check" key={k}>
                <input
                  type="checkbox"
                  checked={opt[k]}
                  onChange={(e) => prefs({ ...opt, [k]: e.target.checked })}
                />
                {["Camera bob", "Sound subtitles", "Reduced flashes"][i]}
              </label>
            ))}
            <h3>Keyboard controls</h3>
            <div className="tw-bindings">
              {(Object.keys(defaultKeys) as Action[]).map((a) => (
                <button
                  key={a}
                  onClick={() => bind(a)}
                  onKeyDown={(e) => {
                    if (remap !== a) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.code === "Escape") {
                      bind(null);
                      return;
                    }
                    const keys = { ...opt.keys },
                      other = (Object.keys(keys) as Action[]).find((k) => keys[k] === e.code);
                    if (other) keys[other] = keys[a];
                    keys[a] = e.code;
                    prefs({ ...opt, keys });
                    bind(null);
                  }}
                >
                  {a}
                  <kbd>{remap === a ? "Press a key" : opt.keys[a]}</kbd>
                </button>
              ))}
            </div>
          </>
        )}
        {panel === "world" && (
          <>
            <Survey rt={rt} />
            <h3>{g.start.info.name}</h3>
            <dl className="tw-info">
              {Object.entries({
                Seed: g.start.info.seed,
                Mode: g.start.info.mode,
                Generator: 1,
                Tick: g.tick,
                Location: [g.body.x, g.body.y, g.body.z].map(Math.floor).join(", "),
                Explored: g.discovered.size + " columns",
              }).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {g.building && (
              <label>
                Weather
                <select
                  value={g.weatherOverride}
                  onChange={(e) =>
                    act(() => {
                      g.weatherOverride = e.target.value;
                    })
                  }
                >
                  {["auto", "clear", "rain", "fog", "storm", "snow"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            {g.markers.map((m) => (
              <p key={cellKey(m)}>
                {m.name} · {cellKey(m)}
              </p>
            ))}
            <div className="tw-tools">
              <button onClick={() => void rt.flush().catch(() => {})}>Save now</button>
              <button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void rt
                    .flush()
                    .then(leave)
                    .catch(() => setBusy(false));
                }}
              >
                {busy ? "Saving…" : "Return to worlds"}
              </button>
            </div>
            <p>{g.status}</p>
          </>
        )}
        {g.notice && (
          <p className="tw-notice" role="status">
            {g.notice}
          </p>
        )}
      </section>
    </div>
  );
}
