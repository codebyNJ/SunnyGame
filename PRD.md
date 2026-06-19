# PRD — Sunnyside Builder (working title)

> A LEGO-style sandbox where you start with a blank seashore and freely
> drag-and-drop categorized assets to compose your own town. No levels, no
> objectives — pure creative building, save as many worlds as you like.

Status: **Draft v1** · Owner: nijeesh · Last updated: 2026-06-12

---

## 1. Vision

The pack (`Sunnyside_World_ASSET_PACK_V2.1`) ships ~1000 tiles and dozens of
animated props. The previous milestone proved we can render a complete,
living town from them at 60 FPS. This milestone flips the model: instead of
**one** hand-authored scene, the player gets the **box of bricks** and builds
their own. The assets become the product.

A session looks like:

1. App opens to a **main menu** (built from pack UI sprites) — not straight
   into the world.
2. Player picks **New World** → gets a blank seashore (sea + a starter patch
   of land, or fully blank, their choice).
3. A **categorized palette** sits at the edge of the screen. Player drags
   terrain, buildings, nature, characters, and props onto the canvas.
4. Tiles **snap to the grid**; characters/props/VFX **pin-point overlay** on
   top at free pixel positions.
5. Player **names regions** ("Harbour", "Old Town") with pack label banners.
6. Player **saves** the world and can come back to it, or start another.

## 2. Goals

- G1 — A working sandbox loop: place → move → delete → save → reload.
- G2 — Every asset **category** is reachable from the palette and placeable.
- G3 — Terrain painting that **autotiles** (coastline/cliffs/paths redraw
  live) so the player can sculpt the shore, not just decorate a fixed one.
- G4 — Sprite overlays placed at **arbitrary pixel positions** on top of the
  tile grid, with the animations from the pack playing.
- G5 — **Named regions** rendered with the pack's label sprites.
- G6 — A **pre-game UI** (main menu / world picker / loading screen).
- G7 — Stays lightweight: target 60 FPS with a moderately filled world.
- G8 — 100% of visible UI and content comes from the asset pack (continues
  the original constraint).

## 3. Non-goals (this milestone)

- No game logic, economy, win/lose, AI pathfinding, or simulation.
- No multiplayer / cloud sync.
- No in-app asset importing (only the bundled pack).
- No mobile/touch-first UX (desktop mouse + keyboard is the target; touch is
  a nice-to-have, not required).
- No undo *history browser* UI beyond simple undo/redo.

## 4. Platform & stack (unchanged)

- **Bun** for all package management and scripts — *bun only, never npm/yarn*.
- **Vite + React 19** thin shell, **PixiJS v8** WebGL renderer.
- **Tauri 2** desktop build (also runs in the browser at `localhost:1420`).
- Reuse the existing `src/game/assets.js` loader and the PixiJS engine
  (`src/game/engine.js`) — the camera/pan/zoom/cursor work is done.

## 5. Personas

- **The Builder** (primary) — wants to make a pretty town and show it off.
  Cares about: a rich palette, things looking right (autotiling), easy
  move/delete, saving multiple creations.
- **The Tinkerer** — wants pixel control: precise sprite placement, layering,
  flip/rotate, region labels exactly where they want them.

## 6. Core concepts & data model

The world is a single JSON document. Three placement primitives:

| Primitive | Bound to | Examples | Edit ops |
|---|---|---|---|
| **Terrain cell** | grid (autotiled) | sea, sand, grass, dirt, path, cliff | brush paint / erase |
| **Object (stamp)** | grid-snapped | house, farm plot, fence run, bridge, tree | place / move / delete / flip / rotate |
| **Sprite overlay** | free pixel pos | villager, animal, VFX, small prop, crate | place / move / delete / flip / pick anim |
| **Region** | rect + anchor | "Harbour", "Market" label | create / rename / move / recolor / delete |

### 6.1 World schema (`*.world.json`)

```jsonc
{
  "version": 1,
  "name": "My Town",
  "createdAt": "2026-06-12T...",
  "updatedAt": "2026-06-12T...",
  "grid": { "tile": 16, "width": 120, "height": 80 },
  "camera": { "x": 0, "y": 0, "scale": 2.2 },
  "terrain": {                      // per-cell terrain-type id; autotiled at render
    "types": ["sea","sand","grass","dirt","path"],
    "cells": "<RLE or flat Int8Array, width*height>"
  },
  "tiles": [                        // raw tiles painted individually (advanced)
    { "idx": 193, "x": 12, "y": 7, "flags": 0, "layer": "decoration_01" }
  ],
  "objects": [                      // grid-snapped multi-tile stamps
    { "id": "o1", "cat": "house_01", "x": 30, "y": 18, "flipX": false, "rot": 0, "z": 0 }
  ],
  "sprites": [                      // free pixel-position overlays (px in tile units)
    { "id": "s1", "cat": "villager", "px": 30.5, "py": 19.2, "kind": "human",
      "hair": "longhair", "tools": true, "anim": "idle", "flipX": false, "z": 0 }
  ],
  "regions": [
    { "id": "r1", "name": "Harbour", "x": 8, "y": 40, "w": 20, "h": 12, "color": "blue" }
  ]
}
```

