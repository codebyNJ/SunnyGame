// Asset catalog + loader for the Sunnyside World pack.
// Everything visual comes from the asset pack only.
import { Assets, Rectangle, Texture, TextureSource } from "pixi.js";

export const PACK = "/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets";

// human animation -> { folder, file token, frames }
export const HUMAN_ANIMS = {
  idle: ["IDLE", "idle", 9],
  walk: ["WALKING", "walk", 8],
  carryWalk: ["CARRY", "carry", 8],
  run: ["RUN", "run", 8],
  dig: ["DIG", "dig", 13],
  watering: ["WATERING", "watering", 5],
  axe: ["AXE", "axe", 10],
  mining: ["MINING", "mining", 10],
  hammering: ["HAMMERING", "hamering", 23],
  casting: ["CASTING", "casting", 15],
  reeling: ["REELING", "reeling", 13],
  swimming: ["SWIMMING", "swimming", 12],
  waiting: ["WAITING", "waiting", 9],
  jump: ["JUMP", "jump", 9],
  roll: ["ROLL", "roll", 10],
  doing: ["DOING", "doing", 8],
};
export const GOBLIN_ANIMS = { idle: 9, walk: 8, jump: 9, doing: 8, run: 8, casting: 15, axe: 10 };
export const SKELETON_ANIMS = { idle: 6, walk: 8, attack: 7, jump: 10 };

const SPRITES = {
  bird: ["Elements/Animals/spr_deco_bird_01_strip4.png", 4],
  blinking: ["Elements/Animals/spr_deco_blinking_strip12.png", 12],
  chicken: ["Elements/Animals/spr_deco_chicken_01_strip4.png", 4],
  cow: ["Elements/Animals/spr_deco_cow_strip4.png", 4],
  duck: ["Elements/Animals/spr_deco_duck_01_strip4.png", 4],
  pig: ["Elements/Animals/spr_deco_pig_01_strip4.png", 4],
  sheep: ["Elements/Animals/spr_deco_sheep_01_strip4.png", 4],
  coracle: ["Elements/Other/spr_deco_coracle_strip4.png", 4],
  coracleLand: ["Elements/Other/spr_deco_coracle_land.png", 1],
  windmill: ["Elements/Other/spr_deco_windmill_withshadow_strip9.png", 9],
  tree1: ["Elements/Plants/spr_deco_tree_01_strip4.png", 4],
  tree2: ["Elements/Plants/spr_deco_tree_02_strip4.png", 4],
  smoke1: ["Elements/VFX/Chimney Smoke/chimneysmoke_01_strip30.png", 30],
  smoke2: ["Elements/VFX/Chimney Smoke/chimneysmoke_02_strip30.png", 30],
  smoke3: ["Elements/VFX/Chimney Smoke/chimneysmoke_03_strip30.png", 30],
  smoke4: ["Elements/VFX/Chimney Smoke/chimneysmoke_04_strip30.png", 30],
  smoke5: ["Elements/VFX/Chimney Smoke/chimneysmoke_05_strip30.png", 30],
  fire1: ["Elements/VFX/Fire/spr_deco_fire_01_strip4.png", 4],
  fire2: ["Elements/VFX/Fire/spr_deco_fire_02_strip4.png", 4],
  glint1: ["Elements/VFX/Glint/spr_deco_glint_01_strip6.png", 6],
  glint2: ["Elements/VFX/Glint/spr_deco_glint_02_strip4.png", 4],
};

const UI = {
  ui_arrow_up: "UI/arrow_up.png",
  ui_arrow_up1: "UI/arrow_up-1.png",
  ui_itemdisc1: "UI/itemdisc_01.png",
  ui_itemdisc2: "UI/itemdisc_02.png",
  ui_search: "UI/search.png",
  ui_label_left: "UI/label_left.png",
  ui_label_middle: "UI/label_middle.png",
  ui_label_right: "UI/label_right.png",
  ui_expr_chat: "UI/expression_chat.png",
  ui_expr_love: "UI/expression_love.png",
  ui_expr_confused: "UI/expression_confused.png",
  ui_expr_alerted: "UI/expression_alerted.png",
  ui_expr_attack: "UI/expression_attack.png",
  ui_expr_working: "UI/expression_working.png",
  ui_expr_stress: "UI/expression_stress.png",
  ui_happy: "UI/happiness_03.png",
};

