import type { Intent } from "./movement";

export const defaultKeys = {
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  sprint: "ShiftLeft",
  squat: "ControlLeft",
  use: "KeyE",
  pack: "Tab",
  last: "KeyQ",
  palette: "AltLeft",
  flight: "KeyG",
} as const;
export type Action = keyof typeof defaultKeys;
export interface Options {
  keys: Record<Action, string>;
  sensitivity: number;
  fov: number;
  uiScale: number;
  brightness: number;
  bob: boolean;
  reducedFlashes: boolean;
  subtitles: boolean;
  effects: number;
  ambience: number;
  music: number;
  voice: number;
  interfaceVolume: number;
}
export function readOptions(reducedMotion: boolean): Options {
  const defaults: Options = {
    keys: { ...defaultKeys },
    sensitivity: 1,
    fov: 82,
    uiScale: 1,
    brightness: 1,
    bob: !reducedMotion,
    reducedFlashes: reducedMotion,
    subtitles: true,
    effects: 0.7,
    ambience: 0.35,
    music: 0.3,
    voice: 0.8,
    interfaceVolume: 0.6,
  };
  try {
    const saved = JSON.parse(localStorage.getItem("buildblox.controls.1") ?? "null");
    return { ...defaults, ...saved, keys: { ...defaultKeys, ...saved?.keys } };
  } catch {
    return defaults;
  }
}
type ButtonAction = "use" | "place" | "pack" | "last" | "palette" | "closePalette" | "flight" | "pause";
interface Hooks {
  active(): boolean;
  look(dx: number, dy: number): void;
  action(id: ButtonAction): void;
  select(index: number, relative: boolean): void;
  capture(active: boolean): void;
  options(): Options;
  paletteOpen(): boolean;
}
export class Controls {
  mining = false;
  captured = false;
  private held = new Set<Action>();
  private pad: Gamepad | null = null;
  private pressed = new Set<number>();
  private events = new AbortController();
  private host: HTMLElement;
  private hooks: Hooks;
  constructor(host: HTMLElement, hooks: Hooks) {
    this.host = host;
    this.hooks = hooks;
    const o = { signal: this.events.signal };
    const clear = () => {
      this.held.clear();
      this.mining = false;
      this.pressed.clear();
    };
    const key = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "Tab") return;
      const action = (Object.keys(defaultKeys) as Action[]).find(
        (a) => hooks.options().keys[a] === e.code,
      );
      if (e.type === "keyup") {
        if (action) this.held.delete(action);
        if (action === "palette" && hooks.paletteOpen()) {
          e.preventDefault();
          hooks.action("closePalette");
        }
        return;
      }
      if (!this.captured || !hooks.active() || e.metaKey || e.target instanceof HTMLInputElement) return;
      if (/^Digit[1-7]$/.test(e.code)) {
        e.preventDefault();
        hooks.select(Number(e.code.slice(5)) - 1, false);
        return;
      }
      if (!action) return;
      e.preventDefault();
      this.held.add(action);
      if (!e.repeat && ["use", "pack", "last", "palette", "flight"].includes(action))
        hooks.action(action as ButtonAction);
    };
    window.addEventListener("keydown", key, o);
    window.addEventListener("keyup", key, o);
    window.addEventListener(
      "blur",
      () => {
        clear();
        this.release();
      },
      o,
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          clear();
          this.release();
        }
      },
      o,
    );
    document.addEventListener(
      "pointerlockchange",
      () => {
        if (document.pointerLockElement === host) this.toggle(true);
        else if (!this.touch) {
          this.toggle(false);
          clear();
        }
      },
      o,
    );
    document.addEventListener(
      "mousemove",
      (e) => {
        if (this.captured && hooks.active() && !this.touch) hooks.look(e.movementX, e.movementY);
      },
      o,
    );
    host.addEventListener(
      "pointerdown",
      (e) => {
        if (!hooks.active()) return;
        if (!this.captured) {
          this.capture(e.pointerType === "touch");
          return;
        }
        if (e.pointerType === "touch") {
          this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
          host.setPointerCapture(e.pointerId);
          return;
        }
        if (e.button === 0) this.mining = true;
        if (e.button === 2) hooks.action("place");
      },
      o,
    );
    host.addEventListener(
      "pointermove",
      (e) => {
        if (this.touch?.id === e.pointerId && hooks.active()) {
          hooks.look(e.clientX - this.touch.x, e.clientY - this.touch.y);
          this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }
      },
      o,
    );
    const end = (e: PointerEvent) => {
      if (e.button === 0) this.mining = false;
      if (this.touch?.id === e.pointerId) this.touch = { id: -1, x: 0, y: 0 };
    };
    window.addEventListener("pointerup", end, o);
    window.addEventListener("pointercancel", end, o);
    host.addEventListener("contextmenu", (e) => e.preventDefault(), o);
    host.addEventListener(
      "wheel",
      (e) => {
        if (this.captured && hooks.active()) {
          e.preventDefault();
          hooks.select(Math.sign(e.deltaY), true);
        }
      },
      { ...o, passive: false },
    );
  }
  private touch: { id: number; x: number; y: number } | null = null;
  private toggle(value: boolean) {
    if (this.captured !== value) {
      this.captured = value;
      this.hooks.capture(value);
    }
  }
  capture(touch = matchMedia("(pointer: coarse)").matches) {
    if (!this.hooks.active()) return;
    this.host.focus({ preventScroll: true });
    if (touch || !this.host.requestPointerLock) {
      this.touch = { id: -1, x: 0, y: 0 };
      this.toggle(true);
      return;
    }
    this.touch = null;
    try {
      this.host.requestPointerLock()?.catch(() => this.toggle(false));
    } catch {
      this.toggle(false);
    }
  }
  release() {
    this.held.clear();
    this.mining = false;
    this.touch = null;
    this.toggle(false);
    if (document.pointerLockElement === this.host) document.exitPointerLock();
  }
  key(key: Action, held: boolean) {
    if (held) this.held.add(key);
    else this.held.delete(key);
  }
  sample(): Intent {
    const a = this.held;
    const pad = navigator.getGamepads?.()[0] ?? null;
    this.pad = pad;
    const axis = (i: number) => (Math.abs(pad?.axes[i] ?? 0) > 0.16 ? pad!.axes[i] : 0);
    if (pad && this.hooks.active()) {
      if (!this.captured && pad.buttons.some((b) => b.pressed)) this.toggle(true);
      if (this.captured) {
        this.hooks.look(axis(2) * 16, axis(3) * 14);
        const bindings: Record<number, ButtonAction> = {
          1: "use",
          2: "place",
          3: "pack",
          8: "palette",
          9: "pause",
          12: "flight",
          13: "last",
        };
        pad.buttons.forEach((b, i) => {
          if (b.pressed && !this.pressed.has(i)) {
            if (bindings[i]) this.hooks.action(bindings[i]);
            if (i === 4 || i === 5) this.hooks.select(i === 4 ? -1 : 1, true);
          }
          if (b.pressed) this.pressed.add(i);
          else this.pressed.delete(i);
        });
      }
    }
    if (!this.captured || !this.hooks.active())
      return { forward: 0, right: 0, jump: false, squat: false, sprint: false };
    return {
      forward: Number(a.has("forward")) - Number(a.has("back")) - axis(1),
      right: Number(a.has("right")) - Number(a.has("left")) + axis(0),
      jump: a.has("jump") || !!pad?.buttons[0]?.pressed,
      squat: a.has("squat") || !!pad?.buttons[11]?.pressed,
      sprint: a.has("sprint") || !!pad?.buttons[10]?.pressed,
    };
  }
  get holdingMine() {
    return this.mining || !!this.pad?.buttons[7]?.pressed;
  }
  dispose() {
    this.release();
    this.events.abort();
  }
}
