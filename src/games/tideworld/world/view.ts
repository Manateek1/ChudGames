import * as T from "three";
import { meshColumn } from "./mesh";
import type { WorkerCommand, WorkerResult } from "./mesh.worker";
import { HeldItem } from "./held";
import { texturePixels, TILE } from "./textures";
import { cellKey, type Vec, type VoxelWorld } from "./world";

const radius = 10;
const key = (x: number, z: number) => x + "," + z;
interface Chunk {
  cx: number;
  cz: number;
  band: number | null;
  version: number;
  group: T.Group;
}
interface Slot {
  worker: Worker;
  busy: boolean;
}
type Changes = Extract<WorkerCommand, { type: "changes" }>["cells"];
const clearGroup = (group: T.Group) => {
  for (const mesh of group.children) if (mesh instanceof T.Mesh) mesh.geometry.dispose();
  group.removeFromParent();
  group.clear();
};
const climate: Record<string, [string, string]> = {
  silt_meadow: ["#82b5c1", "#d5dec8"],
  rainwood: ["#8eafaf", "#c4d0b5"],
  lantern_fen: ["#879eab", "#c0cec1"],
  frostwood: ["#90afc6", "#d4ddd9"],
  frost_crown: ["#849fbf", "#dfdfd9"],
  wind_ridge: ["#8da9bb", "#d0d6c8"],
  red_scrub: ["#acbabc", "#dfc5ad"],
  cinder_shelf: ["#a4a1a6", "#ccbcac"],
  brine_bay: ["#83aab8", "#c4d8d2"],
  storm_coast: ["#889fae", "#c1cdd0"],
  salt_basin: ["#a8b7bd", "#dbd1bd"],
};
function material(texture: T.DataArrayTexture, pass: number) {
  return new T.ShaderMaterial({
    glslVersion: T.GLSL3,
    transparent: pass === 2,
    depthWrite: pass !== 2,
    side: pass === 1 ? T.DoubleSide : T.FrontSide,
    uniforms: {
      mapTiles: { value: texture },
      day: { value: 1 },
      fogTint: { value: new T.Color() },
      fogStart: { value: 90 },
      fogEnd: { value: 157 },
      clock: { value: 0 },
    },
    vertexShader: `in float tileLayer;in float skyLight;in vec3 tint;out float vSky;out vec3 vTint;out vec2 vUv;flat out int layer;out float distanceToEye;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;distanceToEye=length(mv.xyz);vUv=uv;layer=int(tileLayer+.5);vTint=tint;vSky=skyLight;}`,
    fragmentShader: `precision highp sampler2DArray;uniform sampler2DArray mapTiles;uniform vec3 fogTint;uniform float fogStart,fogEnd,day,clock;
      in float vSky;in vec3 vTint;in vec2 vUv;flat in int layer;in float distanceToEye;out vec4 result;
      void main(){vec4 texel=texture(mapTiles,vec3(vUv,float(layer)));if(texel.a<.20)discard;
      vec3 lit=texel.rgb*max(vTint,vSky*mix(vec3(.2,.29,.43),vec3(1.04,1.02,.98),day));
      ${pass === 2 ? "lit*=.99+.045*sin(vUv.x*.48+vUv.y*.72+clock*.85);" : ""}
      lit=mix(lit,fogTint,smoothstep(fogStart,fogEnd,distanceToEye));result=linearToOutputTexel(vec4(lit,${pass === 2 ? "texel.a" : "1."}));}`,
  });
}
function skyDome() {
  return new T.Mesh(
    new T.SphereGeometry(310, 24, 16),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: {
        high: { value: new T.Color() },
        low: { value: new T.Color() },
        sun: { value: new T.Vector3() },
        phase: { value: 0.3 },
      },
      vertexShader: `varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 direction;uniform vec3 high,low,sun;uniform float phase;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){vec3 d=normalize(direction);vec3 col=mix(low,high,smoothstep(-.03,.63,d.y));
      if(d.y>0.){vec2 p=floor((d.xz/max(d.y,.045)*3.+vec2(phase*4.,.8))*22.)/22.;
      float c=noise(p*.63)*.69+noise(p*1.9)*.31;float cloud=smoothstep(.59,.69,c)*smoothstep(.025,.25,d.y);
      col=mix(col,mix(low,vec3(.93,.91,.78),.46),cloud*.73);
      float s=dot(d,sun);col+=vec3(1.,.78,.49)*(smoothstep(.9991,.9997,s)+pow(max(0.,s),115.)*.29);}
      gl_FragColor=vec4(col,1.);
      #include <colorspace_fragment>
    }`,
    }),
  );
}
export class VoxelView {
  readonly scene = new T.Scene();
  readonly actors = new T.Group();
  readonly camera = new T.PerspectiveCamera(60, 1, 0.06, 370);
  readonly renderer: T.WebGLRenderer;
  private host: HTMLElement;
  private world: VoxelWorld;
  private texture: T.DataArrayTexture;
  private held: HeldItem;
  private materials: T.ShaderMaterial[];
  private sky = skyDome();
  private chunks = new Map<string, Chunk>();
  private wanted = new Map<string, number | null>();
  private versions = new Map<string, number>();
  private pending = new Set<string>();
  private changes = new Map<string, Vec>();
  private slots: Slot[] = [];
  private waiting: WorkerResult[] = [];
  private outline: T.LineSegments<T.EdgesGeometry, T.LineBasicMaterial>;
  private resize: ResizeObserver;
  private unsubscribe: () => void;
  private cx = Infinity;
  private cz = Infinity;
  private band: number | null = null;
  private ox = 0;
  private oz = 0;
  private width = 1;
  private height = 1;
  private fov = NaN;
  private gone = false;
  private hemisphere = new T.HemisphereLight(0xfff3d5, 0x708171, 1.7);
  private sun = new T.DirectionalLight(0xffedc2, 1.8);
  private fog = new T.Color();
  private zenith = new T.Color();
  private skyHigh = new T.Color();
  private skyLow = new T.Color();
  private sunset = new T.Color("#db9c79");
  private twilight = new T.Color("#857e9c");
  private night = new T.Color("#29354a");
  private nightHorizon = new T.Color("#45555b");
  private precipitation: T.LineSegments<T.BufferGeometry, T.LineBasicMaterial>;
  private lastMeshTime = 0;
  brightness = 1;
  constructor(host: HTMLElement, world: VoxelWorld) {
    this.host = host;
    this.world = world;
    this.renderer = new T.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.info.autoReset = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.domElement.setAttribute("aria-label", "First-person voxel world");
    this.renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
    host.append(this.renderer.domElement);
    const { data, layers } = texturePixels();
    this.texture = new T.DataArrayTexture(data, TILE, TILE, layers);
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.magFilter = T.NearestFilter;
    this.texture.minFilter = T.NearestMipmapLinearFilter;
    this.texture.wrapS = this.texture.wrapT = T.RepeatWrapping;
    this.texture.generateMipmaps = true;
    this.texture.needsUpdate = true;
    this.held = new HeldItem(this.texture);
    this.materials = [0, 1, 2].map((pass) => material(this.texture, pass));
    const box = new T.BoxGeometry(1.007, 1.007, 1.007);
    this.outline = new T.LineSegments(
      new T.EdgesGeometry(box),
      new T.LineBasicMaterial({ color: 0xffe8ab, transparent: true, opacity: 0.83, depthWrite: false }),
    );
    box.dispose();
    this.outline.visible = false;
    this.sun.position.set(-36, 61, -25);
    this.scene.add(this.hemisphere, this.sun, this.sky, this.actors, this.outline);
    this.sky.renderOrder = -20;
    const positions = new Float32Array(128 * 6);
    for (let i = 0; i < 128; i++) {
      const x = (((i * 97) % 137) / 137) * 20 - 10,
        y = (((i * 23) % 127) / 127) * 12 - 5,
        z = (((i * 71) % 139) / 139) * 20 - 10;
      positions.set([x, y, z, x + 0.07, y - 0.55, z], i * 6);
    }
    const rainGeo = new T.BufferGeometry();
    rainGeo.setAttribute("position", new T.BufferAttribute(positions, 3));
    this.precipitation = new T.LineSegments(
      rainGeo,
      new T.LineBasicMaterial({ color: 0xc1d4d4, opacity: 0.45, transparent: true, depthWrite: false }),
    );
    this.scene.add(this.precipitation);
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(host);
    this.resizeCanvas();
    this.unsubscribe = world.onDirty((x, y, z) => {
      this.changes.set(cellKey(x, y, z), { x, y, z });
      const cx = Math.floor(x / 16),
        cz = Math.floor(z / 16);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const k = key(cx + dx, cz + dz);
          this.versions.set(k, (this.versions.get(k) ?? 0) + 1);
        }
    });
    try {
      const count = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));
      for (let i = 0; i < count; i++) {
        const worker = new Worker(new URL("./mesh.worker.ts", import.meta.url), { type: "module" }),
          slot = { worker, busy: false };
        worker.onmessage = (e: MessageEvent<WorkerResult>) => {
          slot.busy = false;
          const { cx, cz } = e.data.result;
          this.pending.delete(key(cx, cz));
          this.waiting.push(e.data);
        };
        worker.onerror = () => {
          worker.terminate();
          this.slots = this.slots.filter((s) => s !== slot);
          this.pending.clear();
        };
        const init: WorkerCommand = {
          type: "init",
          seed: world.seed,
          edits: world.edits,
          facings: world.facings,
          variants: world.variants,
        };
        worker.postMessage(init);
        this.slots.push(slot);
      }
    } catch {
      for (const slot of this.slots) slot.worker.terminate();
      this.slots = [];
    }
    for (const k of world.allChanges()) {
      const [x, y, z] = k.split(",").map(Number);
      this.changes.set(k, { x, y, z });
    }
  }
  private resizeCanvas() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.width = w;
    this.height = h;
    this.held.resize(w / h);
    this.camera.aspect = w / h;
    this.fov = NaN;
    this.renderer.setSize(w, h, false);
  }
  private requests(eye: Vec) {
    const cx = Math.floor(eye.x / 16),
      cz = Math.floor(eye.z / 16);
    const underground = eye.y < this.world.height(eye.x, eye.z) - 1;
    const band = underground ? Math.floor(eye.y / 16) * 16 : null;
    if (this.cx === cx && this.cz === cz && this.band === band) return;
    this.cx = cx;
    this.cz = cz;
    this.band = band;
    this.ox = cx * 16;
    this.oz = cz * 16;
    this.wanted.clear();
    const order: { cx: number; cz: number; dist: number }[] = [];
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        order.push({ cx: cx + dx, cz: cz + dz, dist: dx * dx + dz * dz });
      }
    order.sort((a, b) => a.dist - b.dist);
    for (const c of order) this.wanted.set(key(c.cx, c.cz), c.dist <= 20 ? band : null);
    for (const [k, c] of this.chunks) {
      if (!this.wanted.has(k)) {
        clearGroup(c.group);
        this.chunks.delete(k);
        this.versions.delete(k);
      } else c.group.position.set(c.cx * 16 - this.ox, 0, c.cz * 16 - this.oz);
    }
    this.actors.position.set(-this.ox, 0, -this.oz);
  }
  private upload({ result, band, version }: WorkerResult) {
    const { cx, cz, layers } = result,
      k = key(cx, cz);
    if (this.wanted.get(k) !== band || version !== (this.versions.get(k) ?? 0) || this.gone) return;
    const old = this.chunks.get(k);
    if (old) clearGroup(old.group);
    const group = new T.Group();
    group.position.set(cx * 16 - this.ox, 0, cz * 16 - this.oz);
    layers.forEach((layer, index) => {
      if (!layer.indices.length) return;
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.BufferAttribute(layer.positions, 3));
      geometry.setAttribute("uv", new T.BufferAttribute(layer.uv, 2));
      geometry.setAttribute("tileLayer", new T.BufferAttribute(layer.tiles, 1));
      geometry.setAttribute("skyLight", new T.BufferAttribute(layer.sky, 1));
      geometry.setAttribute("tint", new T.BufferAttribute(layer.colors, 3));
      geometry.setIndex(new T.BufferAttribute(layer.indices, 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new T.Mesh(geometry, this.materials[index]);
      mesh.renderOrder = index;
      group.add(mesh);
    });
    this.scene.add(group);
    this.chunks.set(k, { cx, cz, band, version, group });
  }
  private stream() {
    if (this.changes.size) {
      const cells: Changes = [];
      for (const { x, y, z } of this.changes.values()) {
        const k = cellKey(x, y, z);
        cells.push({
          x,
          y,
          z,
          id: this.world.get(x, y, z),
          variant: this.world.variants[k],
          facing: this.world.facings[k],
          fluid: this.world.renderFluid(x, y, z),
          lit: this.world.lit(x, y, z),
        });
      }
      this.changes.clear();
      this.slots.forEach((s) => s.worker.postMessage({ type: "changes", cells } satisfies WorkerCommand));
    }
    for (let i = 0; i < 3 && this.waiting.length; i++) this.upload(this.waiting.shift()!);
    if (this.slots.length && this.slots.every((s) => s.busy)) return;
    for (const [k, band] of this.wanted) {
      const old = this.chunks.get(k),
        version = this.versions.get(k) ?? 0;
      if ((old?.band === band && old.version === version) || this.pending.has(k)) continue;
      const [cx, cz] = k.split(",").map(Number);
      const slot = this.slots.find((s) => !s.busy);
      if (slot) {
        this.pending.add(k);
        slot.busy = true;
        slot.worker.postMessage({ type: "mesh", cx, cz, band, version } satisfies WorkerCommand);
      } else if (!this.slots.length && performance.now() - this.lastMeshTime > 12) {
        this.upload({ result: meshColumn(this.world, cx, cz, band), band, version });
        this.lastMeshTime = performance.now();
        return;
      } else return;
    }
  }
  setHeld(id: string | null) {
    this.held.set(id);
  }
  draw(
    eye: Vec,
    yaw: number,
    pitch: number,
    ticks: number,
    target?: Vec | null,
    weather = "clear",
    horizontalFov = 82,
  ) {
    if (this.gone) return;
    this.requests(eye);
    this.stream();
    if (horizontalFov !== this.fov) {
      this.fov = horizontalFov;
      this.camera.fov = T.MathUtils.radToDeg(
        2 * Math.atan(Math.tan(T.MathUtils.degToRad(horizontalFov) * 0.5) / this.camera.aspect),
      );
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(eye.x - this.ox, eye.y, eye.z - this.oz);
    this.camera.rotation.set(pitch, yaw, 0, "YXZ");
    const phase = (((ticks % 43200) + 43200) % 43200) / 43200;
    const day =
      phase < 0.1
        ? 0.2 + (0.8 * phase) / 0.1
        : phase < 0.55
          ? 1
          : phase < 0.65
            ? 1 - (0.8 * (phase - 0.55)) / 0.1
            : 0.2;
    const wet = /rain|storm|fog|mist|snow/.test(weather);
    const [sky, fog] = climate[this.world.biome(eye.x, eye.z)] ?? climate.silt_meadow;
    this.skyHigh.set(sky);
    this.skyLow.set(fog);
    this.zenith.copy(this.night).lerp(this.skyHigh, day);
    this.fog.copy(this.nightHorizon).lerp(this.skyLow, day);
    const blush = Math.max(0, 1 - Math.abs(phase - 0.605) / 0.055, 1 - Math.abs(phase - 0.045) / 0.045);
    this.fog.lerp(this.sunset, blush * 0.73);
    this.zenith.lerp(this.twilight, blush * 0.49);
    if (wet) {
      this.zenith.lerp(this.nightHorizon, 0.48);
      this.fog.lerp(this.skyHigh, 0.51);
    }
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.high.value.copy(this.zenith);
    this.sky.material.uniforms.low.value.copy(this.fog);
    this.sky.material.uniforms.phase.value = phase;
    const solar = ((phase - 0.05) * Math.PI) / 0.55;
    this.sky.material.uniforms.sun.value.set(Math.cos(solar), Math.sin(solar), -0.48).normalize();
    const submerged = this.world.renderFluid(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z)) > 0;
    if (submerged) this.fog.set("#476977");
    for (const mat of this.materials) {
      mat.uniforms.day.value = day * this.brightness;
      mat.uniforms.fogTint.value.copy(this.fog);
      const far = submerged ? 17 : wet ? 90 : 155;
      mat.uniforms.fogStart.value = (far * 2) / 3;
      mat.uniforms.fogEnd.value = far;
      mat.uniforms.clock.value = ticks / 30;
    }
    this.hemisphere.intensity = (0.38 + day * 1.4) * this.brightness;
    this.sun.intensity = day * 1.7;
    this.precipitation.visible = wet && !submerged && this.band === null;
    if (this.precipitation.visible)
      this.precipitation.position.set(
        this.camera.position.x,
        eye.y + 3 - ((ticks / 8) % 3),
        this.camera.position.z,
      );
    this.outline.visible = Boolean(target);
    if (target) this.outline.position.set(target.x - this.ox + 0.5, target.y + 0.5, target.z - this.oz + 0.5);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    this.held.draw(this.renderer);
  }
  dispose() {
    this.gone = true;
    this.unsubscribe();
    this.resize.disconnect();
    for (const s of this.slots) {
      s.worker.onmessage = null;
      s.worker.onerror = null;
      s.worker.terminate();
    }
    this.waiting.length = 0;
    this.changes.clear();
    this.pending.clear();
    this.chunks.forEach((c) => clearGroup(c.group));
    this.chunks.clear();
    this.materials.forEach((m) => m.dispose());
    this.outline.geometry.dispose();
    this.outline.material.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.precipitation.geometry.dispose();
    this.precipitation.material.dispose();
    this.held.dispose();
    this.texture.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
