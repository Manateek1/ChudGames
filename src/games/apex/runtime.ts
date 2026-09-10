import * as THREE from "three";
import type { InputManager } from "../../engine/input";
import type { Difficulty, GameResult } from "../../types/arcade";
import { createCar } from "./car";
import { buildWorld, updateSun } from "./world";
import { createVehicle, FIXED_STEP, stepVehicle } from "./physics";
import type { DriveInput } from "./physics";
import {
  advanceRace,
  createRace,
  loadBest,
  resetRacePosition,
  saveBest,
} from "./race";
import type { BestRun, GhostFrame } from "./race";
import { presets } from "./settings";
import type { ApexSettings } from "./settings";
import { ApexAudio } from "./audio";
import { RoadEffects } from "./effects";
import { trackPoint, TRACK_LENGTH } from "./track";

export type Phase = "menu" | "countdown" | "race" | "finish";
export interface Telemetry {
  phase: Phase;
  speed: number;
  rpm: number;
  gear: number;
  time: number;
  best: number;
  sector: number;
  progress: number;
  x: number;
  z: number;
  heading: number;
  countdown: number;
  message: string;
  fps: number;
  calls: number;
  triangles: number;
  camera: string;
  newBest: boolean;
  resolution: number;
  storageFailed: boolean;
}
export const initialTelemetry: Telemetry = {
  phase: "menu",
  speed: 0,
  rpm: 950,
  gear: 1,
  time: 0,
  best: Infinity,
  sector: 0,
  progress: 0,
  x: 0,
  z: 0,
  heading: 0,
  countdown: 3,
  message: "",
  fps: 60,
  calls: 0,
  triangles: 0,
  camera: "Chase",
  newBest: false,
  resolution: 1,
  storageFailed: false,
};
export const keyboardSteer = (left: boolean, right: boolean): number =>
  Number(left) - Number(right);
