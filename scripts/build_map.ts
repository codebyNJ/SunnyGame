// Builds the original "Sunnyside Cove" town map from the Sunnyside World tileset.
// Reuses verified structures (lifted from the asset pack's GameMaker example room data)
// arranged into a brand-new island geography, plus generated terrain via autotiles.
// Outputs: src/game/map.json (runtime) + scripts/tmp/preview_layers.json (PS renderer).
export {};

const ROOM = await Bun.file("d:/codes/game1/scripts/room1_layers.json").json() as any[];
const roomByName: Record<string, any> = Object.fromEntries(ROOM.map((l) => [l.name, l]));
const RW = 86; // room width in tiles

const W = 100, H = 56;
const N = W * H;

// ---------- layers ----------
const LAYER_DEFS = [
  { name: "sea", depth: 1600 },
  { name: "clouds_02", depth: 1400 },
  { name: "land", depth: 1300 },
  { name: "paths", depth: 1200 },
  { name: "shadows", depth: 1100 },
  { name: "decoration_01", depth: 1000 },
  { name: "building", depth: 700 },
  { name: "walls", depth: 600 },
  { name: "decoration_02", depth: 500 },
  { name: "decoration_03", depth: 400 },
  { name: "cloud_shadow", depth: 100 },
  { name: "clouds_01", depth: 0 },
] as const;
type LayerName = (typeof LAYER_DEFS)[number]["name"];
const L: Record<LayerName, number[]> = {} as any;
for (const d of LAYER_DEFS) L[d.name] = new Array(N).fill(0);
// forest layer is 32px tiles (half resolution)
const FW = W / 2, FH = H / 2;
const forest = new Array(FW * FH).fill(0);

const I = (x: number, y: number) => y * W + x;
const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

// flags
const M = 0x10000000, F = 0x20000000, R = 0x40000000;

// ---------- rng (deterministic, 32-bit safe) ----------
let seed = 1337;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x80000000);
const pick = <T,>(a: T[]) => a[(rnd() * a.length) | 0];

// ---------- masks ----------
const mask = () => new Uint8Array(N);
function ellipse(m: Uint8Array, cx: number, cy: number, rx: number, ry: number) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) m[I(x, y)] = 1;
    }
}
// chunky coastline variant: rasterize at half resolution, upscale 2x.
// Gives even-length straight runs like the hand-drawn example instead of 1-tile stairs.
function ellipseChunky(m: Uint8Array, cx: number, cy: number, rx: number, ry: number) {
  const hw = Math.ceil(W / 2), hh = Math.ceil(H / 2);
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < hw; x++) {
      const dx = (x + 0.5 - cx / 2) / (rx / 2), dy = (y + 0.5 - cy / 2) / (ry / 2);
      if (dx * dx + dy * dy <= 1)
        for (let sy = 0; sy < 2; sy++)
          for (let sx = 0; sx < 2; sx++)
            if (inB(x * 2 + sx, y * 2 + sy)) m[I(x * 2 + sx, y * 2 + sy)] = 1;
    }
}
function rect(m: Uint8Array, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inB(x, y)) m[I(x, y)] = 1;
}

// ---------- autotile ----------
// 16-tile set positions, derived empirically from Room1:
// mask bits N=1,E=2,S=4,W=8 (bit set = same-terrain neighbor)
const MASK2POS: Record<number, number> = {
  15: 0, 14: 3, 7: 5, 13: 10, 11: 12, // edges (sea on N/W/E/S)
  6: 7, 3: 13, 12: 11, 9: 14, // outer corners
  5: 10, 10: 12, // thin strips (reuse edges)
  1: 5, 2: 1, 4: 4, 8: 3, 0: 0, // ends (approx)
};
const SETS = {
  land: [193, 194, 195, 196, 197, 198, 199, 200, 257, 258, 259, 260, 261, 262, 263, 193],
  path1: [449, 450, 451, 452, 453, 454, 455, 456, 513, 514, 515, 516, 517, 518, 519, 449],
  path2: [460, 461, 462, 463, 464, 465, 466, 467, 524, 525, 526, 527, 528, 529, 530, 460],
  river: [470, 471, 472, 473, 474, 475, 476, 477, 534, 535, 536, 537, 538, 539, 540, 470],
  clouds1: [1153, 1154, 1155, 1156, 1157, 1158, 1159, 1160, 1217, 1218, 1219, 1220, 1221, 1222, 1223, 1153],
  clouds2: [1345, 1346, 1347, 1348, 1349, 1350, 1351, 1352, 1409, 1410, 1411, 1412, 1413, 1414, 1415, 1345],
  cloudShadow: [1537, 1538, 1539, 1540, 1541, 1542, 1543, 1544, 1601, 1602, 1603, 1604, 1605, 1606, 1607, 1537],
};
function autotile(layer: number[], m: Uint8Array, set: number[], interiorVariants?: { tiles: number[]; p: number }) {
  const at = (x: number, y: number) => (inB(x, y) ? m[I(x, y)] : 1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m[I(x, y)]) continue;
      const bm = (at(x, y - 1) ? 1 : 0) | (at(x + 1, y) ? 2 : 0) | (at(x, y + 1) ? 4 : 0) | (at(x - 1, y) ? 8 : 0);
      let pos = MASK2POS[bm] ?? 0;
      // inner corner: fully edged but missing a diagonal -> 16th tile
      if (bm === 15 && !(at(x - 1, y - 1) && at(x + 1, y - 1) && at(x - 1, y + 1) && at(x + 1, y + 1))) pos = 15;
      let t = set[pos];
      if (pos === 0 && interiorVariants && rnd() < interiorVariants.p) t = pick(interiorVariants.tiles);
      layer[I(x, y)] = t;
    }
}

