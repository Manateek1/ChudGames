import * as THREE from "three";
import type { GraphicsQuality } from "../../types/arcade";
import { atmospheres, createClouds, createSky, createVoxelMaterials } from "./appearance";
import { VoxelActors, VoxelHand } from "./models";
import type { Actor } from "./models";
import type { HudState, MeshLayer, MeshMessage, MobView, Pose, Realm } from "./protocol";

const drawDistances: Record<GraphicsQuality, [near: number, far: number, resolution: number]> = {
  low: [15, 34, 1], medium: [23, 55, 1.2], high: [31, 74, 1.5],
};

const dayTicks = 24_000;
const sunsetTick = 13_400;
const dusk = new THREE.Color(0xe8a383);
const stormTint = new THREE.Color(0x839fa4);
const darkCloud = new THREE.Color(0x64758e);
const caveMobs = new THREE.Color(1.10, 0.89, 1.03);
const nightMobs = new THREE.Color(0.35, 0.49, 0.66);
const dayMobs = new THREE.Color(1.34, 1.26, 1.17);
const borderIdle = new THREE.Color(0xffedbc);
const borderActive = new THREE.Color(0xfdbb70);
const nightTerrain = new THREE.Color(0.28, 0.38, 0.54);
const caveTerrain = new THREE.Color(1.44, 1.31, 1.42);
const dayTerrain = new THREE.Color(1.73, 1.61, 1.46);
const skyTerrain = new THREE.Color(1.73, 1.58, 1.84);