// the conditional textures a single entity spec needs (characters + crops; all
// decor/animal/VFX/UI textures are always loaded). Used at load time and lazily
// when the user places a new entity.
export function entityManifest(spec) {
  const e = {};
  if (spec.kind === "human") {
    const [folder, token, n] = HUMAN_ANIMS[spec.anim] ?? HUMAN_ANIMS.idle;
    for (const layer of ["base", spec.hair, spec.tools ? "tools" : null]) {
      if (!layer) continue;
      e[`h_${layer}_${spec.anim}`] = `${PACK}/Characters/Human/${folder}/${layer}_${token}_strip${n}.png`;
    }
  } else if (spec.kind === "goblin" && GOBLIN_ANIMS[spec.anim]) {
    e[`g_${spec.anim}`] = `${PACK}/Characters/Goblin/PNG/spr_${spec.anim}_strip${GOBLIN_ANIMS[spec.anim]}.png`;
  } else if (spec.kind === "skeleton" && SKELETON_ANIMS[spec.anim]) {
    e[`s_${spec.anim}`] = `${PACK}/Characters/Skeleton/PNG/skeleton_${spec.anim}_strip${SKELETON_ANIMS[spec.anim]}.png`;
  } else if (spec.kind === "crop") {
    const stage = String(spec.stage ?? 5).padStart(2, "0");
    e[`crop_${spec.crop}_${spec.stage ?? 5}`] = `${PACK}/Elements/Crops/${spec.crop}_${stage}.png`;
  }
  return e;
}

export function buildManifest(map) {
  const entries = {
    tileset: `${PACK}/Tileset/spr_tileset_sunnysideworld_16px.png`,
    tilesetForest: `${PACK}/Tileset/spr_tileset_sunnysideworld_forest_32px.png`,
  };
  for (const [k, [p]] of Object.entries(SPRITES)) entries[k] = `${PACK}/${p}`;
  for (const [k, p] of Object.entries(UI)) entries[k] = `${PACK}/${p}`;
  for (const npc of map.npcs) Object.assign(entries, entityManifest(npc));
  for (const sp of map.sprites) if (sp.kind === "crop") Object.assign(entries, entityManifest(sp));
  return entries;
}

// ensure a placed entity's textures are loaded (idempotent); resolves when ready
export async function ensureTextures(spec) {
  const man = entityManifest(spec);
  const aliases = Object.keys(man);
  const toLoad = [];
  for (const a of aliases) {
    if (registered.has(a)) continue;
    Assets.add({ alias: a, src: encodeURI(man[a]) });
    registered.add(a);
    toLoad.push(a);
  }
  if (toLoad.length) await Assets.load(toLoad);
  const tex = {};
  for (const a of aliases) tex[a] = Assets.get(a);
  return tex;
}

// alias->url registered once so loading another world (menu->play->menu->play)
// never re-adds an alias; aliases are content-derived so a name always maps to
// the same url. Cached urls resolve instantly on the next load.
const registered = new Set();
export async function loadAll(map, onProgress) {
  TextureSource.defaultOptions.scaleMode = "nearest";
  const manifest = buildManifest(map);
  const aliases = Object.keys(manifest);
  for (const a of aliases) {
    if (registered.has(a)) continue;
    Assets.add({ alias: a, src: encodeURI(manifest[a]) });
    registered.add(a);
  }
  await Assets.load(aliases, onProgress);
  const tex = {};
  for (const a of aliases) tex[a] = Assets.get(a);
  return tex;
}

// slice a horizontal strip into frame textures; tolerates wrong strip counts
// in filenames (e.g. goblin idle_strip9 is actually 8 frames of 96px)
export function sliceStrip(base, declaredFrames) {
  const w = base.width, h = base.height;
  let n = declaredFrames, fw = w / declaredFrames;
  if (!Number.isInteger(fw)) {
    fw = h >= 64 ? 96 : Math.floor(w / declaredFrames);
    n = Math.floor(w / fw);
  }
  const frames = [];
  for (let i = 0; i < n; i++)
    frames.push(new Texture({ source: base.source, frame: new Rectangle(i * fw, 0, fw, h) }));
  return frames;
}

// tile texture cache from the 64-column tileset
const tileCache = new Map();
export function tileTexture(tilesetTex, idx, tileSize = 16, cols = 64) {
  const key = `${tileSize}:${idx}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const t = new Texture({
    source: tilesetTex.source,
    frame: new Rectangle((idx % cols) * tileSize, Math.floor(idx / cols) * tileSize, tileSize, tileSize),
  });
  tileCache.set(key, t);
  return t;
}