// ---------- sea ----------
const SEA_BLOCK = [
  [1163, 1164, 1165, 1166],
  [1227, 1228, 1229, 1230],
  [1291, 1292, 1293, 1294],
  [1355, 1356, 1357, 1358],
];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) L.sea[I(x, y)] = SEA_BLOCK[y % 4][x % 4];

// ---------- island masks ----------
const land = mask();
ellipseChunky(land, 38, 31, 24, 11.5); // main island west bulk
ellipseChunky(land, 52, 23, 13, 9); // main island northeast bulge
ellipseChunky(land, 12, 40, 17, 8.5); // SW lobe (reaches mine at bottom-left)
rect(land, 4, 43, 12, 47); // backs the mine chunk so no sea holes open at its filtered edge
ellipseChunky(land, 68, 33, 13, 6.5); // east isthmus reaching the beach strip's grass margin
ellipseChunky(land, 70, 24, 10, 9); // northeast fill: joins chapel headland, peninsula and isthmus
rect(land, 76, 13, 82, 38); // east peninsula: backs the strip's original coast facing the channel
const farm = mask();
ellipseChunky(farm, 15, 11, 10, 7.2); // farm island NW
const chapelIsle = mask();
ellipseChunky(chapelIsle, 69, 11, 7.5, 6.5); // chapel/graveyard island NE
const allLand = mask();
for (let i = 0; i < N; i++) allLand[i] = land[i] | farm[i] | chapelIsle[i];

// land lifted from Room1 (mine, beach, islets) participates in the mask so generated
// terrain blends into it; lifted tiles overwrite the generated ones afterwards.
const LAND_LIFTS: [number, number, number, number, number, number][] = [
  // roomX0,roomY0,roomX1,roomY1, mapX,mapY
  [0, 37, 12, 47, 0, 45], // mine
  // the room's ENTIRE east coast as one piece, so every internal coastline stays
  // intact: lighthouse islet (top), open-house deck, market beach, pier, houseboats.
  // Placed flush against our east map edge, like it was flush in the original.
  [66, 0, 85, 47, 80, 0],
  [1, 1, 6, 6, 36, 3], // small floating islet (complete in original)
  [5, 32, 10, 39, 46, 2], // small tree islet (a cape in the original; east side patched below)
];
// land-layer tiles that are NOT walkable land (water, foam, lips) - excluded from mask
const NOT_LAND = new Set([
  147, 148, 149, 150, 151, 152, 203, 266, 267, 268, 269, 270, 271, 272, 273,
  339, 340, 341, 342, 343, 344, 403, 404, 405, 406, 407, 408, 410, 411, 412, 413,
  414, 415, 416, 417, 418, 478, 479, 480, 481, 859,
  470, 471, 472, 473, 474, 475, 476, 477, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545,
]);
const inLiftLand = (x: number, y: number) =>
  LAND_LIFTS.some(([rx0, ry0, rx1, ry1, mx, my]) => x >= mx && y >= my && x <= mx + (rx1 - rx0) && y <= my + (ry1 - ry0));
{
  const src = roomByName["land"];
  for (const [rx0, ry0, rx1, ry1, mx, my] of LAND_LIFTS)
    for (let y = ry0; y <= ry1; y++)
      for (let x = rx0; x <= rx1; x++) {
        const v = src.cells[y * RW + x] & 0x7ffff;
        const tx = mx + x - rx0, ty = my + y - ry0;
        if (v !== 0 && !NOT_LAND.has(v) && inB(tx, ty)) allLand[I(tx, ty)] = 1;
      }
}

autotile(L.land, allLand, SETS.land, { tiles: [194, 195, 197], p: 0.05 });

// ---------- coast skirt (cliff lips + animated foam, with corner wraps) ----------
// Canonical patterns derived from the example room:
//  - straight south coast: lip rows (266 [203|267r]* 266m) then foam (405 148* 149)
//  - outer corner wrap columns: left [403MF, 148R.., 403M], right [403F, 148FR.., 403]
//  - at staircase junctions lips/foam run right up to the lower step's grass
function coastSkirt(cliffHeight: (x: number, y: number) => number) {
  const isLand = (x: number, y: number) => (inB(x, y) ? allLand[I(x, y)] === 1 : false);
  const isCoast = (x: number, y: number) => isLand(x, y) && !isLand(x, y + 1);
  const free = (x: number, y: number) => inB(x, y) && !isLand(x, y) && L.land[I(x, y)] === 0;
  for (let y = 0; y < H - 2; y++) {
    for (let x = 0; x < W; x++) {
      if (!isCoast(x, y)) continue;
      if (inLiftLand(x, y + 1) || inLiftLand(x, y + 2)) continue;
      const Hh = cliffHeight(x, y);
      const sameRunW = isCoast(x - 1, y) && cliffHeight(x - 1, y) === Hh;
      const sameRunE = isCoast(x + 1, y) && cliffHeight(x + 1, y) === Hh;
      // lip rows
      let broke = false;
      for (let h = 1; h <= Hh; h++) {
        const ty = y + h;
        if (!free(x, ty)) { broke = true; break; }
        const wAbuts = sameRunW || isLand(x - 1, ty);
        const eAbuts = sameRunE || isLand(x + 1, ty);
        L.land[I(x, ty)] = !wAbuts ? 266 : !eAbuts ? 266 | M : (x + h) % 2 ? 203 : 267 | R;
      }
      // foam row
      const fy = y + Hh + 1;
      if (!broke && free(x, fy)) {
        const wAbuts = sameRunW || isLand(x - 1, fy);
        const eAbuts = sameRunE || isLand(x + 1, fy);
        L.land[I(x, fy)] = !wAbuts ? 405 : !eAbuts ? 149 : 148;
      }
      // outer-corner wrap columns (only at true run ends facing open sea)
      if (!sameRunW && !isLand(x - 1, y)) {
        if (free(x - 1, y)) L.land[I(x - 1, y)] = 403 | M | F;
        for (let h = 1; h <= Hh; h++) if (free(x - 1, y + h)) L.land[I(x - 1, y + h)] = 148 | R;
        if (free(x - 1, fy)) L.land[I(x - 1, fy)] = 403 | M;
      }
      if (!sameRunE && !isLand(x + 1, y)) {
        if (free(x + 1, y)) L.land[I(x + 1, y)] = 403 | F;
        for (let h = 1; h <= Hh; h++) if (free(x + 1, y + h)) L.land[I(x + 1, y + h)] = 148 | F | R;
        if (free(x + 1, fy)) L.land[I(x + 1, fy)] = 403;
      }
    }
  }
}

