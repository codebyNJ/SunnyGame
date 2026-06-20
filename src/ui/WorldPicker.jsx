// World picker — a richer card grid: large mini-map thumbnails, size + content
// badges, hover "OPEN" overlay, staggered entrance, a "+ New World" card, and an
// illustrated empty state. Card data comes from storage.listWorlds().
import { useEffect, useState } from "react";
import { Box, Banner } from "./Box.jsx";
import { listWorlds, deleteWorld, importWorld } from "./storage.js";

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

export default function WorldPicker({ onOpen, onImport, onNew, onCancel }) {
  const [worlds, setWorlds] = useState(null);
  const refresh = () => listWorlds().then(setWorlds).catch(() => setWorlds([]));
  useEffect(() => { refresh(); }, []);

  const del = async (e, id) => { e.stopPropagation(); await deleteWorld(id); refresh(); };
  const doImport = async () => { const doc = await importWorld(); if (doc) onImport(doc); };

  const count = worlds?.length ?? 0;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <Box theme="w" className="panel" style={{ width: "min(820px, 94vw)" }}>
        <div className="picker-head">
          <h2>YOUR WORLDS</h2>
          {count > 0 && <span className="picker-count">{count}</span>}
        </div>

        {worlds === null ? (
          <div className="picker-empty"><p>Loading…</p></div>
        ) : count === 0 ? (
          <div className="picker-empty">
            <div className="em-art" />
            <p><b>No worlds yet.</b><br />Start a new world from the menu, or import a <code>.world.json</code> file.</p>
          </div>
        ) : (
          <div className="world-grid2">
            {onNew && (
              <div className="wc new" onClick={onNew} title="Create a new world">
                <span className="plus">+</span>
                <span className="lbl">NEW WORLD</span>
              </div>
            )}
            {worlds.map((w, i) => (
              <div key={w.id} className="wc" style={{ animationDelay: `${0.04 * i}s` }} onClick={() => onOpen(w.id)}>
                <button className="wc-del" title="Delete" onClick={(e) => del(e, w.id)} />
                <div className="wc-thumb" style={w.thumbnail ? { backgroundImage: `url(${w.thumbnail})` } : undefined}>
                  <div className="wc-open">OPEN</div>
                </div>
                <div className="wc-body">
                  <b>{w.name}</b>
                  <div className="wc-meta">
                    <span className="wc-badge">{w.width}×{w.height}</span>
                    {w.counts?.objects > 0 && <span className="wc-badge">🏠 {w.counts.objects}</span>}
                    {w.counts?.sprites > 0 && <span className="wc-badge">🧍 {w.counts.sprites}</span>}
                    {w.counts?.regions > 0 && <span className="wc-badge">▭ {w.counts.regions}</span>}
                    <span className="wc-badge dim">{fmtDate(w.updatedAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="panel-actions">
          <Banner className="small" onClick={onCancel}>BACK</Banner>
          <Banner className="small" onClick={doImport}>IMPORT FILE</Banner>
        </div>
      </Box>
    </div>
  );
}
