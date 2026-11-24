import type { GraphicsQuality } from "../../types/arcade";
import type { ClientMessage, Controls, HudState, MeshMessage, Mode, PlayerAction, Pose, ServerMessage } from "./protocol";
import { BuildBloxRenderer } from "./renderer";
import { readWorld, writeWorld } from "./storage";

const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight"]);
const radiusByQuality: Record<GraphicsQuality, number> = { low: 2, medium: 4, high: 5 };
const emptyControls: Controls = { forward: 0, strafe: 0, jump: false, sprint: false, descend: false, mine: false, yaw: 0, pitch: 0 };

interface Hooks {
  onState: (state: HudState) => void;
  onError: (message: string) => void;
  onSave: (healthy: boolean) => void;
  onFps: (fps: number) => void;
  onInventory: () => void;
  onInteract: (state: HudState) => void;
  onCapture: (active: boolean) => void;
}

export class BuildBloxClient {
  private renderer: BuildBloxRenderer;
  private server: Worker;
  private mesh: Worker;
  private listeners = new AbortController();
  private keys = new Set<string>();
  private controls = { ...emptyControls };
  private pose: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private previous: HudState | null = null;
  private state: HudState | null = null;
  private updatedAt = 0;
  private pressed = false;
  private touch: number | null = null;
  private touchX = 0;
  private touchY = 0;
  private drag = false;
  private active = false;
  private paused = false;
  private blocked = false;
  private disposed = false;
  private started = false;
  private frame = 0;
  private frameCount = 0;
  private sampleAt = performance.now();
  private saveKey: string;
  private hooks: Hooks;
  private pendingSave: (() => void) | undefined;
  private quality: GraphicsQuality;

  constructor(mount: HTMLElement, seed: string, mode: Mode, quality: GraphicsQuality, hooks: Hooks) {
    this.saveKey = mode + ":" + seed;
    this.hooks = hooks;
    this.quality = quality;
    this.renderer = new BuildBloxRenderer(mount, quality);
    this.server = new Worker(new URL("./server.worker.ts", import.meta.url), { type: "module" });
    this.mesh = new Worker(new URL("./mesh.worker.ts", import.meta.url), { type: "module" });
    this.server.onmessage = (event: MessageEvent<ServerMessage>) => this.receive(event.data);
    this.mesh.onmessage = (event: MessageEvent<MeshMessage>) => {
      this.renderer.receive(event.data);
    };
    this.server.onerror = () => this.hooks.onError("The world simulation stopped. Reopen your world to continue.");
    this.mesh.onerror = () => this.hooks.onError("The terrain renderer stopped. Reopen your world to continue.");
    this.attach();
    this.frame = requestAnimationFrame(this.render);
    void readWorld(this.saveKey).catch(() => {
      if (!this.disposed) this.hooks.onSave(false);
      return undefined;
    }).then((saved) => {
      if (this.disposed) return;
      this.send({ type: "init", seed, mode, radius: radiusByQuality[this.quality], saved });
      this.started = true;
      if (this.paused) this.send({ type: "pause", value: true });
    });
  }

  send(message: ClientMessage): void {
    if (!this.disposed) this.server.postMessage(message);
  }

  action(action: PlayerAction, item?: number): void {
    this.send({ type: "action", action, item });
  }

  setQuality(quality: GraphicsQuality): void {
    this.quality = quality;
    this.renderer.setQuality(quality);
    this.send({ type: "radius", radius: radiusByQuality[quality] });
  }

  setBlocked(value: boolean): void {
    this.blocked = value;
    if (value) this.release();
  }

  setPaused(value: boolean): void {
    this.paused = value;
    if (value) this.release();
    if (this.started) this.send({ type: "pause", value });
  }

  key(code: string, pressed: boolean): void {
    if (pressed) this.keys.add(code);
    else this.keys.delete(code);
    this.sendControls();
  }