// ---------- lake + river ----------
const lake = mask();
ellipse(lake, 53, 19, 5.5, 3.6);
// river: 4 wide (2 banks + 2 water), x54..57 from lake down to south shore
let riverEndY = 0;
for (let y = 21; y < H; y++) {
  if (!allLand[I(55, y)] && !allLand[I(56, y)]) { riverEndY = y; break; }
  for (let x = 54; x <= 57; x++) lake[I(x, y)] = 1;
}
// river mouth: carve lake mask out of land-edge handling by treating river cells as "water"
// paint river/lake with river autotile, inverted mask logic: river tiles live ON land layer
{
  const at = (x: number, y: number) => (inB(x, y) ? lake[I(x, y)] : 0);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!lake[I(x, y)]) continue;
      const bm = (at(x, y - 1) ? 1 : 0) | (at(x + 1, y) ? 2 : 0) | (at(x, y + 1) ? 4 : 0) | (at(x - 1, y) ? 8 : 0);
      let pos = MASK2POS[bm] ?? 0;
      if (bm === 15 && !(at(x - 1, y - 1) && at(x + 1, y - 1) && at(x - 1, y + 1) && at(x + 1, y + 1))) pos = 15;
      let t = SETS.river[pos];
      if (pos === 0 && rnd() < 0.18) t = pick([542, 543, 544, 545]); // animated ripples
      L.land[I(x, y)] = t;
    }
}
// waterfall where the river crosses the south shore
{
  const y = riverEndY; // first sea row below river
  L.land[I(53, y)] = 418; L.land[I(54, y)] = 478; L.land[I(55, y)] = 479; L.land[I(56, y)] = 480; L.land[I(57, y)] = 481; L.land[I(58, y)] = 418 | M;
  L.land[I(53, y + 1)] = 418; L.land[I(54, y + 1)] = 414; L.land[I(55, y + 1)] = 415; L.land[I(56, y + 1)] = 416; L.land[I(57, y + 1)] = 417; L.land[I(58, y + 1)] = 418 | M;
}

// ---------- paths ----------
const path1 = mask();
function walkPath(m: Uint8Array, pts: [number, number][], width = 2) {
  for (let s = 0; s < pts.length - 1; s++) {
    let [x0, y0] = pts[s];
    const [x1, y1] = pts[s + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
    for (let t = 0; t <= steps; t++) {
      const x = Math.round(x0 + ((x1 - x0) * t) / steps), y = Math.round(y0 + ((y1 - y0) * t) / steps);
      for (let dy = 0; dy < width; dy++)
        for (let dx = 0; dx < width; dx++)
          if (inB(x + dx, y + dy) && allLand[I(x + dx, y + dy)] && !lake[I(x + dx, y + dy)]) m[I(x + dx, y + dy)] = 1;
    }
  }
}
// main roads
walkPath(path1, [[19, 26], [24, 28], [32, 30], [39, 30]]); // bridge S -> plaza
ellipse(path1, 42, 31, 3.5, 2.2); // plaza
walkPath(path1, [[44, 30], [50, 26], [56, 22], [61, 19], [64, 15], [67, 12]]); // plaza -> chapel headland
walkPath(path1, [[45, 32], [51, 33]]); // plaza -> river bridge (west side)
walkPath(path1, [[59, 33], [64, 33], [70, 33], [76, 33], [80, 33]]); // river bridge -> isthmus -> beach strip
walkPath(path1, [[41, 33], [40, 36]]); // plaza -> barn yard
walkPath(path1, [[39, 30], [44, 24], [47, 22]]); // plaza -> lake shore / blue tower
walkPath(path1, [[24, 28], [20, 32], [14, 36], [8, 40], [6, 44]]); // west road -> mine
// farm island roads
walkPath(path1, [[19, 15], [19, 11], [18, 8]], 2);
// chapel headland roads
walkPath(path1, [[67, 12], [70, 11]], 2);
walkPath(path1, [[71, 12], [74, 13]], 2);
// remove path where lake/river or lifted terrain owns the ground
for (let i = 0; i < N; i++) if (lake[i]) path1[i] = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inLiftLand(x, y)) path1[I(x, y)] = 0;
autotile(L.paths, path1, SETS.path1, { tiles: [450, 451], p: 0.12 });

// farm soil plots (Path02 hexes)
const plots = mask();
rect(plots, 8, 11, 15, 15);
for (let i = 0; i < N; i++) if (!farm[i]) plots[i] = 0;
autotile(L.paths, plots, SETS.path2);

// crops on plots (single-tile mound veggies, rows 15-17 of tileset cols 49+)
const CROPS = [1011, 1012, 1013, 1014, 1015, 1016, 1075, 1076, 1077, 1078, 1079, 1080, 1139, 1140, 1141, 1142, 1143, 1144];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (plots[I(x, y)] && (x + y) % 2 === 0 && rnd() < 0.85) L.decoration_01[I(x, y)] = pick(CROPS);

