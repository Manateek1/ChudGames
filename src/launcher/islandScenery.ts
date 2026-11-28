import * as T from "three";

const pennant = (function () {
  const geometry = new T.PlaneGeometry(1, 1, 7, 2);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    position.setZ(i, 0.16 * Math.sin((x + 0.5) * Math.PI * 2) * (x + 0.5));
  }
  geometry.computeVertexNormals();
  return geometry;
});

export function createScenery(scene: T.Scene) {
  const shapes = {
    box: () => new T.BoxGeometry(),
    post: () => new T.CylinderGeometry(0.5, 0.5, 1, 10),
    tower: () => new T.CylinderGeometry(0.37, 0.5, 1, 12),
    cone: () => new T.CylinderGeometry(0.015, 0.5, 1, 7),
    rock: () => new T.IcosahedronGeometry(0.5),
    crown: () => new T.IcosahedronGeometry(0.5, 1),
    roof: () => new T.CylinderGeometry(0.18, Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
    flag: pennant,
    foam: () => new T.RingGeometry(.463, .5, 28, 1, 0, Math.PI * 1.79).rotateX(-Math.PI / 2),
  };
  type Shape = keyof typeof shapes;
  const batches = new Map<Shape, { matrix: T.Matrix4; color: T.Color }[]>();
  const transform = new T.Object3D();
  const axis = new T.Vector3(0, 1, 0);
  const delta = new T.Vector3();

  function record(shape: Shape, color: string) {
    transform.updateMatrix();
    const items = batches.get(shape) ?? [];
    items.push({ matrix: transform.matrix.clone(), color: new T.Color(color) });
    batches.set(shape, items);
  }

  function add(
    shape: Shape, color: string, x: number, y: number, z: number,
    width: number, height: number, depth: number, yaw = 0, tilt = 0,
  ) {
    transform.position.set(x, y, z);
    transform.rotation.set(0, yaw, tilt, "YXZ");
    transform.scale.set(width, height, depth);
    record(shape, color);
  }

  return {
    add,
    beam(color: string, from: T.Vector3, to: T.Vector3, width: number, depth = width) {
      delta.subVectors(to, from);
      const length = delta.length();
      transform.position.copy(from).lerp(to, 0.5);
      transform.quaternion.setFromUnitVectors(axis, delta.divideScalar(length));
      transform.scale.set(width, length, depth);
      record("box", color);
    },
    finish() {
      const solid = new T.MeshLambertMaterial({ flatShading: true });
      const cloth = new T.MeshLambertMaterial({ side: T.DoubleSide });
      const foam = new T.MeshBasicMaterial({ transparent: true, opacity: .54, depthWrite: false });
      for (const [shape, instances] of batches) {
        const material = shape === "foam" ? foam : shape === "flag" ? cloth : solid;
        const mesh = new T.InstancedMesh(shapes[shape](), material, instances.length);
        instances.forEach(({ matrix, color }, i) => {
          mesh.setMatrixAt(i, matrix);
          mesh.setColorAt(i, color);
        });
        mesh.castShadow = mesh.receiveShadow = shape !== "foam";
        scene.add(mesh);
      }
    },
  };
}

export type Scenery = ReturnType<typeof createScenery>;
export type LandHeight = (x: number, z: number) => number;
export type Reserve = (x: number, z: number, radius: number) => void;