  mine(pressed: boolean): void {
    this.pressed = pressed;
    if (pressed) this.action("attack");
    this.sendControls();
  }

  capture(): void {
    if (!this.state || this.paused || this.blocked) return;
    const canvas = this.renderer.canvas;
    canvas.focus({ preventScroll: true });
    this.setActive(true);
    if (matchMedia("(pointer: coarse)").matches) return;
    try {
      const locked = canvas.requestPointerLock?.();
      void locked?.catch(() => undefined);
    } catch {
      // Drag look remains available when pointer lock is unavailable.
    }
  }

  save(): Promise<void> {
    if (!this.started) return Promise.resolve();
    this.setPaused(true);
    return new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, 1500);
      this.pendingSave = () => { window.clearTimeout(timeout); resolve(); };
      this.send({ type: "save" });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.release();
    this.disposed = true;
    this.listeners.abort();
    cancelAnimationFrame(this.frame);
    this.mesh.terminate();
    this.renderer.dispose();
    if (!this.started) {
      this.server.terminate();
      return;
    }
    this.server.postMessage({ type: "pause", value: true } satisfies ClientMessage);
    this.server.postMessage({ type: "save" } satisfies ClientMessage);
    window.setTimeout(() => this.server.terminate(), 1000);
  }

  private receive(message: ServerMessage): void {
    if (message.type === "save") {
      const done = this.pendingSave;
      this.pendingSave = undefined;
      void writeWorld(this.saveKey, message.data).then(
        () => { if (!this.disposed) this.hooks.onSave(true); },
        () => { if (!this.disposed) this.hooks.onSave(false); },
      ).then(done);
      if (this.disposed) this.server.terminate();
      return;
    }
    if (this.disposed) return;
    if (message.type === "error") {
      this.hooks.onError(message.message);
      return;
    }
    if (message.type === "reset" || message.type === "remove" || message.type === "chunks") {
      if (message.type === "reset") this.renderer.setRealm(message.realm);
      if (message.type === "remove") this.renderer.remove(message.keys);
      const transfers = message.type === "chunks"
        ? message.chunks.flatMap((chunk) => chunk.sections.flatMap((section) => [section.palette.buffer, section.words.buffer]))
        : [];
      this.mesh.postMessage(message, transfers);
      return;
    }
    const next = message.state;
    const last = this.state;
    const moved = !last || last.realm !== next.realm || Math.hypot(next.position.x - last.position.x, next.position.y - last.position.y, next.position.z - last.position.z) > 8;
    if (moved) {
      this.controls.yaw = next.yaw;
      this.controls.pitch = next.pitch;
    }
    this.previous = moved ? next : last;
    this.state = next;
    this.updatedAt = performance.now();
    this.hooks.onState(next);
    if (next.dead && !last?.dead) this.release();
  }

  private render = (now: number): void => {
    if (this.state && this.previous) {
      const alpha = Math.min(1, (now - this.updatedAt) / 50);
      const { position } = this.state;
      const before = this.previous.position;
      this.pose.x = before.x + (position.x - before.x) * alpha;
      this.pose.y = before.y + (position.y - before.y) * alpha;
      this.pose.z = before.z + (position.z - before.z) * alpha;
      this.pose.yaw = this.controls.yaw;
      this.pose.pitch = this.controls.pitch;
      this.renderer.render(this.state, this.pose);
    }
    this.frameCount++;
    if (now - this.sampleAt >= 1000) {
      this.hooks.onFps(Math.round(this.frameCount * 1000 / (now - this.sampleAt)));
      this.sampleAt = now;
      this.frameCount = 0;
    }
    this.frame = requestAnimationFrame(this.render);
  };

  private setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.hooks.onCapture(active);
  }

  private release(): void {
    this.keys.clear();
    this.pressed = false;
    this.drag = false;
    this.touch = null;
    this.sendControls();
    this.setActive(false);
    if (document.pointerLockElement === this.renderer.canvas) document.exitPointerLock();
  }

  private sendControls(): void {
    const keys = this.keys;
    this.controls.forward = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
    this.controls.strafe = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
    this.controls.jump = keys.has("Space");
    this.controls.sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    this.controls.descend = keys.has("ControlLeft") || keys.has("ControlRight");
    this.controls.mine = this.pressed;
    if (this.started) this.send({ type: "input", value: this.controls });
  }

  private look(x: number, y: number): void {
    this.controls.yaw = (this.controls.yaw - x * .0024) % (Math.PI * 2);
    this.controls.pitch = Math.max(-1.54, Math.min(1.54, this.controls.pitch - y * .0024));
    this.sendControls();
  }

  private attach(): void {
    const canvas = this.renderer.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "BuildBlox world");
    const { signal } = this.listeners;
    const listen = { signal };
    const canPlay = (): boolean => Boolean(this.state && !this.state.dead && !this.paused && !this.blocked);
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input,textarea,select") || target.isContentEditable)) return;
      if (event.code === "KeyE" && !event.repeat && !this.paused && this.state && !this.state.dead) {
        event.preventDefault();
        this.hooks.onInventory();
        return;
      }
      if (!canPlay() || !this.active) return;
      if (movementKeys.has(event.code)) {
        event.preventDefault();
        this.key(event.code, true);
      } else if (!event.repeat) {
        const digit = /^Digit([1-9])$/.exec(event.code);
        if (digit) this.send({ type: "select", slot: Number(digit[1]) - 1 });
        if (event.code === "KeyF" && this.state) {
          this.action("interact");
          this.hooks.onInteract(this.state);
        }
        if (event.code === "KeyQ") this.action("eat");
        if (event.code === "KeyG") this.action("flight");
      }
    }, listen);
    document.addEventListener("keyup", (event) => {
      if (this.keys.has(event.code)) this.key(event.code, false);
    }, listen);
    window.addEventListener("blur", () => this.release(), listen);
    window.addEventListener("pagehide", () => this.send({ type: "save" }), listen);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.release();
        this.send({ type: "save" });
      }
    }, listen);
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement === canvas) this.setActive(true);
      else if (!this.drag && this.touch === null) this.release();
    }, listen);
    canvas.addEventListener("pointerdown", (event) => {
      if (!canPlay()) return;
      if (event.pointerType === "touch") {
        this.touch = event.pointerId;
        this.touchX = event.clientX;
        this.touchY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
        this.setActive(true);
        return;
      }
      if (!this.active) {
        this.capture();
        return;
      }
      if (event.button === 2) {
        this.action("place");
      } else if (event.button === 0) {
        this.drag = document.pointerLockElement !== canvas;
        this.mine(true);
      }
    }, listen);
    document.addEventListener("pointermove", (event) => {
      if (!canPlay() || !this.active) return;
      if (this.touch === event.pointerId) {
        this.look(event.clientX - this.touchX, event.clientY - this.touchY);
        this.touchX = event.clientX;
        this.touchY = event.clientY;
      } else if (document.pointerLockElement === canvas || this.drag) {
        this.look(event.movementX, event.movementY);
      }
    }, listen);
    const releasePointer = (event: PointerEvent): void => {
      if (this.touch === event.pointerId) this.touch = null;
      if (event.pointerType !== "touch" && (this.pressed || this.drag)) {
        this.drag = false;
        this.mine(false);
      }
    };
    document.addEventListener("pointerup", releasePointer, listen);
    document.addEventListener("pointercancel", releasePointer, listen);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault(), listen);
    canvas.addEventListener("wheel", (event) => {
      if (!canPlay() || !this.state || !this.active) return;
      event.preventDefault();
      const slot = (this.state.selected + (event.deltaY > 0 ? 1 : 8)) % 9;
      this.send({ type: "select", slot });
    }, { ...listen, passive: false });
  }
}