// ---------- bridges ----------
function bridgeV(x: number, y0: number, y1: number) {
  // 3-wide plank bridge; rails drawn over the outer plank columns (as the example does)
  L.paths[I(x - 1, y0)] = 743; L.paths[I(x, y0)] = 744; L.paths[I(x + 1, y0)] = 745;
  for (let y = y0 + 1; y < y1; y++) {
    L.paths[I(x - 1, y)] = 807; L.paths[I(x, y)] = 808 | R; L.paths[I(x + 1, y)] = 809;
    L.decoration_01[I(x - 1, y)] = 232; L.decoration_01[I(x + 1, y)] = 232;
  }
  L.paths[I(x - 1, y1)] = 745 | M | F; L.paths[I(x, y1)] = 744 | M | F; L.paths[I(x + 1, y1)] = 743 | M | F;
  L.decoration_01[I(x - 1, y0)] = 104; L.decoration_01[I(x + 1, y0)] = 104;
  L.decoration_01[I(x - 1, y1)] = 296; L.decoration_01[I(x + 1, y1)] = 296;
  for (let y = y0; y <= y1; y++) { L.shadows[I(x + 2, y)] = 76; }
}
function bridgeH(x0: number, x1: number, y: number) {
  // 2-row plank bridge with posts
  for (let x = x0; x <= x1; x++) { L.paths[I(x, y)] = 808; L.paths[I(x, y + 1)] = 808; L.shadows[I(x, y + 2)] = 76; }
  L.paths[I(x0 - 1, y)] = 460; L.paths[I(x0 - 1, y + 1)] = 532;
  L.paths[I(x1 + 1, y)] = 460; L.paths[I(x1 + 1, y + 1)] = 532;
  L.decoration_01[I(x0 - 1, y - 1)] = 980; L.decoration_01[I(x1 + 1, y - 1)] = 980 | M;
  L.decoration_01[I(x0 - 1, y + 2)] = 919; L.decoration_01[I(x1 + 1, y + 2)] = 920;
}
// farm -> main bridge: head sits on the farm's grass edge, planks span the tall cliff and sea
{
  let edgeY = 16;
  for (let y = H - 2; y >= 0; y--) if (farm[I(19, y)] && !farm[I(19, y + 1)]) { edgeY = y; break; }
  bridgeV(19, edgeY, 25);
}
bridgeH(53, 58, 32); // over the river (road to beach)

// ---------- lifts from Room1 ----------
const LIFT_LAYERS_T = ["shadows", "decoration_01", "building", "walls", "decoration_02", "decoration_03"] as const;
function lift(x0: number, y0: number, x1: number, y1: number, dx: number, dy: number, layers: readonly string[] = LIFT_LAYERS_T, opts?: { withLand?: boolean; withPaths?: boolean; landFilter?: boolean }) {
  const names = [...layers];
  if (opts?.withLand) names.push("land");
  if (opts?.withPaths) names.push("paths");
  for (const name of names) {
    const src = roomByName[name];
    const dst = (L as any)[name] as number[];
    if (!src || !dst) continue;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const v = src.cells[y * RW + x];
        const tx = dx + x - x0, ty = dy + y - y0;
        if (v !== 0 && inB(tx, ty)) {
          // landFilter: skip coast foam/water tiles that belonged to the original surroundings
          if (opts?.landFilter && name === "land" && NOT_LAND.has(v & 0x7ffff)) continue;
          dst[I(tx, ty)] = v;
        }
      }
  }
}

// terrain chunks (bboxes mirror LAND_LIFTS); mine gets landFilter (its original
// top edge bordered water - that foam shouldn't overwrite our grass)
for (const [i, [rx0, ry0, rx1, ry1, mx, my]] of LAND_LIFTS.entries())
  lift(rx0, ry0, rx1, ry1, mx, my, LIFT_LAYERS_T, { withLand: true, withPaths: true, landFilter: i === 0 });
// tree islet patches: close its east side (was a sandbar to the mainland) and
// drop two foreign coast cells that slipped into the bbox
L.land[I(51, 3)] = 259; L.land[I(51, 4)] = 259; L.land[I(51, 5)] = 259;
allLand[I(51, 3)] = allLand[I(51, 4)] = allLand[I(51, 5)] = 1;
L.land[I(46, 9)] = 0; L.land[I(47, 9)] = 0;
allLand[I(46, 9)] = 0; allLand[I(47, 9)] = 0;
lift(29, 31, 39, 38, 61, 10, LIFT_LAYERS_T); // graveyard (chapel headland)
lift(49, 0, 58, 7, 67, 15, LIFT_LAYERS_T, { withPaths: true }); // NE veggie garden + cottage (soil plots, veggies, crates)

// building stamps: [room bbox] -> map position
const STAMPS: [number, number, number, number, number, number, boolean?][] = [
  // x0,y0,x1,y1, dstX,dstY, withPaths
  [50, 20, 65, 28, 28, 33, true], // #2 red barn complex (town south)
  [39, 24, 47, 29, 67, 5], // #4 blue chapel (chapel island)
  [0, 21, 5, 35, 0, 24, true], // #5 watchtower (west coast)
  [28, 2, 36, 14, 10, 27, true], // #1 orange stilt complex (west shore)
  [42, 1, 46, 9, 43, 14], // #9 blue tower (lake west)
  [50, 11, 56, 15, 37, 24], // #8 red awning shop (plaza north)
  [38, 14, 42, 19, 45, 28], // #12 red tower house (plaza east)
  [50, 6, 55, 9, 33, 22], // #14 blue tarp-roof house (town NW)
  [40, 33, 44, 37, 26, 25], // #11 purple big house (town west)
  [21, 25, 24, 28, 31, 27], // #18 green small house
  [30, 26, 33, 29, 24, 31], // #19 pink small house
  [54, 0, 58, 3, 44, 34], // #16 blue gable house (plaza south)
  [55, 31, 60, 34, 16, 4], // #15 orange wide house (farm)
  [61, 8, 63, 10, 60, 23], // #22 green hut (town east, river bank)
  [13, 26, 18, 31, 59, 27], // #7 purple house (river east)
];
for (const [x0, y0, x1, y1, dx, dy, withPaths] of STAMPS) lift(x0, y0, x1, y1, dx, dy, LIFT_LAYERS_T, { withPaths });

