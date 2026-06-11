// Sunnyside Cove - scene engine (PixiJS).
// Bakes the tile map into render textures, overlays animated tiles, characters,
// animals and VFX, and provides a drag/zoom camera with pack-asset UI.
import {
  AnimatedSprite, Application, Container, Rectangle, RenderTexture, Sprite, Text, Texture, TilingSprite,
} from "pixi.js";
import mapData from "./map.json";
import { GOBLIN_ANIMS, HUMAN_ANIMS, SKELETON_ANIMS, loadAll, sliceStrip, tileTexture } from "./assets.js";

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

export async function start(root, onProgress, onReady) {
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

  const tex = await loadAll(mapData, onProgress);
  const { width: MW, height: MH, layers } = mapData;
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
    const cols = isForest ? 10 : 64;
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
  for (const at of mapData.animTiles) {
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

  // ---------- decorative sprites ----------
  const DECL = {
    bird: 4, blinking: 12, chicken: 4, cow: 4, duck: 4, pig: 4, sheep: 4,
    coracle: 4, windmill: 9, tree1: 4, tree2: 4,
    smoke1: 30, smoke2: 30, smoke3: 30, smoke4: 30, smoke5: 30,
    fire1: 4, fire2: 4, glint1: 6, glint2: 4,
  };
  for (const sp of mapData.sprites) {
    let node;
    switch (sp.kind) {
      case "windmill":
        node = strip("windmill", 9, 9);
        node.anchor.set(0, 0);
        node.zIndex = sp.y + 104;
        break;
      case "smoke": {
        node = strip(`smoke${sp.variant}`, 30, 10);
        node.anchor.set(0.5, 1);
        node.alpha = 0.92;
        node.gotoAndPlay(Math.floor(Math.random() * 30));
        node.zIndex = 1e8; // above buildings
        break;
      }
      case "fire1": case "fire2":
        node = strip(sp.kind, 4, 8);
        node.anchor.set(0.5, 1);
        node.zIndex = sp.y;
        break;
      case "glint": {
        const g = Math.random() < 0.5 ? "glint1" : "glint2";
        node = strip(g, DECL[g], 5);
        node.anchor.set(0.5);
        node.alpha = 0.9;
        node.gotoAndPlay(Math.floor(Math.random() * DECL[g]));
        node.zIndex = -1e7;
        break;
      }
      case "coracle":
        node = strip("coracle", 4, 4);
        node.anchor.set(0.5, 0.8);
        node.zIndex = sp.y;
        node.__bob = Math.random() * Math.PI * 2;
        break;
      case "coracleLand":
        node = new Sprite(tex.coracleLand);
        node.anchor.set(0.5, 0.8);
        node.zIndex = sp.y;
        break;
      default: {
        // animals & misc strips
        node = strip(sp.kind, DECL[sp.kind] ?? 4, 3 + Math.random() * 3);
        node.anchor.set(0.5, 0.85);
        node.gotoAndPlay(Math.floor(Math.random() * (DECL[sp.kind] ?? 4)));
        node.zIndex = sp.y;
        if (Math.random() < 0.5 && ["chicken", "cow", "pig", "sheep", "duck", "bird"].includes(sp.kind)) node.scale.x = -1;
      }
    }
    node.position.set(sp.x, sp.y);
    world.addChild(node);
  }

  // ---------- NPCs ----------
  const EXPR = { chat: "ui_expr_chat", love: "ui_expr_love", confused: "ui_expr_confused", alerted: "ui_expr_alerted", attack: "ui_expr_attack", working: "ui_expr_working", stress: "ui_expr_stress", happy: "ui_happy" };
  const walkers = [];
  for (const npc of mapData.npcs) {
    const group = new Container();
    const parts = [];
    const addPart = (alias, declared) => {
      const a = new AnimatedSprite(sliceStrip(tex[alias], declared));
      a.anchor.set(0.5, 0.875);
      a.animationSpeed = 9 / 60;
      parts.push(a);
      group.addChild(a);
      return a;
    };
    if (npc.kind === "human") {
      const [, , n] = HUMAN_ANIMS[npc.anim];
      addPart(`h_base_${npc.anim}`, n);
      if (npc.hair) addPart(`h_${npc.hair}_${npc.anim}`, n);
      if (npc.tools) addPart(`h_tools_${npc.anim}`, n);
    } else if (npc.kind === "goblin") {
      addPart(`g_${npc.anim}`, GOBLIN_ANIMS[npc.anim]);
    } else {
      addPart(`s_${npc.anim}`, SKELETON_ANIMS[npc.anim]);
    }
    const offset = Math.floor(Math.random() * parts[0].totalFrames);
    for (const p of parts) p.gotoAndPlay(offset);
    if (npc.flip) group.scale.x = -1;
    if (npc.expression && EXPR[npc.expression]) {
      const e = new Sprite(tex[EXPR[npc.expression]]);
      e.anchor.set(0.5, 1);
      e.position.set(6, -30);
      e.scale.set(1.2);
      e.__bobBase = -30;
      group.__expr = e;
      group.addChild(e);
    }
    group.position.set(npc.x, npc.y);
    group.zIndex = npc.y;
    world.addChild(group);
    if (npc.waypoints) walkers.push({ group, wp: npc.waypoints.map(([x, y]) => ({ x: x * T, y: y * T })), i: 0, speed: npc.speed || 14 });
  }

  // ---------- location labels (banner sprites from the pack) ----------
  for (const lb of mapData.labels) {
    const c = new Container();
    const midW = Math.max(2, Math.ceil((lb.text.length * 6 + 6) / 16));
    const left = new Sprite(tex.ui_label_left);
    const mid = new TilingSprite({ texture: tex.ui_label_middle, width: midW * 16, height: 13 });
    const right = new Sprite(tex.ui_label_right);
    left.position.set(0, 0);
    mid.position.set(4, 0);
    right.position.set(4 + midW * 16, 0);
    const label = new Text({
      text: lb.text,
      style: { fontFamily: "Courier New, monospace", fontSize: 9, fontWeight: "bold", fill: 0xfff7e6, letterSpacing: 1 },
    });
    label.resolution = 8;
    label.anchor.set(0.5, 0.5);
    label.position.set((8 + midW * 16) / 2, 5.5);
    c.addChild(left, mid, right, label);
    c.pivot.set((8 + midW * 16) / 2, 6);
    c.position.set(lb.x, lb.y);
    c.zIndex = 5e7; // above houses, below clouds
    c.alpha = 0.95;
    world.addChild(c);
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
  app.stage.eventMode = "static";
  app.stage.hitArea = { contains: () => true };
  app.stage.on("pointerdown", (e) => {
    cam.dragging = true;
    cam.sx = e.global.x; cam.sy = e.global.y; cam.wx = cam.x; cam.wy = cam.y;
    app.canvas.style.cursor = closedCur;
  });
  app.stage.on("pointermove", (e) => {
    if (!cam.dragging) return;
    cam.x = cam.wx + (e.global.x - cam.sx);
    cam.y = cam.wy + (e.global.y - cam.sy);
    clampCam();
  });
  const endDrag = () => { cam.dragging = false; app.canvas.style.cursor = openCur; };
  app.stage.on("pointerup", endDrag);
  app.stage.on("pointerupoutside", endDrag);
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
  const zreset = uiButton(tex.ui_search, () => { cam.scale = 2.2; centerOn((mapData.width * T) / 2, (mapData.height * T) / 2 - 40); });
  function layoutUI() {
    const sw = app.screen.width, sh = app.screen.height;
    zin.position.set(sw - 40, sh - 150);
    zout.position.set(sw - 40, sh - 96);
    zreset.position.set(sw - 40, sh - 42);
  }
  layoutUI();
  app.renderer.on("resize", () => { layoutUI(); clampCam(); });

  // ---------- ticker: walkers, drift, bobbing ----------
  let t = 0;
  app.ticker.add((tick) => {
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

  // initial view: town plaza
  cam.scale = 2.2;
  centerOn(42 * T, 30 * T);
  // dev camera hook
  window.__cam = { centerOn, set: (s) => { cam.scale = s; clampCam(); } };
  window.__app = app;
  onReady?.();
  return app;
}
