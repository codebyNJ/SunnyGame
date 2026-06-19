// World compiler: world doc (world.js schema) -> render model consumed by engine.js.
// Pure data (no pixi) so bun scripts can compile worlds for verification too.
// Model shape matches the old map.json: { width, height, tile, layers, animTiles,
// sprites, npcs, labels } — layers ordered by depth, bottom first.
import catalog from "./catalog.json";
import { LAYER_DEPTH, TILE, rleDecode } from "./world.js";
import { computeTerrain } from "./terrain.js";

const CHAR_KINDS = new Set(["human", "goblin", "skeleton"]);

const itemIndex = new Map();
for (const cat of catalog.categories) for (const item of cat.items) itemIndex.set(item.id, item);
export const catalogItem = (id) => itemIndex.get(id);

export function compileWorld(world) {
  const { width: W, height: H, tile = TILE } = world.grid;
  const N = W * H;

  // named tile layers (16px standard stack) + passthrough layers (e.g. forest 32px)
  const std = new Map();
  const ensure = (name, depth = LAYER_DEPTH[name] ?? 0) => {
    let l = std.get(name);
    if (!l) {
      l = { name, tileset: "tileset_sunnysideworld", width: W, height: H, depth, cells: new Array(N).fill(0) };
      std.set(name, l);
    }
    return l;
  };
  const passthrough = [];

  // 1. terrain: sea fill + autotiled grass/paths + coast skirt (shared with the
  //    engine's live re-bake via terrain.js)
  if (world.terrain) {
    const t = computeTerrain(rleDecode(world.terrain.cells, N), world.terrain.types, W, H);
    ensure("sea").cells = t.sea;
    ensure("land").cells = t.land;
    ensure("paths").cells = t.paths;
  }

  // 2. grid-snapped objects (catalog stamps) are kept LIVE (rendered as editable
  //    nodes, not baked) so placement/move/delete/undo never re-bake the ground.
  const objects = [];
  for (const o of world.objects ?? []) {
    const item = itemIndex.get(o.cat);
    if (!item || item.kind !== "object") continue;
    objects.push({ ...o, item });
  }

  // 3. raw tile layers (baked escape hatch); non-zero cells win
  for (const tl of world.tileLayers ?? []) {
    const w = tl.width ?? W, h = tl.height ?? H;
    const cells = rleDecode(tl.cells, w * h);
    const isStandard = w === W && h === H && (tl.tileset ?? "tileset_sunnysideworld") === "tileset_sunnysideworld" && LAYER_DEPTH[tl.name] !== undefined;
    if (!isStandard) {
      passthrough.push({ name: tl.name, tileset: tl.tileset ?? "tileset_sunnysideworld", width: w, height: h, depth: tl.depth ?? 0, cells });
      continue;
    }
    const target = ensure(tl.name, tl.depth ?? LAYER_DEPTH[tl.name]);
    for (let i = 0; i < cells.length; i++) if (cells[i]) target.cells[i] = cells[i];
  }

  // ordered, non-empty layers (higher depth bakes first / sits lower)
  const layers = [...std.values(), ...passthrough]
    .filter((l) => l.cells.some((v) => v !== 0))
    .sort((a, b) => b.depth - a.depth);

  // 4. animated tiles: explicit list wins, else derive from the catalog table
  let animTiles = world.animTiles;
  if (!animTiles) {
    const animByTile = new Map();
    for (const a of catalog.animations)
      a.frames.forEach((f, i) => { if (!animByTile.has(f)) animByTile.set(f, { frames: a.frames, phase: i, slow: a.slow }); });
    animTiles = [];
    for (const l of layers) {
      if (l.tileset !== "tileset_sunnysideworld") continue;
      for (let i = 0; i < l.cells.length; i++) {
        const v = l.cells[i];
        if (!v) continue;
        const a = animByTile.get(v & 0x7ffff);
        if (a) animTiles.push({ x: i % l.width, y: (i / l.width) | 0, layer: l.name, frames: a.frames, phase: a.phase, fps: a.slow ? 2.5 : 8, flags: (v >>> 28) & 7 });
      }
    }
  }

  // 5. sprite overlays -> decor sprites + character npcs (px/py are tile units)
  const sprites = [], npcs = [];
  for (const s of world.sprites ?? []) {
    const item = s.cat ? itemIndex.get(s.cat) : null;
    const spec = { ...(item?.place ?? {}), ...s };
    delete spec.cat;
    delete spec.px; delete spec.py; delete spec.id;
    spec.x = s.px * tile;
    spec.y = s.py * tile;
    (CHAR_KINDS.has(spec.kind) ? npcs : sprites).push(spec);
  }

  // 6. regions -> label banners (anchored top-center of the region rect)
  const labels = (world.regions ?? []).map((r) => ({ text: r.name, x: (r.x + (r.w ?? 0) / 2) * tile, y: r.y * tile }));

  return { width: W, height: H, tile, layers, animTiles, sprites, npcs, labels, objects };
}