// skirt AFTER lifts know their place (skips lifted coasts internally);
// the farm island gets tall 2-row cliffs (terraced look), everything else 1
coastSkirt((x, y) => (farm[I(x, y)] ? 2 : 1));

// farm cliff furniture: ladder down the cliff face + fence along the cliff top
{
  // find the farm's south edge at x=12 and drop a ladder over the cliff
  for (let y = H - 2; y >= 0; y--) {
    if (farm[I(12, y)] && !farm[I(12, y + 1)]) {
      L.decoration_02[I(12, y + 1)] = 746;
      L.decoration_02[I(12, y + 2)] = 810;
      L.decoration_02[I(12, y + 3)] = 811;
      break;
    }
  }
  // fence on the farm cliff edge rows (skip the ladder column and bridge)
  for (let x = 8; x <= 16; x++) {
    if (x === 12 || (x >= 18 && x <= 20)) continue;
    for (let y = H - 2; y >= 0; y--) {
      if (farm[I(x, y)] && !farm[I(x, y + 1)]) {
        if (L.decoration_01[I(x, y)] === 0 && !plots[I(x, y)] && !path1[I(x, y)]) L.decoration_01[I(x, y)] = 167;
        break;
      }
    }
  }
}

// ---------- fences & pens (farm) ----------
// wooden fence kit: post 106, horizontal rail 167, end 170, vertical rail 104/232/296
function fenceRect(x0: number, y0: number, x1: number, y1: number, gate?: [number, number]) {
  for (let x = x0 + 1; x < x1; x++) { L.decoration_01[I(x, y0)] = 167; L.decoration_01[I(x, y1)] = 167; }
  L.decoration_01[I(x0, y0)] = 106; L.decoration_01[I(x1, y0)] = 170;
  L.decoration_01[I(x0, y1)] = 106; L.decoration_01[I(x1, y1)] = 170;
  for (let y = y0 + 1; y < y1; y++) { L.decoration_01[I(x0, y)] = 232; L.decoration_01[I(x1, y)] = 232; }
  if (gate) L.decoration_01[I(gate[0], gate[1])] = 0;
}
fenceRect(20, 10, 24, 14, [20, 12]); // sheep & cow pen (farm east)
fenceRect(12, 16, 16, 18, [16, 17]); // pig pen (farm south)
// knight statue (2x3 tiles) as the plaza centerpiece
{
  const ST = [1196, 1197, 1260, 1261, 1324, 1325];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 2; c++) L.decoration_02[I(41 + c, 29 + r)] = ST[r * 2 + c];
}

// ---------- seam cleanup at the east strip margin ----------
L.decoration_01[I(80, 26)] = 0; L.decoration_01[I(80, 27)] = 0; // jar halves cut by the lift
// blend my plain grass into the strip's textured margin with a gradient of the same variants
for (let y = 27; y <= 38; y++)
  for (let x = 74; x <= 79; x++)
    if (allLand[I(x, y)] && (L.land[I(x, y)] & 0x7ffff) === 193 && rnd() < 0.1)
      L.land[I(x, y)] = pick([129, 130, 133, 134]);

// ---------- dressing: free-grass test, stone walls, road fences, building bases ----------
const isFreeGrass = (x: number, y: number) =>
  inB(x, y) && allLand[I(x, y)] === 1 && !lake[I(x, y)] && !path1[I(x, y)] && !plots[I(x, y)] && !inLiftLand(x, y) &&
  L.decoration_01[I(x, y)] === 0 && L.building[I(x, y)] === 0 && L.walls[I(x, y)] === 0 &&
  L.decoration_02[I(x, y)] === 0 && (L.land[I(x, y)] & 0x7ffff) === 193;
function place2x3(x: number, y: number, tiles: number[]) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) L.decoration_01[I(x + c, y + r)] = tiles[r * 2 + c];
}
function place2x2(x: number, y: number, tiles: number[]) {
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) L.decoration_01[I(x + c, y + r)] = tiles[r * 2 + c];
}
const PINE = [435, 436, 499, 500, 563, 564];
const DARKPINE = [243, 244, 307, 308, 371, 372];
const BUSH = [113, 114, 177, 178];

// stone wall run (rail-side wall family: 495 run, 496 ends, 560 post)
function stoneWallH(x0: number, x1: number, y: number) {
  for (let x = x0; x <= x1; x++) if (!isFreeGrass(x, y)) return false;
  for (let x = x0; x <= x1; x++) L.decoration_01[I(x, y)] = x === x0 ? 496 | M : x === x1 ? 496 : 495;
  if (x1 - x0 >= 5) L.decoration_01[I((x0 + x1) >> 1, y)] = 560;
  return true;
}
stoneWallH(33, 38, 26); // north plaza district edge
stoneWallH(1, 6, 43); // above the old mine
stoneWallH(64, 68, 23); // along the NE garden

// wood fence runs beside roads (placed only where fully free)
function woodFenceH(x0: number, x1: number, y: number) {
  for (let x = x0; x <= x1; x++) if (!isFreeGrass(x, y)) return false;
  for (let x = x0; x <= x1; x++) L.decoration_01[I(x, y)] = x === x0 ? 106 : x === x1 ? 170 : 167;
  return true;
}
woodFenceH(26, 31, 27); // along the west road into town
woodFenceH(46, 51, 24); // along the lake road
woodFenceH(36, 40, 35); // by the barn yard

// crates / jars / bushes at building bases
{
  const SINGLES = [613, 614, 612];
  for (const [bx0, by0, bx1, by1, dx, dy] of STAMPS) {
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    const spots: [number, number][] = [[dx - 1, dy + bh - 1], [dx + bw, dy + bh - 1], [dx - 1, dy + bh - 3]];
    let n = 0;
    for (const [sx, sy] of spots) {
      if (n >= 2) break;
      if (isFreeGrass(sx, sy) && isFreeGrass(sx + 1, sy) && isFreeGrass(sx, sy - 1) && isFreeGrass(sx + 1, sy - 1) && rnd() < 0.6) {
        place2x2(sx, sy - 1, BUSH); n++;
      } else if (isFreeGrass(sx, sy) && rnd() < 0.7) {
        L.decoration_01[I(sx, sy)] = pick(SINGLES); n++;
      }
    }
  }
}

