// Pack-asset UI primitives: a 9-slice panel and a label-banner button.
// All chrome comes from the Sunnyside pack (no custom art), matching the
// in-canvas banners/boxes so the menu and the world feel like one piece.
const UI = "/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets/UI";
const NINE = `${UI}/9slice_box_white`;

// theme: "w" wood · "lt" light · "dt" dark. Pieces are 3x3px, scaled up via CSS.
export function Box({ theme = "w", className = "", style, children }) {
  const img = (p) => `url(${NINE}/${theme}_box_9slice_${p}.png)`;
  const edge = (p, repeat) => ({ backgroundImage: img(p), backgroundRepeat: repeat, backgroundSize: "12px 12px", imageRendering: "pixelated" });
  return (
    <div className={`nine ${className}`} style={style}>
      <span style={edge("tl", "no-repeat")} />
      <span style={edge("tc", "repeat-x")} />
      <span style={edge("tr", "no-repeat")} />
      <span style={edge("lc", "repeat-y")} />
      <div className="nine-c" style={edge("c", "repeat")}>{children}</div>
      <span style={edge("rc", "repeat-y")} />
      <span style={edge("bl", "no-repeat")} />
      <span style={edge("bc", "repeat-x")} />
      <span style={edge("br", "no-repeat")} />
    </div>
  );
}

// label-banner button (label_left/middle/right) with centered text
export function Banner({ children, onClick, disabled, className = "", title }) {
  return (
    <button type="button" className={`banner ${className}`} onClick={onClick} disabled={disabled} title={title}>
      <span className="banner-cap banner-l" />
      <span className="banner-body">{children}</span>
      <span className="banner-cap banner-r" />
    </button>
  );
}

// small round disc button (itemdisc) with an icon image from the pack
export function Disc({ icon, onClick, title, className = "" }) {
  return (
    <button type="button" className={`disc ${className}`} onClick={onClick} title={title}>
      {icon && <img className="disc-icon" src={`${UI}/${icon}.png`} alt="" />}
    </button>
  );
}
