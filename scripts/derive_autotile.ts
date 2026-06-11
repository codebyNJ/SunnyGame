// Derive mask -> tile mapping for GameMaker 16-tile autotile sets from Room1 usage.
// mask bits: N=1, E=2, S=4, W=8 (neighbor is "same terrain")
export {};
const layers: any[] = await Bun.file("d:/codes/game1/scripts/room1_layers.json").json();
const byName = Object.fromEntries(layers.map((l) => [l.name, l]));

const SETS: Record<string, { layer: string; tiles: number[] }> = {
  Land: { layer: "land", tiles: [193, 194, 195, 196, 197, 198, 199, 200, 257, 258, 259, 260, 261, 262, 263, 264] },
  Path01: { layer: "paths", tiles: [449, 450, 451, 452, 453, 454, 455, 456, 513, 514, 515, 516, 517, 518, 519] },
  Path02: { layer: "paths", tiles: [460, 461, 462, 463, 464, 465, 466, 467, 524, 525, 526, 527, 528, 529, 530] },
  Path03: { layer: "paths", tiles: [482, 483, 484, 485, 486, 487, 488, 489, 546, 547, 548, 549, 550, 551, 552] },
  River: { layer: "land", tiles: [470, 471, 472, 473, 474, 475, 476, 477, 534, 535, 536, 537, 538, 539, 540] },
  Clouds01: { layer: "clouds_01", tiles: [1153, 1154, 1155, 1156, 1157, 1158, 1159, 1160, 1217, 1218, 1219, 1220, 1221, 1222, 1223] },
  Clouds02: { layer: "clouds_02", tiles: [1345, 1346, 1347, 1348, 1349, 1350, 1351, 1352, 1409, 1410, 1411, 1412, 1413, 1414, 1415] },
  CloudShadow: { layer: "cloud_shadow", tiles: [1537, 1538, 1539, 1540, 1541, 1542, 1543, 1544, 1601, 1602, 1603, 1604, 1605, 1606, 1607] },
};

for (const [name, def] of Object.entries(SETS)) {
  const l = byName[def.layer];
  const W = l.width, H = l.height;
  const inSet = new Set(def.tiles);
  const member = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true; // out of bounds counts as same
    const v = l.cells[y * W + x];
    return v !== 0 && inSet.has(v & 0x7ffff);
  };
  // histogram: mask -> {tileKey: count}; tileKey includes flags
  const hist: Record<number, Record<string, number>> = {};
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = l.cells[y * W + x];
      if (v === 0 || !inSet.has(v & 0x7ffff)) continue;
      const mask = (member(x, y - 1) ? 1 : 0) | (member(x + 1, y) ? 2 : 0) | (member(x, y + 1) ? 4 : 0) | (member(x - 1, y) ? 8 : 0);
      const flags = ["", "m", "f", "mf", "r", "mr", "fr", "mfr"][(v >>> 28) & 7];
      const key = (v & 0x7ffff) + flags;
      (hist[mask] ??= {})[key] = ((hist[mask] ??= {})[key] ?? 0) + 1;
    }
  console.log(`\n== ${name} ==`);
  for (let m = 0; m < 16; m++) {
    if (!hist[m]) { console.log(` mask ${String(m).padStart(2)} (N${m & 1 ? 1 : 0}E${m & 2 ? 1 : 0}S${m & 4 ? 1 : 0}W${m & 8 ? 1 : 0}): -`); continue; }
    const sorted = Object.entries(hist[m]).sort((a, b) => b[1] - a[1]);
    console.log(` mask ${String(m).padStart(2)} (N${m & 1 ? 1 : 0}E${m & 2 ? 1 : 0}S${m & 4 ? 1 : 0}W${m & 8 ? 1 : 0}): ${sorted.slice(0, 4).map(([k, c]) => `${k}x${c}`).join("  ")}`);
  }
}