- **Pin-point positioning:** `sprites[].px/py` are floats in tile units, so a
  villager can stand anywhere, overlapping tiles freely. Objects use integer
  grid `x/y`. `z` is an explicit z-bias on top of y-sorting for fine control.
  *(Decision: objects snap to grid, sprites are free pixel.)*
- **Rotation:** objects store `rot` ∈ {0,90,180,270}; rendering remaps each
  tile's GameMaker M/F/R flags so multi-tile stamps rotate as a unit (true 90°
  rotation, decided for MVP). Sprite overlays use flipX + free angle.
- **Storage:** real `.world.json` files on disk via **Tauri fs/dialog** from
  the start (decided). A browser `localStorage` fallback is kept only for the
  pure-web dev build where Tauri APIs are absent.
- **Resizable board:** `grid.width/height` can change after creation; terrain
  cells re-index and tiles/objects out of new bounds are clipped or shifted by
  an anchor. (Decided: resizable anytime.)

### 6.2 Catalog (`src/game/catalog.json`, generated)

A build-time script scans the pack and reuses the existing **stamp extractor**
to emit a palette manifest the UI consumes:

```jsonc
{
  "categories": [
    { "id": "terrain",  "label": "Terrain",  "items": [ {"cat":"grass","kind":"terrain","icon":"...","thumb":"..."} ] },
    { "id": "buildings","label": "Buildings","items": [ {"cat":"house_01","kind":"object","w":4,"h":5,"tiles":[...],"thumb":"..."} ] },
    { "id": "nature",   "label": "Nature",   "items": [ {"cat":"tree1","kind":"sprite","anim":"...","thumb":"..."} ] },
    { "id": "farm",     "label": "Farm",     "items": [...] },
    { "id": "fences",   "label": "Fences & Paths", "items": [...] },
    { "id": "people",   "label": "People",   "items": [...] },
    { "id": "animals",  "label": "Animals",  "items": [...] },
    { "id": "props",    "label": "Props",    "items": [...] },
    { "id": "vfx",      "label": "Effects",  "items": [...] }
  ]
}
```

Each item carries enough to (a) render a **thumbnail** in the palette and
(b) instantiate the right primitive on drop. Stamps come straight from the
already-built `scripts/extract_stamps.ts` output.

## 7. Feature requirements

Each feature lists acceptance criteria (AC).

### F1 — Pre-game UI / Main menu
- Full-screen menu before the world loads, built from pack UI sprites + label
  banners. Options: **New World**, **Load World**, **Continue** (last opened),
  **Settings** (sound/zoom defaults), **Quit** (Tauri).
- World picker lists saved worlds with name + thumbnail + updated date.
- AC: launching the app shows the menu, not the canvas; New World creates and
  opens a blank world; Load opens a saved one; the existing pack loading
  screen plays while assets load.

### F2 — Blank canvas / New World
- New World dialog: name, board size (S/M/L), starter = **Blank sea** or
  **Starter island** (a small autotiled sand+grass patch in the centre).
- Board is **resizable after creation** (grow/shrink via a Settings/board
  panel); terrain re-indexes around an anchor edge, out-of-bounds content is
  clipped.
- AC: a new world renders an empty sea (animated water tiles) at the chosen
  size; camera centred; ready to build; resizing the board later preserves
  existing content and re-bakes correctly.

### F3 — Categorized asset palette
- Docked, collapsible panel. Category tabs (icons from pack). Scrollable grid
  of item thumbnails. Search box (pack `search.png`) filters by name.
- AC: every category in §6.2 is present and shows correct thumbnails; clicking
  a category switches the grid; search narrows results.

### F4 — Placement (grid-snap objects & tiles)
- Drag an item from the palette onto the canvas, OR click-to-arm then click on
  canvas to place. A **ghost preview** follows the cursor and snaps to the
  grid; red tint if blocked/out of bounds.
- Objects occupy their footprint; placing writes tiles into the right layers.
- AC: dropping a house places its full multi-tile stamp grid-aligned; ghost
  preview shows before commit; placement is undoable.

### F5 — Sprite overlay with pin-point positioning
- Characters, animals, VFX, and small props place at **free pixel positions**
  on top of the tiles (not grid-locked). While armed, the ghost follows the
  cursor at sub-tile precision; holding a modifier (e.g. Alt) disables any
  snap entirely.
- Placed sprites animate (idle/walk/etc. from the pack) and y-sort against
  objects so they occlude correctly.
- AC: a villager can be dropped half-overlapping a house roof and stands at
  the exact pixel; its idle animation plays; it sorts in front of/behind
  taller objects by y; can be nudged with arrow keys.

### F6 — Terrain brush + autotiling
- Brush tool paints a terrain type per grid cell; the renderer **autotiles**
  edges (sea↔sand↔grass↔dirt↔path) and draws **cliffs/foam** on coastlines
  using the rules already derived in `scripts/derive_autotile.ts`.
- Brush sizes (1×1, 3×3), plus an eraser (paint back to sea).
- AC: painting grass into the sea grows a coastline with correct beach edges
  and cliff skirt; erasing restores water with foam; no seams.

