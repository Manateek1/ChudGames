import * as T from "three";
import { VoxelView } from "./world";
import { CreatureView } from "./systems/creatureView";
import { Controls, type Options } from "./controls";
import { Expedition, type Panel } from "./expedition";
import type { ExpeditionStart } from "./expeditionData";
import { DT, eye } from "./movement";
import { WorldAudio } from "./sound";

interface Callbacks {
  update(): void;
  fps(fps: number): void;
  panel(p: Panel | null): void;
  pause(): void;
  error(message: string): void;
}
export class Runtime {
  readonly game: Expedition;
  readonly view: VoxelView;
  readonly controls: Controls;
  readonly sound = new WorldAudio();
  hurt = false;
  private hurtUntil = 0;
  private previewMesh?: T.InstancedMesh<T.BoxGeometry, T.MeshBasicMaterial>;
  private previewId = -1;
  private renderPreview() {
    const selection = this.game.preview;
    if (this.previewId === (selection?.token ?? -1)) return;
    if (this.previewMesh) {
      this.previewMesh.removeFromParent();
      this.previewMesh.geometry.dispose();
      this.previewMesh.material.dispose();
      this.previewMesh.dispose();
      this.previewMesh = undefined;
    }
    this.previewId = selection?.token ?? -1;
    if (!selection?.cells.length) return;
    const mesh = new T.InstancedMesh(
      new T.BoxGeometry(1.01, 1.01, 1.01),
      new T.MeshBasicMaterial({ transparent: true, opacity: 0.38, depthWrite: false }),
      selection.cells.length,
    );
    const matrix = new T.Matrix4(),
      color = new T.Color();
    selection.cells.forEach(({ p, blocked }, i) => {
      mesh.setMatrixAt(i, matrix.makeTranslation(p.x + 0.5, p.y + 0.5, p.z + 0.5));
      mesh.setColorAt(i, color.set(blocked ? "#d45c54" : "#6de1c0"));
    });
    this.view.actors.add(mesh);
    this.previewMesh = mesh;
  }
  private ropeGeo = new T.BoxGeometry(0.075, 1, 0.075);
  private creatures: CreatureView;
  options: Options;
  panel: Panel | null = null;
  paused: boolean;
  private hooks: Callbacks;
  private raf = 0;
  private previous = 0;
  private accumulator = 0;
  private lastHud = 0;
  private lastFrame = 0;
  private frameCount = 0;
  private stepDistance = 0;
  private subtitleUntil = 0;
  subtitle = "";
  private meshes = new Map<string, T.Mesh>();
  private pickupGeo = new T.IcosahedronGeometry(0.18, 0);
  private materials = new Map<string, T.MeshLambertMaterial>();
  private listeners = new AbortController();
  private disposed = false;
  private saving = false;
  private measurement?: { remaining: number; samples: number[]; done: (result: string) => void };
  private lastPos: T.Vector3;
  private info: { sound: boolean; music: boolean };
  constructor(
    host: HTMLElement,
    start: ExpeditionStart,
    options: Options,
    info: { sound: boolean; music: boolean; paused: boolean },
    hooks: Callbacks,
  ) {
    this.options = options;
    this.info = info;
    this.paused = info.paused;
    this.hooks = hooks;
    const g = new Expedition(start);
    this.game = g;
    this.lastPos = new T.Vector3(g.body.x, g.body.y, g.body.z);
    this.view = new VoxelView(host, g.world);
    this.creatures = new CreatureView(this.view.actors);
    this.controls = new Controls(host, {
      active: () => !this.paused && !this.panel && g.body.health > 0,
      options: () => this.options,
      paletteOpen: () => this.panel === "palette",
      capture: () => hooks.update(),
      look: (dx, dy) => {
        g.body.yaw = (g.body.yaw - dx * 0.0022 * this.options.sensitivity) % (Math.PI * 2);
        g.body.pitch = T.MathUtils.clamp(
          g.body.pitch - dy * 0.0022 * this.options.sensitivity,
          -1.55,
          1.55,
        );
      },
      select: (i, relative) => {
        g.select(i, relative);
        hooks.update();
      },
      action: (a) => {
        if (a === "pack") this.open("pack");
        else if (a === "palette") this.open("palette");
        else if (a === "closePalette") {
          this.open(null);
          this.capture();
        } else if (a === "pause") hooks.pause();
        else if (a === "last") g.select(g.last);
        else if (a === "use") g.interact();
        else if (a === "place") g.place();
        else if (a === "flight" && g.building) g.flying = !g.flying;
        hooks.update();
      },
    });
    g.cue = (kind, mat = "") => {
      if (this.info.sound) this.sound.play(kind, mat, this.options, g.body.submerged > 0);
      if (this.options.subtitles && kind !== "step" && kind !== "select") {
        this.subtitle =
          kind === "break" ? "Block broken" : kind === "place" ? "Block placed" : "Item collected";
        this.subtitleUntil = performance.now() + 1100;
      }
    };
    g.panel = (p) => this.open(p);
    const save = () => {
      if (!this.disposed) void this.flush().catch(() => {});
    };
    window.addEventListener("pagehide", save, { signal: this.listeners.signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        this.accumulator = 0;
        this.previous = 0;
        if (document.hidden) save();
      },
      { signal: this.listeners.signal },
    );
    this.raf = requestAnimationFrame(this.frame);
  }
  setOptions(options: Options) {
    this.options = options;
  }
  capture(touch?: boolean) {
    this.sound.unlock();
    this.controls.capture(touch);
  }
  open(panel: Panel | null) {
    this.panel = panel;
    this.controls.release();
    this.game.resetMine();
    this.hooks.panel(panel);
    this.hooks.update();
  }
  settings(paused: boolean, sound: boolean, music: boolean) {
    this.info = { sound, music };
    if (paused && !this.paused) this.controls.release();
    this.paused = paused;
  }
  async flush() {
    try {
      await this.game.save();
    } catch (error) {
      this.game.status = error instanceof Error ? error.message : "Save failed";
      this.hooks.update();
      throw error;
    }
    if (!this.disposed) this.hooks.update();
  }
  benchmark(count: number) {
    if (this.measurement) return Promise.resolve("A measurement is already running.");
    return new Promise<string>((done) => {
      this.measurement = { remaining: count, samples: [], done };
    });
  }
  private frame = (now: number) => {
    if (this.disposed) return;
    try {
      const g = this.game;
      if (!this.previous) this.previous = now;
      this.accumulator += Math.min(0.18, (now - this.previous) / 1000);
      this.previous = now;
      if (document.hidden || this.paused) this.accumulator = 0;
      while (this.accumulator >= DT) {
        this.accumulator -= DT;
        this.lastPos.set(g.body.x, g.body.y, g.body.z);
        const input = this.controls.sample();
        const t = this.measurement ? performance.now() : 0;
        const previousHealth = g.body.health;
        g.frame(input, !this.panel && this.controls.captured && this.controls.holdingMine);
        if (previousHealth - g.body.health > 0) this.hurtUntil = now + 250;
        if (g.tick % 150 === 0) {
          const c = g.ecology.creatures.find(
            (c) => c.health > 0 && Math.hypot(c.x - g.body.x, c.y - g.body.y, c.z - g.body.z) < 14,
          );
          if (c) {
            if (this.info.sound) this.sound.play("voice", c.species, this.options, g.body.submerged > 0);
            if (this.options.subtitles) {
              const angle = (Math.atan2(c.x - g.body.x, g.body.z - c.z) * 180) / Math.PI;
              this.subtitle =
                c.species.replaceAll("_", " ") +
                " call · " +
                ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][(Math.round(angle / 45) + 8) % 8];
              this.subtitleUntil = now + 1800;
            }
          }
        }
        if (this.measurement) {
          const m = this.measurement;
          m.samples.push(performance.now() - t);
          if (--m.remaining === 0) {
            m.samples.sort((a, b) => a - b);
            m.done(
              m.samples.length +
                " ticks · p95 " +
                m.samples[Math.ceil(0.95 * m.samples.length) - 1].toFixed(2) +
                " ms",
            );
            this.measurement = undefined;
          }
        }
        this.stepDistance += g.body.grounded
          ? Math.hypot(g.body.x - this.lastPos.x, g.body.z - this.lastPos.z)
          : 0;
        if (this.stepDistance > 1.75) {
          this.stepDistance = 0;
          g.cue(
            "step",
            g.world.get(Math.floor(g.body.x), Math.floor(g.body.y) - 1, Math.floor(g.body.z)),
          );
        }
        if (this.info.sound) this.sound.atmosphere(g.tick, this.options, this.info.music);
        if (g.tick % 300 === 0 && !this.saving) {
          this.saving = true;
          void this.flush()
            .catch(() => {})
            .finally(() => {
              this.saving = false;
            });
        }
      }
      if (!document.hidden) {
        const p = eye(g.body),
          f = this.accumulator / DT;
        if (this.controls.captured && !this.paused) {
          p.x = T.MathUtils.lerp(this.lastPos.x, g.body.x, f);
          p.z = T.MathUtils.lerp(this.lastPos.z, g.body.z, f);
          p.y += (this.lastPos.y - g.body.y) * (1 - f);
        }
        if (this.options.bob && g.body.grounded && this.controls.captured)
          p.y +=
            0.025 * Math.sin(this.stepDistance * 3.59) * Math.min(1, Math.hypot(g.body.vx, g.body.vz));
        this.drawActors();
        this.renderPreview();
        this.creatures.update(
          g.ecology.creatures,
          g.ecology.skiffs,
          g.tick / 30,
          g.ecology.population.drops,
          g.ecology.population.shots,
        );
        this.hurt = now < this.hurtUntil;
        this.view.setHeld(g.held?.id ?? null);
        this.view.brightness = this.options.brightness;
        this.view.draw(
          p,
          g.body.yaw,
          g.body.pitch,
          g.tick + g.dayOffset,
          g.target,
          g.weather,
          this.options.fov,
        );
      }
      if (this.subtitle && now > this.subtitleUntil) this.subtitle = "";
      if (now - this.lastHud >= 125) {
        this.hooks.update();
        this.lastHud = now;
      }
      if (!this.lastFrame) this.lastFrame = now;
      if (++this.frameCount >= 30) {
        this.hooks.fps((this.frameCount * 1000) / Math.max(1, now - this.lastFrame));
        this.lastFrame = now;
        this.frameCount = 0;
      }
    } catch (e) {
      this.controls.release();
      this.hooks.error(e instanceof Error ? e.message : String(e));
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
  private drawActors() {
    const active = new Set<string>();
    const g = this.game;
    const show = (
      key: string,
      x: number,
      y: number,
      z: number,
      color: string,
      geo: T.BufferGeometry = this.pickupGeo,
    ) => {
      active.add(key);
      let m = this.meshes.get(key);
      if (!m) {
        let material = this.materials.get(color);
        if (!material) {
          material = new T.MeshLambertMaterial({ color });
          this.materials.set(color, material);
        }
        m = new T.Mesh(geo, material);
        this.view.actors.add(m);
        this.meshes.set(key, m);
      }
      m.position.set(x, y, z);
      return m;
    };
    for (const p of g.pickups)
      show(p.id, p.x, p.y + 0.04 * Math.sin(g.tick * 0.05), p.z, "#a1a7ae").rotation.y = g.tick * 0.012;
    for (const rope of g.ecology.transport.ropes) {
      const length = rope.length ?? 12;
      const mesh = show(
        "rope-" + rope.x + "," + rope.y + "," + rope.z,
        rope.x + 0.5,
        rope.y + 1 - length / 2,
        rope.z + 0.5,
        "#b19864",
        this.ropeGeo,
      );
      mesh.scale.y = length;
    }
    for (const [k, m] of this.meshes)
      if (!active.has(k)) {
        m.removeFromParent();
        this.meshes.delete(k);
      }
  }
  dispose() {
    this.game.preview = null;
    this.renderPreview();
    this.measurement?.done("World closed.");
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.listeners.abort();
    this.controls.dispose();
    void this.game.save().catch(() => {});
    for (const m of this.meshes.values()) m.removeFromParent();
    this.meshes.clear();
    this.pickupGeo.dispose();
    this.ropeGeo.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.creatures.dispose();
    this.view.dispose();
    this.sound.dispose();
  }
}
