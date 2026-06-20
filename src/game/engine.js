// Sunnyside builder - world engine (PixiJS).
// Compiles a world doc (world.js schema) to a render model, bakes the tile layers
// into render textures, overlays animated tiles, characters, animals and VFX, and
// provides a drag/zoom camera with pack-asset UI.
import {
  AnimatedSprite, Application, Container, Graphics, Rectangle, RenderTexture, Sprite, Text, Texture, TilingSprite,
} from "pixi.js";
import { catalogItem, compileWorld } from "./compile.js";
import { GOBLIN_ANIMS, HUMAN_ANIMS, SKELETON_ANIMS, ensureTextures, loadAll, sliceStrip, tileTexture } from "./assets.js";
import { transformObject } from "./tiles.js";
import { LAYER_DEPTH, rleDecode, rleEncode } from "./world.js";
import { computeTerrain } from "./terrain.js";
import { History } from "./history.js";
import { thumbFor } from "./thumbs.js";

const T = 16;
const M = 0x10000000, F = 0x20000000, R = 0x40000000;

function applyFlags(sprite, v) {
  const m = !!(v & M), f = !!(v & F), r = !!(v & R);
  sprite.anchor?.set?.(0.5);
  if (r) {
    sprite.rotation = Math.PI / 2;
    sprite.scale.set(f ? -1 : 1, m ? -1 : 1);
  } else {
    sprite.scale.set(m ? -1 : 1, f ? -1 : 1);
  }
}

function makeTileSprite(tex, v, idx, tileSize, cols) {
  const s = new Sprite(tileTexture(tex, idx, tileSize, cols));
  s.anchor.set(0.5);
  applyFlags(s, v);
  return s;
}