// lumber camp: stumps near the woodcutters (east of the stilt complex)
for (const [sx, sy] of [[21, 35], [25, 38], [23, 38]] as [number, number][])
  if (isFreeGrass(sx, sy)) L.decoration_01[I(sx, sy)] = 353;

// flowers hugging the paths
const PATH_FLOWERS = [97, 98, 99, 161, 162, 163, 225, 226, 227];
for (let y = 1; y < H - 1; y++)
  for (let x = 1; x < W - 1; x++) {
    if (!isFreeGrass(x, y)) continue;
    const nearPath = path1[I(x - 1, y)] || path1[I(x + 1, y)] || path1[I(x, y - 1)] || path1[I(x, y + 1)];
    if (nearPath && rnd() < 0.1) L.decoration_01[I(x, y)] = pick(PATH_FLOWERS);
  }

// stepping stones dotting the water near coasts
for (let y = 1; y < H - 1; y++)
  for (let x = 1; x < W - 1; x++) {
    if (allLand[I(x, y)] || L.land[I(x, y)] !== 0) continue;
    const nearCoast = allLand[I(x - 1, y)] || allLand[I(x + 1, y)] || allLand[I(x, y - 1)] || allLand[I(x, y + 1)];
    if (nearCoast && rnd() < 0.035) L.land[I(x, y)] = pick([211, 212, 215, 211 | M]);
  }
// orchard (fruit trees) on chapel island south
const FRUITS = [
  [245, 246, 309, 310], // apple
  [373, 374, 437, 438], // orange
];
for (const [x, y, f] of [[72, 12, 0], [74, 14, 1]] as number[][]) {
  const [a, b, c, d] = FRUITS[f];
  L.decoration_01[I(x, y)] = a; L.decoration_01[I(x + 1, y)] = b;
  L.decoration_01[I(x, y + 1)] = c; L.decoration_01[I(x + 1, y + 1)] = d;
}

// ---------- scatter decor ----------
let placed = 0, tries = 0;
while (placed < 34 && tries++ < 6000) {
  const x = 2 + ((rnd() * (W - 6)) | 0), y = 2 + ((rnd() * (H - 8)) | 0);
  let ok = true;
  for (let r = 0; r < 3 && ok; r++) for (let c = 0; c < 2 && ok; c++) if (!isFreeGrass(x + c, y + r)) ok = false;
  // keep town plaza neighborhood clearer
  if (ok && x > 30 && x < 52 && y > 22 && y < 36) ok = rnd() < 0.2;
  if (!ok) continue;
  const kind = rnd();
  if (kind < 0.4) place2x3(x, y, PINE);
  else if (kind < 0.7) place2x3(x, y, DARKPINE);
  else place2x2(x, y, BUSH);
  placed++;
}
// flowers, mushrooms (animated), small rocks, grass tufts
const SMALL = [97, 98, 99, 161, 162, 163, 225, 226, 227, 289, 290, 91, 155, 219, 283, 244, 307];
for (let y = 1; y < H - 1; y++)
  for (let x = 1; x < W - 1; x++)
    if (isFreeGrass(x, y) && rnd() < 0.045) L.decoration_01[I(x, y)] = pick(SMALL);

// animated swaying tree sprites (runtime), on free grass
const treeSprites: { kind: string; x: number; y: number }[] = [];
{
  let n = 0, tr = 0;
  while (n < 12 && tr++ < 3000) {
    const x = 3 + ((rnd() * (W - 6)) | 0), y = 3 + ((rnd() * (H - 8)) | 0);
    if (!isFreeGrass(x, y) || !isFreeGrass(x + 1, y) || !isFreeGrass(x, y - 1) || !isFreeGrass(x + 1, y - 1)) continue;
    treeSprites.push({ kind: rnd() < 0.5 ? "tree1" : "tree2", x: x * 16 + 16, y: y * 16 + 12 });
    n++;
  }
}

// ---------- forest (32px tiles) on chapel island ----------
{
  const src = roomByName["forest"];
  const SW = 43;
  // lift the example's nicest cluster (rows of canopy) twice
  const liftForest = (x0: number, y0: number, x1: number, y1: number, dx: number, dy: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const v = src.cells[y * SW + x];
        const tx = dx + x - x0, ty = dy + y - y0;
        if (v !== 0 && tx >= 0 && ty >= 0 && tx < FW && ty < FH) forest[ty * FW + tx] = v;
      }
  };
  liftForest(22, 9, 28, 12, 29, 16); // isthmus SE woods (goblin camp beside it)
  liftForest(9, 3, 14, 7, 13, 17); // main island west woods
}

// ---------- clouds ----------
{
  const c1 = mask(), c2 = mask();
  const blobs1: [number, number, number, number][] = [
    [10, 4, 5, 2.2], [30, 2, 4, 1.8], [64, 2, 5, 2], [92, 8, 4, 2], [4, 30, 3.5, 1.8],
    [50, 50, 5, 2.2], [20, 50, 4, 1.8], [90, 50, 4.5, 2], [70, 30, 3, 1.5],
  ];
  for (const [x, y, rx, ry] of blobs1) ellipse(c1, x, y, rx, ry);
  autotile(L.clouds_01, c1, SETS.clouds1);
  const sh = mask();
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--)
      if (c1[I(x, y)] && inB(x + 2, y + 2)) sh[I(x + 2, y + 2)] = 1;
  autotile(L.cloud_shadow, sh, SETS.cloudShadow);
  const blobs2: [number, number, number, number][] = [
    [27, 19, 3, 1.5], [62, 25, 2.5, 1.3], [44, 10, 3, 1.4], [86, 30, 2.5, 1.2], [32, 46, 3, 1.5], [6, 18, 2.5, 1.3], [78, 50, 3, 1.4],
  ];
  for (const [x, y, rx, ry] of blobs2) ellipse(c2, x, y, rx, ry);
  autotile(L.clouds_02, c2, SETS.clouds2);
}

