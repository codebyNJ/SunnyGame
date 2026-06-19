# task.md — Sunnyside Builder

Task breakdown for the sandbox builder described in [PRD.md](PRD.md).
Checkbox list, grouped by phase. Each phase is shippable on its own.

Conventions: **bun only** · pack-only visuals · reuse `src/game/engine.js`
camera & `src/game/assets.js` loader · world state lives in one JSON doc.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · ⛏ = build script ·
🎨 = UI/React · 🧩 = engine/PixiJS · 💾 = data/persistence.

---

## P0 — Foundations: catalog + data model + read-only render ✅ DONE

Goal: load a hand-written `*.world.json` and render it (no editing yet).

- [x] ⛏ `scripts/build_catalog.ts` → `src/game/catalog.json` (25 structure
      stamps via connected-components on Room1 cores + curated tile-kits +
      sprite/crop tables; embeds terrain autotile sets + anim table). Added
      `catalog` + `worlds` npm scripts. 30 KB, 9 categories.
- [x] ⛏ Thumbnails: `src/game/thumbs.js` builds palette swatch nodes at runtime
      from already-loaded textures (objects composite tile-layers; sprites take
      a square first frame; crops/terrain use the single tile/image). No extra
      files. (Visual tuning happens with the P2 palette.)
- [x] 💾 `src/game/world.js`: `createBlankWorld(opts)`, `WORLD_VERSION`, RLE
      encode/decode, `validateWorld`, `STANDARD_LAYERS`/`LAYER_DEPTH`.
- [x] 🧩 `src/game/compile.js` — world doc → render model (terrain autotile,
      object stamps → layers, raw `tileLayers` hatch, animTiles derive, sprite
      overlays → sprites/npcs split, regions → labels). `engine.js` now calls
      `compileWorld(worldDoc)`; `App.jsx` fetches `/worlds/<name>.world.json`
      (`?world=` selectable); camera reads the world's stored home view.
- [x] 🧩 `scripts/convert_map_to_world.ts` → `public/worlds/sample.world.json`
      with a **byte-parity assertion** (compileWorld output == map.json: all 13
      layers, animTiles, sprites, npcs, labels). Plus
      `scripts/make_starter_world.ts` → `starter.world.json` exercising the
      semantic path (terrain cells, catalog stamps, pin-point sprites, region).
- [x] ✅ Exit check: sample renders **identical** (byte-proven + visual);
      starter proves the build path; **60 FPS, 440 world children, no page
      errors**; pan/zoom intact; `bunx vite build` passes.

## P1 — Shell: main menu + new/load/save loop (Tauri file IO) ✅ DONE

Goal: app boots to a menu; can create, open, and persist worlds to disk.

- [x] 🎨 `src/ui/MainMenu.jsx` — title banner + New World · Continue (when a
      last-world exists) · Load · Quit (Tauri only). Pack `Box.jsx` primitives
      (9-slice panel, label-banner button, itemdisc).
- [x] 🎨 `src/ui/NewWorldDialog.jsx` — name, size S/M/L (60×40 / 100×56 /
      140×90), starter Blank Sea / Starter Island.
- [x] 🎨 `src/ui/WorldPicker.jsx` — grid of saved worlds (name, mini-map
      thumbnail, size, updated) + delete + Import File.
- [x] 💾 `src/ui/storage.js` — one API, two backends. **Tauri**: `.world.json`
      files in `$APPDATA/worlds` via `plugin-fs`; Save As / Import via
      `plugin-dialog`. **Web fallback**: `localStorage` + download/upload.
      Thumbnail **embedded as base64** (decided: one file, no orphan sidecars).
      Added `tauri-plugin-fs`/`tauri-plugin-dialog` (JS + Rust) + capability
      allowlist (`$APPDATA/**`); `cargo check` passes.
- [x] 🧩 Engine returns a handle: `snapshot()` (whole-world mini-map data URL),
      `getCamera()` (stored home view), `destroy()`. Loader made idempotent so
      menu→play→menu→play never double-registers aliases.
- [x] 🎨 `src/ui/GameView.jsx` + `App.jsx` state machine: `menu → play` with the
      pack loading screen inside GameView; in-build top bar (Back · Save ·
      Save As) + save toast; new worlds auto-register on first open.
- [x] ✅ Exit check (web-fallback, puppeteer): Menu → New World → build →
      auto-register + Save (thumbnail + camera persisted) → **full page reload**
      → Load World shows the saved card with mini-map thumbnail → reopens; menu
      shows Continue; no page errors. Tauri path wired + compiles (`cargo
      check` clean, plugins in `Cargo.lock`).

## P2 — Object placement (grid-snapped) + undo ✅ DONE

Goal: drag buildings/fences/trees-as-objects from the palette onto the grid.

