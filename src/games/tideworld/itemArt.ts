import { BLOCKS } from "./world/blocks";
import { ITEMS } from "./systems/catalog";
const cache = new Map<string, string>();
const rgb = (color: string, scale: number) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.min(255, Math.round(parseInt(color.slice(i, i + 2), 16) * scale))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
export function itemArt(id: string) {
  if (cache.has(id)) return cache.get(id);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 24;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const block = BLOCKS[id],
    item = ITEMS[id];
  if (!item) {
    ctx.fillStyle = "#e6d7ae";
    ctx.font = "bold 19px monospace";
    ctx.fillText("?", 6, 19);
    const icon = canvas.toDataURL();
    cache.set(id, icon);
    return icon;
  }
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const line = (x: number, y: number, ex: number, ey: number, c: string, size = 1) => {
    const n = Math.max(1, Math.abs(ex - x), Math.abs(ey - y));
    for (let i = 0; i <= n; i++)
      rect(Math.round(x + ((ex - x) * i) / n), Math.round(y + ((ey - y) * i) / n), size, size, c);
  };
  const seed = Array.from(id).reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 17);
  const metal = id.includes("copper")
    ? "#c68b68"
    : id.includes("iron")
      ? "#b3bac1"
      : id.includes("tin")
        ? "#a2bebc"
        : "#9eaaa9";
  if (block) {
    const c = block.color;
    for (let x = 0; x < 18; x++) {
      const rise = Math.floor(Math.abs(8.5 - x) / 2);
      rect(3 + x, 2 + rise, 1, 8 - rise * 2 + 1, rgb(c, 1.2));
      rect(3 + x, 11 - rise, 1, 9, x < 9 ? c : rgb(c, 0.7));
    }
    for (let i = 0; i < 8; i++) {
      const x = (Math.abs(seed + i * 7) % 16) + 4;
      rect(x, 11 + ((i * 5) % 5), 2, 1, rgb(c, x < 12 ? 0.84 : 0.6));
    }
    if (
      [
        "switch",
        "lamp",
        "workbench",
        "smelter",
        "kiln",
        "stove",
        "storage_drawer",
        "relay",
        "pump",
        "sensor",
        "timer",
      ].includes(id)
    ) {
      rect(5, 11, 6, 4, "#374342");
      rect(6, 12, 3, 1, id === "lamp" ? "#ffcf71" : "#d2af73");
    }
  } else if (item.group === "Tool") {
    line(4, 19, 15, 8, "#624638", 3);
    line(5, 18, 15, 8, "#d9a46c");
    if (id.includes("hammer")) {
      line(11, 5, 19, 11, metal, 4);
      line(11, 5, 17, 9, "#ecdbb9", 2);
    } else if (id === "sling") {
      line(14, 10, 10, 4, "#ad8463", 2);
      line(14, 10, 20, 6, "#ad8463", 2);
      line(10, 4, 20, 6, "#e6d6b9");
    } else if (id === "field_hoe") {
      line(12, 7, 19, 10, metal, 2);
      line(19, 10, 21, 7, metal, 2);
    } else {
      line(13, 10, 19, 4, metal, 4);
      line(15, 8, 20, 3, "#d9e9de", 2);
    }
  } else if (id.includes("flask") || id === "oil") {
    rect(10, 3, 5, 4, "#c4b594");
    rect(9, 7, 7, 3, "#dbe3cf");
    rect(6, 10, 13, 10, "#91aba8");
    rect(8, 14, 9, 5, id === "brine_flask" ? "#719ac1" : id === "empty_flask" ? "#4f6162" : "#478d8e");
    rect(8, 10, 2, 4, "#e5e7ce");
  } else if (/fiber|cord|rope|spool/.test(id)) {
    for (let i = 0; i < 4; i++) {
      line(4 + i, 18, 12 + i, 4, "#b9925d", 2);
      line(9 + i, 19, 19 + i, 6, "#dec18b");
    }
  } else if (/seed|grain|reed|frond/.test(id)) {
    line(8, 20, 15, 4, "#a0a264", 2);
    for (let i = 0; i < 4; i++) {
      rect(8 + i, 13 - i * 2, 3, 3, "#d5b36b");
      rect(14 + i, 12 - i * 2, 3, 2, "#b9bb73");
    }
  } else if (/cape|coat|glider/.test(id)) {
    for (let i = 0; i < 14; i++)
      rect(
        11 - Math.floor(i / 3),
        5 + i,
        3 + Math.floor(i * 0.75),
        1,
        id === "rain_cape" ? "#628c86" : "#b58e76",
      );
    rect(10, 4, 6, 3, "#e5c6a0");
  } else {
    const c = /iron|tin|copper|rubble|gear|bearing/.test(id)
      ? metal
      : item.group === "Food"
        ? "#c17b50"
        : id.includes("quartz")
          ? "#e0ce8d"
          : id.includes("charcoal")
            ? "#63606b"
            : "#bb9e75";
    for (let y = 0; y < 12; y++) {
      const inset = Math.floor(Math.abs(y - 5) / 2);
      rect(4 + inset, 6 + y, 16 - inset * 2, 1, rgb(c, y < 4 ? 1.23 : y > 8 ? 0.72 : 1));
    }
    rect(8, 9, 4, 2, rgb(c, 1.35));
    rect(15, 13, 3, 2, rgb(c, 0.8));
  }
  const url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}
