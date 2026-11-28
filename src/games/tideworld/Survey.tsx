import { useEffect, useRef, useState } from "react";
import type { Runtime } from "./runtime";
import { BLOCKS } from "./world/blocks";
import { cellKey } from "./expeditionData";

const colors: Record<string, string> = {
  silt_meadow: "#a1ac73",
  rainwood: "#5a8b71",
  lantern_fen: "#68a89b",
  red_scrub: "#ba8568",
  storm_coast: "#c8b58e",
  brine_bay: "#6395a3",
  salt_basin: "#c7c2b5",
  frostwood: "#839fa4",
  wind_ridge: "#9497a2",
  frost_crown: "#d4d2c6",
  cinder_shelf: "#967c70",
};
export function Survey({ rt }: { rt: Runtime }) {
  const g = rt.game,
    canvas = useRef<HTMLCanvasElement>(null),
    [command, setCommand] = useState(""),
    [response, setResponse] = useState("");
  const cx = Math.floor(g.body.x / 16),
    cz = Math.floor(g.body.z / 16);
  const discovered = g.discovered.size;
  useEffect(() => {
    const c = canvas.current,
      ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const scale = 10,
      px = (n: number) => (n - cx) * scale + 120,
      pz = (n: number) => (n - cz) * scale + 60;
    ctx.fillStyle = "#1d2828";
    ctx.fillRect(0, 0, 240, 120);
    for (const cell of g.discovered) {
      const [x, z] = cell.split(",").map(Number);
      if (Math.abs(x - cx) > 12 || Math.abs(z - cz) > 6) continue;
      ctx.fillStyle = colors[g.world.biome(x * 16, z * 16)] ?? "#777";
      ctx.fillRect(px(x), pz(z), 9, 9);
    }
    ctx.fillStyle = "#ffcb72";
    ctx.fillRect(122, 62, 5, 5);
    for (const marker of g.markers) {
      if (marker.visible === false) continue;
      ctx.fillStyle = marker.color;
      ctx.fillRect(px(marker.x / 16), pz(marker.z / 16), 4, 4);
    }
  }, [g, cx, cz, discovered, g.markers]);
  async function run() {
    const [verb, ...args] = command.trim().split(/\s+/),
      [x, y, z] = args.map(Number);
    try {
      if (verb === "world.info") {
        setResponse(JSON.stringify({ ...g.start.info, tick: g.tick, generator: 1 }));
        return;
      }
      if (verb === "save.flush") {
        await rt.flush();
        setResponse("Save committed.");
        return;
      }
      if (verb === "benchmark.ticks") {
        const n = Math.floor(Number(args[0]));
        if (!(n >= 1 && n <= 900)) throw Error("Choose 1–900 ticks.");
        setResponse("Measuring " + n + " ticks…");
        setResponse(await rt.benchmark(n));
        return;
      }
      if (verb === "entity.inspect") {
        const c = g.ecology.creatures.find((c) => c.id === args[0]);
        setResponse(c ? JSON.stringify(c) : "Unknown creature ID.");
        return;
      }
      if (verb === "marker.create") {
        const p = g.target;
        if (!p || p.id !== "marker_stand") throw Error("Aim at a marker stand.");
        g.anchor = p;
        g.register(args.join(" "));
        setResponse(g.notice);
        return;
      }
      if (verb === "edit.apply") {
        if (!g.preview || args[0] !== String(g.preview.token))
          throw Error("That preview is no longer active.");
        g.applyFill();
        setResponse(g.notice);
        return;
      }
      if (
        ![x, y, z].every(Number.isSafeInteger) ||
        Math.max(Math.abs(x), Math.abs(z)) > 1048576 ||
        y < -96 ||
        y > 223
      )
        throw Error("Enter valid integer cell coordinates.");
      if (verb === "cell.inspect") {
        const w = g.world;
        setResponse(
          JSON.stringify({
            id: w.get(x, y, z),
            facing: (w.facings[[x, y, z].join(",")] ?? 0) & 3,
            connections: g.ecology.devices.connectionMask({ x, y, z }),
            variant: w.variants[[x, y, z].join(",")] ?? null,
            fluid: g.ecology.fluids.read(g.sys, { x, y, z }),
            light: g.ecology.light(g.sys, { x, y, z }, g.tick),
            revision: g.revision,
          }),
        );
        return;
      }
      if (verb === "device.trace") {
        setResponse(JSON.stringify(g.ecology.devices.at({ x, y, z }) ?? "No device here."));
        return;
      }
      if (verb === "edit.preview") {
        const [x2, y2, z2] = args.slice(3, 6).map(Number),
          block = args[6];
        if (!g.building || !BLOCKS[block] || [x2, y2, z2].some((v) => !Number.isSafeInteger(v)))
          throw Error("Building mode needs two integer corners and a block ID.");
        g.planFill({ x, y, z }, { x: x2, y: y2, z: z2 }, block);
        setResponse(
          g.preview ? g.preview.cells.length + " cells · preview " + g.preview.token : g.notice,
        );
        return;
      }
      setResponse("Unknown command.");
    } catch (e) {
      setResponse(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div className="tw-survey">
      <h3>Survey map</h3>
      <canvas
        ref={canvas}
        width={240}
        height={120}
        aria-label={"Discovered terrain around column " + cx + ", " + cz}
      />
      <small>
        North up · amber marks your position ·{" "}
        {cellKey(g.body)
          .split(",")
          .map((n) => Math.floor(Number(n)))
          .join(", ")}
      </small>
      <details>
        <summary>World console</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <label>
            Command
            <input
              value={command}
              list="tw-command-list"
              placeholder="world.info"
              onChange={(e) => setCommand(e.target.value)}
            />
          </label>
          <datalist id="tw-command-list">
            {[
              "world.info",
              "cell.inspect",
              "entity.inspect",
              "device.trace",
              "benchmark.ticks 60",
              "edit.preview",
              "edit.apply",
              "marker.create",
              "save.flush",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </datalist>
          <button>Run</button>
        </form>
        <output>{response}</output>
      </details>
    </div>
  );
}