function meshLayer(layer: MeshLayer, material: THREE.Material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(layer.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(layer.normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(layer.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(layer.indices, 1));
  geometry.computeBoundingSphere();
  return new THREE.Mesh(geometry, material);
}

function outlineGeometry() {
  const box = new THREE.BoxGeometry(1.006, 1.006, 1.006);
  const outline = new THREE.EdgesGeometry(box);
  box.dispose();
  return outline;
}

function rain() {
  const count = 145;
  const positions = new Float32Array(count * 6);
  for (let index = 0; index < count; index++) {
    const x = ((index * 127) % 191) / 191 - 0.5;
    const y = ((index * 113) % 167) / 167;
    const z = ((index * 137) % 173) / 173 - 0.5;
    const offset = index * 6;
    positions.set([x, y, z, x + 0.006, y, z], offset);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { elapsed: { value: 0 }, strength: { value: 0 } },
    vertexShader: `
      uniform float elapsed;
      varying float fade;
      void main() {
        bool tail = gl_VertexID % 2 == 1;
        float y = 1.0 - fract(position.y + elapsed * 0.75);
        vec3 point = vec3(position.x * 21.0 + y * 0.9, y * 11.0 - 5.0 + (tail ? 0.28 : 0.0), position.z * 21.0);
        fade = (tail ? 0.35 : 0.9) * (1.0 - 2.0 * max(abs(position.x), abs(position.z)));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
      }
    `,
    fragmentShader: `
      uniform float strength;
      varying float fade;
      void main() {
        gl_FragColor = vec4(0.52, 0.68, 0.74, fade * strength);
        #include <colorspace_fragment>
      }
    `,
  });
  const result = new THREE.LineSegments(geometry, material);
  result.frustumCulled = false;
  result.renderOrder = 40;
  return result;
}

export class BuildBloxRenderer {
  readonly canvas: HTMLCanvasElement;

  private readonly mount: HTMLElement;
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: false, alpha: false, powerPreference: "high-performance",
  });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(66, 1, 0.05, 345);
  private readonly fog = new THREE.Fog(0xdfe8d3, 21, 48);
  private readonly sunColor = new THREE.Color();
  private readonly sky = createSky();
  private readonly clouds = createClouds();
  private readonly rain = rain();
  private readonly voxel = createVoxelMaterials();
  private readonly hand = new VoxelHand();
  private readonly models = new VoxelActors();
  private readonly chunks = new Map<string, { x: number; z: number; meshes: THREE.Mesh[] }>();
  private readonly actors = new Map<string, Actor>();
  private readonly outline = new THREE.LineSegments(
    outlineGeometry(),
    new THREE.LineBasicMaterial({ color: borderIdle, opacity: 0.82, transparent: true, depthWrite: false }),
  );
  private readonly sunDirection = new THREE.Vector3();
  private readonly zenith = new THREE.Color();
  private readonly horizon = new THREE.Color();
  private readonly resize: ResizeObserver;
  private readonly previous = new THREE.Vector3();
  private realm: Realm = "surface";
  private quality: GraphicsQuality;
  private previousTime = 0;
  private elapsed = 0;
  private moving = 0;
  private stamp = 0;

  constructor(mount: HTMLElement, quality: GraphicsQuality) {
    this.mount = mount;
    this.quality = quality;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "buildblox-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-label", "BuildBlox game");
    this.canvas.style.cssText = "display:block;width:100%;height:100%;outline:none;touch-action:none";
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.camera.rotation.order = "YXZ";
    this.scene.fog = this.fog;
    this.camera.add(this.hand.root);
    this.scene.add(this.camera, this.sky.sky, this.clouds, this.rain, this.outline);
    this.outline.visible = false;
    mount.appendChild(this.canvas);
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(mount);
    this.setQuality(quality);
    this.atmosphere(0, 0, 0);
  }


  private resizeCanvas() {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setQuality(quality: GraphicsQuality) {
    this.quality = quality;
    const [, , resolution] = drawDistances[quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, resolution));
    this.resizeCanvas();
  }

  setRealm(realm: Realm) {
    if (realm === this.realm) return;
    this.realm = realm;
    this.remove(this.chunks.keys());
    for (const actor of this.actors.values()) actor.root.removeFromParent();
    this.actors.clear();
    this.outline.visible = false;
    this.previousTime = 0;
  }

  receive({ realm, key, solid, liquid }: MeshMessage) {
    if (realm !== this.realm) return;
    if (this.chunks.has(key)) this.remove([key]);
    const meshes: THREE.Mesh[] = [];
    if (solid.indices.length) meshes.push(meshLayer(solid, this.voxel.solid));
    if (liquid.indices.length) meshes.push(meshLayer(liquid, this.voxel.liquid));
    if (!meshes.length) return;
    const [cx, cz] = key.split(",").map(Number);
    this.chunks.set(key, { x: (cx + 0.5) * 16, z: (cz + 0.5) * 16, meshes });
    this.scene.add(...meshes);
  }

  remove(keys: Iterable<string>) {
    for (const key of keys) {
      const chunk = this.chunks.get(key);
      if (!chunk) continue;
      for (const mesh of chunk.meshes) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
      }
      this.chunks.delete(key);
    }
  }

  private atmosphere(tick: number, x: number, z: number) {
    const palette = atmospheres[this.realm];
    const cave = this.realm === "underdeep";
    const localTick = tick % dayTicks;
    const sunCycle = localTick < sunsetTick ? localTick / sunsetTick : 1 + (localTick - sunsetTick) / (dayTicks - sunsetTick);
    const angle = sunCycle * Math.PI;
    const elevation = Math.sin(angle);
    const daylight = cave ? 0.37 : THREE.MathUtils.smoothstep(elevation, -0.16, 0.07);
    const twilight = cave ? 0 : (1 - THREE.MathUtils.smoothstep(Math.abs(elevation), 0.02, 0.33)) * daylight;
    const rainCycle = tick % 16_000;
    const rainfall = this.realm === "surface" ? Math.max(0, 1 - Math.abs(rainCycle - 5_900) / 880) : 0;
    this.sunDirection.set(-0.77 * Math.cos(angle), elevation, -0.64).normalize();
    this.sunColor.copy(palette.sunlight).lerp(dusk, twilight * 0.62);
    this.models.material.color.copy(cave ? caveMobs : nightMobs)
      .lerp(dayMobs, cave ? 0 : daylight)
      .multiplyScalar(1 - rainfall * 0.29);
    this.voxel.terrainLight.value.copy(cave ? caveTerrain : nightTerrain)
      .lerp(this.realm === "skyreach" ? skyTerrain : dayTerrain, cave ? 0 : daylight)
      .multiplyScalar(1 - rainfall * 0.20);
    this.zenith.copy(palette.night).lerp(palette.zenith, daylight).lerp(stormTint, rainfall * 0.51);
    this.horizon.copy(palette.nightHorizon).lerp(palette.horizon, daylight)
      .lerp(dusk, twilight * 0.30).lerp(stormTint, rainfall * 0.47);
    const [near, far] = drawDistances[this.quality];
    this.fog.color.copy(this.horizon);
    this.fog.near = cave ? 5.6 : near * (1 - rainfall * 0.37);
    this.fog.far = cave ? far * 0.66 : far * (1 - rainfall * 0.22);
    const sky = this.sky.skyUniforms;
    sky.zenith.value.copy(this.zenith);
    sky.horizon.value.copy(this.horizon);
    sky.sunDirection.value.copy(this.sunDirection);
    sky.sunColor.value.copy(this.sunColor);
    sky.daylight.value = daylight;
    sky.celestial.value = cave ? 0 : 1 - rainfall * 0.82;
    this.clouds.visible = !cave;
    this.clouds.material.color.copy(darkCloud).lerp(palette.cloud, daylight).lerp(stormTint, rainfall * 0.61);
    const wind = (tick % dayTicks) * 0.004;
    const cloudHeight = this.realm === "skyreach" ? Math.max(150, this.camera.position.y + 14) : 80;
    this.clouds.position.set(x + wind, cloudHeight, z + wind * 0.18);
    this.rain.visible = rainfall > 0.04 && this.quality !== "low";
    this.rain.position.copy(this.camera.position);
    this.rain.material.uniforms.elapsed.value = tick / 20;
    this.rain.material.uniforms.strength.value = rainfall * 0.52;
  }

  private updateActors(mobs: MobView[], dt: number) {
    const stamp = ++this.stamp;
    const ease = 1 - Math.exp(-dt * 17);
    for (const mob of mobs) {
      let actor = this.actors.get(mob.id);
      if (!actor) {
        actor = this.models.create(mob.kind);
        actor.root.position.set(mob.x, mob.y, mob.z);
        actor.root.rotation.y = mob.yaw;
        actor.health = mob.health;
        this.actors.set(mob.id, actor);
        this.scene.add(actor.root);
      }
      actor.stamp = stamp;
      if (mob.health < actor.health) actor.damage = 1;
      actor.health = mob.health;
      actor.damage = Math.max(0, actor.damage - dt * 5);
      const root = actor.root;
      const dx = (mob.x - root.position.x) * ease;
      const dz = (mob.z - root.position.z) * ease;
      root.position.x += dx;
      root.position.z += dz;
      root.position.y += (mob.y - root.position.y) * ease;
      const yaw = mob.yaw - root.rotation.y;
      root.rotation.y += Math.atan2(Math.sin(yaw), Math.cos(yaw)) * ease;
      const pace = Math.hypot(dx, dz);
      actor.stride += pace * 10;
      actor.body.position.y = mob.kind === "sentinel" ? Math.sin(this.elapsed * 3) * 0.12 : 0;
      actor.body.rotation.z = Math.sin(this.elapsed * 38) * actor.damage * 0.12;
      const gait = Math.sin(actor.stride) * Math.min(0.59, pace * 15);
      for (let i = 0; i < actor.feet.length; i++) actor.feet[i].rotation.x = gait * (i === 0 || i === 3 ? 1 : -1);
    }
    for (const [id, actor] of this.actors) {
      if (actor.stamp === stamp) continue;
      actor.root.removeFromParent();
      this.actors.delete(id);
    }
  }

  render(state: HudState, pose: Pose) {
    const time = performance.now() * 0.001;
    const dt = this.previousTime ? Math.max(0, Math.min(0.06, time - this.previousTime)) : 0;
    this.previousTime = time;
    this.elapsed += dt;
    const velocity = dt > 0 ? Math.hypot(pose.x - this.previous.x, pose.z - this.previous.z) / dt : 0;
    this.previous.set(pose.x, pose.y, pose.z);
    this.moving += (Math.min(1, velocity / 4) - this.moving) * Math.min(1, dt * 13);
    this.camera.position.set(pose.x, pose.y + 1.58, pose.z);
    this.camera.rotation.set(pose.pitch, pose.yaw, 0);
    this.sky.sky.position.copy(this.camera.position);
    this.voxel.waterTime.value = this.elapsed;
    this.atmosphere(state.tick, pose.x, pose.z);
    this.updateActors(state.mobs, dt);
    const visibleDistance = (this.fog.far + 20) ** 2;
    for (const chunk of this.chunks.values()) {
      const visible = (chunk.x - pose.x) ** 2 + (chunk.z - pose.z) ** 2 <= visibleDistance;
      for (const mesh of chunk.meshes) mesh.visible = visible;
    }
    this.hand.update(state.inventory[state.selected]?.id ?? 0, this.moving, this.elapsed, state.mining, dt, state.dead, this.camera.aspect);
    const target = state.target;
    this.outline.visible = target !== null;
    if (target) {
      this.outline.position.set(target[0] + 0.5, target[1] + 0.5, target[2] + 0.5);
      this.outline.material.color.copy(borderIdle).lerp(borderActive, state.mining);
      this.outline.material.opacity = 0.73 + state.mining * 0.26;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resize.disconnect();
    this.remove(this.chunks.keys());
    this.models.dispose();
    this.actors.clear();
    this.hand.dispose();
    this.sky.sky.geometry.dispose();
    this.sky.sky.material.dispose();
    this.clouds.geometry.dispose();
    this.clouds.material.dispose();
    this.clouds.dispose();
    this.rain.geometry.dispose();
    this.rain.material.dispose();
    this.outline.geometry.dispose();
    this.outline.material.dispose();
    this.voxel.solid.dispose();
    this.voxel.liquid.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
