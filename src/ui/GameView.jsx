// Build view: hosts the PixiJS engine for one world doc, the asset palette, the
// edit toolbar (tools, undo/redo, regions, layering, board resize), the pack loading
// screen, and Save / Save As / Menu. The engine owns editing + history; React mirrors.
import { useEffect, useRef, useState } from "react";
import { start } from "../game/engine.js";
import { Banner, Disc, Box } from "./Box.jsx";
import Palette from "./Palette.jsx";
import catalog from "../game/catalog.json";
import { rleDecode, rleEncode } from "../game/world.js";
import { saveWorld, exportWorld, savePng, setLastWorld } from "./storage.js";

const UI = "/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets/UI";
const BARS = ["greenbar_00", "greenbar_01", "greenbar_02", "greenbar_03", "greenbar_04", "greenbar_05", "greenbar_06"];
const EMPTY_ED = { tool: "pan", armedId: null, armKind: null, rot: 0, flipX: false, sprite: {}, selectedId: null, selectedType: null, regionsVisible: true, canUndo: false, canRedo: false };
const ITEMS = Object.fromEntries(catalog.categories.flatMap((c) => c.items).map((it) => [it.id, it]));
const SWATCH = { cream: "#fff7e6", blue: "#9fd4ff", green: "#bdf0a6", pink: "#ffb3cb", gold: "#ffd98a" };
const COLORS = ["cream", "blue", "green", "pink", "gold"];

