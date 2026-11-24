import type { ClientMessage, ServerMessage } from "./protocol";
import { Simulation, TICK_MS } from "./simulation";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<ClientMessage>) => void) | null;
  postMessage(message: ServerMessage): void;
};
const send = (message: ServerMessage): void => worker.postMessage(message);
let simulation: Simulation | undefined;
let clock: ReturnType<typeof setInterval> | undefined;

function stop(error: unknown): void {
  if (clock !== undefined) clearInterval(clock);
  clock = undefined;
  simulation = undefined;
  send({ type: "error", message: error instanceof Error ? error.message : "BuildBlox simulation stopped." });
}

worker.onmessage = ({ data }) => {
  try {
    if (data.type === "init") {
      if (clock !== undefined) clearInterval(clock);
      simulation = new Simulation(data, send);
      clock = setInterval(() => {
        try { simulation?.step(); }
        catch (error) { stop(error); }
      }, TICK_MS);
    } else simulation?.receive(data);
  } catch (error) { stop(error); }
};
