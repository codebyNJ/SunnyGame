// Extract multi-tile structure "stamps" from Room1 building/walls/decoration layers
// via connected components (8-conn + 1 dilation), saving each as mini layers-json
// and a combined contact-sheet layers-json for visual review.
const layers: any[] = await Bun.file("d:/codes/game1/scripts/room1_layers.json").json();
const W = 86, H = 48;

const CORE_LAYERS = ["building", "walls"]; // CC runs on these
const STAMP_LAYERS = ["building", "walls", "decoration_02", "decoration_03"]; // copied into stamps
const byName = Object.fromEntries(layers.map((l) => [l.name, l]));

// union occupancy (cores only, so adjacent decor doesn't merge buildings)
const occ = new Uint8Array(W * H);
for (const name of CORE_LAYERS) {
  const l = byName[name];
  for (let i = 0; i < l.cells.length; i++) if (l.cells[i] !== 0) occ[i] = 1;
}

// connected components with chebyshev distance <= 2 merging (dilate)
const comp = new Int32Array(W * H).fill(-1);
let nComp = 0;
const R = 1; // merge radius
for (let i = 0; i < W * H; i++) {
  if (!occ[i] || comp[i] !== -1) continue;
  const stack = [i];
  comp[i] = nComp;
  while (stack.length) {
    const c = stack.pop()!;
    const cx = c % W, cy = (c / W) | 0;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (occ[n] && comp[n] === -1) { comp[n] = nComp; stack.push(n); }
      }
  }
  nComp++;
}

// bboxes
const boxes: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
for (let k = 0; k < nComp; k++) boxes.push({ x0: W, y0: H, x1: -1, y1: -1, n: 0 });
for (let i = 0; i < W * H; i++) {
  if (comp[i] === -1) continue;
  const b = boxes[comp[i]];
  const x = i % W, y = (i / W) | 0;
  b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y);
  b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
  b.n++;
}

boxes.sort((a, b) => b.n - a.n);
console.log(`${nComp} components`);

// contact sheet: lay stamps left-to-right in rows, 1 tile gap, sheet width 100
const sheetW = 100;
let cx = 1, cy = 1, rowH = 0;
const placements: any[] = [];
for (const [bi, b] of boxes.entries()) {
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
  if (cx + bw + 1 > sheetW) { cx = 1; cy += rowH + 2; rowH = 0; }
  placements.push({ bi, b, dx: cx, dy: cy });
  cx += bw + 2; rowH = Math.max(rowH, bh);
}
const sheetH = cy + rowH + 1;

const outLayers: any[] = [];
for (const name of STAMP_LAYERS) {
  const src = byName[name];
  const cells = new Array(sheetW * sheetH).fill(0);
  for (const p of placements) {
    for (let y = p.b.y0; y <= p.b.y1; y++)
      for (let x = p.b.x0; x <= p.b.x1; x++) {
        const v = src.cells[y * W + x];
        if (v !== 0) cells[(p.dy + y - p.b.y0) * sheetW + (p.dx + x - p.b.x0)] = v;
      }
  }
  outLayers.push({ name, tileset: "tileset_sunnysideworld", width: sheetW, height: sheetH, depth: src.depth, cells });
}

await Bun.write("d:/codes/game1/scripts/tmp/stamps_sheet.json", JSON.stringify(outLayers));
// stamp metadata: id -> bbox (in room coords) so we can reference them later
await Bun.write(
  "d:/codes/game1/scripts/tmp/stamps_meta.json",
  JSON.stringify(placements.map((p, i) => ({ id: i, room: [p.b.x0, p.b.y0, p.b.x1, p.b.y1], sheet: [p.dx, p.dy], w: p.b.x1 - p.b.x0 + 1, h: p.b.y1 - p.b.y0 + 1, cells: p.b.n })), null, 1)
);
console.log(`sheet ${sheetW}x${sheetH}, wrote stamps_sheet.json + stamps_meta.json`);
for (const [i, p] of placements.entries()) console.log(`#${i} room(${p.b.x0},${p.b.y0})-(${p.b.x1},${p.b.y1}) ${p.b.x1 - p.b.x0 + 1}x${p.b.y1 - p.b.y0 + 1} cells=${p.b.n} sheet@(${p.dx},${p.dy})`);
