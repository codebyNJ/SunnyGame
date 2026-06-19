// Tile-flag math + object-stamp transforms (rotation/flip), shared by the engine's
// live object renderer, the thumbnail builder, and the compiler.
// GameMaker tile value = index (low 19 bits) | flags. M=mirror(H), F=flip(V), R=rotate90.
export const M = 0x10000000, F = 0x20000000, R = 0x40000000;
export const TILE_IDX = 0x7ffff;

// The 8 orientations (dihedral group D4) encoded as state = m + 2f + 4r, matching
// how engine.applyFlags renders them. Permutation tables for a 90° CW rotation and a
// horizontal flip were derived by composing the net transform matrices (see PRD §6
// "Rotation"): every tile rotates via the R flag, so NO dedicated rotated tile
// variants are needed — flag-based rotation is universal for stamps.
const ROT90 = [4, 6, 5, 7, 3, 1, 2, 0];
const FLIPX = [1, 0, 3, 2, 5, 4, 7, 6];
const toState = (v) => (v & M ? 1 : 0) | (v & F ? 2 : 0) | (v & R ? 4 : 0);
const toFlags = (st) => (st & 1 ? M : 0) | (st & 2 ? F : 0) | (st & 4 ? R : 0);

// rotate/flip a tile VALUE in place (keeps its index, remaps orientation bits)
export const rotTileValue = (v) => (v & TILE_IDX) | toFlags(ROT90[toState(v)]);
export const flipTileValue = (v) => (v & TILE_IDX) | toFlags(FLIPX[toState(v)]);

// Transform an object catalog item by rot (0/90/180/270, CW) and flipX.
// Returns { w, h, tiles: [{ layer, idx, flags, lx, ly }] } in the rotated footprint.
export function transformObject(item, rot = 0, flipX = false) {
  let w = item.w, h = item.h;
  const tiles = [];
  for (const [layer, cells] of Object.entries(item.layers)) {
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i];
      if (!v) continue;
      tiles.push({ layer, idx: v & TILE_IDX, st: toState(v), lx: i % w, ly: (i / w) | 0 });
    }
  }
  if (flipX) for (const t of tiles) { t.lx = w - 1 - t.lx; t.st = FLIPX[t.st]; }
  const steps = (((rot / 90) % 4) + 4) % 4;
  for (let s = 0; s < steps; s++) {
    for (const t of tiles) { const nlx = h - 1 - t.ly; t.ly = t.lx; t.lx = nlx; t.st = ROT90[t.st]; }
    [w, h] = [h, w];
  }
  return { w, h, tiles: tiles.map((t) => ({ layer: t.layer, idx: t.idx, flags: toFlags(t.st), lx: t.lx, ly: t.ly })) };
}

// footprint of an object instance in tile units (accounts for rotation swapping w/h)
export function objectFootprint(item, rot = 0) {
  const swap = ((rot / 90) % 2 + 2) % 2 === 1;
  return { w: swap ? item.h : item.w, h: swap ? item.w : item.h };
}
