# Sunnyside Cove

A complete, living town scene built entirely from the **Sunnyside World** asset pack —
no game logic, just a lovingly assembled world to pan around and zoom into.

Islands, a town plaza, farm with animals and crop plots, chapel + graveyard (with
skeletons), goblin camp, old mine with carts and ore, market beach with a pier,
houseboats, a lighthouse, windmills, a river with a waterfall... and ~26 villagers
going about their day (farming, fishing, mining, hammering, swimming, chatting).

## Stack

- **Bun** (package manager + scripts) — use bun only
- **Vite + React** (thin shell) + **PixiJS v8** (WebGL renderer)
- **Tauri 2** desktop app

## Run

```sh
bun install
bun run tauri dev   # desktop app
bun run dev         # or just the browser at http://localhost:1420
```

## Controls

- **Drag** to pan (hand cursor from the pack)
- **Mouse wheel** to zoom at cursor
- On-screen buttons (pack UI sprites): zoom in / zoom out / reset view

## How the scene is built

- `scripts/build_map.ts` (run via `bun run map`) generates `src/game/map.json`:
  an original island layout painted with the pack's tileset using autotile rules,
  animated-tile data, and positions for every sprite/NPC/label.
  Verified structures (houses, towers, the graveyard, mine, beach...) are lifted
  from the asset pack's own GameMaker example room data and rearranged into a new
  geography.
- At runtime the ~35k tiles are baked once into 3 render textures (ground +
  drifting cloud layers), so the scene renders at 60 FPS with only ~400 live
  display objects (animated tiles, characters, animals, VFX).
- Every visual element — tiles, characters, UI buttons, cursors, loading bar,
  location banners, expression bubbles — comes from the asset pack only.

Dev helpers in `scripts/`: Room1 decoder, tileset inspector, stamp extractor,
PowerShell map renderer (`render_room.ps1`), and a puppeteer screenshot harness
(`shot.ts`).