// ---------- animated tiles ----------
const TILE_ANIMS: number[][] = [
  [147, 150], [148, 151], [149, 152], [211, 214], [213, 216], [275, 278], [276, 279], [277, 280],
  [340, 343], [339, 342], [341, 344], [403, 406], [405, 408], [478, 479, 480, 481], [212, 215],
  [153, 217], [414, 415, 416, 417], [91, 92, 93, 94], [155, 156, 157, 158], [219, 220, 221, 222],
  [283, 284, 285, 286], [410, 411, 412, 413], [542, 543, 544, 545], [1276, 1277], [1419, 1420, 1421, 1422],
];
const animByTile = new Map<number, { frames: number[]; phase: number; slow: boolean }>();
TILE_ANIMS.forEach((frames, ai) => {
  const slow = ai <= 12 || ai === 14 || ai === 15 || ai >= 23 || (ai >= 17 && ai <= 20); // 2-frame & sparkle anims tick slowly
  frames.forEach((f, i) => { if (!animByTile.has(f)) animByTile.set(f, { frames, phase: i, slow }); });
});
const animTiles: any[] = [];
for (const def of LAYER_DEFS) {
  const cells = L[def.name];
  for (let i = 0; i < N; i++) {
    const v = cells[i];
    if (!v) continue;
    const a = animByTile.get(v & 0x7ffff);
    if (a) animTiles.push({ x: i % W, y: (i / W) | 0, layer: def.name, frames: a.frames, phase: a.phase, fps: a.slow ? 2.5 : 8, flags: (v >>> 28) & 7 });
  }
}

