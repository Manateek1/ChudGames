import * as T from "three";
import { createCar } from "../games/apex/car";
import { apexCars } from "../games/apex/vehicles";
import { groundHeight, type Car, type Gate } from "./islandRoads";
import { buildIsland } from "./islandWorld";

export function createIslandScene(host: HTMLDivElement, gates: readonly Gate[]) {
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const scene = new T.Scene();
  buildIsland(scene, gates);
  const camera = new T.OrthographicCamera(-70, 70, 50, -50, 0.1, 500);
  const model = createCar({ ...apexCars[0], color: "#ff6042" });
  model.root.scale.setScalar(1.48);
  // The car has a separate contact shadow. The island's lights and casters are static.
  model.root.traverse((part) => { part.castShadow = false; });
  scene.add(model.root);

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 64;
  const context = shadowCanvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 6, 32, 32, 32);
  gradient.addColorStop(0, "rgba(17,27,34,.72)");
  gradient.addColorStop(0.64, "rgba(17,27,34,.43)");
  gradient.addColorStop(1, "rgba(17,27,34,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const shadow = new T.Mesh(
    new T.PlaneGeometry(3.8, 6.4),
    new T.MeshBasicMaterial({
      map: new T.CanvasTexture(shadowCanvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  model.root.add(shadow);
  shadow.position.y = 0.008;
  host.appendChild(renderer.domElement);

  let dirty = true;
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = host;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const halfHeight = Math.max(50, 70 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  let lastX = NaN,
    lastZ = NaN,
    lastHeading = NaN;
  let previousZoom = false;
  return {
    draw(car: Car, steering: number, braking: boolean, dt: number, zoomed: boolean) {
      if (
        !dirty &&
        lastX === car.x &&
        lastZ === car.z &&
        lastHeading === car.heading &&
        previousZoom === zoomed &&
        model.hubs[0].rotation.y === -steering * 0.32 &&
        model.brake.emissiveIntensity === (braking ? 3 : 1)
      )
        return;
      if (dirty || zoomed !== previousZoom) {
        camera.zoom = zoomed ? 1.8 : 1;
        camera.updateProjectionMatrix();
        previousZoom = zoomed;
      }
      lastX = car.x;
      lastZ = car.z;
      lastHeading = car.heading;
      dirty = false;
      model.root.position.set(car.x, groundHeight(car.x, car.z) + 0.36, car.z);
      model.root.rotation.y = Math.PI - car.heading;
      for (const wheel of model.wheels) wheel.rotation.x += (car.speed * dt) / 0.365;
      model.hubs[0].rotation.y = model.hubs[1].rotation.y = -steering * 0.32;
      model.brake.emissiveIntensity = braking ? 3 : 1;
      model.reverse.emissiveIntensity = car.speed < 0 ? 2 : 0.1;
      // Keep north up. Even the closer view only pans, so steering never turns the island.
      const cx = zoomed ? car.x * 0.8 : 0;
      const cz = zoomed ? car.z * 0.8 : 0;
      camera.position.set(cx, 111, cz + 102);
      camera.lookAt(cx, 1, cz);
      renderer.render(scene, camera);
    },
    dispose() {
      observer.disconnect();
      const geometries = new Set<T.BufferGeometry>(),
        materials = new Set<T.Material>(),
        textures = new Set<T.Texture>();
      scene.traverse((object) => {
        if (object instanceof T.DirectionalLight) object.shadow.dispose();
        if (!(object instanceof T.Mesh)) return;
        if (object instanceof T.InstancedMesh) object.dispose();
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          if (material.map) textures.add(material.map);
        }
      });
      geometries.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      textures.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