- [x] 🎨 `src/ui/Palette.jsx` — docked, collapsible, 9 category tabs, thumbnail
      grid (rendered at runtime via `engine.thumb()` from loaded textures),
      search box. Reads `catalog.json`.
- [x] 🧩 Tool/mode state lives in the engine (`pan`/`place`/`select`); armed
      catalog item; Esc cancels. Architecture decision: objects render as
      **live editable nodes** (compile.js passes them through; engine builds a
      Container per object) so placement/edit never re-bakes the ground.
- [x] 🧩 Ghost preview: follows cursor, snaps to grid, footprint outline,
      red tint when out of bounds.
- [x] 🧩 Commit placement → push object to `world.objects` + add live node (no
      re-bake); undoable.
- [x] 🧩 **True 90° rotation** (`R`) + flipX (`F`) via `tiles.js`
      `transformObject` — derived D4 flag-permutation tables remap each tile's
      position + M/F/R bits so a stamp rotates as a unit. Flag rotation is
      universal (no dedicated rotated variants needed); unit-tested (rot×4 =
      flip×2 = identity).
- [x] 💾 `src/game/history.js` — undo/redo command stack (place/move/delete/
      flip), depth ≤ 50; Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y.
- [x] 🧩 Pan vs. place: drag = pan, click = place; Space forces pan; cursor
      reflects tool (crosshair/grab).
- [x] ✅ Exit check (puppeteer): armed East-Coast stamp, ghost preview, placed +
      rotated 90°, dirty indicator, undo — all verified; build passes.

## P3 — Sprite overlays (pin-point) + select/move/delete ✅ DONE

Goal: characters/animals/VFX/props placed at free pixel positions on top.

- [x] 🧩 Refactored sprite/npc rendering into reusable builders; ALL entities
      (initial + placed) are now live editable nodes built from `world.sprites`
      (stable ids assigned to legacy entries). `assets.js` `ensureTextures()`
      lazily loads a placed entity's character/crop strips and merges them into
      the engine `tex` map.
- [x] 🧩 Sprite placement: free-pixel ghost (half-tile snap, **Alt = no snap**);
      commits to `world.sprites[]` with `px/py` floats.
- [x] 🧩 Per-sprite options bar: animation + hair + tools for humans, flipX —
      driven by `catalog.options` (anims/hairs/tools per character).
- [x] 🧩 y-sort overlays + objects together by foot (`entityZ`); special z for
      smoke/glint/windmill preserved.
- [x] 🧩 Select tool: manual hit-test (tight foot box for characters), yellow
      selection outline, drag-move (objects grid-snap, sprites free/Alt),
      arrow-key nudge (1 tile / 1 px), Del to delete, F to flip.
- [x] 💾 History extended: object+sprite move/delete/flip; place-sprite.
- [x] ✅ Exit check (puppeteer): villager dropped at exact pixel over the island,
      idles, y-sorts vs. trees/house, select→move→flip→delete, 3× undo restores
      position→facing→existence; new-world place(2 objects + villager) → Save →
      full reload → reopen persists all. No page errors; `vite build` passes.

## P4 — Terrain brush + autotiling ✅ DONE

Goal: sculpt the coastline, not just decorate a fixed one.

- [x] 🧩 `src/game/terrain.js` — shared `computeTerrain(cells, types, W, H)`:
      sea fill + grass/path/river autotile + ported `coastSkirt` (1-tile cliff
      lips + foam, corner wraps). Single source of truth for compile.js AND the
      engine's live re-bake. (Starter island now renders cliffs + animated foam;
      sample parity preserved since it has no `terrain`.)
- [x] 🧩 Brush tool: paint terrain-type per cell, sizes **1×1 / 3×3**, eraser =
      paint Sea. Arming a Terrain palette item sets `brushType` (adds the type
      to `world.terrain.types` on demand); brush outline ghost follows cursor.
- [x] 🧩 Live autotile via full CPU recompute (cheap, whole-board array math) +
      **diff** against current layer cells → exact changed-tile set.
- [x] 🧩 Incremental **dirty-rect GPU re-bake**: only the changed bbox is
      redrawn onto `groundRT` (`clear:false`; opaque sea fills the rect so the
      full layer stack overwrites cleanly) — no full rebake.
- [x] 💾 One undo command per **stroke** (pointerdown→up accumulates pre-stroke
      cell types; undo/redo recompute + re-bake).
- [x] 🧩 Pan vs. paint: drag paints; Space forces pan.
- [x] ✅ Exit check (puppeteer): painted grass into the sea → correct beach +
      cliffs + foam, seamless autotile with the existing coast; erased (Sea
      brush) → water returns cleanly; undo restored the stroke; **60 FPS**
      (browser rAF), single canvas, no page errors; `vite build` passes.

## P5 — Regions + layering + polish ✅ DONE

Goal: name areas, fine z-control, and make it feel finished.

