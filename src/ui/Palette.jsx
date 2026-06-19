// Asset palette (PRD F3): docked, collapsible, category tabs, searchable thumbnail
// grid. Clicking an OBJECT item arms it for placement; thumbnails render from the
// loaded textures via engine.thumb(). Sprite/terrain items are placed in later phases.
import { useEffect, useMemo, useState } from "react";
import catalog from "../game/catalog.json";

const UI = "/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets/UI";

function Thumb({ item, engine }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let on = true;
    engine.thumb(item).then((url) => on && setSrc(url)).catch(() => {});
    return () => { on = false; };
  }, [item, engine]);
  return src
    ? <img className="pal-thumb" src={src} alt={item.label} />
    : <div className="pal-thumb pal-thumb-empty" />;
}

export default function Palette({ engine, armedId, onArm, terrainEnabled }) {
  const [tab, setTab] = useState(catalog.categories[0].id);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return catalog.categories.flatMap((c) => c.items).filter((it) => it.label.toLowerCase().includes(q));
    return catalog.categories.find((c) => c.id === tab)?.items ?? [];
  }, [tab, query]);

  if (!open) {
    return <button className="pal-reopen" onClick={() => setOpen(true)} title="Open palette">‹ BUILD</button>;
  }

  return (
    <div className="palette">
      <div className="pal-head">
        <span className="pal-title">BUILD</span>
        <button className="pal-collapse" onClick={() => setOpen(false)} title="Hide palette">›</button>
      </div>
      <div className="pal-search">
        <img src={`${UI}/search.png`} alt="" />
        <input type="text" placeholder="search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {!query && (
        <div className="pal-tabs">
          {catalog.categories.map((c) => (
            <button key={c.id} className={`pal-tab ${tab === c.id ? "active" : ""}`} onClick={() => setTab(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="pal-grid">
        {items.map((it) => {
          const placeable = it.kind === "object" || it.kind === "sprite" || (it.kind === "terrain" && terrainEnabled);
          return (
            <button
              key={it.id}
              className={`pal-item ${armedId === it.id ? "armed" : ""} ${placeable ? "" : "soon"}`}
              title={placeable ? it.label : `${it.label} (placeable in a later update)`}
              onClick={() => placeable && onArm(it)}
            >
              <Thumb item={it} engine={engine} />
              <span className="pal-label">{it.label}</span>
            </button>
          );
        })}
        {items.length === 0 && <div className="pal-empty">no matches</div>}
      </div>
    </div>
  );
}
