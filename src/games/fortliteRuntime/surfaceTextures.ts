import * as THREE from 'three';

export function tileNoise(u: number, v: number, frequency: number): number {
  const x = u * frequency;
  const y = v * frequency;
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = THREE.MathUtils.smoothstep(x - i, 0, 1);
  const fy = THREE.MathUtils.smoothstep(y - j, 0, 1);

  const corner = (column: number, row: number) => {
    const a = column % frequency;
    const b = row % frequency;
    const hash = Math.imul(a + 271, 1597334677) ^ Math.imul(b + 197, 3812015801);
    return (Math.imul(hash ^ (hash >>> 16), 2246822519) >>> 0) / 4294967295;
  };

  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(corner(i, j), corner(i + 1, j), fx),
    THREE.MathUtils.lerp(corner(i, j + 1), corner(i + 1, j + 1), fx),
    fy
  );
}

export function createTileTexture(
  size: number,
  sample: (u: number, v: number) => number,
  name: string
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const shade = Math.round(255 * THREE.MathUtils.clamp(sample(x / size, y / size), 0, 1));
      data[offset] = data[offset + 1] = data[offset + 2] = shade;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = name;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
