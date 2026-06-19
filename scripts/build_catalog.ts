// Builds src/game/catalog.json — the palette manifest for the sandbox builder.
// Sources:
//  - room1_layers.json: multi-tile structure stamps via connected components
//    (same approach as extract_stamps.ts), labeled from the known example-room map.
//  - hand-curated tile kits (fences, statue, pines, bushes, flowers) verified in build_map.ts.
//  - sprite/character tables kept in sync with src/game/assets.js.
//  - Elements/Crops directory scan for crop overlays.
// Also embeds the terrain autotile sets + animated-tile table so the runtime
// compiler (src/game/compile.js) can paint terrain and derive animTiles.
import { readdirSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const PACK = join(ROOT, "public", "Sunnyside_World_ASSET_PACK_V2.1", "Sunnyside_World_Assets");

// ---------- terrain autotile data (verified in build_map.ts) ----------
const SETS = {
  land: [193, 194, 195, 196, 197, 198, 199, 200, 257, 258, 259, 260, 261, 262, 263, 193],
  path1: [449, 450, 451, 452, 453, 454, 455, 456, 513, 514, 515, 516, 517, 518, 519, 449],
  path2: [460, 461, 462, 463, 464, 465, 466, 467, 524, 525, 526, 527, 528, 529, 530, 460],
  river: [470, 471, 472, 473, 474, 475, 476, 477, 534, 535, 536, 537, 538, 539, 540, 470],
};
const SEA_BLOCK = [
  [1163, 1164, 1165, 1166],
  [1227, 1228, 1229, 1230],
  [1291, 1292, 1293, 1294],
  [1355, 1356, 1357, 1358],
];
const terrains = [
  { id: "sea", label: "Sea", block: SEA_BLOCK },
  { id: "grass", label: "Grass Island", set: SETS.land, layer: "land", base: true },
  { id: "path", label: "Dirt Path", set: SETS.path1, layer: "paths" },
  { id: "path2", label: "Stone Path", set: SETS.path2, layer: "paths" },
  { id: "river", label: "River Water", set: SETS.river, layer: "paths" },
];

// ---------- animated-tile table (verified in build_map.ts) ----------
const TILE_ANIMS: number[][] = [
  [147, 150], [148, 151], [149, 152], [211, 214], [213, 216], [275, 278], [276, 279], [277, 280],
  [340, 343], [339, 342], [341, 344], [403, 406], [405, 408], [478, 479, 480, 481], [212, 215],
  [153, 217], [414, 415, 416, 417], [91, 92, 93, 94], [155, 156, 157, 158], [219, 220, 221, 222],
  [283, 284, 285, 286], [410, 411, 412, 413], [542, 543, 544, 545], [1276, 1277], [1419, 1420, 1421, 1422],
];
const animations = TILE_ANIMS.map((frames, ai) => ({
  frames,
  slow: ai <= 12 || ai === 14 || ai === 15 || ai >= 23 || (ai >= 17 && ai <= 20),
}));

// ---------- structure stamps from Room1 (connected components on cores) ----------
const ROOM: any[] = await Bun.file(join(ROOT, "scripts", "room1_layers.json")).json();
const RW = 86, RH = 48;
const byName = Object.fromEntries(ROOM.map((l) => [l.name, l]));
const CORE_LAYERS = ["building", "walls"];
const STAMP_LAYERS = ["shadows", "decoration_01", "building", "walls", "decoration_02", "decoration_03"];

const occ = new Uint8Array(RW * RH);
for (const name of CORE_LAYERS) {
  const l = byName[name];
  for (let i = 0; i < l.cells.length; i++) if (l.cells[i] !== 0) occ[i] = 1;
}
const comp = new Int32Array(RW * RH).fill(-1);
let nComp = 0;
const MERGE_R = 1;
for (let i = 0; i < RW * RH; i++) {
  if (!occ[i] || comp[i] !== -1) continue;
  const stack = [i];
  comp[i] = nComp;
  while (stack.length) {
    const c = stack.pop()!;
    const cx = c % RW, cy = (c / RW) | 0;
    for (let dy = -MERGE_R; dy <= MERGE_R; dy++)
      for (let dx = -MERGE_R; dx <= MERGE_R; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= RW || ny >= RH) continue;
        const n = ny * RW + nx;
        if (occ[n] && comp[n] === -1) { comp[n] = nComp; stack.push(n); }
      }
  }
  nComp++;
}
const boxes = Array.from({ length: nComp }, () => ({ x0: RW, y0: RH, x1: -1, y1: -1, n: 0 }));
for (let i = 0; i < RW * RH; i++) {
  if (comp[i] === -1) continue;
  const b = boxes[comp[i]];
  const x = i % RW, y = (i / RW) | 0;
  b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y);
  b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
  b.n++;
}

