// Pre-game main menu (PRD F1). Pack-asset banner buttons.
import { Banner } from "./Box.jsx";
import { isTauri } from "./storage.js";

export default function MainMenu({ onNew, onLoad, onContinue, lastWorldId }) {
  const quit = async () => {
    if (!isTauri()) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().close();
  };
  return (
    <div className="screen">
      <div className="title">
        <span className="cap l" />
        <span className="body">SUNNYSIDE</span>
        <span className="cap r" />
      </div>
      <div className="subtitle">~ WORLD BUILDER ~</div>
      <div className="menu-buttons">
        <Banner onClick={onNew}>NEW WORLD</Banner>
        {lastWorldId && <Banner onClick={() => onContinue(lastWorldId)}>CONTINUE</Banner>}
        <Banner onClick={onLoad}>LOAD WORLD</Banner>
        {isTauri() && <Banner onClick={quit}>QUIT</Banner>}
      </div>
    </div>
  );
}