export async function start(root, worldDoc, onProgress, onReady) {
  const model = compileWorld(worldDoc);
  const app = new Application();
  await app.init({
    resizeTo: root,
    background: "#2a93c9",
    antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    roundPixels: true,
  });
  root.appendChild(app.canvas);

  const tex = await loadAll(model, onProgress);
  const { width: MW, height: MH, layers } = model;
  const PW = MW * T, PH = MH * T;

  // ---------- world ----------
  const world = new Container();
  world.sortableChildren = true;
  app.stage.addChild(world);

  // ---------- bake static layers ----------
  const CLOUD_LAYERS = new Set(["clouds_01", "cloud_shadow"]);
  const groundRT = RenderTexture.create({ width: PW, height: PH });
  let first = true;
  for (const layer of layers) {
    if (CLOUD_LAYERS.has(layer.name)) continue;
    const isForest = layer.tileset === "tileset_forest";
    const ts = isForest ? tex.tilesetForest : tex.tileset;
    const tile = isForest ? 32 : 16;
    const cols = isForest ? 13 : 64;
    const c = new Container();
    for (let i = 0; i < layer.cells.length; i++) {
      const v = layer.cells[i];
      if (!v) continue;
      const idx = v & 0x7ffff;
      if (!idx) continue;
      const s = makeTileSprite(ts, v, idx, tile, cols);
      s.position.set((i % layer.width) * tile + tile / 2, Math.floor(i / layer.width) * tile + tile / 2);
      c.addChild(s);
    }
    app.renderer.render({ container: c, target: groundRT, clear: first });
    first = false;
    c.destroy({ children: true });
  }
  const ground = new Sprite(groundRT);
  ground.zIndex = -1e9;
  world.addChild(ground);

  // clouds baked separately so they can drift
  const cloudsRT = RenderTexture.create({ width: PW, height: PH });
  const shadowRT = RenderTexture.create({ width: PW, height: PH });
  for (const layer of layers) {
    if (!CLOUD_LAYERS.has(layer.name)) continue;
    const c = new Container();
    for (let i = 0; i < layer.cells.length; i++) {
      const v = layer.cells[i];
      if (!v) continue;
      const s = makeTileSprite(tex.tileset, v, v & 0x7ffff, 16, 64);
      s.position.set((i % layer.width) * 16 + 8, Math.floor(i / layer.width) * 16 + 8);
      c.addChild(s);
    }
    app.renderer.render({ container: c, target: layer.name === "clouds_01" ? cloudsRT : shadowRT, clear: true });
    c.destroy({ children: true });
  }
  const cloudShadow = new Sprite(shadowRT);
  cloudShadow.zIndex = 1e9 - 1;
  cloudShadow.alpha = 0.9;
  const clouds = new Sprite(cloudsRT);
  clouds.zIndex = 1e9;
  world.addChild(cloudShadow, clouds);

  // ---------- animated tiles ----------
  for (const at of model.animTiles) {
    const frames = at.frames.map((f) => tileTexture(tex.tileset, f));
    const s = new AnimatedSprite(frames);
    s.anchor.set(0.5);
    applyFlags(s, at.flags << 28);
    s.position.set(at.x * T + 8, at.y * T + 8);
    s.animationSpeed = at.fps / 60;
    s.gotoAndPlay(at.phase % frames.length);
    s.zIndex = -1e8;
    world.addChild(s);
  }

  // ---------- helper: animated sprite from a strip ----------
  function strip(alias, declared, fps = 8) {
    const s = new AnimatedSprite(sliceStrip(tex[alias], declared));
    s.animationSpeed = fps / 60;
    s.play();
    return s;
  }

  // ---------- entities (sprites, animals, VFX, crops, characters) as editable nodes ----------
  const DECL = {
    bird: 4, blinking: 12, chicken: 4, cow: 4, duck: 4, pig: 4, sheep: 4,
    coracle: 4, windmill: 9, tree1: 4, tree2: 4,
    smoke1: 30, smoke2: 30, smoke3: 30, smoke4: 30, smoke5: 30,
    fire1: 4, fire2: 4, glint1: 6, glint2: 4,
  };
  const EXPR = { chat: "ui_expr_chat", love: "ui_expr_love", confused: "ui_expr_confused", alerted: "ui_expr_alerted", attack: "ui_expr_attack", working: "ui_expr_working", stress: "ui_expr_stress", happy: "ui_happy" };
  const CHAR_KINDS = new Set(["human", "goblin", "skeleton"]);
  const walkers = [];
  const spriteNodes = new Map(); // id -> node (decor + characters)

  function buildDecorNode(sp) {
    let node;
    switch (sp.kind) {
      case "windmill": node = strip("windmill", 9, 9); node.anchor.set(0, 0); node.__zBase = 104; break;
      case "smoke": node = strip(`smoke${sp.variant ?? 1}`, 30, 10); node.anchor.set(0.5, 1); node.alpha = 0.92; node.gotoAndPlay(Math.floor(Math.random() * 30)); node.__zFixed = 1e8; break;
      case "fire1": case "fire2": node = strip(sp.kind, 4, 8); node.anchor.set(0.5, 1); break;
      case "glint": { const g = Math.random() < 0.5 ? "glint1" : "glint2"; node = strip(g, DECL[g], 5); node.anchor.set(0.5); node.alpha = 0.9; node.gotoAndPlay(Math.floor(Math.random() * DECL[g])); node.__zFixed = -1e7; break; }
      case "coracle": node = strip("coracle", 4, 4); node.anchor.set(0.5, 0.8); node.__bob = Math.random() * Math.PI * 2; break;
      case "coracleLand": node = new Sprite(tex.coracleLand); node.anchor.set(0.5, 0.8); break;
      case "crop": node = new Sprite(tex[`crop_${sp.crop}_${sp.stage ?? 5}`]); node.anchor.set(0.5, 0.9); break;
      default: node = strip(sp.kind, DECL[sp.kind] ?? 4, 3 + Math.random() * 3); node.anchor.set(0.5, 0.85); node.gotoAndPlay(Math.floor(Math.random() * (DECL[sp.kind] ?? 4)));
    }
    if (sp.flipX) node.scale.x = -Math.abs(node.scale.x || 1);
    return node;
  }

  function buildCharNode(npc) {
    const group = new Container();
    const parts = [];
    const addPart = (alias, declared) => {
      const a = new AnimatedSprite(sliceStrip(tex[alias], declared));
      a.anchor.set(0.5, 0.875); a.animationSpeed = 9 / 60;
      parts.push(a); group.addChild(a); return a;
    };
    if (npc.kind === "human") {
      const [, , n] = HUMAN_ANIMS[npc.anim] ?? HUMAN_ANIMS.idle;
      addPart(`h_base_${npc.anim}`, n);
      if (npc.hair) addPart(`h_${npc.hair}_${npc.anim}`, n);
      if (npc.tools) addPart(`h_tools_${npc.anim}`, n);
    } else if (npc.kind === "goblin") {
      addPart(`g_${npc.anim}`, GOBLIN_ANIMS[npc.anim]);
    } else {
      addPart(`s_${npc.anim}`, SKELETON_ANIMS[npc.anim]);
    }
    const offset = Math.floor(Math.random() * (parts[0]?.totalFrames || 1));
    for (const p of parts) p.gotoAndPlay(offset);
    if (npc.flipX ?? npc.flip) group.scale.x = -1;
    if (npc.expression && EXPR[npc.expression]) {
      const e = new Sprite(tex[EXPR[npc.expression]]);
      e.anchor.set(0.5, 1); e.position.set(6, -30); e.scale.set(1.2); e.__bobBase = -30;
      group.__expr = e; group.addChild(e);
    }
    const walker = npc.waypoints ? { group, wp: npc.waypoints.map(([x, y]) => ({ x: x * T, y: y * T })), i: 0, speed: npc.speed || 14 } : null;
    // tight hit/select box: character frames are 96px with lots of transparent margin
    group.__hitBox = { x: -8, y: -24, w: 16, h: 28 };
    return { group, walker };
  }

  // local-space selection/hit bounds (tight box for characters, else sprite bounds)
  const entityBounds = (node) => node.__hitBox
    ? { x: node.__hitBox.x, y: node.__hitBox.y, width: node.__hitBox.w, height: node.__hitBox.h }
    : node.getLocalBounds();
  const entityZ = (node, y) => (node.__zFixed ?? (y + (node.__zBase || 0)));
  function resolveSprite(entry) {
    const item = entry.cat ? catalogItem(entry.cat) : null;
    const spec = { ...(item?.place ?? {}), ...entry };
    spec.x = entry.px * T; spec.y = entry.py * T;
    return spec;
  }
  function addEntity(entry) {
    const spec = resolveSprite(entry);
    let node, isChar = false;
    if (CHAR_KINDS.has(spec.kind)) { const r = buildCharNode(spec); node = r.group; if (r.walker) walkers.push(r.walker); isChar = true; }
    else node = buildDecorNode(spec);
    node.position.set(spec.x, spec.y);
    node.zIndex = entityZ(node, spec.y);
    node.__id = entry.id; node.__entry = entry; node.__entity = true; node.__isChar = isChar;
    spriteNodes.set(entry.id, node);
    world.addChild(node);
    return node;
  }
  function removeEntity(id) {
    const node = spriteNodes.get(id);
    if (!node) return;
    if (node.__isChar) for (let i = walkers.length - 1; i >= 0; i--) if (walkers[i].group === node) walkers.splice(i, 1);
    world.removeChild(node); node.destroy({ children: true }); spriteNodes.delete(id);
  }

  // initial entities from the world doc (assign stable ids to legacy entries)
  let entSeq = 0;
  for (const entry of worldDoc.sprites ?? []) { if (!entry.id) entry.id = `s${(entSeq++).toString(36)}_init`; addEntity(entry); }

  // ---------- regions (named banner labels from the pack) as editable nodes ----------
  const REGION_COLORS = { cream: 0xffffff, blue: 0x9fd4ff, green: 0xbdf0a6, pink: 0xffb3cb, gold: 0xffd98a };
  const REGION_ORDER = ["cream", "blue", "green", "pink", "gold"];
  let regionsVisible = true;
  const regionNodes = new Map();
  function buildRegionNode(r) {
    const c = new Container();
    const text = r.name || "AREA";
    const midW = Math.max(2, Math.ceil((text.length * 6 + 6) / 16));
    const bannerW = 8 + midW * 16;
    const left = new Sprite(tex.ui_label_left);
    const mid = new TilingSprite({ texture: tex.ui_label_middle, width: midW * 16, height: 13 });
    const right = new Sprite(tex.ui_label_right);
    left.position.set(0, 0); mid.position.set(4, 0); right.position.set(4 + midW * 16, 0);
    const tint = REGION_COLORS[r.color] ?? 0xffffff;
    left.tint = mid.tint = right.tint = tint;
    const label = new Text({ text, style: { fontFamily: "Courier New, monospace", fontSize: 9, fontWeight: "bold", fill: 0xfff7e6, letterSpacing: 1 } });
    label.resolution = 8; label.anchor.set(0.5, 0.5); label.position.set(bannerW / 2, 5.5);
    c.addChild(left, mid, right, label);
    c.pivot.set(bannerW / 2, 6);
    c.position.set((r.x + (r.w ?? 0) / 2) * T, r.y * T);
    c.zIndex = 5e7; c.alpha = 0.95;
    c.__id = r.id; c.__region = r; c.__hitBox = { x: -bannerW / 2, y: -6, w: bannerW, h: 13 };
    c.visible = regionsVisible;
    return c;
  }
  function addRegionNode(r) { const n = buildRegionNode(r); regionNodes.set(r.id, n); world.addChild(n); return n; }
  function removeRegionNode(id) { const n = regionNodes.get(id); if (n) { world.removeChild(n); n.destroy({ children: true }); regionNodes.delete(id); } }
  let regSeq = 0;
  for (const r of worldDoc.regions ?? []) { if (!r.id) r.id = `r${(regSeq++).toString(36)}_init`; addRegionNode(r); }

  // ---------- live objects (editable stamps, not baked) ----------
  const objectNodes = new Map(); // id -> Container
  function buildObjectNode(obj) {
    const item = obj.item || catalogItem(obj.cat);
    const tf = transformObject(item, obj.rot || 0, obj.flipX || false);
    const c = new Container();
    // draw in layer-depth order (higher depth first = lower in the stack)
    const order = tf.tiles.slice().sort((a, b) => (LAYER_DEPTH[b.layer] ?? 0) - (LAYER_DEPTH[a.layer] ?? 0));
    for (const t of order) {
      const s = new Sprite(tileTexture(tex.tileset, t.idx));
      s.anchor.set(0.5);
      applyFlags(s, t.flags);
      s.position.set(t.lx * T + T / 2, t.ly * T + T / 2);
      c.addChild(s);
    }
    c.position.set(obj.x * T, obj.y * T);
    c.zIndex = (obj.y + tf.h) * T; // y-sort by the footprint's foot
    c.__objId = obj.id;
    c.__footH = tf.h;
    return c;
  }
  function addObjectNode(obj) {
    const node = buildObjectNode(obj);
    objectNodes.set(obj.id, node);
    world.addChild(node);
    return node;
  }
  function removeObjectNode(id) {
    const node = objectNodes.get(id);
    if (node) { world.removeChild(node); node.destroy({ children: true }); objectNodes.delete(id); }
  }
  for (const obj of model.objects) addObjectNode(obj);

  // ---------- live terrain (brush paints types -> autotile -> dirty-rect re-bake) ----------
  const terrainEnabled = !!worldDoc.terrain;
  const terrainCells = terrainEnabled ? rleDecode(worldDoc.terrain.cells, MW * MH) : null;
  const seaLayer = layers.find((l) => l.name === "sea");
  const landLayer = layers.find((l) => l.name === "land");
  const pathsLayer = layers.find((l) => l.name === "paths");
  // redraw all baked tile layers within a tile rect on top of groundRT (sea is opaque
  // and fills every cell, so the full stack cleanly overwrites the old pixels)
  function rebakeRect(x0, y0, x1, y1) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(MW - 1, x1); y1 = Math.min(MH - 1, y1);
    if (x1 < x0 || y1 < y0) return;
    const c = new Container();
    for (const layer of layers) {
      if (CLOUD_LAYERS.has(layer.name) || layer.tileset === "tileset_forest") continue;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const v = layer.cells[y * layer.width + x];
          if (!v) continue;
          const s = makeTileSprite(tex.tileset, v, v & 0x7ffff, 16, 64);
          s.position.set(x * 16 + 8, y * 16 + 8);
          c.addChild(s);
        }
    }
    app.renderer.render({ container: c, target: groundRT, clear: false });
    c.destroy({ children: true });
  }
  // apply {i,type} cell changes -> recompute terrain layers -> re-bake the changed bbox
  function applyTerrain(changes) {
    for (const ch of changes) terrainCells[ch.i] = ch.type;
    worldDoc.terrain.cells = rleEncode(terrainCells);
    const t = computeTerrain(terrainCells, worldDoc.terrain.types, MW, MH);
    let x0 = MW, y0 = MH, x1 = -1, y1 = -1;
    const sync = (layer, arr) => {
      if (!layer) return;
      for (let i = 0; i < arr.length; i++) if (layer.cells[i] !== arr[i]) {
        layer.cells[i] = arr[i];
        const x = i % MW, y = (i / MW) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    };
    sync(seaLayer, t.sea); sync(landLayer, t.land); sync(pathsLayer, t.paths);
    if (x1 >= 0) rebakeRect(x0, y0, x1, y1);
    markDirty();
  }

  // ---------- editor: tools, ghost preview, placement, selection, history ----------
  worldDoc.objects ||= [];
  worldDoc.sprites ||= [];
  worldDoc.regions ||= [];
  const ed = {
    tool: "pan", armed: null, armKind: null, rot: 0, flipX: false,
    sprite: { anim: null, hair: null, tools: false },
    brushType: 1, brushSize: 1, stroke: null, painting: false,
    ghostTile: { tx: -999, ty: -999 }, ghostPx: { px: 0, py: 0 }, ghostValid: false,
    spaceHeld: false, altHeld: false,
    selectedId: null, selectedType: null, selection: [], dragSel: null, regionDrag: null, marquee: null,
  };
  const history = new History();
  let ghost = null, ghostOutline = null, selOutline = null;
  const onDirtyCbs = new Set();
  const markDirty = () => { for (const fn of onDirtyCbs) fn(); };
  const onEditorCbs = new Set();
  const selectedRegion = () => (ed.selectedType === "region" ? worldDoc.regions.find((r) => r.id === ed.selectedId) : null);
  const editorState = () => ({
    tool: ed.tool, armedId: ed.armed?.id ?? null, armKind: ed.armKind, rot: ed.rot, flipX: ed.flipX,
    sprite: { ...ed.sprite }, brushSize: ed.brushSize, terrainEnabled, regionsVisible, animOn,
    selectedId: ed.selectedId, selectedType: ed.selectedType, selectedCount: ed.selection.length,
    selectedName: selectedRegion()?.name ?? null, selectedColor: selectedRegion()?.color ?? null,
    canUndo: history.canUndo(), canRedo: history.canRedo(),
  });
  const emitEditor = () => { const st = editorState(); for (const fn of onEditorCbs) fn(st); };
  history.onChange(emitEditor);
  let idSeq = 0;
  const nextId = (p) => `${p}${Date.now().toString(36)}${(idSeq++).toString(36)}`;
  // load a placed entity's textures and merge them into the engine's tex map
  const ensureTex = async (spec) => { Object.assign(tex, await ensureTextures(spec)); };

  // -- ghost --
  function clearGhost() {
    if (ghost) { world.removeChild(ghost); ghost.destroy({ children: true }); ghost = null; }
    if (ghostOutline) { world.removeChild(ghostOutline); ghostOutline.destroy(); ghostOutline = null; }
  }
  const tintNode = (node, valid) => {
    const c = valid ? 0xffffff : 0xff8a8a;
    if (node instanceof Sprite) node.tint = c; else for (const ch of node.children) ch.tint = c;
  };
  const withinBounds = (tx, ty, w, h) => tx >= 0 && ty >= 0 && tx + w <= MW && ty + h <= MH;
  const objFootprint = () => { const swap = ((ed.rot / 90) % 2) === 1; return { w: swap ? ed.armed.h : ed.armed.w, h: swap ? ed.armed.w : ed.armed.h }; };
  function spriteArmSpec() {
    const pl = ed.armed?.place ?? {};
    return { ...pl, anim: ed.sprite.anim ?? pl.anim, hair: ed.sprite.hair ?? pl.hair, tools: ed.sprite.tools, flipX: ed.flipX };
  }
  function refreshGhost() {
    clearGhost();
    if (ed.armKind === "terrain") {
      const { tx, ty } = ed.ghostTile;
      const off = (ed.brushSize / 2) | 0;
      ghostOutline = new Graphics();
      ghostOutline.rect((tx - off) * T, (ty - off) * T, ed.brushSize * T, ed.brushSize * T).stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
      ghostOutline.zIndex = 2e9 + 1; world.addChild(ghostOutline);
      return;
    }
    if (!ed.armed) return;
    if (ed.armKind === "object") {
      const { tx, ty } = ed.ghostTile;
      ghost = buildObjectNode({ id: "__ghost", item: ed.armed, x: tx, y: ty, rot: ed.rot, flipX: ed.flipX });
      ghost.alpha = 0.65; ghost.zIndex = 2e9;
      const { w, h } = objFootprint();
      const valid = withinBounds(tx, ty, w, h);
      tintNode(ghost, valid); world.addChild(ghost);
      ghostOutline = new Graphics();
      ghostOutline.rect(tx * T, ty * T, w * T, h * T).stroke({ width: 1, color: valid ? 0x70e0a0 : 0xff5555, alpha: 0.95 });
      ghostOutline.zIndex = 2e9 + 1; world.addChild(ghostOutline);
      ed.ghostValid = valid;
    } else {
      const spec = spriteArmSpec();
      if (CHAR_KINDS.has(spec.kind) && !tex[`${spec.kind === "human" ? "h_base" : spec.kind === "goblin" ? "g" : "s"}_${spec.anim}`]) return; // textures not ready yet
      const { px, py } = ed.ghostPx;
      ghost = CHAR_KINDS.has(spec.kind) ? buildCharNode(spec).group : buildDecorNode(spec);
      ghost.alpha = 0.7; ghost.zIndex = 2e9; ghost.position.set(px * T, py * T);
      const valid = px >= 0 && py >= 0 && px <= MW && py <= MH;
      tintNode(ghost, valid); world.addChild(ghost);
      ghostOutline = new Graphics();
      ghostOutline.circle(px * T, py * T, 2.5).stroke({ width: 1, color: valid ? 0x70e0a0 : 0xff5555, alpha: 0.9 });
      ghostOutline.zIndex = 2e9 + 1; world.addChild(ghostOutline);
      ed.ghostValid = valid;
    }
  }
  function moveGhostScreen(gx, gy) {
    const wx = (gx - cam.x) / cam.scale, wy = (gy - cam.y) / cam.scale;
    if (ed.armKind === "terrain") {
      const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      if (tx === ed.ghostTile.tx && ty === ed.ghostTile.ty && ghostOutline) return;
      ed.ghostTile = { tx, ty }; refreshGhost();
      return;
    }
    if (!ed.armed) return;
    if (ed.armKind === "object") {
      const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      if (ghost && tx === ed.ghostTile.tx && ty === ed.ghostTile.ty) return;
      ed.ghostTile = { tx, ty }; refreshGhost();
    } else {
      let px = wx / T, py = wy / T;
      if (!ed.altHeld) { px = Math.round(px * 2) / 2; py = Math.round(py * 2) / 2; }
      if (ghost && px === ed.ghostPx.px && py === ed.ghostPx.py) return;
      ed.ghostPx = { px, py }; refreshGhost();
    }
  }

  // -- placement --
  function placeObject(tx, ty) {
    const { w, h } = objFootprint();
    if (!withinBounds(tx, ty, w, h)) return;
    const obj = { id: nextId("o"), cat: ed.armed.id, x: tx, y: ty, rot: ed.rot, flipX: ed.flipX };
    history.run({
      label: "place",
      do() { worldDoc.objects.push(obj); addObjectNode(obj); markDirty(); },
      undo() { removeObjectNode(obj.id); const i = worldDoc.objects.findIndex((o) => o.id === obj.id); if (i >= 0) worldDoc.objects.splice(i, 1); markDirty(); },
    });
  }
  async function placeSprite(px, py) {
    if (px < 0 || py < 0 || px > MW || py > MH) return;
    const entry = { id: nextId("s"), cat: ed.armed.id, px, py };
    const opts = spriteArmSpec();
    if (opts.anim) entry.anim = opts.anim;
    if (opts.hair) entry.hair = opts.hair;
    if (opts.tools) entry.tools = true;
    if (ed.flipX) entry.flipX = true;
    await ensureTex(resolveSprite(entry));
    history.run({
      label: "place-sprite",
      do() { worldDoc.sprites.push(entry); addEntity(entry); markDirty(); },
      undo() { removeEntity(entry.id); const i = worldDoc.sprites.findIndex((s) => s.id === entry.id); if (i >= 0) worldDoc.sprites.splice(i, 1); markDirty(); },
    });
  }
  function commitPlace(gx, gy) {
    if (!ed.armed) return;
    const wx = (gx - cam.x) / cam.scale, wy = (gy - cam.y) / cam.scale;
    if (ed.armKind === "object") placeObject(Math.floor(wx / T), Math.floor(wy / T));
    else { let px = wx / T, py = wy / T; if (!ed.altHeld) { px = Math.round(px * 2) / 2; py = Math.round(py * 2) / 2; } placeSprite(px, py); }
  }

  // -- terrain brush (paint type per cell; one undo command per stroke) --
  function brushDab(tx, ty) {
    const off = (ed.brushSize / 2) | 0;
    const changes = [];
    for (let dy = 0; dy < ed.brushSize; dy++)
      for (let dx = 0; dx < ed.brushSize; dx++) {
        const x = tx - off + dx, y = ty - off + dy;
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        const i = y * MW + x;
        if (terrainCells[i] === ed.brushType) continue;
        if (!ed.stroke.has(i)) ed.stroke.set(i, terrainCells[i]);
        changes.push({ i, type: ed.brushType });
      }
    if (changes.length) applyTerrain(changes);
  }
  function brushDabScreen(gx, gy) {
    const wx = (gx - cam.x) / cam.scale, wy = (gy - cam.y) / cam.scale;
    brushDab(Math.floor(wx / T), Math.floor(wy / T));
  }
  function endStroke() {
    const stroke = ed.stroke; ed.stroke = null; ed.painting = false;
    if (!stroke || stroke.size === 0) return;
    const before = [...stroke].map(([i, old]) => ({ i, type: old }));
    const after = [...stroke].map(([i]) => ({ i, type: terrainCells[i] }));
    history.push({ label: "paint", do() { applyTerrain(after); }, undo() { applyTerrain(before); } });
  }

  // -- selection / move / delete / flip (objects + sprites + regions) --
  const Z_BIAS = 1e6; // layering: manual forward/back offset added to foot-based zIndex
  const objById = (id) => worldDoc.objects.find((o) => o.id === id);
  const sprById = (id) => worldDoc.sprites.find((s) => s.id === id);
  const regById = (id) => worldDoc.regions.find((r) => r.id === id);
  const nodeFor = (id, type) => (type === "object" ? objectNodes : type === "sprite" ? spriteNodes : regionNodes).get(id);
  function setObjectPos(o, x, y) { o.x = x; o.y = y; const n = objectNodes.get(o.id); if (n) { n.position.set(x * T, y * T); n.zIndex = (y + n.__footH) * T + (o.z || 0) * Z_BIAS; } }
  function setSpritePos(e, px, py) { e.px = px; e.py = py; const n = spriteNodes.get(e.id); if (n) { n.position.set(px * T, py * T); n.zIndex = entityZ(n, py * T) + (e.z || 0) * Z_BIAS; } }
  function setRegionPos(r, x, y) { r.x = x; r.y = y; const n = regionNodes.get(r.id); if (n) n.position.set((x + (r.w ?? 0) / 2) * T, y * T); }
  const isSelected = (id) => ed.selection.some((s) => s.id === id);
  function clearSelection() { ed.selection = []; ed.selectedId = null; ed.selectedType = null; if (selOutline) { world.removeChild(selOutline); selOutline.destroy(); selOutline = null; } }
  function updateSelectionOutline() {
    if (selOutline) { world.removeChild(selOutline); selOutline.destroy(); selOutline = null; }
    if (!ed.selection.length) return;
    selOutline = new Graphics();
    for (const { id, type } of ed.selection) {
      const node = nodeFor(id, type); if (!node) continue;
      const b = entityBounds(node);
      selOutline.rect(node.x + b.x - 1, node.y + b.y - 1, b.width + 2, b.height + 2);
    }
    selOutline.stroke({ width: 1, color: 0xffe14a, alpha: 0.95 });
    selOutline.zIndex = 1.9e9; world.addChild(selOutline);
  }
  function setSelection(list) {
    ed.selection = list;
    ed.selectedId = list.length === 1 ? list[0].id : null;
    ed.selectedType = list.length === 1 ? list[0].type : null;
    updateSelectionOutline(); emitEditor();
  }
  function selectEntity(id, type) { clearGhost(); ed.armed = null; ed.armKind = null; setSelection([{ id, type }]); }
  function toggleSel(hit) {
    const i = ed.selection.findIndex((s) => s.id === hit.id);
    if (i >= 0) { const ns = ed.selection.slice(); ns.splice(i, 1); setSelection(ns); }
    else setSelection([...ed.selection, hit]);
  }
  function hitTest(gx, gy) {
    const wx = (gx - cam.x) / cam.scale, wy = (gy - cam.y) / cam.scale;
    let best = null, bestZ = -Infinity;
    const consider = (node, id, type) => {
      const b = entityBounds(node);
      const x0 = node.x + b.x, y0 = node.y + b.y;
      if (wx >= x0 && wx <= x0 + b.width && wy >= y0 && wy <= y0 + b.height && node.zIndex >= bestZ) { best = { id, type }; bestZ = node.zIndex; }
    };
    for (const [id, node] of regionNodes) if (node.visible) consider(node, id, "region");
    for (const [id, node] of objectNodes) consider(node, id, "object");
    for (const [id, node] of spriteNodes) consider(node, id, "sprite");
    return best;
  }
  const entById = (id, type) => (type === "object" ? objById(id) : type === "region" ? regById(id) : sprById(id));
  const arrRemove = (a, x) => { const i = a.indexOf(x); if (i >= 0) a.splice(i, 1); };
  function applyPos(type, id, pos) {
    if (type === "object") { const o = objById(id); if (o) setObjectPos(o, pos.a, pos.b); }
    else if (type === "sprite") { const e = sprById(id); if (e) setSpritePos(e, pos.a, pos.b); }
    else { const r = regById(id); if (r) setRegionPos(r, pos.a, pos.b); }
    if (isSelected(id)) updateSelectionOutline();
  }
  function commitMoves(moves) {
    const real = moves.filter((m) => m.from.a !== m.to.a || m.from.b !== m.to.b);
    if (!real.length) return;
    history.run({ label: "move", do() { for (const m of real) applyPos(m.type, m.id, m.to); markDirty(); }, undo() { for (const m of real) applyPos(m.type, m.id, m.from); markDirty(); } });
  }
  function deleteSelected() {
    if (!ed.selection.length) return;
    const removed = ed.selection.map(({ id, type }) => ({ type, ent: entById(id, type) })).filter((r) => r.ent);
    const addBack = ({ type, ent }) => { if (type === "object") { worldDoc.objects.push(ent); addObjectNode(ent); } else if (type === "region") { worldDoc.regions.push(ent); addRegionNode(ent); } else { worldDoc.sprites.push(ent); addEntity(ent); } };
    const take = ({ type, ent }) => { if (type === "object") { removeObjectNode(ent.id); arrRemove(worldDoc.objects, ent); } else if (type === "region") { removeRegionNode(ent.id); arrRemove(worldDoc.regions, ent); } else { removeEntity(ent.id); arrRemove(worldDoc.sprites, ent); } };
    history.run({ label: "delete", do() { removed.forEach(take); markDirty(); }, undo() { removed.forEach(addBack); markDirty(); } });
    clearSelection(); emitEditor();
  }
  // -- regions: create / rename / recolor / hide --
  function createRegion(x, y, w, h) {
    const r = { id: nextId("r"), name: "AREA", x, y, w, h, color: "cream" };
    history.run({
      label: "region",
      do() { worldDoc.regions.push(r); addRegionNode(r); markDirty(); },
      undo() { removeRegionNode(r.id); const i = worldDoc.regions.indexOf(r); if (i >= 0) worldDoc.regions.splice(i, 1); markDirty(); },
    });
    selectEntity(r.id, "region");
  }
  function renameSelected(name) {
    const r = selectedRegion(); if (!r) return;
    const was = r.name;
    if (was === name) return;
    const apply = (v) => { r.name = v; removeRegionNode(r.id); addRegionNode(r); updateSelectionOutline(); markDirty(); };
    history.run({ label: "rename", do() { apply(name); }, undo() { apply(was); } });
    emitEditor();
  }
  function recolorSelected(color) {
    const r = selectedRegion(); if (!r) return;
    const was = r.color;
    const apply = (v) => { r.color = v; removeRegionNode(r.id); addRegionNode(r); updateSelectionOutline(); markDirty(); };
    history.run({ label: "recolor", do() { apply(color); }, undo() { apply(was); } });
    emitEditor();
  }
  function toggleLabels() { regionsVisible = !regionsVisible; for (const n of regionNodes.values()) n.visible = regionsVisible; if (!regionsVisible && ed.selectedType === "region") clearSelection(); emitEditor(); }
  // -- region tool: drag a rectangle to place a named banner --
  let regionPreview = null;
  function clearRegionPreview() { if (regionPreview) { world.removeChild(regionPreview); regionPreview.destroy(); regionPreview = null; } }
  function drawRegionPreview() {
    clearRegionPreview();
    const d = ed.regionDrag; if (!d) return;
    const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0) + 1, h = Math.abs(d.y1 - d.y0) + 1;
    regionPreview = new Graphics();
    regionPreview.rect(x * T, y * T, w * T, h * T).fill({ color: 0xffe14a, alpha: 0.14 }).stroke({ width: 1, color: 0xffe14a, alpha: 0.9 });
    regionPreview.zIndex = 2e9; world.addChild(regionPreview);
  }
  function startRegionDrag(gx, gy) {
    const wx = (gx - cam.x) / cam.scale, wy = (gy - cam.y) / cam.scale;
    const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    ed.regionDrag = { x0: tx, y0: ty, x1: tx, y1: ty }; drawRegionPreview();
  }
  function updateRegionDrag(gx, gy) {
    if (!ed.regionDrag) return;
    const wx = (gx - cam.x) / cam.scale, wy = (gy - cam.y) / cam.scale;
    ed.regionDrag.x1 = Math.floor(wx / T); ed.regionDrag.y1 = Math.floor(wy / T); drawRegionPreview();
  }
  function endRegionDrag() {
    const d = ed.regionDrag; ed.regionDrag = null; clearRegionPreview();
    if (!d) return;
    const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0) + 1, h = Math.abs(d.y1 - d.y0) + 1;
    ed.tool = "select";
    createRegion(x, y, w, h);
    updateCursor();
  }
  function flipSelected() {
    const id = ed.selectedId, type = ed.selectedType; if (!id) return;
    const ent = type === "object" ? objById(id) : sprById(id); if (!ent) return;
    const was = !!ent.flipX;
    const rebuild = (v) => { ent.flipX = v; if (type === "object") { removeObjectNode(id); addObjectNode(ent); } else { removeEntity(id); addEntity(ent); } updateSelectionOutline(); markDirty(); };
    history.run({ label: "flip", do() { rebuild(!was); }, undo() { rebuild(was); } });
  }
  function nudgeSelected(dx, dy) {
    if (!ed.selection.length) return;
    const allSprite = ed.selection.every((s) => s.type === "sprite");
    const step = allSprite ? 1 / T : 1;
    const moves = ed.selection.map(({ id, type }) => {
      const ent = entById(id, type); if (!ent) return null;
      const a = type === "sprite" ? ent.px : ent.x, b = type === "sprite" ? ent.py : ent.y;
      return { type, id, from: { a, b }, to: { a: +(a + dx * step).toFixed(4), b: +(b + dy * step).toFixed(4) } };
    }).filter(Boolean);
    commitMoves(moves);
  }
  // -- layering: bring forward / send back (object/sprite z-bias) --
  function layerSelected(dir) {
    const id = ed.selectedId, type = ed.selectedType; if (!id || type === "region") return;
    const ent = type === "object" ? objById(id) : sprById(id); if (!ent) return;
    const was = ent.z || 0;
    const apply = (v) => { ent.z = v; if (type === "object") setObjectPos(ent, ent.x, ent.y); else setSpritePos(ent, ent.px, ent.py); updateSelectionOutline(); markDirty(); };
    history.run({ label: "layer", do() { apply(was + dir); }, undo() { apply(was); } });
  }
  // -- multi-select: marquee box + group drag --
  let marqueeG = null;
  function clearMarquee() { if (marqueeG) { world.removeChild(marqueeG); marqueeG.destroy(); marqueeG = null; } }
  function drawMarquee() {
    clearMarquee(); const m = ed.marquee; if (!m) return;
    const x = Math.min(m.sx, m.ex), y = Math.min(m.sy, m.ey), w = Math.abs(m.ex - m.sx), h = Math.abs(m.ey - m.sy);
    marqueeG = new Graphics();
    marqueeG.rect(x, y, w, h).fill({ color: 0x9fd4ff, alpha: 0.12 }).stroke({ width: 1, color: 0x9fd4ff, alpha: 0.9 });
    marqueeG.zIndex = 1.95e9; world.addChild(marqueeG);
  }
  function selectInMarquee() {
    const m = ed.marquee; if (!m) return;
    const x0 = Math.min(m.sx, m.ex), y0 = Math.min(m.sy, m.ey), x1 = Math.max(m.sx, m.ex), y1 = Math.max(m.sy, m.ey);
    const sel = [];
    const test = (node, id, type) => { const b = entityBounds(node); const nx = node.x + b.x, ny = node.y + b.y; if (nx + b.width >= x0 && nx <= x1 && ny + b.height >= y0 && ny <= y1) sel.push({ id, type }); };
    for (const [id, node] of objectNodes) test(node, id, "object");
    for (const [id, node] of spriteNodes) test(node, id, "sprite");
    for (const [id, node] of regionNodes) if (node.visible) test(node, id, "region");
    setSelection(sel);
  }
  function startMarquee(gx, gy) { const wx = (gx - cam.x) / cam.scale, wy = (gy - cam.y) / cam.scale; ed.marquee = { sx: wx, sy: wy, ex: wx, ey: wy }; drawMarquee(); }
  function updateMarquee(gx, gy) { if (!ed.marquee) return; ed.marquee.ex = (gx - cam.x) / cam.scale; ed.marquee.ey = (gy - cam.y) / cam.scale; drawMarquee(); selectInMarquee(); }
  function endMarquee() { selectInMarquee(); clearMarquee(); ed.marquee = null; }
  function beginDrag(gx, gy) {
    const items = ed.selection.map(({ id, type }) => {
      const ent = entById(id, type), node = nodeFor(id, type); if (!ent || !node) return null;
      const a = type === "sprite" ? ent.px : ent.x, b = type === "sprite" ? ent.py : ent.y;
      return { id, type, node, startA: a, startB: b, curA: a, curB: b };
    }).filter(Boolean);
    ed.dragSel = { items, startWx: (gx - cam.x) / cam.scale, startWy: (gy - cam.y) / cam.scale, moved: false, lastDa: 0, lastDb: 0 };
  }

  // -- tools --
  function updateCursor() {
    if (cam.dragging && ed.tool !== "select") { app.canvas.style.cursor = closedCur; return; }
    app.canvas.style.cursor = (ed.tool === "place" || ed.tool === "brush" || ed.tool === "region") ? "crosshair" : ed.tool === "select" ? "default" : openCur;
  }
  function setTool(t) { ed.tool = t; if (t !== "place" && t !== "brush") { ed.armed = null; ed.armKind = null; clearGhost(); } if (t !== "region") { ed.regionDrag = null; clearRegionPreview(); } if (t !== "select") clearSelection(); updateCursor(); emitEditor(); }
  function arm(item) {
    if (item.kind === "terrain") { armTerrain(item); return; }
    clearSelection();
    ed.armed = item; ed.armKind = item.kind; ed.tool = "place"; ed.rot = 0; ed.flipX = false;
    if (item.kind === "sprite") {
      const pl = item.place ?? {};
      ed.sprite = { anim: pl.anim ?? null, hair: pl.hair ?? null, tools: !!pl.tools };
      clearGhost();
      ensureTex(spriteArmSpec()).then(() => { if (ed.armed === item) refreshGhost(); });
    } else { ed.sprite = { anim: null, hair: null, tools: false }; refreshGhost(); }
    updateCursor(); emitEditor();
  }
  function armTerrain(item) {
    if (!terrainEnabled) return;
    clearSelection();
    ed.armed = item; ed.armKind = "terrain"; ed.tool = "brush";
    let ti = worldDoc.terrain.types.indexOf(item.terrain);
    if (ti < 0) { worldDoc.terrain.types.push(item.terrain); ti = worldDoc.terrain.types.length - 1; }
    ed.brushType = ti;
    refreshGhost(); updateCursor(); emitEditor();
  }
  function setBrushSize(n) { ed.brushSize = n; refreshGhost(); emitEditor(); }
  function cancelArm() { ed.armed = null; ed.armKind = null; ed.tool = "pan"; clearGhost(); updateCursor(); emitEditor(); }
  function rotateArmed() { if (ed.armKind !== "object") return; ed.rot = (ed.rot + 90) % 360; refreshGhost(); emitEditor(); }
  function flipArmed() { if (!ed.armed) { if (ed.selectedId) flipSelected(); return; } ed.flipX = !ed.flipX; refreshGhost(); emitEditor(); }
  function setArmOption(key, value) {
    if (!ed.armed) return;
    if (key === "flipX") ed.flipX = !!value; else ed.sprite[key] = value;
    if (key === "anim" || key === "hair" || key === "tools") ensureTex(spriteArmSpec()).then(() => refreshGhost());
    else refreshGhost();
    emitEditor();
  }

  // palette thumbnails: render a catalog item to a small data URL (cached)
  const thumbCache = new Map();
  async function thumb(item) {
    if (thumbCache.has(item.id)) return thumbCache.get(item.id);
    const { node, w, h } = thumbFor(item, tex);
    const pad = 0.5;
    const rt = RenderTexture.create({ width: Math.max(1, Math.ceil((w + pad * 2) * T)), height: Math.max(1, Math.ceil((h + pad * 2) * T)) });
    node.position.set(pad * T, pad * T);
    app.renderer.render({ container: node, target: rt });
    const url = await app.renderer.extract.base64(rt);
    node.destroy({ children: true }); rt.destroy(true);
    thumbCache.set(item.id, url);
    return url;
  }

  // ---------- camera ----------
  const cam = { scale: 2.2, x: 0, y: 0, dragging: false, sx: 0, sy: 0, wx: 0, wy: 0 };
  const openCur = "url('/cursors/hand_open_02@2x.png') 14 14, grab";
  const closedCur = "url('/cursors/hand_closed_02@2x.png') 13 12, grabbing";
  app.canvas.style.cursor = openCur;
  function clampCam() {
    const sw = app.screen.width, sh = app.screen.height;
    const minScale = Math.max(sw / PW, sh / PH);
    cam.scale = Math.min(6, Math.max(minScale, cam.scale));
    const w = PW * cam.scale, h = PH * cam.scale;
    cam.x = Math.min(0, Math.max(sw - w, cam.x));
    cam.y = Math.min(0, Math.max(sh - h, cam.y));
    world.scale.set(cam.scale);
    world.position.set(Math.round(cam.x), Math.round(cam.y));
  }
  function centerOn(tx, ty) {
    cam.x = app.screen.width / 2 - tx * cam.scale;
    cam.y = app.screen.height / 2 - ty * cam.scale;
    clampCam();
  }
  const screenToTile = (gx, gy) => {
    const wx = (gx - cam.x) / cam.scale, wy = (gy - cam.y) / cam.scale;
    return { tx: Math.floor(wx / T), ty: Math.floor(wy / T) };
  };
  app.stage.eventMode = "static";
  app.stage.hitArea = { contains: () => true };
  app.stage.on("pointerdown", (e) => {
    cam.moved = false;
    cam.sx = e.global.x; cam.sy = e.global.y; cam.wx = cam.x; cam.wy = cam.y;
    // Select tool: pick/marquee + group drag (Shift/Ctrl toggles; Space pans)
    if (ed.tool === "select" && !ed.spaceHeld) {
      const hit = hitTest(e.global.x, e.global.y);
      if (hit) {
        if (e.shiftKey || e.ctrlKey) { toggleSel(hit); }
        else { if (!isSelected(hit.id)) selectEntity(hit.id, hit.type); beginDrag(e.global.x, e.global.y); }
        return;
      }
      if (!(e.shiftKey || e.ctrlKey)) { clearSelection(); emitEditor(); }
      startMarquee(e.global.x, e.global.y);
      return;
    }
    // Brush tool: start a paint stroke (Space forces pan instead)
    if (ed.tool === "brush" && !ed.spaceHeld) {
      ed.stroke = new Map(); ed.painting = true;
      brushDabScreen(e.global.x, e.global.y);
      return;
    }
    // Region tool: drag a rectangle to create a named banner
    if (ed.tool === "region" && !ed.spaceHeld) { startRegionDrag(e.global.x, e.global.y); return; }
    cam.dragging = true;
    if (ed.tool !== "place" || ed.spaceHeld) app.canvas.style.cursor = closedCur;
  });
  app.stage.on("pointermove", (e) => {
    if ((ed.tool === "place" || ed.tool === "brush") && !cam.moved) moveGhostScreen(e.global.x, e.global.y);
    if (ed.painting) { brushDabScreen(e.global.x, e.global.y); return; }
    if (ed.regionDrag) { updateRegionDrag(e.global.x, e.global.y); return; }
    if (ed.marquee) { updateMarquee(e.global.x, e.global.y); return; }
    if (ed.dragSel) {
      const ds = ed.dragSel;
      const wx = (e.global.x - cam.x) / cam.scale, wy = (e.global.y - cam.y) / cam.scale;
      const dTx = (wx - ds.startWx) / T, dTy = (wy - ds.startWy) / T;
      const allSprite = ds.items.every((it) => it.type === "sprite");
      let da, db;
      if (allSprite && ed.altHeld) { da = dTx; db = dTy; }
      else if (allSprite) { da = Math.round(dTx * 2) / 2; db = Math.round(dTy * 2) / 2; }
      else { da = Math.round(dTx); db = Math.round(dTy); }
      if (da !== ds.lastDa || db !== ds.lastDb) {
        ds.lastDa = da; ds.lastDb = db; ds.moved = (da !== 0 || db !== 0);
        for (const it of ds.items) {
          it.curA = +(it.startA + da).toFixed(4); it.curB = +(it.startB + db).toFixed(4);
          if (it.type === "object") { it.node.position.set(it.curA * T, it.curB * T); it.node.zIndex = (it.curB + it.node.__footH) * T + ((objById(it.id)?.z || 0)) * Z_BIAS; }
          else if (it.type === "region") { const r = regById(it.id); it.node.position.set((it.curA + (r?.w ?? 0) / 2) * T, it.curB * T); }
          else { it.node.position.set(it.curA * T, it.curB * T); it.node.zIndex = entityZ(it.node, it.curB * T) + ((sprById(it.id)?.z || 0)) * Z_BIAS; }
        }
        updateSelectionOutline();
      }
      return;
    }
    if (!cam.dragging) return;
    if (!cam.moved && Math.hypot(e.global.x - cam.sx, e.global.y - cam.sy) > 4) {
      cam.moved = true;
      if (ed.tool === "place") app.canvas.style.cursor = closedCur;
    }
    if (cam.moved) {
      cam.x = cam.wx + (e.global.x - cam.sx);
      cam.y = cam.wy + (e.global.y - cam.sy);
      clampCam();
    }
  });
  const endDrag = (e) => {
    if (ed.painting) { endStroke(); updateCursor(); return; }
    if (ed.regionDrag) { endRegionDrag(); return; }
    if (ed.marquee) { endMarquee(); updateCursor(); return; }
    if (ed.dragSel) {
      const ds = ed.dragSel; ed.dragSel = null;
      if (ds.moved) commitMoves(ds.items.map((it) => ({ type: it.type, id: it.id, from: { a: it.startA, b: it.startB }, to: { a: it.curA, b: it.curB } })));
      updateCursor(); return;
    }
    const wasClick = cam.dragging && !cam.moved;
    cam.dragging = false;
    if (wasClick && ed.tool === "place" && ed.armed && !ed.spaceHeld) commitPlace(e.global.x, e.global.y);
    updateCursor();
  };
  app.stage.on("pointerup", endDrag);
  app.stage.on("pointerupoutside", () => { cam.dragging = false; ed.dragSel = null; if (ed.painting) endStroke(); if (ed.regionDrag) endRegionDrag(); if (ed.marquee) endMarquee(); updateCursor(); });
  function zoomAt(factor, gx, gy) {
    const wx = (gx - cam.x) / cam.scale, wy = (gy - cam.y) / cam.scale;
    cam.scale *= factor;
    clampCam();
    cam.x = gx - wx * cam.scale;
    cam.y = gy - wy * cam.scale;
    clampCam();
  }
  app.canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(Math.pow(1.0015, -e.deltaY), e.offsetX, e.offsetY);
  }, { passive: false });

  // ---------- UI: zoom controls (pack discs + arrows) ----------
  const ui = new Container();
  app.stage.addChild(ui);
  function uiButton(iconTex, onTap, rotate = false) {
    const b = new Container();
    const disc = new Sprite(tex.ui_itemdisc1);
    disc.anchor.set(0.5);
    const icon = new Sprite(iconTex);
    icon.anchor.set(0.5);
    if (rotate) icon.rotation = Math.PI;
    b.addChild(disc, icon);
    b.scale.set(2.6);
    b.eventMode = "static";
    b.cursor = "pointer";
    b.on("pointertap", onTap);
    b.on("pointerover", () => b.scale.set(2.9));
    b.on("pointerout", () => b.scale.set(2.6));
    ui.addChild(b);
    return b;
  }
  const zin = uiButton(tex.ui_arrow_up, () => zoomAt(1.3, app.screen.width / 2, app.screen.height / 2));
  const zout = uiButton(tex.ui_arrow_up1, () => zoomAt(1 / 1.3, app.screen.width / 2, app.screen.height / 2), true);
  const home = worldDoc.camera ?? { cx: (model.width * T) / 2, cy: (model.height * T) / 2, scale: 2.2 };
  const zreset = uiButton(tex.ui_search, () => { cam.scale = home.scale; centerOn(home.cx, home.cy); });
  function layoutUI() {
    const sw = app.screen.width, sh = app.screen.height;
    zin.position.set(sw - 40, sh - 150);
    zout.position.set(sw - 40, sh - 96);
    zreset.position.set(sw - 40, sh - 42);
  }
  layoutUI();
  app.renderer.on("resize", () => { layoutUI(); clampCam(); });

  // ---------- ticker: walkers, drift, bobbing ----------
  let animOn = true;
  function setAnimated(on) {
    animOn = on;
    const walk = (node) => { if (node instanceof AnimatedSprite) { on ? node.play() : node.stop(); } for (const ch of node.children || []) walk(ch); };
    walk(world);
    emitEditor();
  }
  let t = 0;
  app.ticker.add((tick) => {
    if (!animOn) return;
    const dt = tick.deltaMS / 1000;
    t += dt;
    // clouds drift gently
    const dx = Math.sin(t * 0.04) * 26 + t * 0; // slow oscillation
    clouds.x = dx;
    cloudShadow.x = dx + 2;
    // walkers
    for (const w of walkers) {
      const target = w.wp[(w.i + 1) % w.wp.length];
      const gx = w.group.x, gy = w.group.y;
      const ddx = target.x - gx, ddy = target.y - gy;
      const d = Math.hypot(ddx, ddy);
      if (d < 1.5) { w.i = (w.i + 1) % w.wp.length; continue; }
      const step = Math.min(d, w.speed * dt);
      w.group.x = gx + (ddx / d) * step;
      w.group.y = gy + (ddy / d) * step;
      if (Math.abs(ddx) > 0.5) w.group.scale.x = ddx < 0 ? -1 : 1;
      w.group.zIndex = w.group.y;
    }
    // expression bubbles bob
    for (const child of world.children) {
      if (child.__expr) child.__expr.y = child.__expr.__bobBase + Math.sin(t * 2.2 + child.x) * 1.5;
      if (child.__bob !== undefined) child.y += Math.sin(t * 1.4 + child.__bob) * 0.06;
    }
  });

  // initial view: the world's stored camera
  cam.scale = home.scale;
  centerOn(home.cx, home.cy);
  // dev camera hook
  window.__cam = { centerOn, set: (s) => { cam.scale = s; clampCam(); } };
  window.__app = app;

  // current camera as a storable home view (center of viewport, in world px)
  function getCamera() {
    return {
      cx: (app.screen.width / 2 - cam.x) / cam.scale,
      cy: (app.screen.height / 2 - cam.y) / cam.scale,
      scale: cam.scale,
    };
  }

  // render the whole world to a PNG data URL at the given scale (editor overlays
  // hidden). Hardened: returns null if the renderer is gone (a teardown race).
  async function renderToURL(scale) {
    if (!app.renderer) return null;
    let rt = null;
    try {
      rt = RenderTexture.create({ width: Math.max(1, Math.ceil(PW * scale)), height: Math.max(1, Math.ceil(PH * scale)) });
      const ps = world.scale.x, px = world.position.x, py = world.position.y, pcx = clouds.x, pshx = cloudShadow.x;
      const hide = [ghost, ghostOutline, selOutline, regionPreview].filter(Boolean);
      const vis = hide.map((n) => n.visible); hide.forEach((n) => { n.visible = false; });
      world.scale.set(scale); world.position.set(0, 0); clouds.x = 0; cloudShadow.x = 0;
      app.renderer.render({ container: world, target: rt });
      world.scale.set(ps); world.position.set(px, py); clouds.x = pcx; cloudShadow.x = pshx;
      hide.forEach((n, i) => { n.visible = vis[i]; });
      return await app.renderer.extract.base64(rt);
    } catch (e) { console.warn("render failed", e); return null; }
    finally { if (rt) try { rt.destroy(true); } catch { /* ignore */ } }
  }
  const snapshot = (maxW = 256) => renderToURL(Math.min(maxW / PW, (maxW * 0.7) / PH));
  // full-board export (native resolution, capped so the GPU texture stays in range)
  const exportImage = (maxDim = 4096) => renderToURL(Math.min(1, maxDim / PW, maxDim / PH));

  // ---------- keyboard ----------
  const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  function onKey(e) {
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); history.redo(); return; }
    if (e.key === "Alt") { ed.altHeld = true; return; }
    if (e.key === "Escape") { ed.armed ? cancelArm() : clearSelection(); emitEditor(); return; }
    if (e.key === " ") { ed.spaceHeld = true; updateCursor(); return; }
    if (ed.armed) {
      if (k === "r") rotateArmed();
      else if (k === "f") flipArmed();
      return;
    }
    if (ed.selection.length) {
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); }
      else if (k === "f") flipSelected();
      else if (NUDGE[e.key]) { e.preventDefault(); nudgeSelected(...NUDGE[e.key]); }
    }
  }
  function onKeyUp(e) {
    if (e.key === " ") { ed.spaceHeld = false; updateCursor(); }
    if (e.key === "Alt") ed.altHeld = false;
  }
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);

  function destroy() {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKeyUp);
    app.destroy(true, { children: true, texture: false });
  }

  onReady?.();
  return {
    app, world: worldDoc, getCamera, snapshot, destroy,
    history,
    exportImage, setAnimated,
    setTool, arm, cancelArm, rotateArmed, flipArmed, setArmOption,
    armTerrain, setBrushSize,
    deleteSelected, flipSelected, layerSelected,
    renameSelected, recolorSelected, toggleLabels, regionColors: REGION_ORDER,
    undo: () => history.undo(), redo: () => history.redo(),
    onDirty: (fn) => { onDirtyCbs.add(fn); return () => onDirtyCbs.delete(fn); },
    onEditor: (fn) => { onEditorCbs.add(fn); fn(editorState()); return () => onEditorCbs.delete(fn); },
    thumb,
  };
}
