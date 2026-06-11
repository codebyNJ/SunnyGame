import { useEffect, useRef, useState } from "react";
import { start } from "./game/engine.js";
import "./App.css";

const UI = "/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets/UI";
const BARS = ["greenbar_00", "greenbar_01", "greenbar_02", "greenbar_03", "greenbar_04", "greenbar_05", "greenbar_06"];

function App() {
  const rootRef = useRef(null);
  const startedRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (startedRef.current) return; // survive StrictMode double-invoke
    startedRef.current = true;
    start(rootRef.current, (p) => setProgress(p), () => setReady(true));
  }, []);

  const bar = BARS[Math.min(BARS.length - 1, Math.round(progress * (BARS.length - 1)))];
  return (
    <div className="game-root" ref={rootRef}>
      {!ready && (
        <div className="loading">
          <div className="loading-banner">
            <img src={`${UI}/label_left.png`} alt="" />
            <img className="mid" src={`${UI}/label_middle.png`} alt="" />
            <img src={`${UI}/label_right.png`} alt="" />
            <span>SUNNYSIDE COVE</span>
          </div>
          <img className="loading-bar" src={`${UI}/${bar}.png`} alt={`loading ${Math.round(progress * 100)}%`} />
          <img className="loading-timer" src={`${UI}/sandtimer.png`} alt="" />
        </div>
      )}
    </div>
  );
}

export default App;