- [x] 🧩 Region tool: drag a rectangle → creates a named pack **label banner**
      (`label_left/middle/right`); live editable nodes. Select to **move**
      (drag/arrows), **rename** (inline input), **recolor** (5 tint swatches),
      **delete**; global **LABELS** show/hide toggle. All undoable.
- [x] 🧩 **Board resize**: BOARD panel sets new width/height; re-indexes terrain
      cells (center anchor), shifts objects/sprites/regions, clips out-of-bounds,
      re-bakes at the new size by mutating the doc + remounting the engine.
      *(Fix: unmount→tick→remount so the old engine tears down before the new
      one inits — concurrent Pixi apps corrupt the shared texture pool; also
      hardened `snapshot()`.)* Not wired into the undo stack (engine history is
      per-session); content is preserved so the user can resize back.
- [x] 🎨 Layering: **▲ FWD / ▼ BACK** on a selected object/sprite — a `z` bias
      (`Z_BIAS`) added on top of foot y-sort. Undoable.
- [x] 🎨 Toolbar (Pan/Select/Region + Labels/Board/Help) with **tooltips**;
      **keyboard-help overlay** (`?` → SHORTCUTS panel) from the pack 9-slice box.
- [x] 🧩 Empty-board affordance: centered hint until the first edit (`touched`).
- [~] 🎨 Settings (default zoom / animation toggle / autosave interval) —
      deferred to P6; not needed for the exit check.
- [x] ✅ Exit check (puppeteer): fresh New World shows the hint; help overlay
      lists shortcuts; placed a tree, dragged a region + named it "DOCKS" +
      recolored; **resized 100×56 → 120×80 with all content preserved &
      re-centered**; no page errors; `vite build` passes.

## P6 — Stretch / fast-follow ✅ DONE (core items)

- [x] 🧩 **Export PNG** of the whole board: `engine.exportImage()` renders the
      world to a native-res RT (capped 4096) → data URL; `storage.savePng`
      downloads (web) or saves via Tauri dialog. Verified a valid 187 KB PNG.
- [x] 🧩 **Marquee multi-select**: drag an empty area (Select tool) to box-select;
      Shift/Ctrl-click toggles. **Multi-move** (group drag, snap by type),
      **multi-delete** (Del), arrow-nudge — all over a unified selection array
      across objects/sprites/regions. Verified 8-entity marquee + group move +
      Del (8→2 sprites). *(Fixed: Del/arrows were gated on single-select.)*
- [x] 🎨 **Settings** (deferred from P5): **animation on/off** toggle (ANIM ↔
      ANIM✕, stops/plays all `AnimatedSprite`s) + **debounced autosave** (4 s
      after an edit, once the world has a library id). Verified.
- [x] 🧩 **Touch/trackpad**: single-finger drag pans, mouse-wheel + trackpad
      pinch (`ctrl`+wheel) zoom — all work via the existing pointer/wheel paths.
      Two-finger *touchscreen* pinch deferred (Pixi's single-pointer model makes
      it fragile; can't verify headless).
- [x] 🧩 **Share export of a world file**: covered by Save As (P1) —
      `.world.json` download (web) / native save dialog (Tauri).
- [~] Cloud share: out of scope (no backend); local file share covers it.

> Moved into core per 2026-06-12 decisions: Tauri file IO → P1, true 90°
> rotation → P2, board resize → P5.

### Known follow-ups (not blocking)
- Tauri write to paths **outside `$APPDATA`** (Save As / Export PNG to a chosen
  folder) needs broader `fs` scope in `capabilities/default.json`; not added to
  avoid breaking the Tauri build with unverified permission ids. Web build works
  fully (download). Verify under `bun run tauri dev` and widen scope as needed.
- Board resize isn't in the per-session undo stack (engine history resets on the
  resize remount); content is preserved so the user can resize back.

---

## Cross-cutting / definition of done

- [ ] All scripts run under **bun**; no npm/yarn invocations anywhere.
- [ ] Every shipped pixel originates from the asset pack.
- [ ] `bunx vite build` passes; Tauri build packages cleanly.
- [ ] Verify via puppeteer on the dev server (`localhost:1420`) — **never**
      OS-level screen-capture of the Tauri window (per prior direction).
- [ ] Save format is versioned (`world.version`) with a migration note when it
      changes.

## Suggested first slice (smallest end-to-end demo)

P0 catalog + read-only render → P1 menu + save/load → **P2 just `house_01`
placement**. That alone is a usable, demoable loop; everything after widens it.

## Decisions locked (2026-06-12)

- ✅ Objects snap to grid, sprites are free pixel placement.
- ✅ Tauri file IO (`.world.json` on disk) from the start; localStorage = web
  fallback only.
- ✅ Board resizable after creation.
- ✅ True 90° rotation for multi-tile stamps in the MVP.

Remaining to verify in-flight: 90° tile-flag remap vs. autotile sets (P2);
thumbnail sidecar-PNG vs. embedded-base64 (P1).
