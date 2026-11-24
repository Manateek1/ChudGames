import * as THREE from "three";
import type { ApexTrack } from "./track";

export const VIADUCT_WIDTH = 15.8;
const DECK_DROP = 0.18;
const DECK_THICKNESS = 1.30;

export function createViaductDeck(track: ApexTrack, first: number, last: number): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  const crossSection = [
    [-VIADUCT_WIDTH / 2, -DECK_DROP],
    [VIADUCT_WIDTH / 2, -DECK_DROP],
    [VIADUCT_WIDTH / 2, -DECK_DROP - DECK_THICKNESS],
    [-VIADUCT_WIDTH / 2, -DECK_DROP - DECK_THICKNESS],
  ];

  for (let face = 0; face < crossSection.length; face += 1) {
    const start = vertices.length / 3;
    const edge = [crossSection[face], crossSection[(face + 1) % crossSection.length]];
    for (let i = first; i <= last; i += 1) {
      const p = track.samples[i];
      for (const [offset, height] of edge) {
        vertices.push(p.x + p.nx * offset, p.y + height, p.z + p.nz * offset);
      }
      if (i < last) {
        const a = start + (i - first) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }

  for (const endpoint of [first, last]) {
    const start = vertices.length / 3;
    const p = track.samples[endpoint];
    for (const [offset, height] of crossSection) {
      vertices.push(p.x + p.nx * offset, p.y + height, p.z + p.nz * offset);
    }
    if (endpoint === first) indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    else indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  }

  const deck = new THREE.BufferGeometry();
  deck.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  deck.setIndex(indices);
  deck.computeVertexNormals();
  return deck;
}