// known structures (room bboxes used by build_map.ts STAMPS/lifts) -> labels
const KNOWN: [number, number, number, number, string][] = [
  [50, 20, 65, 28, "Red Barn Complex"],
  [39, 24, 47, 29, "Blue Chapel"],
  [0, 21, 5, 35, "Watchtower"],
  [28, 2, 36, 14, "Stilt House Complex"],
  [42, 1, 46, 9, "Blue Tower"],
  [50, 11, 56, 15, "Red Awning Shop"],
  [38, 14, 42, 19, "Red Tower House"],
  [50, 6, 55, 9, "Blue Tarp House"],
  [40, 33, 44, 37, "Purple Big House"],
  [21, 25, 24, 28, "Green Small House"],
  [30, 26, 33, 29, "Pink Small House"],
  [54, 0, 58, 3, "Blue Gable House"],
  [55, 31, 60, 34, "Orange Wide House"],
  [61, 8, 63, 10, "Green Hut"],
  [13, 26, 18, 31, "Purple House"],
  [29, 31, 39, 38, "Graveyard"],
  [49, 0, 58, 7, "Veggie Garden Cottage"],
  [66, 0, 85, 47, "East Coast Structure"], // pier/lighthouse/market pieces from the strip
].sort((a, b) => (a[2] - a[0]) * (a[3] - a[1]) - (b[2] - b[0]) * (b[3] - b[1])); // smallest box wins

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const usedIds = new Map<string, number>();
const uniqueId = (base: string) => {
  const n = (usedIds.get(base) ?? 0) + 1;
  usedIds.set(base, n);
  return n === 1 ? base : `${base}_${n}`;
};

const buildingItems: any[] = [];
for (const b of boxes.filter((b) => b.n >= 2).sort((a, b) => b.n - a.n)) {
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const known = KNOWN.find(([x0, y0, x1, y1]) => cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1);
  const label = known ? known[4] : `Structure ${buildingItems.length + 1}`;
  const layers: Record<string, number[]> = {};
  for (const name of STAMP_LAYERS) {
    const src = byName[name];
    const cells = new Array(w * h).fill(0);
    let any = false;
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        const v = src.cells[y * RW + x];
        if (v !== 0) { cells[(y - b.y0) * w + (x - b.x0)] = v; any = true; }
      }
    if (any) layers[name] = cells;
  }
  buildingItems.push({ id: uniqueId(slug(label)), label, kind: "object", w, h, layers, thumb: { type: "object" } });
}

// ---------- hand-curated tile-kit objects (indices verified in build_map.ts) ----------
const obj = (id: string, label: string, w: number, h: number, layer: string, cells: number[]) => ({
  id, label, kind: "object", w, h, layers: { [layer]: cells }, thumb: { type: "object" },
});
const grid1 = (layer: string, idx: number) => (id: string, label: string) => obj(id, label, 1, 1, layer, [idx]);
const d1 = (idx: number, id: string, label: string) => grid1("decoration_01", idx)(id, label);

const fenceItems = [
  d1(106, "fence_post", "Wood Fence Post"),
  d1(167, "fence_rail", "Wood Fence Rail"),
  d1(170, "fence_end", "Wood Fence End"),
  d1(232, "fence_vertical", "Wood Fence Vertical"),
  d1(495, "stone_wall", "Stone Wall Run"),
  d1(496, "stone_wall_end", "Stone Wall End"),
  d1(560, "stone_wall_post", "Stone Wall Post"),
];

const natureObjects = [
  obj("pine_tree", "Pine Tree", 2, 3, "decoration_01", [435, 436, 499, 500, 563, 564]),
  obj("dark_pine", "Dark Pine", 2, 3, "decoration_01", [243, 244, 307, 308, 371, 372]),
  obj("bush_big", "Big Bush", 2, 2, "decoration_01", [113, 114, 177, 178]),
  obj("apple_tree", "Apple Tree", 2, 2, "decoration_01", [245, 246, 309, 310]),
  obj("orange_tree", "Orange Tree", 2, 2, "decoration_01", [373, 374, 437, 438]),
  d1(353, "stump", "Tree Stump"),
  ...[97, 98, 99, 161, 162, 163, 225, 226, 227].map((idx, i) => d1(idx, `flower_${i + 1}`, `Flowers ${i + 1}`)),
  ...[211, 212, 215].map((idx, i) => obj(`stepping_stone_${i + 1}`, `Stepping Stone ${i + 1}`, 1, 1, "land", [idx])),
];

const propObjects = [
  obj("knight_statue", "Knight Statue", 2, 3, "decoration_02", [1196, 1197, 1260, 1261, 1324, 1325]),
  ...[613, 614, 612].map((idx, i) => d1(idx, `crate_${i + 1}`, `Crate / Jar ${i + 1}`)),
];

