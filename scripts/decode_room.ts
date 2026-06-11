// Decode GameMaker Room1.yy compressed tile layers -> JSON for analysis/build
// Format: positive N = next N literal values; negative -N = repeat next value N times.
// Value 0x80000000 (or 0) = empty. Low bits = tile index, high bits = flip/mirror/rotate flags.
const ROOM = "d:/codes/game1/public/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Gamemaker/rooms/Room1/Room1.yy";

const raw = await Bun.file(ROOM).text();
const json = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1"));

const EMPTY = -2147483648;

function decompress(data: number[], expected: number): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const n = data[i++];
    if (n < 0) {
      const v = data[i++];
      for (let k = 0; k < -n; k++) out.push(v);
    } else {
      for (let k = 0; k < n; k++) out.push(data[i++]);
    }
  }
  if (out.length !== expected) console.error(`  !! decompressed ${out.length}, expected ${expected}`);
  return out;
}

const layers: any[] = [];
for (const layer of json.layers) {
  if (layer.resourceType !== "GMRTileLayer") {
    console.log(`layer ${layer.name}: ${layer.resourceType} (skipped) depth=${layer.depth}`);
    continue;
  }
  const t = layer.tiles;
  const w = t.SerialiseWidth, h = t.SerialiseHeight;
  const cells = t.TileCompressedData
    ? decompress(t.TileCompressedData, w * h)
    : t.TileSerialiseData;
  // normalize empties to 0
  const norm = cells.map((v: number) => (v === EMPTY ? 0 : v));
  const used = new Set(norm.filter((v: number) => v !== 0).map((v: number) => v & 0x7ffff));
  console.log(`layer ${layer.name}: tileset=${layer.tilesetId.name} ${w}x${h} depth=${layer.depth} nonEmpty=${norm.filter((v: number) => v !== 0).length} distinctTiles=${used.size}`);
  layers.push({ name: layer.name, tileset: layer.tilesetId.name, width: w, height: h, depth: layer.depth, cells: norm });
}

await Bun.write("d:/codes/game1/scripts/room1_layers.json", JSON.stringify(layers));
console.log("wrote scripts/room1_layers.json");
