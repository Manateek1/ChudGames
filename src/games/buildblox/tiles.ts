import { Block, blockOf, stateOf } from "./blocks";

export const Tile = {
  Neutral: 0, Turf: 1, TurfEdge: 2, Earth: 3, Shale: 4, Sand: 5,
  Cedar: 6, Endgrain: 7, SilverBark: 8, FirBark: 9, Amber: 10,
  Blossom: 11, Fir: 12, Broadleaf: 13, Copper: 14, Boards: 15,
  Brick: 16, Gravel: 17, Snow: 18, Frost: 19, Moss: 20, MossEdge: 21,
  Tuft: 22, Wildflower: 23, Basalt: 24, Lumen: 25, Prism: 26,
} as const;

export const TILE_SIZE = 32;

export function voxelTile(code: number, verticalNormal: number): number {
  const state = stateOf(code);
  switch (blockOf(code)) {
    case Block.Sod: return verticalNormal > 0 ? Tile.Turf : verticalNormal < 0 ? Tile.Earth : Tile.TurfEdge;
    case Block.Soil: return Tile.Earth;
    case Block.Stone: return Tile.Shale;
    case Block.Sand:
    case Block.Sandstone: return Tile.Sand;
    case Block.Timber: return verticalNormal ? Tile.Endgrain : state === 1 ? Tile.SilverBark : state === 2 ? Tile.FirBark : Tile.Cedar;
    case Block.Leaves: return state === 3 ? Tile.Blossom : state === 4 ? Tile.Fir : state === 5 ? Tile.Broadleaf : Tile.Amber;
    case Block.CopperOre: return Tile.Copper;
    case Block.Wood: return Tile.Boards;
    case Block.Brick: return Tile.Brick;
    case Block.Gravel: return Tile.Gravel;
    case Block.Snow: return Tile.Snow;
    case Block.Frostglass: return Tile.Frost;
    case Block.Moss: return verticalNormal > 0 ? Tile.Moss : verticalNormal < 0 ? Tile.Earth : Tile.MossEdge;
    case Block.Basalt:
    case Block.Bedrock: return Tile.Basalt;
    case Block.Glowstone: return Tile.Lumen;
    case Block.Crystal: return Tile.Prism;
    default: return Tile.Neutral;
  }
}

type Pixel = readonly [r: number, g: number, b: number, a?: number];

function noise(x: number, y: number, salt: number): number {
  const a = Math.imul(x + 83, 1597334677) ^ Math.imul(y + 19, 3812015801) ^ Math.imul(salt, 2246822519);
  return ((Math.imul(a ^ (a >>> 15), 1252192193) >>> 20) & 4095) / 4095;
}

const rgba = (hex: number, shade: number, alpha = 255): Pixel => [
  Math.min(255, (hex >>> 16) * shade),
  Math.min(255, ((hex >>> 8) & 255) * shade),
  Math.min(255, (hex & 255) * shade),
  alpha,
];

function plantPixel(x: number, y: number, flowers: boolean): Pixel {
  let color = 0, brightness = 1;
  for (const [base, length, lean] of [[6, 15, -3], [11, 23, 4], [16, 27, -3], [19, 18, 4], [25, 14, 2]]) {
    const t = y / length;
    const blade = base + Math.floor(t * t * lean) + Math.floor(t * 2);
    if (y < length && Math.abs(x - blade) < (t < .65 ? 2 : 1)) {
      color = x < blade ? 0x587c37 : 0x8d9950;
      brightness = 0.68 + t * 0.35;
    }
    if (!flowers || length < 17) continue;
    const tip = base + lean + 2;
    const distance = Math.abs(x - tip) + Math.abs(y - length);
    if (distance <= 3 && (distance < 3 || (x + y) % 2 === 0)) {
      color = distance === 0 ? 0xe4ac61 : distance === 1 ? 0xf5dbdc : 0xc17d9d;
      brightness = 1;
    }
  }
  return color ? rgba(color, brightness) : [0, 0, 0, 0];
}