export default function GameView({ world, worldId, onExit, onSavedId, onReplaceWorld }) {
  const rootRef = useRef(null);
  const engineRef = useRef(null);
  const idRef = useRef(worldId || null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState((world.objects?.length || 0) + (world.sprites?.length || 0) > 0);
  const [ed, setEd] = useState(EMPTY_ED);
  const [overlay, setOverlay] = useState(null); // null | "board" | "help"

  useEffect(() => {
    let handle, cancelled = false, offs = [];
    (async () => {
      const h = await start(rootRef.current, world, (p) => setProgress(p), () => {});
      if (cancelled) { h.destroy(); return; }
      handle = h;
      engineRef.current = h;
      window.__engine = h; // reliable live-engine handle (window.__app is racy under StrictMode)
      offs.push(h.onEditor(setEd));
      offs.push(h.onDirty(() => { setDirty(true); setTouched(true); }));
      setReady(true);
      if (!idRef.current) await persist();
    })();
    return () => { cancelled = true; offs.forEach((f) => f?.()); if (window.__engine === handle) window.__engine = null; if (handle) handle.destroy(); engineRef.current = null; };
  }, [world]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 1600); };

  async function persist() {
    const eng = engineRef.current;
    if (!eng || busy) return;
    setBusy(true);
    try {
      const thumbnail = await eng.snapshot();
      const doc = { ...world, camera: eng.getCamera() };
      const { id } = await saveWorld(doc, { id: idRef.current, thumbnail });
      idRef.current = id; setLastWorld(id); setDirty(false); onSavedId?.(id);
      flash("SAVED");
    } catch (e) { flash("SAVE FAILED"); console.error("save failed", e); }
    finally { setBusy(false); }
  }

  async function saveAs() {
    const eng = engineRef.current;
    if (!eng) return;
    const where = await exportWorld({ ...world, camera: eng.getCamera(), updatedAt: new Date().toISOString() });
    if (where) flash("EXPORTED");
  }

  async function exportPng() {
    const eng = engineRef.current;
    if (!eng) return;
    flash("RENDERING…");
    const url = await eng.exportImage();
    if (!url) { flash("EXPORT FAILED"); return; }
    const where = await savePng(url, world.name || "sunnyside");
    if (where) flash("PNG SAVED");
  }

  // debounced autosave on edits (only once the world has a library id)
  useEffect(() => {
    if (!dirty || !idRef.current) return;
    const t = setTimeout(() => persist(), 4000);
    return () => clearTimeout(t);
  }, [dirty]);

  // board resize: re-index terrain + shift/clip entities (center anchor), then remount
  function applyResize(newW, newH) {
    const eng = engineRef.current;
    const w0 = world.grid.width, h0 = world.grid.height;
    const dx = Math.floor((newW - w0) / 2), dy = Math.floor((newH - h0) / 2);
    const old = rleDecode(world.terrain.cells, w0 * h0);
    const next = new Array(newW * newH).fill(0);
    for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < newW && ny < newH) next[ny * newW + nx] = old[y * w0 + x];
    }
    const cam = eng ? eng.getCamera() : world.camera;
    const doc = {
      ...world,
      grid: { ...world.grid, width: newW, height: newH },
      terrain: { ...world.terrain, cells: rleEncode(next) },
      objects: world.objects.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })).filter((o) => o.x < newW && o.y < newH && o.x > -6 && o.y > -6),
      sprites: world.sprites.map((s) => ({ ...s, px: s.px + dx, py: s.py + dy })).filter((s) => s.px > -2 && s.py > -2 && s.px < newW + 2 && s.py < newH + 2),
      regions: world.regions.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })),
      camera: cam ? { ...cam, cx: cam.cx + dx * 16, cy: cam.cy + dy * 16 } : undefined,
    };
    setOverlay(null);
    onReplaceWorld(doc);
  }

  const eng = engineRef.current;
  const bar = BARS[Math.min(BARS.length - 1, Math.round(progress * (BARS.length - 1)))];
  const armedItem = ed.armedId ? ITEMS[ed.armedId] : null;
  const opts = armedItem?.options;
  const selRegion = ed.selectedType === "region";

  return (
    <div className="game-root" ref={rootRef}>
      {ready && (
        <>
          <div className="build-bar">
            <Disc icon="arrow_left" onClick={onExit} title="Back to menu" />
            <Banner className="small" onClick={persist}>{dirty ? "SAVE •" : "SAVE"}</Banner>
            <Banner className="small" onClick={saveAs}>SAVE AS…</Banner>
            <span className="bar-sep" />
            <Disc icon="arrow_left" className={`undo ${ed.canUndo ? "" : "off"}`} onClick={() => eng?.undo()} title="Undo (Ctrl+Z)" />
            <Disc icon="arrow_right" className={`redo ${ed.canRedo ? "" : "off"}`} onClick={() => eng?.redo()} title="Redo (Ctrl+Shift+Z)" />
            <span className="bar-sep" />
            <button className={`tool-btn ${ed.tool === "pan" ? "on" : ""}`} onClick={() => eng?.setTool("pan")} title="Pan / navigate (Space to pan in any tool)">✋ PAN</button>
            <button className={`tool-btn ${ed.tool === "select" ? "on" : ""}`} onClick={() => eng?.setTool("select")} title="Select & move (click an item, drag to move, Del to delete)">◹ SELECT</button>
            <button className={`tool-btn ${ed.tool === "region" ? "on" : ""}`} onClick={() => eng?.setTool("region")} title="Region: drag a box to label an area">▭ REGION</button>
            <span className="bar-sep" />
            <button className={`tool-btn ${ed.regionsVisible ? "" : "on"}`} onClick={() => eng?.toggleLabels()} title="Show / hide region labels">{ed.regionsVisible ? "LABELS" : "LABELS✕"}</button>
            <button className="tool-btn" onClick={() => setOverlay("board")} title="Resize the board">BOARD</button>
            <button className={`tool-btn ${ed.animOn ? "" : "on"}`} onClick={() => eng?.setAnimated(!ed.animOn)} title="Play / pause animations">{ed.animOn ? "ANIM" : "ANIM✕"}</button>
            <button className="tool-btn" onClick={exportPng} title="Export the whole board as a PNG image">⤓ PNG</button>
            <button className="tool-btn" onClick={() => setOverlay("help")} title="Keyboard shortcuts">?</button>
          </div>

          {ed.armedId && ed.armKind === "terrain" && (
            <div className="arm-bar">
              <span className="arm-name">PAINTING {armedItem?.label?.toUpperCase()}</span>
              <button className={`tool-btn ${ed.brushSize === 1 ? "on" : ""}`} onClick={() => eng?.setBrushSize(1)}>1×1</button>
              <button className={`tool-btn ${ed.brushSize === 3 ? "on" : ""}`} onClick={() => eng?.setBrushSize(3)}>3×3</button>
              <Banner className="small" onClick={() => eng?.cancelArm()}>DONE (ESC)</Banner>
            </div>
          )}

          {ed.armedId && ed.armKind !== "terrain" && (
            <div className="arm-bar">
              <span className="arm-name">PLACING {armedItem?.label?.toUpperCase()}{ed.armKind === "object" ? ` · ${ed.rot}°` : ""}{ed.flipX ? " · flip" : ""}</span>
              {ed.armKind === "object" && <Banner className="small" onClick={() => eng?.rotateArmed()}>ROTATE (R)</Banner>}
              {opts?.anims && (
                <select className="arm-sel" value={ed.sprite?.anim || ""} onChange={(e) => eng?.setArmOption("anim", e.target.value)}>
                  {opts.anims.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
              {opts?.hairs && (
                <select className="arm-sel" value={ed.sprite?.hair || ""} onChange={(e) => eng?.setArmOption("hair", e.target.value)}>
                  {opts.hairs.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              )}
              {opts?.tools && (
                <button className={`tool-btn ${ed.sprite?.tools ? "on" : ""}`} onClick={() => eng?.setArmOption("tools", !ed.sprite?.tools)}>TOOLS</button>
              )}
              <Banner className="small" onClick={() => eng?.flipArmed()}>FLIP (F)</Banner>
              <Banner className="small" onClick={() => eng?.cancelArm()}>DONE (ESC)</Banner>
            </div>
          )}

          {!ed.armedId && ed.selectedId && !selRegion && (
            <div className="arm-bar">
              <span className="arm-name">SELECTED {ed.selectedType?.toUpperCase()}</span>
              <Banner className="small" onClick={() => eng?.flipSelected()}>FLIP (F)</Banner>
              <button className="tool-btn" onClick={() => eng?.layerSelected(1)} title="Bring forward">▲ FWD</button>
              <button className="tool-btn" onClick={() => eng?.layerSelected(-1)} title="Send back">▼ BACK</button>
              <Banner className="small" onClick={() => eng?.deleteSelected()}>DELETE (DEL)</Banner>
            </div>
          )}

          {!ed.armedId && ed.selectedCount > 1 && (
            <div className="arm-bar">
              <span className="arm-name">{ed.selectedCount} SELECTED</span>
              <Banner className="small" onClick={() => eng?.deleteSelected()}>DELETE ALL (DEL)</Banner>
            </div>
          )}

          {!ed.armedId && selRegion && (
            <div className="arm-bar">
              <span className="arm-name">REGION</span>
              <input className="region-name" key={ed.selectedId} defaultValue={ed.selectedName || ""} placeholder="name…"
                onKeyDown={(e) => { if (e.key === "Enter") { eng?.renameSelected(e.target.value); e.target.blur(); } }}
                onBlur={(e) => eng?.renameSelected(e.target.value)} />
              <div className="swatches">
                {COLORS.map((c) => (
                  <button key={c} className={`swatch ${ed.selectedColor === c ? "on" : ""}`} style={{ background: SWATCH[c] }}
                    title={c} onClick={() => eng?.recolorSelected(c)} />
                ))}
              </div>
              <Banner className="small" onClick={() => eng?.deleteSelected()}>DELETE</Banner>
            </div>
          )}

          {!touched && (
            <div className="empty-hint">
              <p>Pick a piece from the <b>palette</b> → and click to place it.</p>
              <p>Use <b>BUILD ▸ Terrain</b> to paint land & sea, <b>REGION</b> to name areas.</p>
            </div>
          )}

          <Palette engine={eng} armedId={ed.armedId} terrainEnabled={ed.terrainEnabled} onArm={(item) => eng?.arm(item)} />
          <div className={`build-toast ${toast ? "show" : ""}`}>{toast}</div>
        </>
      )}

      {overlay === "board" && <BoardPanel world={world} onApply={applyResize} onCancel={() => setOverlay(null)} />}
      {overlay === "help" && <HelpOverlay onClose={() => setOverlay(null)} />}

      {!ready && (
        <div className="loading">
          <div className="load-sky" />
          <div className="clouds">
            <i className="cloud cl1" /><i className="cloud cl3" /><i className="cloud cl2" />
          </div>
          <div className="ground load-ground">
            <div className="grass-edge" />
            <i className="spr windmill load-windmill" />
            <i className="spr tree2 load-tree" />
            <span className="walker"><i className="spr walk base" /><i className="spr walk hair" /><i className="spr walk tools" /></span>
            <i className="spr sheep load-sheep" />
          </div>
          <div className="load-card">
            <div className="loading-banner">
              <img src={`${UI}/label_left.png`} alt="" />
              <img className="mid" src={`${UI}/label_middle.png`} alt="" />
              <img src={`${UI}/label_right.png`} alt="" />
              <span>{world.name?.toUpperCase() || "SUNNYSIDE"}</span>
            </div>
            <div className="load-bar">
              <img className="loading-bar" src={`${UI}/${bar}.png`} alt="" />
              <span className="load-pct">{Math.round(progress * 100)}%</span>
              <img className="loading-timer" src={`${UI}/sandtimer.png`} alt="" />
            </div>
            <div className="load-tips">
              <span>Shaping the coastline…</span>
              <span>Planting trees &amp; flowers…</span>
              <span>Waking the villagers…</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BoardPanel({ world, onApply, onCancel }) {
  const [w, setW] = useState(world.grid.width);
  const [h, setH] = useState(world.grid.height);
  const clamp = (v) => Math.max(20, Math.min(240, v | 0));
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <Box theme="w" className="panel" style={{ width: "min(420px, 92vw)" }}>
        <h2>BOARD SIZE</h2>
        <p style={{ fontSize: 12, textAlign: "center", marginBottom: 12 }}>Content stays centered; tiles outside the new bounds are trimmed.</p>
        <div className="choice-group" style={{ marginBottom: 14 }}>
          <label style={{ flex: 1 }}>WIDTH<input type="number" value={w} min={20} max={240} onChange={(e) => setW(+e.target.value)} /></label>
          <label style={{ flex: 1 }}>HEIGHT<input type="number" value={h} min={20} max={240} onChange={(e) => setH(+e.target.value)} /></label>
        </div>
        <div className="panel-actions">
          <Banner className="small" onClick={onCancel}>CANCEL</Banner>
          <Banner className="small" onClick={() => onApply(clamp(w), clamp(h))}>APPLY</Banner>
        </div>
      </Box>
    </div>
  );
}

function HelpOverlay({ onClose }) {
  const rows = [
    ["Drag", "Pan the view"], ["Wheel", "Zoom to cursor"], ["Space + drag", "Pan in any tool"],
    ["Click (Place)", "Drop the armed piece"], ["R / F", "Rotate / flip armed or selected"],
    ["Alt (sprites)", "Free pixel placement (no snap)"], ["Click (Select)", "Pick an item"],
    ["Drag (Select)", "Move it"], ["Arrows", "Nudge selection"], ["Del", "Delete selection"],
    ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"], ["Ctrl+S-ish", "use the SAVE button"],
  ];
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Box theme="w" className="panel" style={{ width: "min(460px, 92vw)" }}>
        <h2>SHORTCUTS</h2>
        <div className="help-grid">
          {rows.map(([k, v]) => (
            <div key={k} className="help-row"><span className="help-k">{k}</span><span className="help-v">{v}</span></div>
          ))}
        </div>
        <div className="panel-actions"><Banner className="small" onClick={onClose}>GOT IT</Banner></div>
      </Box>
    </div>
  );
}
