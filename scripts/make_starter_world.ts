// Builds public/worlds/starter.world.json — a small demo world that exercises the
// SEMANTIC pipeline (unlike sample.world.json which rides the raw tileLayers hatch):
// terrain cells -> autotile, catalog object stamps, free pixel sprite overlays, a
// named region. This is the "blank seashore you build on" proven end-to-end.
import { compileWorld, catalogItem } from "../src/game/compile.js";
import { createBlankWorld, rleDecode, rleEncode, validateWorld } from "../src/game/world.js";

const world = createBlankWorld({ name: "Starter Island", width: 60, height: 40, starter: "island" });
const W = world.grid.width, H = world.grid.height;

// carve a dirt path across the island (type 2 = "path"), only over grass
const cells = rleDecode(world.terrain.cells, W * H);
for (let x = 18; x <= 42; x++) {
  const y = 20 + Math.round(Math.sin((x - 18) / 6) * 2);
  for (let dy = 0; dy < 2; dy++) if (cells[(y + dy) * W + x] === 1) cells[(y + dy) * W + x] = 2;
}
world.terrain.cells = rleEncode(cells);

// drop a few catalog stamps (grid-snapped objects)
world.objects = [
  { id: "o1", cat: "green_small_house", x: 22, y: 13, rot: 0, flipX: false },
  { id: "o2", cat: "green_hut", x: 33, y: 14, rot: 0, flipX: false },
  { id: "o3", cat: "pine_tree", x: 19, y: 23, rot: 0, flipX: false },
  { id: "o4", cat: "bush_big", x: 36, y: 23, rot: 0, flipX: false },
  { id: "o5", cat: "fence_post", x: 27, y: 24, rot: 0, flipX: false },
  { id: "o6", cat: "fence_rail", x: 28, y: 24, rot: 0, flipX: false },
  { id: "o7", cat: "fence_end", x: 29, y: 24, rot: 0, flipX: false },
];
for (const o of world.objects) if (!catalogItem(o.cat)) throw new Error(`unknown catalog item ${o.cat}`);

// free pixel-position overlays (pin-point: note the fractional tile coords)
world.sprites = [
  { id: "s1", cat: "villager", px: 26.4, py: 19.7, anim: "idle", hair: "longhair", tools: false },
  { id: "s2", cat: "cow", px: 31.2, py: 22.3 },
  { id: "s3", cat: "tree1", px: 38.6, py: 17.2 },
  { id: "s4", cat: "smoke_2", px: 23.5, py: 13.2 },
  { id: "s5", cat: "crop_pumpkin", px: 25.3, py: 22.6 },
];

// a named region rendered with the pack label banner
world.regions = [{ id: "r1", name: "MY FIRST TOWN", x: 26, y: 11, w: 4, h: 4 }];

const v = validateWorld(world);
if (!v.ok) throw new Error("invalid world: " + v.errors.join("; "));

// compile smoke test: island visible, terrain autotiled, objects pass through as
// LIVE render data (no longer baked into layers — see compile.js step 2), overlays + region.
const model = compileWorld(world);
const land = model.layers.find((l) => l.name === "land");
const paths = model.layers.find((l) => l.name === "paths");
if (!land?.cells.some((v) => v) || !paths?.cells.some((v) => v)) throw new Error("terrain compile produced empty layers");
if (model.objects.length !== world.objects.length || !model.objects.every((o) => o.item)) throw new Error("object stamps did not resolve");
if (model.sprites.length + model.npcs.length !== world.sprites.length) throw new Error("overlay count mismatch");
if (model.labels[0]?.text !== "MY FIRST TOWN") throw new Error("region label missing");

const out = "d:/codes/game1/public/worlds/starter.world.json";
await Bun.write(out, JSON.stringify(world));
console.log(`starter.world.json written (${((await Bun.file(out).arrayBuffer()).byteLength / 1024).toFixed(1)} KB)`);
console.log(`compiled: ${model.layers.map((l) => l.name).join(",")} | sprites:${model.sprites.length} npcs:${model.npcs.length} animTiles:${model.animTiles.length}`);