function pixel(tile: number, x: number, y: number): Pixel {
  // Broad brush marks and smaller flecks are baked once into each tile.
  const n = noise(x, y, tile);
  const cluster = noise(x >> 2, y >> 2, tile + 81);
  const shade = 0.81 + cluster * 0.22 + n * 0.15;
  const earth = n > .91 ? 0x947c63 : cluster > .58 ? 0x80644e : 0x705542;
  const turf = cluster > .6 ? 0x809856 : n > .72 ? 0x79904d : 0x6a8445;
  const ledge = 24 + Math.floor(noise(x >> 1, 0, 5) * 5);
  switch (tile) {
    case Tile.Turf: return rgba(turf, shade);
    case Tile.TurfEdge: return rgba(y >= ledge ? turf : earth, y === ledge ? shade * .73 : shade);
    case Tile.Earth: return rgba(earth, shade);
    case Tile.Shale:
    case Tile.Copper:
    case Tile.Basalt: {
      const seam = (y + (x >> 2) + (x > 16 ? 2 : 0)) % 11 === 1 && cluster < .64;
      const vein = noise(x >> 2, y >> 2, 49);
      const copper = tile === Tile.Copper && vein > .68 && n > .24;
      return rgba(copper ? (vein > .86 ? 0xd79c6a : 0xa76849) :
        tile === Tile.Basalt ? 0x504656 : cluster > .69 ? 0x817f80 : 0x686971, seam ? shade * .70 : shade);
    }
    case Tile.Sand: return rgba(n > .9 ? 0xa99470 : 0xcbb589, shade);
    case Tile.Cedar:
    case Tile.FirBark:
    case Tile.SilverBark: {
      const grain = noise((x + (y >> 3)) >> 1, y >> 4, 212);
      if (tile === Tile.SilverBark) {
        const scar = noise(x >> 3, y >> 1, 513);
        return rgba(scar > .88 ? 0x514656 : grain > .7 ? 0xbea9ac : 0xded0bd, shade);
      }
      return rgba(grain > .72 ? 0x997058 : grain < .42 ? 0x544033 : 0x78523a, shade * (tile === Tile.FirBark ? .84 : 1));
    }
    case Tile.Endgrain: {
      const ring = Math.floor(Math.max(Math.abs(x - 15), Math.abs(y - 15)) + cluster * 1.5);
      return rgba(ring > 13 ? 0x75523f : ring % 4 === 2 ? 0x9f7151 : 0xbf9566, shade);
    }
    case Tile.Amber:
    case Tile.Blossom:
    case Tile.Fir:
    case Tile.Broadleaf: {
      const buds = noise(x >> 1, y >> 1, tile + 19);
      const dark = tile === Tile.Amber ? 0xaa7845 : tile === Tile.Blossom ? 0xb085a5 : tile === Tile.Fir ? 0x40645b : 0x527448;
      const light = tile === Tile.Amber ? 0xd9ac59 : tile === Tile.Blossom ? 0xe6b9cc : tile === Tile.Fir ? 0x6a877a : 0x7b9960;
      return rgba(buds * .48 + cluster * .67 > .59 ? light : dark, .89 + shade * .11, buds < .13 && cluster < .53 ? 0 : 255);
    }
    case Tile.Boards: {
      const joint = y % 8 === 0 || (y % 8 === 1 && n > .48);
      const end = ((x + (y >> 3) * 9) & 31) === 0;
      return rgba(joint || end ? 0x75513b : 0xb18457, .79 + noise(x >> 3, y, 118) * .29);
    }
    case Tile.Brick: {
      const mortar = y % 8 === 0 || ((x + ((y >> 3) & 1) * 8) % 16) === 0;
      return rgba(mortar ? 0x836e61 : (y & 7) === 1 ? 0xc08569 : 0x9f6d59, shade);
    }
    case Tile.Gravel: return rgba(cluster > .68 ? 0xa49382 : n > .65 ? 0x8f8277 : 0x766b63, shade);
    case Tile.Snow: return rgba(cluster > .42 ? 0xe4ecf4 : 0xc3d2e1, shade);
    case Tile.Frost: return rgba((x + y) % 11 < 2 ? 0xc5dce7 : 0x71a5c4, shade);
    case Tile.Moss: return rgba(cluster > .50 ? 0x709779 : 0x527b63, shade);
    case Tile.MossEdge: return rgba(y >= ledge ? 0x698d72 : earth, shade);
    case Tile.Tuft: return plantPixel(x, y, false);
    case Tile.Wildflower: return plantPixel(x, y, true);
    case Tile.Lumen: return rgba(cluster > .47 ? 0xe9b962 : 0xaa784f, shade);
    case Tile.Prism: return rgba((x + y * 2) % 13 < 4 ? 0xadc1ec : 0x726cac, shade);
    default: return rgba(0xffffff, 0.93 + n * .07);
  }
}

export function createTilePixels(): Uint8Array<ArrayBuffer> {
  const layers = Object.keys(Tile).length;
  const pixels = new Uint8Array(TILE_SIZE * TILE_SIZE * layers * 4);
  for (let layer = 0; layer < layers; layer++) {
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const [red, green, blue, alpha = 255] = pixel(layer, x, y);
        const offset = ((layer * TILE_SIZE + y) * TILE_SIZE + x) * 4;
        pixels[offset] = red;
        pixels[offset + 1] = green;
        pixels[offset + 2] = blue;
        pixels[offset + 3] = alpha;
      }
    }
  }
  return pixels;
}
