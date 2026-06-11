// Dump dimensions of every PNG in the asset pack (reads PNG IHDR directly)
import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..", "public", "Sunnyside_World_ASSET_PACK_V2.1", "Sunnyside_World_Assets");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.toLowerCase().endsWith(".png")) out.push(p);
  }
  return out;
}

for (const file of walk(ROOT)) {
  const buf = readFileSync(file);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  console.log(`${w}x${h}\t${file.slice(ROOT.length + 1).replaceAll("\\", "/")}`);
}
