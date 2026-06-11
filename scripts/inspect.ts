// Print per-layer tile index grids for a room rect: bun scripts/inspect.ts x0 y0 x1 y1 [layer...]
export {};
const layers: any[] = await Bun.file("d:/codes/game1/scripts/room1_layers.json").json();
const [x0, y0, x1, y1] = process.argv.slice(2, 6).map(Number);
const only = process.argv.slice(6);

for (const l of layers) {
  if (l.tileset === "tileset_forest") continue;
  if (only.length && !only.includes(l.name)) continue;
  let any = false;
  const rows: string[] = [];
  for (let y = y0; y <= y1; y++) {
    const row: string[] = [];
    for (let x = x0; x <= x1; x++) {
      const v = l.cells[y * l.width + x];
      const idx = v & 0x7ffff;
      if (idx) any = true;
      let s = idx === 0 ? "." : String(idx);
      if (v & 0x10000000) s += "m";
      if (v & 0x20000000) s += "f";
      if (v & 0x40000000) s += "r";
      row.push(s.padStart(6));
    }
    rows.push(`${String(y).padStart(2)} ${row.join("")}`);
  }
  if (!any) continue;
  console.log(`\n== ${l.name} ==`);
  console.log(`   ${Array.from({ length: x1 - x0 + 1 }, (_, i) => String(x0 + i).padStart(6)).join("")}`);
  for (const r of rows) console.log(r);
}