interface Hooks {
  input: InputManager;
  difficulty: Difficulty;
  onHud: (hud: Telemetry) => void;
  onScore: (score: number) => void;
  onFps: (fps: number) => void;
  onPause: () => void;
  onFinish: (result: GameResult) => void;
  onError: (message: string) => void;
}
export class ApexRuntime {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.12, 2400);
  private renderer: THREE.WebGLRenderer;
  private world: ReturnType<typeof buildWorld>;
  private car: ReturnType<typeof createCar>;
  private ghost: ReturnType<typeof createCar>;
  private effects: RoadEffects;
  private sound = new ApexAudio();
  private state = createVehicle();
  private previous = { x: 0, y: 28, z: 0, heading: this.state.heading };
  private race = createRace();
  private best: BestRun | null;
  private recording: GhostFrame[] = [];
  private recordTimer = 0;
  private ghostIndex = 0;
  private phase: Phase = "menu";
  private countdown = 3.2;
  private settings: ApexSettings;
  private hooks: Hooks;
  private mount: HTMLElement;
  private observer: ResizeObserver;
  private raf = 0;
  private lastTime = 0;
  private nextFrame = 0;
  private elapsed = 0;
  private accumulator = 0;
  private hudTimer = 0;
  private fpsTime = 0;
  private fpsFrames = 0;
  private measuredFps = 60;
  private adaptiveScale = 1;
  private performanceTime = 0;
  private paused = false;
  private hidden = false;
  private cameraMode = 0;
  private cameraPosition = new THREE.Vector3();
  private cameraTarget = new THREE.Vector3();
  private smoothTarget = new THREE.Vector3();
  private environment: THREE.WebGLRenderTarget | null = null;
  private disposed = false;
  private message = "";
  private messageUntil = 0;
  private newBest = false;
  private storageFailed = false;
  private padButtons: boolean[] = [];
  private controls: DriveInput = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
  };
  constructor(mount: HTMLElement, settings: ApexSettings, hooks: Hooks) {
    this.mount = mount;
    this.settings = settings;
    this.hooks = hooks;
    this.best = loadBest(hooks.difficulty);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Solstice Pass racing view",
    );
    mount.appendChild(this.renderer.domElement);
    try {
      this.world = buildWorld(this.scene, settings.quality);
      this.car = createCar(settings.paint);
      this.ghost = createCar("#b7dddd", true);
      this.scene.add(this.car.root, this.ghost.root);
      this.ghost.root.visible = false;
      this.effects = new RoadEffects(this.scene);
      this.car.root.position.set(this.state.x, this.state.y, this.state.z);
      this.car.root.rotation.y = this.state.heading;
      updateSun(this.world.sun, 0, 28, 0);
      this.applySettings(settings);
      this.refreshEnvironment();
      this.camera.position.set(-7, 31.2, 7);
      this.smoothTarget.set(0, 28.7, 0);
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(mount);
      window.addEventListener("keydown", this.keydown);
      window.addEventListener("blur", this.blur);
      document.addEventListener("visibilitychange", this.visibility);
      this.renderer.domElement.addEventListener(
        "webglcontextlost",
        this.contextLost,
      );
      this.resize();
      this.raf = requestAnimationFrame(this.loop);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private refreshEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer),
      previous = this.environment;
    this.scene.environment = null;
    this.car.root.visible =
      this.ghost.root.visible =
      this.effects.points.visible =
      this.effects.marks.visible =
        false;
    try {
      this.environment = pmrem.fromScene(this.scene, 0.035, 0.1, 3500, {
        size: presets[this.settings.quality].reflection,
        position: new THREE.Vector3(
          this.state.x,
          this.state.y + 2,
          this.state.z,
        ),
      });
      this.scene.environment = this.environment.texture;
      this.scene.environmentIntensity = 0.22;
      previous?.dispose();
    } finally {
      this.car.root.visible =
        this.effects.points.visible =
        this.effects.marks.visible =
          true;
      pmrem.dispose();
    }
  }
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.paused = true;
    this.hooks.onError(
      "The graphics context was interrupted. Restart the game to reconnect.",
    );
  };
  private keydown = (event: KeyboardEvent) => {
    if (
      event.repeat ||
      (event.target instanceof HTMLElement &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName))
    )
      return;
    if (event.code === "KeyC") {
      event.preventDefault();
      this.changeCamera();
    }
    if (event.code === "KeyR" && this.phase === "race" && !this.paused) {
      event.preventDefault();
      this.resetCar();
    }
    if (event.code === "Enter" && this.phase === "menu" && !this.paused) {
      event.preventDefault();
      this.start();
    }
  };
  private blur = () => {
    if (!this.paused && (this.phase === "race" || this.phase === "countdown"))
      this.hooks.onPause();
  };
  private visibility = () => {
    this.hidden = document.hidden;
    this.lastTime = 0;
    this.accumulator = 0;
    if (this.hidden) this.blur();
  };
  private resize = () => {
    const { width, height } = this.mount.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 1.5) *
        presets[this.settings.quality].scale *
        this.adaptiveScale,
    );
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };
  applySettings(settings: ApexSettings): void {
    const previousShadow = this.settings
        ? presets[this.settings.quality].shadow
        : -1,
      previousReflection = this.settings
        ? presets[this.settings.quality].reflection
        : -1;
    this.settings = settings;
    const cfg = presets[settings.quality];
    this.world.setQuality(settings.quality);
    this.effects.limit = cfg.particles;
    this.car.paint.color.set(settings.paint);
    this.renderer.shadowMap.enabled = cfg.shadow > 0;
    this.world.sun.shadow.mapSize.set(cfg.shadow || 512, cfg.shadow || 512);
    if (previousShadow !== cfg.shadow && this.world.sun.shadow.map) {
      this.world.sun.shadow.map.dispose();
      this.world.sun.shadow.map = null;
    }
    this.camera.far = cfg.distance;
    this.camera.updateProjectionMatrix();
    this.adaptiveScale = 1;
    this.resize();
    if (this.environment && previousReflection !== cfg.reflection)
      this.refreshEnvironment();
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.accumulator = 0;
    this.publish();
    if (!paused) this.sound.start();
  }
  start(): void {
    this.sound.start();
    this.state = createVehicle();
    this.previous = {
      x: this.state.x,
      y: this.state.y,
      z: this.state.z,
      heading: this.state.heading,
    };
    this.race = createRace();
    this.recording = [
      [0, this.state.x, this.state.y, this.state.z, this.state.heading],
    ];
    this.recordTimer = 0;
    this.ghostIndex = 0;
    this.phase = "countdown";
    this.countdown = 3.2;
    this.accumulator = 0;
    this.newBest = false;
    this.message = "";
    this.hooks.onScore(0);
    this.publish();
  }
  changeCamera(): void {
    this.cameraMode = (this.cameraMode + 1) % 3;
    this.publish();
  }
  resetCar(): void {
    const p = resetRacePosition(this.race);
    this.state = createVehicle(p);
    this.previous = {
      x: this.state.x,
      y: this.state.y,
      z: this.state.z,
      heading: this.state.heading,
    };
    this.message = "BACK ON TRACK  /  +3.000 SEC";
    this.messageUntil = this.elapsed + 3;
  }
  private readInput(): void {
    const input = this.hooks.input,
      c = this.controls;
    c.throttle = Number(input.isDown("up"));
    c.brake = Number(input.isDown("down"));
    c.steer = keyboardSteer(input.isDown("left"), input.isDown("right"));
    c.handbrake = input.isDown("action");
    if (input.consumePress("pause")) this.hooks.onPause();
    const pads = navigator.getGamepads?.(),
      pad = pads ? Array.from(pads).find((p) => p?.connected) : null;
    if (pad) {
      const axis = pad.axes[0] || 0,
        analog =
          Math.abs(axis) < 0.12
            ? 0
            : (Math.sign(axis) * (Math.abs(axis) - 0.12)) / 0.88;
      if (Math.abs(analog) > Math.abs(c.steer)) c.steer = analog;
      c.throttle = Math.max(c.throttle, pad.buttons[7]?.value || 0);
      c.brake = Math.max(c.brake, pad.buttons[6]?.value || 0);
      c.handbrake ||= pad.buttons[0]?.pressed || false;
      for (const i of [3, 2, 9]) {
        const down = pad.buttons[i]?.pressed || false;
        if (down && !this.padButtons[i]) {
          if (i === 9) this.hooks.onPause();
          if (i === 3) this.changeCamera();
          if (i === 2 && this.phase === "race" && !this.paused) this.resetCar();
        }
        this.padButtons[i] = down;
      }
    } else this.padButtons.length = 0;
  }
  private finish(): void {
    this.phase = "finish";
    this.sound.cue(true);
    this.newBest = !this.best || this.race.time < this.best.time;
    if (this.newBest) {
      this.best = { time: this.race.time, frames: this.recording };
      this.storageFailed = !saveBest(this.hooks.difficulty, this.best);
    }
    const score = Math.max(
      100,
      Math.round(1000000 / Math.max(1, this.race.time)),
    );
    this.hooks.onScore(score);
    this.hooks.onFinish({
      score,
      won: true,
      stats: {
        time: this.race.time,
        topSpeed: Math.round(this.race.topSpeed),
        checkpoints: 8,
        resets: this.race.resets,
      },
    });
    this.publish();
  }
  private step(dt: number): void {
    this.previous.x = this.state.x;
    this.previous.y = this.state.y;
    this.previous.z = this.state.z;
    this.previous.heading = this.state.heading;
    if (this.phase === "countdown") {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before) this.sound.cue();
      if (this.countdown <= 0) {
        this.phase = "race";
        this.message = "CHASE THE HORIZON";
        this.messageUntil = this.elapsed + 2;
      }
      return;
    }
    if (this.phase !== "race") return;
    stepVehicle(
      this.state,
      this.controls,
      dt,
      this.settings.assists && this.hooks.difficulty !== "hard",
      this.hooks.difficulty === "easy" ? 1.18 : 1,
    );
    const crossed = advanceRace(
      this.race,
      this.state.road.progress,
      this.state.road.lateral,
      dt,
      this.state.speed,
    );
    this.recordTimer += dt;
    if (this.recordTimer >= 0.1 && this.recording.length < 18000) {
      this.recordTimer -= 0.1;
      this.recording.push([
        Number(this.race.time.toFixed(3)),
        Number(this.state.x.toFixed(3)),
        Number(this.state.y.toFixed(3)),
        Number(this.state.z.toFixed(3)),
        Number(this.state.heading.toFixed(4)),
      ]);
    }
    if (crossed) {
      this.sound.cue();
      this.message = `SECTOR ${this.race.checkpoint} COMPLETE`;
      this.messageUntil = this.elapsed + 2;
    }
    if (this.race.finished) this.finish();
  }
  private updateGhost(): void {
    const frames = this.best?.frames;
    this.ghost.root.visible =
      !!frames?.length && this.settings.ghost && this.phase === "race";
    if (!this.ghost.root.visible || !frames) return;
    while (
      this.ghostIndex < frames.length - 2 &&
      frames[this.ghostIndex + 1][0] < this.race.time
    )
      this.ghostIndex++;
    const a = frames[this.ghostIndex],
      b = frames[Math.min(frames.length - 1, this.ghostIndex + 1)];
    if (this.race.time > b[0] || b[0] - a[0] > 0.5) {
      this.ghost.root.visible = false;
      return;
    }
    const t = THREE.MathUtils.clamp(
      (this.race.time - a[0]) / Math.max(0.001, b[0] - a[0]),
      0,
      1,
    );
    this.ghost.root.position.set(
      THREE.MathUtils.lerp(a[1], b[1], t),
      THREE.MathUtils.lerp(a[2], b[2], t),
      THREE.MathUtils.lerp(a[3], b[3], t),
    );
    this.ghost.root.rotation.y = THREE.MathUtils.lerp(a[4], b[4], t);
    if (this.ghost.root.position.distanceToSquared(this.car.root.position) < 9)
      this.ghost.root.visible = false;
  }
  private updateCamera(dt: number): void {
    const p = this.car.root.position,
      s = this.state,
      reduced = this.settings.reducedMotion;
    if (this.phase === "menu" || this.phase === "finish") {
      const angle = reduced
        ? -0.85
        : -0.85 + Math.sin(this.elapsed * 0.12) * 0.4;
      this.cameraPosition.set(
        p.x + Math.sin(angle) * 7.9,
        p.y + 2.1,
        p.z + Math.cos(angle) * 7.9,
      );
      this.cameraTarget.set(
        p.x - Math.cos(angle) * 2.2,
        p.y + 1.4,
        p.z + Math.sin(angle) * 2.2,
      );
    } else {
      const heading = s.heading + (reduced ? 0 : s.yaw * 0.12),
        sin = Math.sin(heading),
        cos = Math.cos(heading),
        framing = Math.max(1, 1.1 / this.camera.aspect),
        distance =
          this.cameraMode === 0
            ? (5.9 + Math.abs(s.speed) * 0.01) * framing
            : this.cameraMode === 1
              ? 5.1 * framing
              : -1.05;
      const height =
        this.cameraMode === 0 ? 2.35 : this.cameraMode === 1 ? 1.5 : 1.2;
      const shake =
        reduced || this.cameraMode === 2
          ? 0
          : (Math.sin(this.elapsed * 51) * 0.008 * Math.abs(s.speed)) / 60 +
            Math.sin(this.elapsed * 70) * s.impact * 0.13;
      this.cameraPosition.set(
        p.x - sin * distance,
        p.y + height + shake,
        p.z - cos * distance,
      );
      this.cameraTarget.set(p.x + sin * 9, p.y + 0.9, p.z + cos * 9);
      // A rising road cannot swallow the trailing camera when cresting a hill.
      const behind = trackPoint(
        s.road.progress - Math.max(0, distance) / TRACK_LENGTH,
      );
      this.cameraPosition.y = Math.max(this.cameraPosition.y, behind.y + 1.1);
    }
    this.camera.position.lerp(
      this.cameraPosition,
      1 - Math.exp(-dt * (this.cameraMode === 2 ? 20 : 6)),
    );
    this.smoothTarget.lerp(this.cameraTarget, 1 - Math.exp(-dt * 8));
    this.camera.lookAt(this.smoothTarget);
    const fov =
      this.phase === "menu" || this.phase === "finish"
        ? 53
        : (this.cameraMode === 2 ? 64 : 54) +
          (reduced ? 0 : Math.min(7, Math.abs(s.speed) * 0.1));
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 3, dt);
    this.camera.updateProjectionMatrix();
  }
  private publish(): void {
    this.hooks.onHud({
      phase: this.phase,
      speed: Math.round(Math.abs(this.state.speed) * 3.6),
      rpm: this.state.rpm,
      gear: this.state.speed < -0.5 ? -1 : this.state.gear,
      time: this.race.time,
      best: this.best?.time ?? Infinity,
      sector: this.race.checkpoint,
      progress: Math.max(0, this.race.distance / TRACK_LENGTH),
      x: this.state.x,
      z: this.state.z,
      heading: this.state.heading,
      countdown: Math.max(1, Math.ceil(this.countdown)),
      message: this.elapsed < this.messageUntil ? this.message : "",
      fps: Math.round(this.measuredFps),
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      camera: ["Chase", "Close", "Hood"][this.cameraMode],
      newBest: this.newBest,
      resolution: this.adaptiveScale,
      storageFailed: this.storageFailed,
    });
  }
  private loop = (time: number): void => {
    if (this.disposed) return;
    this.readInput();
    // Poll controls at display refresh, but spend GPU work on at most 60 frames/s.
    if (time < this.nextFrame - 0.5) {
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    this.nextFrame = Math.max(this.nextFrame + 1000 / 60, time - 1000 / 60);
    const raw = this.lastTime ? (time - this.lastTime) / 1000 : 1 / 60,
      dt = Math.min(raw, 0.08);
    this.lastTime = time;
    if (!this.hidden) {
      if (!this.paused) {
        this.elapsed += dt;
        this.accumulator += dt;
        let steps = 0;
        while (this.accumulator >= FIXED_STEP && steps < 10) {
          this.step(FIXED_STEP);
          this.accumulator -= FIXED_STEP;
          steps++;
        }
      }
      const alpha = this.paused ? 1 : this.accumulator / FIXED_STEP;
      this.car.root.position.set(
        THREE.MathUtils.lerp(this.previous.x, this.state.x, alpha),
        THREE.MathUtils.lerp(this.previous.y, this.state.y, alpha),
        THREE.MathUtils.lerp(this.previous.z, this.state.z, alpha),
      );
      this.car.root.rotation.y = THREE.MathUtils.lerp(
        this.previous.heading,
        this.state.heading,
        alpha,
      );
      if (!this.paused) {
        this.car.animate(this.state, this.controls.brake, dt);
        this.effects.update(
          this.state,
          this.state.slip > 0.09 || this.controls.handbrake,
          this.phase === "race" ? dt : 0,
        );
        this.updateCamera(dt);
      }
      this.updateGhost();
      updateSun(this.world.sun, this.state.x, this.state.y, this.state.z);
      this.renderer.render(this.scene, this.camera);
      this.fpsTime += raw;
      this.fpsFrames++;
      this.performanceTime += raw;
      if (this.fpsTime >= 1) {
        this.measuredFps = this.fpsFrames / this.fpsTime;
        this.fpsTime = 0;
        this.fpsFrames = 0;
        this.hooks.onFps(this.measuredFps);
      }
      if (this.performanceTime > 5) {
        this.performanceTime = 0;
        const next =
          this.measuredFps < 46
            ? Math.max(0.6, this.adaptiveScale - 0.1)
            : this.measuredFps > 58
              ? Math.min(1, this.adaptiveScale + 0.05)
              : this.adaptiveScale;
        if (next !== this.adaptiveScale) {
          this.adaptiveScale = next;
          this.resize();
        }
      }
      this.hudTimer += dt;
      if (this.hudTimer >= 0.1) {
        this.hudTimer = 0;
        this.publish();
      }
    }
    this.sound.update(
      this.state,
      this.controls,
      !this.paused &&
        !this.hidden &&
        this.settings.sound &&
        (this.phase === "race" || this.phase === "countdown"),
    );
    this.raf = requestAnimationFrame(this.loop);
  };
  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.sound.dispose();
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("blur", this.blur);
    document.removeEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        geometries.add(o.geometry);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
          materials.add(mat);
          for (const value of Object.values(mat))
            if (value instanceof THREE.Texture) textures.add(value);
        }
        if (o instanceof THREE.InstancedMesh) o.dispose();
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.world?.sun.shadow.dispose();
    this.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