### F7 — Select / transform / delete
- Click to select an object/sprite (highlight outline). Drag to move. Delete
  key removes. Flip-X (`F`) and **true 90° rotate** (`R`) for objects — the
  stamp's tiles are remapped (position + M/F/R flags) so it rotates as a unit.
- Marquee select for multi-move/delete (stretch).
- AC: selecting, moving, flipping, deleting work and are undoable; pressing R
  rotates a multi-tile house 90° with correct tile orientation and footprint;
  selection outline uses a pack UI element.

### F8 — Layering & z-order
- Automatic y-sorting for overlays/objects; manual **bring-forward /
  send-back** for fine cases; terrain/tiles render under everything.
- AC: a tree placed below a house occludes it correctly; manual z override
  visibly reorders two overlapping sprites.

### F9 — Region naming
- Region tool: drag a rectangle, type a name → renders a pack **label banner**
  (`label_left/middle/right`) anchored to the region. Regions are movable,
  renamable, recolorable, deletable. A toggle hides all region labels.
- AC: creating "Harbour" shows the banner over that area; it persists in the
  save; toggling labels hides/shows them without affecting the world.

### F10 — Save / load / multiple worlds
- Manual **Save** + **Save As**; autosave on a debounce. Worlds are real
  `.world.json` files on disk via **Tauri fs/dialog** (decided). A default
  worlds folder holds the library the picker lists; Save As opens a native
  dialog. Each save captures a **thumbnail** (render-to-texture snapshot)
  stored alongside (sidecar PNG or embedded base64) for the picker. Pure-web
  dev build falls back to `localStorage` + file download.
- AC: save → relaunch app → world reappears in the picker with its thumbnail
  and reopens identically; multiple independent world files coexist; Save As
  to a chosen path works.

### F11 — Camera (reuse)
- Drag-pan, wheel-zoom-at-cursor, on-screen zoom buttons, hand cursors — all
  already implemented in `engine.js`; integrate with build mode (panning must
  not fire placement; e.g. space-drag to pan, or pan with the same drag when
  no tool is armed).
- AC: panning/zooming never accidentally places or deletes; cursor reflects
  current tool (hand vs. crosshair vs. brush).

### F12 — Export image (stretch)
- "Export PNG" renders the whole board (or current view) to an image file.
- AC: produces a clean PNG of the world at native pixel scale.

## 8. UX / interaction model

- **Modes/tools** (toolbar, pack icons): Select, Place (from palette), Brush
  (terrain), Region, Pan. Esc cancels the armed tool back to Select.
- **Keyboard:** Del = delete, F = flip, R = rotate, Ctrl+Z/Ctrl+Shift+Z =
  undo/redo, Ctrl+S = save, arrows = nudge selected sprite, Space = temporary
  pan.
- **Feedback:** ghost preview, snap highlight, invalid-placement tint,
  selection outline, toast confirmations — all from pack sprites where one
  exists; otherwise minimal.

## 9. Performance requirements

- Baked terrain/tiles into render textures (as today); only sprites/animated
  tiles/regions are live display objects.
- Re-bake terrain **incrementally** (dirty-rect) on brush edits, not full
  rebake per stroke.
- Targets: 60 FPS while panning a moderately filled board (~ a few hundred
  overlays); placement latency < 1 frame for the ghost; save < 200 ms.

## 10. Success metrics

- A first-time user can build and save a recognizable little town in < 10 min
  without instructions beyond tooltips.
- All 9 palette categories usable; no category is a dead end.
- 60 FPS sustained on the reference machine with a medium board.
- Zero non-pack visual assets shipped.

## 11. Resolved decisions (2026-06-12)

- **OQ1 — Placement:** objects grid-snapped, sprites free pixel. ✅ decided.
- **OQ2 — Undo depth:** last 50 actions for MVP.
- **OQ3 — Storage:** Tauri file IO (`.world.json` on disk) from the start;
  localStorage only as the pure-web dev fallback. ✅ decided.
- **OQ4 — Board size:** resizable after creation (re-index + clip). ✅ decided.
- **OQ5 — Rotation:** true 90° rotation for multi-tile stamps now (per-tile
  position + M/F/R flag remap), not flip-only. ✅ decided.

### Still open

- The 90° tile-flag remap must be validated against the pack's autotile sets
  (some directional tiles may lack a rotated variant; fall back to flag-based
  rotation where a dedicated tile doesn't exist) — to verify in P2.
- Thumbnail storage: sidecar PNG next to the `.world.json` vs. embedded
  base64 — pick during P1.

## 12. Phasing (see `task.md` for the breakdown)

- **P0** Catalog + data model + render a saved world (no editing).
- **P1** Main menu + new/load/save loop on **Tauri file IO** (`.world.json`).
- **P2** Palette UI + object placement (ghost, snap, commit, **90° rotate**,
  undo).
- **P3** Sprite overlay placement (pin-point) + select/move/delete.
- **P4** Terrain brush + incremental autotiling.
- **P5** Region naming + layering + **board resize** + polish.
- **P6** (stretch) export PNG, marquee/multi-select, touch.