// ---------- sprite items (aliases match src/game/assets.js manifest) ----------
const sprite = (id: string, label: string, place: any, thumbAlias = id, extra: any = {}) => ({
  id, label, kind: "sprite", place, thumb: { type: "strip", alias: thumbAlias }, ...extra,
});
const animalItems = ["bird", "chicken", "cow", "duck", "pig", "sheep"].map((k) =>
  sprite(k, k[0].toUpperCase() + k.slice(1), { kind: k }));

const HUMAN_ANIM_KEYS = ["idle", "walk", "carryWalk", "run", "dig", "watering", "axe", "mining", "hammering", "casting", "reeling", "swimming", "waiting", "jump", "roll", "doing"];
const HAIRS = ["bowlhair", "curlyhair", "longhair", "mophair", "shorthair", "spikeyhair"];
const peopleItems = [
  sprite("villager", "Villager", { kind: "human", anim: "idle", hair: "shorthair", tools: false }, "h_base_idle", {
    options: { anims: HUMAN_ANIM_KEYS, hairs: HAIRS, tools: [false, true] },
  }),
  sprite("goblin", "Goblin", { kind: "goblin", anim: "idle" }, "g_idle", {
    options: { anims: ["idle", "walk", "jump", "doing", "run", "casting", "axe"] },
  }),
  sprite("skeleton", "Skeleton", { kind: "skeleton", anim: "idle" }, "s_idle", {
    options: { anims: ["idle", "walk", "attack", "jump"] },
  }),
];

const vfxItems = [
  ...[1, 2, 3, 4, 5].map((v) => sprite(`smoke_${v}`, `Chimney Smoke ${v}`, { kind: "smoke", variant: v }, `smoke${v}`)),
  sprite("fire1", "Camp Fire", { kind: "fire1" }),
  sprite("fire2", "Camp Fire Big", { kind: "fire2" }),
  sprite("glint", "Sparkle Glint", { kind: "glint" }, "glint1"),
];

const propSprites = [
  sprite("windmill", "Windmill Blades", { kind: "windmill" }),
  sprite("coracle", "Coracle (water)", { kind: "coracle" }),
  sprite("coracle_land", "Coracle (beached)", { kind: "coracleLand" }, "coracleLand"),
  sprite("blinking", "Cave Eyes", { kind: "blinking" }),
];

const natureSprites = [
  sprite("tree1", "Tree (swaying)", { kind: "tree1" }),
  sprite("tree2", "Tree (round)", { kind: "tree2" }),
];

// crops: scan Elements/Crops for <name>_05.png (ripe stage)
const cropNames = [...new Set(
  readdirSync(join(PACK, "Elements", "Crops"))
    .map((f) => /^([a-z]+)_05\.png$/.exec(f)?.[1])
    .filter(Boolean) as string[],
)].sort();
const farmItems = cropNames.map((c) =>
  sprite(`crop_${c}`, c[0].toUpperCase() + c.slice(1), { kind: "crop", crop: c, stage: 5 }, `crop_${c}_5`, {
    thumb: { type: "image", alias: `crop_${c}_5` },
  }));

// ---------- assemble ----------
const catalog = {
  version: 1,
  generated: new Date().toISOString(),
  tilesets: {
    tileset_sunnysideworld: { file: "Tileset/spr_tileset_sunnysideworld_16px.png", tile: 16, cols: 64 },
    tileset_forest: { file: "Tileset/spr_tileset_sunnysideworld_forest_32px.png", tile: 32, cols: 10 },
  },
  terrains,
  animations,
  categories: [
    { id: "terrain", label: "Terrain", items: terrains.map((t) => ({ id: `terrain_${t.id}`, label: t.label, kind: "terrain", terrain: t.id, thumb: { type: "tile", idx: t.block ? t.block[0][0] : t.set![0] } })) },
    { id: "buildings", label: "Buildings", items: buildingItems },
    { id: "farm", label: "Farm", items: farmItems },
    { id: "fences", label: "Fences & Walls", items: fenceItems },
    { id: "nature", label: "Nature", items: [...natureSprites, ...natureObjects] },
    { id: "people", label: "People", items: peopleItems },
    { id: "animals", label: "Animals", items: animalItems },
    { id: "props", label: "Props", items: [...propSprites, ...propObjects] },
    { id: "vfx", label: "Effects", items: vfxItems },
  ],
};

const out = join(ROOT, "src", "game", "catalog.json");
await Bun.write(out, JSON.stringify(catalog));
const counts = catalog.categories.map((c) => `${c.id}:${c.items.length}`).join(" ");
console.log(`catalog.json written (${((await Bun.file(out).arrayBuffer()).byteLength / 1024).toFixed(1)} KB)`);
console.log(`stamps: ${buildingItems.length} | ${counts}`);
console.log(buildingItems.map((b) => `  ${b.id} ${b.w}x${b.h}`).join("\n"));
