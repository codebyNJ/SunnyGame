// Shared terrain computation: terrain-type cells -> baked tile layers (sea, land,
// paths) with autotiled edges + a coastline skirt (cliff lips + foam, corner wraps).
// Used by compile.js (initial render) AND the engine (live incremental re-bake on
// brush edits). Pure data — no pixi. Tile indices/patterns verified in build_map.ts.
import catalog from "./catalog.json";
import { M, F, R } from "./tiles.js";

// 16-tile autotile positions; mask bits N=1,E=2,S=4,W=8 (set = same-terrain neighbor)
const MASK2POS = {
  15: 0, 14: 3, 7: 5, 13: 10, 11: 12,
  6: 7, 3: 13, 12: 11, 9: 14,
  5: 10, 10: 12,
  1: 5, 2: 1, 4: 4, 8: 3, 0: 0,
};
function autotile(cells, mask, set, W, H) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? mask[y * W + x] : 1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      const bm = (at(x, y - 1) ? 1 : 0) | (at(x + 1, y) ? 2 : 0) | (at(x, y + 1) ? 4 : 0) | (at(x - 1, y) ? 8 : 0);
      let pos = MASK2POS[bm] ?? 0;
      if (bm === 15 && !(at(x - 1, y - 1) && at(x + 1, y - 1) && at(x - 1, y + 1) && at(x + 1, y + 1))) pos = 15;
      cells[y * W + x] = set[pos];
    }
}

// Foam ring: an animated foam edge in every WATER cell orthogonally adjacent to land.
// Derived empirically from the example room — tile 148 (foam edge) rotated/flipped
// for the 4 sides, 147/149 for the outer corners. Purely local (depends only on the
// cell's grass neighbours), so it can't fragment on irregular/brush-painted coasts.
// mask bits: N=1 E=2 S=4 W=8 (set = that neighbour is grass).
const FOAM = {
  1: 148, 2: 148 | R, 4: 148 | F, 8: 148 | R | F,        // edges N/E/S/W
  3: 149, 6: 149 | F, 12: 147 | F, 9: 147,               // outer corners NE/SE/SW/NW
  5: 148, 10: 148 | R,                                   // thin channels
  7: 149, 11: 147, 13: 147 | F, 14: 149 | F,             // peninsula tips (3 sides)
};
function foamRing(land, mask, W, H) {
  const isGrass = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? mask[y * W + x] === 1 : false);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (isGrass(x, y) || land[y * W + x] !== 0) continue; // water cells only, don't overwrite
      const m = (isGrass(x, y - 1) ? 1 : 0) | (isGrass(x + 1, y) ? 2 : 0) | (isGrass(x, y + 1) ? 4 : 0) | (isGrass(x - 1, y) ? 8 : 0);
      const t = FOAM[m];
      if (t !== undefined) land[y * W + x] = t;
    }
}

const TERRAINS = Object.fromEntries(catalog.terrains.map((t) => [t.id, t]));
const SEA = catalog.terrains.find((t) => t.id === "sea");
const BASE = catalog.terrains.find((t) => t.base);

// terrain-type cells (0 = first type = sea) -> { sea, land, paths } tile arrays
export function computeTerrain(tcells, types, W, H) {
  const N = W * H;
  const sea = new Array(N).fill(0), land = new Array(N).fill(0), paths = new Array(N).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sea[y * W + x] = SEA.block[y % 4][x % 4];

  // base (grass) mask -> autotiled land + coast skirt
  const baseIdx = types.indexOf(BASE.id);
  const baseMask = new Uint8Array(N);
  let anyBase = false;
  for (let i = 0; i < N; i++) if (tcells[i] === baseIdx) { baseMask[i] = 1; anyBase = true; }
  if (anyBase) { autotile(land, baseMask, BASE.set, W, H); foamRing(land, baseMask, W, H); }

  // overlay types (paths, river, stone path…) onto their layer
  for (let ti = 0; ti < types.length; ti++) {
    const def = TERRAINS[types[ti]];
    if (!def || def.id === "sea" || def.base || !def.set) continue;
    const m = new Uint8Array(N);
    let any = false;
    for (let i = 0; i < N; i++) if (tcells[i] === ti) { m[i] = 1; any = true; }
    if (any) autotile(def.layer === "land" ? land : paths, m, def.set, W, H);
  }
  return { sea, land, paths };
}
