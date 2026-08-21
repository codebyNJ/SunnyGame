import { useEffect, useState } from "react";
import MainMenu from "./ui/MainMenu.jsx";
import NewWorldDialog from "./ui/NewWorldDialog.jsx";
import WorldPicker from "./ui/WorldPicker.jsx";
import GameView from "./ui/GameView.jsx";
import { loadWorld, getLastWorld } from "./ui/storage.js";
import "./App.css";
import "./ui/menu.css";
import "./ui/menu-scene.css";

// App state machine: menu -> (new | picker overlay) -> play. The pack loading
// screen lives inside GameView between selecting a world and the engine being ready.
export default function App() {
  const [screen, setScreen] = useState("menu"); // "menu" | "play"
  const [overlay, setOverlay] = useState(null); // null | "new" | "picker"
  const [world, setWorld] = useState(null);
  const [worldId, setWorldId] = useState(null);
  const [lastId, setLastId] = useState(null);
  const [playKey, setPlayKey] = useState(0); // remount GameView per world

  useEffect(() => { setLastId(getLastWorld()); }, [screen]);

  // ?world=<name> still works: deep-link straight into a bundled sample world
  useEffect(() => {
    const w = new URLSearchParams(location.search).get("world");
    if (!w) return;
    fetch(`/worlds/${w}.world.json`).then((r) => r.ok ? r.json() : null).then((doc) => {
      if (doc) openWorld(doc, null);
    }).catch(() => {});
  }, []);

  function openWorld(doc, id) {
    setWorld(doc);
    setWorldId(id);
    setPlayKey((k) => k + 1);
    setOverlay(null);
    setScreen("play");
  }

  // board resize replaces the live doc and remounts the engine at the new size.
  // Unmount first (null world) so the old engine fully tears down before the new
  // one inits — concurrent Pixi apps corrupt the shared texture pool.
  function replaceWorld(doc) {
    setWorld(null);
    setTimeout(() => { setWorld(doc); setPlayKey((k) => k + 1); }, 0);
  }

  const startNew = (doc) => openWorld(doc, null);
  const openSaved = async (id) => { try { openWorld(await loadWorld(id), id); } catch (e) { console.error(e); } };

  return (
    <>
      {screen === "menu" && (
        <MainMenu
          onNew={() => setOverlay("new")}
          onLoad={() => setOverlay("picker")}
          onContinue={openSaved}
          lastWorldId={lastId}
        />
      )}
      {screen === "play" && world && (
        <GameView
          key={playKey}
          world={world}
          worldId={worldId}
          onExit={() => setScreen("menu")}
          onSavedId={(id) => { setWorldId(id); setLastId(id); }}
          onReplaceWorld={replaceWorld}
        />
      )}
      {overlay === "new" && <NewWorldDialog onCreate={startNew} onCancel={() => setOverlay(null)} />}
      {overlay === "picker" && (
        <WorldPicker onOpen={openSaved} onImport={(doc) => startNew(doc)} onNew={() => setOverlay("new")} onCancel={() => setOverlay(null)} />
      )}
    </>
  );
}