// ---------- sprites / npcs / labels (runtime data) ----------
const T = 16;
const px = (x: number, y: number) => ({ x: x * T, y: y * T });
const sprites: any[] = [
  // windmill blades mount on top of the pack's towers (as in the example room)
  { kind: "windmill", ...px(43.5, 26.2) }, // red tower (town)
  { kind: "windmill", ...px(0, 22.5) }, // harbor watchtower
  { kind: "windmill", ...px(88, 4.6) }, // lighthouse islet (east strip, original offset)
  { kind: "windmill", ...px(87, 43.4) }, // houseboat (east strip, original offset)
  // chimney smoke (positions tuned to stamps)
  { kind: "smoke", variant: 1, ...px(31.5, 33.2) }, // barn complex
  { kind: "smoke", variant: 2, ...px(46.2, 28.4) }, // red tower house
  { kind: "smoke", variant: 3, ...px(34.4, 21.3) }, // green tower
  { kind: "smoke", variant: 4, ...px(27.5, 25.2) }, // purple big
  { kind: "smoke", variant: 5, ...px(17.2, 4.3) }, // farm house
  { kind: "smoke", variant: 2, ...px(68.6, 5.4) }, // chapel
  { kind: "smoke", variant: 1, ...px(58.4, 27.3) }, // purple house
  { kind: "smoke", variant: 4, ...px(12.4, 27.2) }, // stilt complex
  // animals
  { kind: "cow", ...px(21, 10.8) }, { kind: "cow", ...px(23, 12.6) },
  { kind: "sheep", ...px(20.6, 12.4) }, { kind: "sheep", ...px(22.4, 11.2) }, { kind: "sheep", ...px(21.6, 13.4) },
  { kind: "pig", ...px(13, 16.8) }, { kind: "pig", ...px(14.6, 17.2) },
  { kind: "chicken", ...px(17.5, 8) }, { kind: "chicken", ...px(18.6, 8.7) }, { kind: "chicken", ...px(16.8, 9.2) },
  { kind: "duck", ...px(51, 18) }, { kind: "duck", ...px(54, 19.5) }, { kind: "duck", ...px(56, 18.6) }, { kind: "duck", ...px(52.5, 20.5) },
  { kind: "bird", ...px(36, 22) }, { kind: "bird", ...px(64, 30) }, { kind: "bird", ...px(46, 40) },
  { kind: "bird", ...px(90, 18) }, { kind: "bird", ...px(24, 42) }, { kind: "bird", ...px(12, 24) },
  { kind: "blinking", ...px(63, 6) }, { kind: "blinking", ...px(15, 18.5) },
  // VFX
  { kind: "fire1", ...px(73.2, 37.4) }, // goblin campfire (SE woods)
  { kind: "fire2", ...px(41, 34.5) }, // plaza firepit
  { kind: "glint", ...px(30, 50) }, { kind: "glint", ...px(70, 2) }, { kind: "glint", ...px(5, 15) },
  { kind: "glint", ...px(91, 36) }, { kind: "glint", ...px(46, 5) }, { kind: "glint", ...px(16, 48) },
  { kind: "glint", ...px(60, 52) }, { kind: "glint", ...px(2, 40) }, { kind: "glint", ...px(53, 19) },
  // boats
  { kind: "coracle", ...px(58, 48) }, { kind: "coracle", ...px(33, 12) },
  { kind: "coracle", ...px(52.5, 20.8) }, // the lake fisher's boat
  { kind: "coracleLand", ...px(83, 33) },
  { kind: "bird", ...px(95.3, 30.6) }, // on a pier post
  ...treeSprites,
];
const npcs: any[] = [
  // workers
  { kind: "human", hair: "longhair", tools: true, anim: "watering", ...px(11, 13), flip: false },
  { kind: "human", hair: "shorthair", tools: true, anim: "dig", ...px(14, 15), flip: true, expression: "working" },
  { kind: "human", hair: "mophair", tools: true, anim: "watering", ...px(9.6, 14.4), flip: true },
  { kind: "goblin", anim: "doing", ...px(13, 12.4), flip: false },
  { kind: "goblin", anim: "axe", ...px(24.2, 37.4), flip: true }, // second woodcutter at the lumber camp
  { kind: "goblin", anim: "casting", ...px(52.4, 20.3), flip: false }, // fishing from the coracle on the lake
  { kind: "human", hair: "longhair", tools: true, anim: "carryWalk", waypoints: [[3, 49], [8, 48.5], [3, 49]], speed: 10, ...px(3, 49) }, // ore hauler in the mine
  { kind: "human", hair: "bowlhair", tools: true, anim: "axe", ...px(22.5, 36.5), flip: false }, // woodcutter at the lumber camp
  { kind: "human", hair: "curlyhair", tools: true, anim: "mining", ...px(5, 50), flip: false },
  { kind: "human", hair: "mophair", tools: true, anim: "mining", ...px(9, 48), flip: true },
  { kind: "human", hair: "spikeyhair", tools: true, anim: "hammering", ...px(30, 36), flip: false },
  { kind: "human", hair: "longhair", tools: true, anim: "casting", ...px(94, 33.2), flip: false }, // pier
  { kind: "human", hair: "shorthair", tools: true, anim: "reeling", ...px(3.5, 29), flip: false }, // watchtower dock
  { kind: "human", hair: "curlyhair", anim: "swimming", ...px(82, 41.5), flip: false }, // lagoon
  { kind: "human", hair: "mophair", anim: "doing", ...px(84.5, 28.6), flip: false }, // market stall
  { kind: "human", hair: "curlyhair", anim: "idle", ...px(86.4, 29.6), flip: true, expression: "chat" }, // market customers
  { kind: "human", hair: "bowlhair", anim: "idle", ...px(87.4, 29.6), flip: false },
  // idle / social
  { kind: "human", hair: "longhair", anim: "idle", ...px(40, 31.4), flip: true, expression: "chat" },
  { kind: "human", hair: "spikeyhair", anim: "idle", ...px(43.2, 31.4), flip: false },
  { kind: "human", hair: "curlyhair", anim: "idle", ...px(50, 22.4), flip: true, expression: "love" },
  { kind: "human", hair: "bowlhair", anim: "idle", ...px(51, 22.4), flip: false, expression: "love" },
  { kind: "human", hair: "shorthair", anim: "waiting", ...px(60.8, 19.8), flip: false, expression: "confused" },
  { kind: "human", hair: "mophair", anim: "jump", ...px(44, 36.5), flip: false, expression: "happy" },
  // walkers
  { kind: "human", hair: "longhair", tools: true, anim: "carryWalk", waypoints: [[19, 17], [19, 25], [22, 27.5], [30, 29.5], [38, 30]], speed: 18, ...px(19, 17) },
  { kind: "human", hair: "shorthair", anim: "walk", waypoints: [[40, 30.5], [48, 27], [55, 22.5], [61, 19.5], [55, 22.5], [48, 27]], speed: 16, ...px(40, 30.5) },
  { kind: "human", hair: "curlyhair", anim: "walk", waypoints: [[45, 32], [51, 33], [56, 33], [64, 33.5], [72, 33.5], [79, 33], [72, 33.5], [64, 33.5], [56, 33], [51, 33]], speed: 15, ...px(45, 32) },
  { kind: "human", hair: "bowlhair", anim: "run", waypoints: [[40, 32], [40, 36], [34, 37], [40, 36]], speed: 38, ...px(40, 32) },
  { kind: "human", hair: "spikeyhair", anim: "roll", waypoints: [[42, 33], [42, 36.5], [46, 37], [42, 36.5]], speed: 30, ...px(42, 33) },
  // goblins & skeletons
  { kind: "goblin", anim: "idle", ...px(72.4, 36.8), flip: true },
  { kind: "goblin", anim: "jump", ...px(74.4, 36.2), flip: false, expression: "attack" },
  { kind: "goblin", anim: "doing", ...px(73.4, 38.2), flip: false },
  { kind: "skeleton", anim: "idle", ...px(64, 12.5), flip: false },
  { kind: "skeleton", anim: "walk", waypoints: [[63, 14.5], [68, 15], [63, 14.5]], speed: 8, ...px(63, 14.5) },
];
// fix lumberjack position to west woods on main island


const labels: any[] = [
  { text: "SUNNYSIDE", ...px(42.5, 27.6) },
  { text: "FARM", ...px(15, 9) },
  { text: "MARKET", ...px(85.5, 30) },
  { text: "CHAPEL", ...px(71.5, 4.2) },
  { text: "GRAVEYARD", ...px(66, 9.6) },
  { text: "OLD MINE", ...px(6.5, 46.5) },
  { text: "HARBOR", ...px(3, 38.5) },
  { text: "LIGHTHOUSE", ...px(93, 2.4) },
  { text: "THE OPEN HOUSE", ...px(92, 13.4) },
];

// ---------- export ----------
const outLayers = LAYER_DEFS.map((d) => ({ name: d.name, tileset: "tileset_sunnysideworld", width: W, height: H, depth: d.depth, cells: L[d.name] }));
outLayers.splice(6, 0, { name: "forest", tileset: "tileset_forest", width: FW, height: FH, depth: 800, cells: forest } as any);

await Bun.write("d:/codes/game1/scripts/tmp/preview_layers.json", JSON.stringify(outLayers));
await Bun.write(
  "d:/codes/game1/src/game/map.json",
  JSON.stringify({ width: W, height: H, tile: T, layers: outLayers, animTiles, sprites, npcs, labels })
);
console.log(`map ${W}x${H}; animTiles=${animTiles.length}; sprites=${sprites.length}; npcs=${npcs.length}`);
