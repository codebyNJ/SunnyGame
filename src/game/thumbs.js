// Palette thumbnails for catalog items, generated at runtime from already-loaded
// textures (no extra image files). Each thumb is a small Pixi Container the palette
// UI can snapshot via app.renderer.extract or add to a thumbnail strip.
// Used by the P2 palette; here in P0 so the catalog pipeline is complete.
import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { tileTexture } from "./assets.js";

// build a thumbnail node for a catalog item using the loaded `tex` bundle.
// returns { node, w, h } in tile units (caller scales to the swatch size).
export function thumbFor(item, tex) {
  const c = new Container();
  let w = 1, h = 1;

  if (item.kind === "object") {
    // composite the stamp's tile layers (decoration_01 under building, etc.)
    w = item.w; h = item.h;
    const order = ["shadows", "decoration_01", "building", "walls", "decoration_02", "decoration_03", "land", "paths"];
    const names = Object.keys(item.layers).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const name of names) {
      const cells = item.layers[name];
      for (let i = 0; i < cells.length; i++) {
        const v = cells[i];
        if (!v) continue;
        const s = new Sprite(tileTexture(tex.tileset, v & 0x7ffff));
        applyFlags(s, v);
        s.position.set((i % w) * 16 + 8, ((i / w) | 0) * 16 + 8);
        c.addChild(s);
      }
    }
  } else if (item.kind === "terrain") {
    const s = new Sprite(tileTexture(tex.tileset, item.thumb.idx));
    c.addChild(s);
  } else if (item.kind === "sprite") {
    const t = item.thumb ?? {};
    if (t.type === "image" && tex[t.alias]) {
      const s = new Sprite(tex[t.alias]);
      c.addChild(s);
      w = s.width / 16; h = s.height / 16;
    } else if (t.alias && tex[t.alias]) {
      // first frame of the strip; pack character/animal/VFX strips use square
      // frames, so a height-wide slice from the left is the first frame
      const base = tex[t.alias];
      const fw = Math.min(base.height, base.width);
      const frame = new Texture({ source: base.source, frame: new Rectangle(0, 0, fw, base.height) });
      const s = new Sprite(frame);
      c.addChild(s);
      w = fw / 16; h = base.height / 16;
    }
  }
  return { node: c, w, h };
}

const M = 0x10000000, F = 0x20000000, R = 0x40000000;
function applyFlags(s, v) {
  const m = !!(v & M), f = !!(v & F), r = !!(v & R);
  s.anchor.set(0.5);
  if (r) { s.rotation = Math.PI / 2; s.scale.set(f ? -1 : 1, m ? -1 : 1); }
  else s.scale.set(m ? -1 : 1, f ? -1 : 1);
}
