// World document model for the Sunnyside builder.
// A world is one JSON doc (see PRD.md §6.1): terrain cells (autotiled), grid-snapped
// objects (catalog stamps), free pixel-position sprite overlays, named regions, and
// an optional raw `tileLayers` escape hatch for fully baked tile data.
// Pure data module — no pixi imports — so bun scripts can use it too.

export const WORLD_VERSION = 1;
export const TILE = 16;

// standard tile-layer stack; higher depth bakes first (bottom of the stack)
export const STANDARD_LAYERS = [
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
];
export const LAYER_DEPTH = Object.fromEntries(STANDARD_LAYERS.map((l) => [l.name, l.depth]));

// ---------- RLE codec for cell arrays ----------
// flat pairs: [run, value, run, value, ...]
export function rleEncode(cells) {
  const out = [];
  let i = 0;
  while (i < cells.length) {
    const v = cells[i];
    let run = 1;
    while (i + run < cells.length && cells[i + run] === v) run++;
    out.push(run, v);
    i += run;
  }
  return out;
}

export function rleDecode(pairs, length) {
  const out = new Array(length).fill(0);
  let i = 0;
  for (let p = 0; p < pairs.length; p += 2) {
    const run = pairs[p], v = pairs[p + 1];
    for (let r = 0; r < run; r++) out[i++] = v;
  }
  if (i !== length) throw new Error(`rleDecode: expected ${length} cells, got ${i}`);
  return out;
}

// ---------- world creation ----------
const DEFAULT_TYPES = ["sea", "grass", "path"];

export function createBlankWorld({ name = "Untitled", width = 100, height = 56, starter = "blank" } = {}) {
  const cells = new Array(width * height).fill(0);
  if (starter === "island") {
    // a smooth, strictly-CONVEX full-resolution ellipse. This pack has no
    // inner-corner or 90° corner tiles, so only convex coasts autotile cleanly
    // (straight edges + 45° outer bevels); any concavity would leave a blue notch.
    const cx = (width - 1) / 2, cy = (height - 1) / 2;
    const rx = width * 0.40, ry = height * 0.40;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) cells[y * width + x] = 1; // grass
      }
  }
  const now = new Date().toISOString();
  return {
    version: WORLD_VERSION,
    name,
    createdAt: now,
    updatedAt: now,
    grid: { tile: TILE, width, height },
    camera: { cx: (width * TILE) / 2, cy: (height * TILE) / 2, scale: 2.2 },
    terrain: { types: [...DEFAULT_TYPES], cells: rleEncode(cells) },
    objects: [],
    sprites: [],
    regions: [],
  };
}

// ---------- validation ----------
export function validateWorld(doc) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!doc || typeof doc !== "object") return { ok: false, errors: ["not an object"] };
  if (doc.version !== WORLD_VERSION) err(`version: expected ${WORLD_VERSION}, got ${doc.version}`);
  const g = doc.grid;
  if (!g || !Number.isInteger(g.width) || !Number.isInteger(g.height) || g.width < 1 || g.height < 1)
    err("grid: width/height must be positive integers");
  else if (g.tile !== TILE) err(`grid.tile: expected ${TILE}`);
  if (doc.terrain) {
    if (!Array.isArray(doc.terrain.types) || doc.terrain.types[0] !== "sea")
      err("terrain.types: must be an array starting with 'sea'");
    if (!Array.isArray(doc.terrain.cells)) err("terrain.cells: must be an RLE pair array");
    else if (g && Number.isInteger(g.width)) {
      try { rleDecode(doc.terrain.cells, g.width * g.height); } catch (e) { err(`terrain.cells: ${e.message}`); }
    }
  }
  for (const [field, required] of [["objects", ["cat", "x", "y"]], ["sprites", ["px", "py"]], ["regions", ["name", "x", "y"]]]) {
    const arr = doc[field];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) { err(`${field}: must be an array`); continue; }
    arr.forEach((e, i) => {
      for (const k of required) if (e[k] === undefined) err(`${field}[${i}]: missing '${k}'`);
    });
  }
  for (const tl of doc.tileLayers ?? []) {
    if (!tl.name || !Array.isArray(tl.cells)) { err("tileLayers: entries need name + RLE cells"); continue; }
    const w = tl.width ?? g?.width, h = tl.height ?? g?.height;
    try { rleDecode(tl.cells, w * h); } catch (e) { err(`tileLayers[${tl.name}]: ${e.message}`); }
  }
  return { ok: errors.length === 0, errors };
}
