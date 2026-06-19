// World picker (PRD F3-ish / load): grid of saved worlds with thumbnails.
import { useEffect, useState } from "react";
import { Box, Banner } from "./Box.jsx";
import { listWorlds, deleteWorld, importWorld } from "./storage.js";

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

export default function WorldPicker({ onOpen, onImport, onCancel }) {
  const [worlds, setWorlds] = useState(null);
  const refresh = () => listWorlds().then(setWorlds).catch(() => setWorlds([]));
  useEffect(() => { refresh(); }, []);

  const del = async (e, id) => {
    e.stopPropagation();
    await deleteWorld(id);
    refresh();
  };
  const doImport = async () => {
    const doc = await importWorld();
    if (doc) onImport(doc);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <Box theme="w" className="panel">
        <h2>LOAD WORLD</h2>
        {worlds === null ? (
          <div className="empty-note">Loading…</div>
        ) : worlds.length === 0 ? (
          <div className="empty-note">No saved worlds yet.<br />Create one from the menu, or import a .world.json file.</div>
        ) : (
          <div className="world-grid">
            {worlds.map((w) => (
              <div key={w.id} className="world-card" onClick={() => onOpen(w.id)}>
                <button className="del" title="Delete" onClick={(e) => del(e, w.id)} />
                <div className="thumb" style={w.thumbnail ? { backgroundImage: `url(${w.thumbnail})` } : undefined}>
                  {!w.thumbnail && "no preview"}
                </div>
                <div className="cap2">
                  <b>{w.name}</b>
                  <small>{w.width}×{w.height} · {fmtDate(w.updatedAt)}</small>
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
