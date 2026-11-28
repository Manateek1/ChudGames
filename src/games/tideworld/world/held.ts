import * as T from "three";
import { BLOCKS } from "./blocks";
import { textureIndex } from "./textures";

/** The surveyor's folded sleeve, leather glove and equipped object share a camera-space studio. */
export class HeldItem {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(48, 1, 0.03, 8);
  private hand = new T.Group();
  private object = new T.Group();
  private box = new T.BoxGeometry(1, 1, 1);
  private block: T.Mesh<T.BoxGeometry, T.ShaderMaterial>;
  private colors = new Map<string, T.MeshLambertMaterial>();
  private current: string | null | undefined;
  constructor(tiles: T.DataArrayTexture) {
    this.scene.add(this.hand, new T.HemisphereLight(0xfff2d7, 0x837b82, 2));
    const sun = new T.DirectionalLight(0xffe1ad, 1.9);
    sun.position.set(-2, 3, 2);
    this.scene.add(sun);
    this.hand.position.set(0.43, -0.31, -0.92);
    this.hand.rotation.set(-0.13, -0.37, -0.25);
    this.hand.add(this.object);
    this.part(this.hand, "#405b5e", 0.02, -0.19, 0.16, 0.19, 0.31, 0.25);
    this.part(this.hand, "#af7952", 0, -0.07, 0.04, 0.19, 0.22, 0.18);
    this.part(this.hand, "#dfb17a", 0, -0.16, 0.055, 0.2, 0.044, 0.19);
    this.part(this.hand, "#936347", -0.095, -0.035, 0.014, 0.07, 0.095, 0.09);
    const geo = this.box.clone();
    geo.setAttribute("tileLayer", new T.Float32BufferAttribute(new Float32Array(24), 1));
    const mat = new T.ShaderMaterial({
      glslVersion: T.GLSL3,
      uniforms: { atlas: { value: tiles } },
      vertexShader: `in float tileLayer;out vec2 cellUv;flat out int layer;out float shade;
      void main(){cellUv=uv;layer=int(tileLayer+.5);shade=.70+.30*max(dot(normalize(mat3(modelViewMatrix)*normal),normalize(vec3(-.5,.8,.3))),0.);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `precision highp sampler2DArray;uniform sampler2DArray atlas;in vec2 cellUv;flat in int layer;in float shade;out vec4 pixel;
      void main(){vec4 c=texture(atlas,vec3(cellUv,float(layer)));if(c.a<.15)discard;pixel=linearToOutputTexel(vec4(c.rgb*shade,1.));}`,
    });
    this.block = new T.Mesh(geo, mat);
    this.block.position.set(-0.02, 0.1, -0.024);
    this.block.scale.setScalar(0.23);
    this.block.rotation.y = 0.66;
    this.hand.add(this.block);
    this.set(null);
  }
  private part(
    parent: T.Group,
    color: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    tilt = 0,
  ) {
    let mat = this.colors.get(color);
    if (!mat) {
      mat = new T.MeshLambertMaterial({ color });
      this.colors.set(color, mat);
    }
    const piece = new T.Mesh(this.box, mat);
    piece.position.set(x, y, z);
    piece.scale.set(w, h, d);
    piece.rotation.z = tilt;
    parent.add(piece);
    return piece;
  }
  set(id: string | null) {
    if (id === this.current) return;
    this.current = id;
    this.object.clear();
    this.block.visible = false;
    if (!id) return;
    if (BLOCKS[id] && id !== "air") {
      const layers = this.block.geometry.getAttribute("tileLayer") as T.BufferAttribute;
      for (let side = 0; side < 6; side++)
        for (let i = 0; i < 4; i++) layers.setX(side * 4 + i, textureIndex(id, side, undefined));
      layers.needsUpdate = true;
      this.block.visible = true;
      return;
    }
    const put = (c: string, x: number, y: number, z: number, w: number, h: number, d: number, r = 0) =>
      this.part(this.object, c, x, y, z, w, h, d, r);
    const metal = id.includes("reinforced")
      ? "#697888"
      : id.includes("stone")
        ? "#939a98"
        : id.includes("copper")
          ? "#b07957"
          : "#b1b3a5";
    if (/hammer|trowel|hoe|knife|saw|sling/.test(id)) {
      put("#88664d", -0.035, 0.11, -0.05, 0.047, 0.34, 0.053, -0.1);
      put("#c6a66b", -0.05, 0.2, -0.05, 0.068, 0.05, 0.073, -0.1);
      if (id.includes("hammer")) {
        put(metal, -0.058, 0.294, -0.05, 0.218, 0.11, 0.112, -0.1);
        put("#716d64", -0.15, 0.284, -0.05, 0.048, 0.125, 0.12, -0.1);
      } else if (id.includes("saw")) {
        put(metal, -0.062, 0.31, -0.05, 0.085, 0.24, 0.026, -0.1);
        for (let i = 0; i < 5; i++)
          put(metal, -0.105 + i * 0.004, 0.23 + i * 0.04, -0.05, 0.035, 0.03, 0.026, 0.54);
      } else if (id.includes("sling")) {
        for (const side of [-1, 1]) {
          put("#916d4b", -0.055 + side * 0.045, 0.27, -0.05, 0.034, 0.135, 0.037, -side * 0.32);
          put("#d8c893", -0.055 + side * 0.04, 0.32, -0.05, 0.025, 0.096, 0.027, side * 0.78);
        }
      } else if (id.includes("hoe")) {
        put(metal, -0.09, 0.28, -0.05, 0.16, 0.05, 0.065, -0.1);
        put(metal, -0.16, 0.25, -0.05, 0.034, 0.09, 0.067, -0.1);
      } else {
        put(metal, -0.064, 0.295, -0.05, id.includes("knife") ? 0.055 : 0.119, 0.18, 0.026, -0.1);
        put(metal, -0.071, 0.393, -0.05, 0.035, 0.05, 0.026, -0.16);
      }
    } else if (/flask|oil/.test(id)) {
      put("#779b9c", -0.03, 0.062, -0.04, 0.135, 0.165, 0.1);
      put("#b2bcb2", -0.03, 0.164, -0.04, 0.061, 0.045, 0.055);
      put("#805f4c", -0.03, 0.199, -0.04, 0.05, 0.03, 0.05);
    } else if (/fiber|reed|cord|rope|grain|plank|stick/.test(id)) {
      for (let i = 0; i < 3; i++)
        put(
          i === 1 ? "#947b4d" : "#baab78",
          -0.055 + i * 0.035,
          0.086 + i * 0.024,
          -0.045,
          0.029,
          0.23,
          0.035,
          -0.12 + i * 0.12,
        );
      put("#817059", -0.017, 0.065, -0.045, 0.118, 0.03, 0.05);
    } else {
      const c = /quartz|amber/.test(id)
        ? "#d7b673"
        : /copper|clay/.test(id)
          ? "#b78564"
          : /food|cap|fish|grain/.test(id)
            ? "#b49368"
            : "#909b97";
      put(c, -0.03, 0.076, -0.04, 0.16, 0.105, 0.123, 0.16);
      put(c, -0.02, 0.122, -0.04, 0.108, 0.071, 0.104, -0.16);
    }
  }
  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.hand.position.x = 0.43 * Math.min(1.2, aspect / (16 / 9));
  }
  draw(renderer: T.WebGLRenderer) {
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
  dispose() {
    this.scene.clear();
    this.box.dispose();
    this.block.geometry.dispose();
    this.block.material.dispose();
    this.colors.forEach((m) => m.dispose());
  }
}
