import * as T from "three";
import { clamp } from "../../engine/math";
import { RollingFps, shouldSkipFrame } from "../../engine/fps";
import type { GraphicsQuality } from "../../types/arcade";
import { night, type Farm, type Station } from "./farm";
import { crate, dock, house, landscape, sculpt, tree } from "./models";

const tau = Math.PI * 2;
function slab(parent: T.Object3D, points: number[][], top: number, depth: number, color: string) {
  const shape = new T.Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const geo = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const m = new T.Mesh(geo, new T.MeshStandardMaterial({ color, flatShading: true }));
  m.position.y = top - depth;
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function field(w: number, d: number) {
  return [
    [-w + 1, -d],
    [w - 1, -d],
    [w, -d + 1],
    [w, d - 1],
    [w - 1, d],
    [-w + 1, d],
    [-w, d - 1],
    [-w, -d + 1],
  ];
}
function shore(w: number, d: number) {
  return Array.from({ length: 48 }, (_, i) => {
    const a = (i * tau) / 48,
      c = Math.cos(a),
      s = Math.sin(a),
      wiggle = 1 + 0.022 * Math.sin(a * 5) + 0.014 * Math.cos(a * 3);
    return [w * Math.sign(c) * Math.abs(c) ** 0.87 * wiggle, d * Math.sign(s) * Math.abs(s) ** 0.83 * wiggle];
  });
}
export function createPond(
  host: HTMLElement,
  quality: GraphicsQuality,
  onFeed: () => void,
  onFps: (n: number) => void,
) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1.35));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = quality === "high";
  renderer.shadowMap.needsUpdate = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  host.appendChild(renderer.domElement);
  const scene = new T.Scene(),
    camera = new T.OrthographicCamera(-12, 12, 9, -9, 0.1, 150);
  const sun = new T.DirectionalLight("#fff2d2", 2.45);
  sun.position.set(-8, 18, 7);
  sun.castShadow = true;
  const shadowSize = quality === "low" ? 512 : 1024;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12 });
  sun.shadow.normalBias = 0.025;
  const sky = new T.HemisphereLight("#fff9e6", "#889d84", 1.45);
  scene.add(sun, sky);
  const ground = new T.Mesh(new T.PlaneGeometry(180, 180), new T.ShadowMaterial({ opacity: 0.24 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.48;
  ground.receiveShadow = true;
  scene.add(ground);
  slab(scene, field(9.45, 7), -1.04, 0.42, "#ad835d");
  slab(scene, field(9.5, 7.05), -0.4, 0.69, "#c89868");
  slab(scene, field(9.52, 7.07), -0.18, 0.23, "#ad9157");
  slab(scene, field(9.56, 7.11), 0.07, 0.27, "#8eae62");
  slab(scene, shore(7.28, 3.96), 0.09, 0.05, "#cfc98e");
  const shallows = slab(scene, shore(6.98, 3.71), 0.11, 0.04, "#88c9a1");
  slab(scene, shore(6.58, 3.36), 0.125, 0.02, "#69c4ae");
  const water = slab(scene, shore(6.09, 2.98), 0.136, 0.015, "#46ada9");
  const scenery = sculpt(scene);
  scenery.put("box", "#d5bc87", 0.6, 0.095, 5.45, 15.1, 0.04, 1.36);
  scenery.put("box", "#d5bc87", -7.43, 0.095, 0.2, 1.05, 0.04, 10.8);
  scenery.put("box", "#d5bc87", -0.35, 0.095, -4.56, 14.7, 0.04, 0.9);
  landscape(scenery.put);
  for (let i = 0; i < 35; i++) {
    const x = Math.sin(i * 11.6) * 5.55,
      z = Math.cos(i * 2.7) * 2.35;
    if ((x / 6) ** 2 + (z / 2.9) ** 2 < 1)
      scenery.put("box", "#a1d9be", x, 0.16, z, 0.12 + (i % 5) * 0.13, 0.014, 0.035, 0, (i % 2) * 0.12);
  }
  scenery.finish();
  const upgrades: Partial<Record<Station, T.Group>> = {};
  function model(id: Station, make: (part: ReturnType<typeof sculpt>["put"]) => void) {
    const g = new T.Group();
    scene.add(g);
    upgrades[id] = g;
    const batch = sculpt(g);
    make(batch.put);
    batch.finish();
  }
  model("ducks", (p) => {
    dock(p, 4.9, -4, 8);
    house(p, 4.9, -3.65, 0.72, "#b85f42", 0.42);
  });
  model("nursery", (p) => {
    for (let i = 0; i < 2; i++) {
      const z = 3.2 + i * 0.7;
      p("box", "#9f704b", -1, 0.22, z, 2.9, 0.24, 0.75);
      p("box", "#83beaa", -1, 0.35, z, 2.68, 0.04, 0.58);
      for (let j = 0; j < 6; j++) p("box", "#efcf8e", -2.3 + j * 0.49, 0.39, z, 0.035, 0.035, 0.66);
    }
  });
  model("dike", (p) => {
    for (let i = 0; i < 4; i++) tree(p, -2.2 + i * 1.68, -5.88, 0.82, true);
    crate(p, 2.2, -4.55, 0.7);
  });
  model("wheel", (p) => {
    for (const x of [-6.4, -5.26]) p("box", "#986c46", x, 0.61, 0.6, 0.15, 1.25, 0.23);
    p("box", "#594f37", -5.83, 1.09, 0.6, 1.65, 0.16, 0.16);
  });
  const wheel = new T.Group();
  scene.add(wheel);
  wheel.position.set(-5.83, 1.08, 0.6);
  const paddles = sculpt(wheel);
  for (let i = 0; i < 8; i++) {
    const a = (i * tau) / 8;
    paddles.put("box", "#bd874e", 0, Math.cos(a) * 0.65, Math.sin(a) * 0.65, 1.02, 0.13, 0.37, a);
    paddles.put("box", "#745237", 0, 0, 0, 0.13, 1.4, 0.09, a);
  }
  paddles.finish();

  const fishGeometry = new T.IcosahedronGeometry(1, 0),
    fishMaterial = new T.MeshStandardMaterial({ flatShading: true });
  const bodies = new T.InstancedMesh(fishGeometry, fishMaterial, 80);
  const tails = new T.InstancedMesh(fishGeometry, fishMaterial, 80);
  scene.add(bodies, tails);
  const colors = ["#f9b75e", "#d3ede1", "#769eaa", "#d58a61"];
  const species = ["grass", "silver", "bighead", "common"] as const;
  const ducks = Array.from({ length: 5 }, () => {
    const g = new T.Group(),
      b = sculpt(g);
    scene.add(g);
    b.put("ball", "#fff4d3", 0, 0.16, 0, 0.59, 0.35, 0.39);
    b.put("ball", "#fff5d7", 0.23, 0.36, 0, 0.3, 0.32, 0.3);
    b.put("box", "#e89a42", 0.41, 0.32, 0, 0.15, 0.075, 0.16);
    b.put("stone", "#f9e7c3", -0.24, 0.24, 0, 0.24, 0.19, 0.23, 0, 0, -0.4);
    for (const z of [-0.124, 0.124]) b.put("ball", "#332f28", 0.29, 0.4, z, 0.048, 0.048, 0.048);
    b.finish();
    return g;
  });
  const porter = new T.Group();
  const carrier = sculpt(porter);
  carrier.put("post", "#384d41", -0.08, 0.29, 0, 0.14, 0.43, 0.15);
  carrier.put("post", "#384d41", 0.08, 0.29, 0.06, 0.14, 0.43, 0.15);
  carrier.put("box", "#477f77", 0, 0.6, 0, 0.4, 0.44, 0.26);
  carrier.put("ball", "#bf9166", 0, 0.92, 0, 0.26, 0.31, 0.26);
  carrier.put("cone", "#d6b45e", 0, 1.09, 0, 0.59, 0.24, 0.59);
  carrier.put("box", "#a67a4a", 0, 0.51, -0.22, 0.41, 0.36, 0.27);
  carrier.finish();
  scene.add(porter);
  if (quality !== "high") {
    for (const prop of [...ducks, wheel, porter])
      prop.traverse((o) => {
        o.castShadow = false;
      });
  }
  const rippleMaterial = new T.MeshBasicMaterial({
    color: "#e0f3da",
    transparent: true,
    opacity: 0.47,
    depthWrite: false,
  });
  const ripples = new T.InstancedMesh(new T.RingGeometry(0.95, 1, 30, 1, 0.2, 4.9), rippleMaterial, 12);
  ripples.frustumCulled = false;
  scene.add(ripples);
  const clippings = new T.InstancedMesh(
    new T.BoxGeometry(),
    new T.MeshStandardMaterial({ color: "#9dbf55" }),
    22,
  );
  clippings.frustumCulled = false;
  scene.add(clippings);
  let gathering = 0;
  let swimTime = 0;
  let dirty = true;
  const dummy = new T.Object3D(),
    color = new T.Color(),
    fps = new RollingFps();
  let farm: Farm | undefined,
    pause = false,
    reduced = false,
    frame = 0,
    prev = 0,
    time = 0,
    report = 0;
  let heading = 0.37,
    zoom = 1;
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    dirty = true;
    renderer.setSize(w, h, false);
    const aspect = w / h,
      view = Math.max(8.85, 11.9 / aspect) / zoom;
    Object.assign(camera, { left: -view * aspect, right: view * aspect, top: view, bottom: -view });
    camera.position.set(24 * Math.sin(heading), 22, 24 * Math.cos(heading));
    camera.lookAt(0, 0.45, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  function draw(now: number) {
    frame = requestAnimationFrame(draw);
    if (!farm || document.hidden || shouldSkipFrame(now, prev)) return;
    const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0;
    prev = now;
    if ((pause || reduced) && !dirty) return;
    dirty = false;
    if (!pause && !reduced) {
      time += dt;
      swimTime += dt * (farm.fed ? 0.52 : 0.28);
      gathering += ((farm.fed ? 1 : 0) - gathering) * Math.min(1, dt * 0.85);
    }
    const measured = fps.next(now);
    if (now - report > 1000) {
      report = now;
      onFps(measured);
    }
    const dark = night(farm);
    sun.intensity = dark ? 1.12 : 1.95;
    sky.intensity = dark ? 1.05 : 1.38;
    sun.color.set(dark ? "#bfccff" : "#fff0d1");
    water.material.color.setHSL(0.495 - (farm.algae - 45) * 0.0013, 0.49, dark ? 0.32 : 0.39);
    const feedX = -3.5,
      feedZ = -1.1;
    let n = 0;
    species.forEach((id, k) => {
      for (let j = 0; j < farm!.levels[id] * 4; j++) {
        const phase = swimTime * (1 + (j % 4) * 0.05) + j * 2.4 + k * 1.53;
        const cx = Math.sin(j * 3.1 + k * 4.2) * 2.3,
          cz = Math.cos(j * 2.1 + k) * 0.86;
        const rx = 1.1 + 0.65 * (j % 3),
          rz = 0.54 + 0.16 * (j % 4);
        const x = (1 - gathering) * cx + gathering * feedX + Math.cos(phase) * rx * (1 - 0.4 * gathering);
        const z = (1 - gathering) * cz + gathering * feedZ + Math.sin(phase) * rz * (1 - 0.4 * gathering);
        const angle = Math.atan2(-rz * Math.cos(phase), -rx * Math.sin(phase));
        dummy.rotation.set(0, angle, 0);
        dummy.position.set(x, 0.206, z);
        dummy.scale.set(0.38, 0.085, 0.13);
        dummy.updateMatrix();
        bodies.setMatrixAt(n, dummy.matrix);
        dummy.position.set(x - 0.33 * Math.cos(angle), 0.205, z + 0.33 * Math.sin(angle));
        dummy.rotation.y += 0.26 * Math.sin(time * 7 + j);
        dummy.scale.set(0.135, 0.055, 0.145);
        dummy.updateMatrix();
        tails.setMatrixAt(n, dummy.matrix);
        color.set(colors[k]);
        bodies.setColorAt(n, color);
        tails.setColorAt(n, color);
        n++;
      }
    });
    for (const mesh of [bodies, tails]) {
      mesh.count = n;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (let i = 0; i < 12; i++) {
      const phase = (time * 0.42 + i * 0.381) % 1;
      const x = i < 4 && gathering > 0.3 ? feedX + Math.sin(i) : Math.sin(i * 5.9) * 4.4;
      const z = i < 4 && gathering > 0.3 ? feedZ + Math.cos(i) * 0.4 : Math.cos(i * 2.8) * 1.8;
      dummy.position.set(x, 0.169, z);
      dummy.rotation.set(-Math.PI / 2, 0, i * 0.74);
      dummy.scale.setScalar(0.06 + phase * 0.43);
      dummy.updateMatrix();
      ripples.setMatrixAt(i, dummy.matrix);
    }
    ripples.instanceMatrix.needsUpdate = true;
    clippings.visible = farm.fed > 0;
    if (clippings.visible) {
      for (let i = 0; i < 22; i++) {
        dummy.position.set(
          feedX + Math.cos(i * 2.4) * (i % 7) * 0.17,
          0.179,
          feedZ + Math.sin(i * 2.4) * (i % 7) * 0.14,
        );
        dummy.rotation.set(0, i + time * 0.14, 0);
        dummy.scale.set(0.18, 0.023, 0.045);
        dummy.updateMatrix();
        clippings.setMatrixAt(i, dummy.matrix);
      }
      clippings.instanceMatrix.needsUpdate = true;
    }
    ducks.forEach((duck, i) => {
      duck.visible = i < Math.min(5, farm!.levels.ducks * 2);
      const a = time * 0.23 + i * 2.2;
      duck.position.set(3.05 + Math.cos(a) * (1 + i * 0.15), 0.17, Math.sin(a) * 0.75 - i * 0.23);
      duck.rotation.y = Math.atan2(-0.75 * Math.cos(a), -(1 + i * 0.15) * Math.sin(a));
    });
    wheel.visible = Boolean(farm.levels.wheel);
    if (dark) wheel.rotation.x += pause || reduced ? 0 : dt * 1.8;
    const trip = (time * 0.09) % 2;
    porter.position.set(
      -5.5 + Math.min(trip, 2 - trip) * 9.2,
      0.075 + Math.abs(Math.sin(time * 6)) * 0.038,
      5.44,
    );
    porter.rotation.y = trip < 1 ? Math.PI / 2 : -Math.PI / 2;
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(draw);
  let drag: { id: number; x: number; y: number; start: number; moved: boolean } | null = null;
  const canvas = renderer.domElement;
  const down = (e: PointerEvent) => {
    if (pause || e.button !== 0 || drag) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: heading, moved: false };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    if (Math.hypot(dx, e.clientY - drag.y) > 6) drag.moved = true;
    if (drag.moved) {
      heading = drag.start - dx * 0.009;
      resize();
    }
  };
  const up = (e: PointerEvent) => {
    if (drag?.id !== e.pointerId) return;
    if (!drag.moved && !pause) {
      const rect = canvas.getBoundingClientRect(),
        ray = new T.Raycaster();
      ray.setFromCamera(
        new T.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((e.clientY - rect.top) / rect.height) * 2,
        ),
        camera,
      );
      shallows.updateWorldMatrix(true, false);
      if (ray.intersectObject(shallows).length) onFeed();
    }
    drag = null;
  };
  const cancel = () => {
    drag = null;
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("lostpointercapture", cancel);
  return {
    sync(next: Farm, paused: boolean, motion: boolean) {
      dirty = true;
      if (farm?.levels !== next.levels) renderer.shadowMap.needsUpdate = true;
      farm = next;
      pause = paused;
      reduced = motion;
      for (const id of Object.keys(upgrades) as Station[]) upgrades[id]!.visible = Boolean(next.levels[id]);
    },
    camera(turn: number, scale: number) {
      heading += turn;
      zoom = clamp(zoom + scale, 0.8, 1.55);
      resize();
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("lostpointercapture", cancel);
      const geometries = new Set<T.BufferGeometry>(),
        materials = new Set<T.Material>();
      scene.traverse((obj) => {
        if (obj instanceof T.InstancedMesh) obj.dispose();
        if (obj instanceof T.Mesh) {
          geometries.add(obj.geometry);
          materials.add(obj.material);
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
