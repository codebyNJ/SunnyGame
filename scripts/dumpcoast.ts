import { computeTerrain } from "../src/game/terrain.js";
import { rleDecode } from "../src/game/world.js";
const w = await Bun.file("public/worlds/coast.world.json").json();
const W = w.grid.width, H = w.grid.height;
const t = computeTerrain(rleDecode(w.terrain.cells, W * H), w.terrain.types, W, H);
await Bun.write("scripts/tmp/render.json", JSON.stringify({ W, H, sea: t.sea, land: t.land }));
console.log("dumped", W + "x" + H);
