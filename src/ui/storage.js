// World library storage with two backends behind one API:
//  - Tauri: real .world.json files in $APPDATA/worlds (desktop, decided in PRD).
//  - Web fallback: localStorage index + file download/upload (dev browser build).
// A world file embeds a base64 `thumbnail` (decided P1: embedded, one file per
// world, no orphan sidecars). The library index is derived by listing the folder.
import { WORLD_VERSION, validateWorld } from "../game/world.js";

const isTauri = () => typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
export { isTauri };

const WORLDS_DIR = "worlds";
const slug = (s) => (s || "world").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "world";
const newId = (name) => `${slug(name)}-${Date.now().toString(36)}`;

// ---------- Tauri backend ----------
async function tauriFs() {
  const fs = await import("@tauri-apps/plugin-fs");
  const base = fs.BaseDirectory.AppData;
  if (!(await fs.exists(WORLDS_DIR, { baseDir: base }))) await fs.mkdir(WORLDS_DIR, { baseDir: base, recursive: true });
  return { fs, base };
}

const tauriBackend = {
  async list() {
    const { fs, base } = await tauriFs();
    const entries = await fs.readDir(WORLDS_DIR, { baseDir: base });
    const out = [];
    for (const e of entries) {
      if (!e.isFile || !e.name.endsWith(".world.json")) continue;
      try {
        const txt = await fs.readTextFile(`${WORLDS_DIR}/${e.name}`, { baseDir: base });
        const doc = JSON.parse(txt);
        out.push(meta(doc, e.name.replace(/\.world\.json$/, "")));
      } catch { /* skip unreadable */ }
    }
    return out.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  },
  async load(id) {
    const { fs, base } = await tauriFs();
    const doc = JSON.parse(await fs.readTextFile(`${WORLDS_DIR}/${id}.world.json`, { baseDir: base }));
    delete doc.thumbnail;
    return doc;
  },
  async save(id, doc) {
    const { fs, base } = await tauriFs();
    await fs.writeTextFile(`${WORLDS_DIR}/${id}.world.json`, JSON.stringify(doc), { baseDir: base });
    return id;
  },
  async remove(id) {
    const { fs, base } = await tauriFs();
    await fs.remove(`${WORLDS_DIR}/${id}.world.json`, { baseDir: base });
  },
  async saveAs(doc) {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const path = await dialog.save({ defaultPath: `${slug(doc.name)}.world.json`, filters: [{ name: "World", extensions: ["world.json", "json"] }] });
    if (!path) return null;
    await fs.writeTextFile(path, JSON.stringify(doc));
    return path;
  },
  async importFile() {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const path = await dialog.open({ multiple: false, filters: [{ name: "World", extensions: ["world.json", "json"] }] });
    if (!path) return null;
    return JSON.parse(await fs.readTextFile(path));
  },
};

// ---------- Web fallback backend (localStorage + download/upload) ----------
const LS_KEY = "sunnyside.worlds";
const lsAll = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } };
const lsWrite = (all) => localStorage.setItem(LS_KEY, JSON.stringify(all));

const webBackend = {
  async list() {
    return Object.entries(lsAll())
      .map(([id, doc]) => meta(doc, id))
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  },
  async load(id) {
    const doc = lsAll()[id];
    if (!doc) throw new Error(`world ${id} not found`);
    const copy = structuredClone(doc);
    delete copy.thumbnail;
    return copy;
  },
  async save(id, doc) {
    const all = lsAll();
    all[id] = doc;
    lsWrite(all);
    return id;
  },
  async remove(id) {
    const all = lsAll();
    delete all[id];
    lsWrite(all);
  },
  async saveAs(doc) {
    const blob = new Blob([JSON.stringify(doc)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(doc.name)}.world.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return a.download;
  },
  async importFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,.world.json,application/json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        try { resolve(JSON.parse(await file.text())); } catch { resolve(null); }
      };
      input.click();
    });
  },
};

const backend = () => (isTauri() ? tauriBackend : webBackend);

// ---------- shared helpers ----------
function meta(doc, id) {
  return {
    id,
    name: doc.name || "Untitled",
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
    thumbnail: doc.thumbnail || null,
    width: doc.grid?.width,
    height: doc.grid?.height,
    counts: { objects: doc.objects?.length || 0, sprites: doc.sprites?.length || 0, regions: doc.regions?.length || 0 },
  };
}

// ---------- public API ----------
export const listWorlds = () => backend().list();
export const loadWorld = (id) => backend().load(id);
export const deleteWorld = (id) => backend().remove(id);
export const exportWorld = (doc) => backend().saveAs(doc);
export const importWorld = () => backend().importFile();

// persist a world to the library; assigns/keeps an id, stamps updatedAt, embeds thumb
export async function saveWorld(doc, { id, thumbnail } = {}) {
  const v = validateWorld(doc);
  if (!v.ok) throw new Error("won't save invalid world: " + v.errors.join("; "));
  const worldId = id || doc.id || newId(doc.name);
  const record = { ...doc, id: worldId, version: WORLD_VERSION, updatedAt: new Date().toISOString() };
  if (thumbnail) record.thumbnail = thumbnail;
  await backend().save(worldId, record);
  return { id: worldId, updatedAt: record.updatedAt };
}

// save a PNG data URL to disk (Tauri dialog) or download it (web)
export async function savePng(dataUrl, name) {
  const fname = `${slug(name)}.png`;
  if (isTauri()) {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const path = await dialog.save({ defaultPath: fname, filters: [{ name: "PNG", extensions: ["png"] }] });
    if (!path) return null;
    const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    await fs.writeFile(path, bytes);
    return path;
  }
  const a = document.createElement("a");
  a.href = dataUrl; a.download = fname; a.click();
  return fname;
}

// last-opened pointer, for the "Continue" menu entry
const CONT_KEY = "sunnyside.lastWorld";
export const setLastWorld = (id) => { try { localStorage.setItem(CONT_KEY, id); } catch { /* ignore */ } };
export const getLastWorld = () => { try { return localStorage.getItem(CONT_KEY); } catch { return null; } };
