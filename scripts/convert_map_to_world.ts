// One-time conversion: src/game/map.json (baked scene) -> public/worlds/sample.world.json.
// The handcrafted scene rides in via the raw `tileLayers` escape hatch (RLE) plus
// copied animTiles; sprites/npcs become free pixel overlays; labels become regions.
// Asserts: compileWorld(sample) reproduces map.json exactly (cells, animTiles,
// overlays, labels) so the new renderer is provably identical to the old one.
import { compileWorld } from "../src/game/compile.js";
import { WORLD_VERSION, rleDecode, rleEncode, validateWorld } from "../src/game/world.js";

const map = await Bun.file("d:/codes/game1/src/game/map.json").json();
const T = map.tile;

const sprites: any[] = [
  // decor sprites: {kind, variant?, x, y} px -> tile-unit px/py (exact: /16 is a pow2 divide)
  ...map.sprites.map((s: any) => {
    const { x, y, ...rest } = s;
    return { ...rest, px: x / T, py: y / T };
  }),
  // characters keep hair/tools/anim/flip/expression/waypoints/speed
  ...map.npcs.map((n: any) => {
    const { x, y, ...rest } = n;
    return { ...rest, px: x / T, py: y / T };
  }),
];

const now = new Date().toISOString();
const world = {
  version: WORLD_VERSION,
  name: "Sunnyside Cove",
  createdAt: now,
  updatedAt: now,
  grid: { tile: T, width: map.width, height: map.height },
  camera: { cx: 42 * T, cy: 30 * T, scale: 2.2 }, // town plaza, same as the old engine default
  objects: [],
  sprites,
  regions: map.labels.map((lb: any, i: number) => ({ id: `r${i + 1}`, name: lb.text, x: lb.x / T, y: lb.y / T, w: 0, h: 0 })),
  tileLayers: map.layers.map((l: any) => ({
    name: l.name, tileset: l.tileset, width: l.width, height: l.height, depth: l.depth,
    cells: rleEncode(l.cells),
  })),
  animTiles: map.animTiles,
};

// ---------- prove the renderer model is identical ----------
const v = validateWorld(world);
if (!v.ok) throw new Error("invalid world: " + v.errors.join("; "));

const model = compileWorld(world);
const fail = (m: string) => { throw new Error("PARITY FAIL: " + m); };

if (model.width !== map.width || model.height !== map.height) fail("dimensions");
if (model.layers.length !== map.layers.length) fail(`layer count ${model.layers.length} != ${map.layers.length}`);
for (let i = 0; i < map.layers.length; i++) {
  const a = map.layers[i], b = model.layers[i];
  if (a.name !== b.name) fail(`layer order [${i}] ${b.name} != ${a.name}`);
  if (a.cells.length !== b.cells.length) fail(`${a.name} cell count`);
  for (let j = 0; j < a.cells.length; j++)
    if (a.cells[j] !== b.cells[j]) fail(`${a.name}[${j % a.width},${(j / a.width) | 0}] ${b.cells[j]} != ${a.cells[j]}`);
}
// canonical stringify (sorted keys) so field order doesn't matter
const canon = (v: any): string =>
  Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${k}:${canon(v[k])}`).join(",")}}`
  : JSON.stringify(v);
const eq = (x: any, y: any) => canon(x) === canon(y);
if (!eq(model.animTiles, map.animTiles)) fail("animTiles");
if (!eq(model.sprites, map.sprites)) fail("sprites");
if (!eq(model.npcs, map.npcs)) fail("npcs");
if (!eq(model.labels, map.labels)) fail("labels");

// RLE roundtrip sanity on one layer
const l0 = map.layers[0];
if (!eq(rleDecode(rleEncode(l0.cells), l0.cells.length), l0.cells)) fail("rle roundtrip");

const out = "d:/codes/game1/public/worlds/sample.world.json";
await Bun.write(out, JSON.stringify(world));
const kb = ((await Bun.file(out).arrayBuffer()).byteLength / 1024).toFixed(1);
console.log(`PARITY OK — sample.world.json written (${kb} KB, map.json was ${(208047 / 1024).toFixed(1)} KB)`);
console.log(`layers:${world.tileLayers.length} sprites:${world.sprites.length} regions:${world.regions.length} animTiles:${world.animTiles.length}`);
