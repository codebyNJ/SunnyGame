// Pre-game main menu (PRD F1) — a grounded, animated pixel landscape built from the
// pack: gradient sky, drifting clouds, a shimmering sea, and a grass foreground with
// a turning windmill, swaying trees, an idling villager and a grazing sheep. The
// title + buttons sit on the scene (not floating chrome on a flat gradient).
import { Banner } from "./Box.jsx";
import { isTauri } from "./storage.js";

export default function MainMenu({ onNew, onLoad, onContinue, lastWorldId }) {
  const quit = async () => {
    if (!isTauri()) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().close();
  };
  return (
    <div className="menu">
      <div className="sky" />
      <div className="sun" />
      <div className="clouds">
        <i className="cloud cl1" /><i className="cloud cl2 s2" /><i className="cloud cl3" /><i className="cloud cl4 s2" />
      </div>
      <div className="bird-path"><i className="spr bird" /></div>

      <div className="sea"><i className="spr coracle" /></div>

      <div className="ground">
        <div className="grass-edge" />
        <i className="spr windmill" />
        <i className="spr tree tree-a" />
        <i className="spr tree2 tree-b" />
        <i className="spr tree tree-c" />
        <span className="villager"><i className="spr idle base" /><i className="spr idle hair" /></span>
        <i className="spr cow" />
        <i className="spr sheep" />
        <i className="spr chicken" />
        <i className="spr duck" />
      </div>

      <div className="menu-content">
        <div className="title-wrap">
          <div className="title">
            <span className="cap l" />
            <span className="body">SUNNYSIDE</span>
            <span className="cap r" />
          </div>
          <div className="subtitle">~ WORLD BUILDER ~</div>
        </div>
        <div className="menu-buttons">
          <Banner onClick={onNew}>NEW WORLD</Banner>
          {lastWorldId && <Banner onClick={() => onContinue(lastWorldId)}>CONTINUE</Banner>}
          <Banner onClick={onLoad}>LOAD WORLD</Banner>
          {isTauri() && <Banner onClick={quit}>QUIT</Banner>}
        </div>
      </div>

      <div className="menu-foot">
        <span>SUNNYSIDE WORLD BUILDER</span>
        <span>made with the Sunnyside asset pack</span>
      </div>
    </div>
  );
}
