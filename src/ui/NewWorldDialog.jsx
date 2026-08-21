// New World dialog (PRD F2): name, board size, starter (blank sea / island).
import { useState } from "react";
import { Box, Banner } from "./Box.jsx";
import { createBlankWorld } from "../game/world.js";

const SIZES = {
  S: { label: "Small", width: 60, height: 40 },
  M: { label: "Medium", width: 100, height: 56 },
  L: { label: "Large", width: 140, height: 90 },
};
const STARTERS = {
  blank: { label: "Blank Sea", note: "open water" },
  island: { label: "Starter Island", note: "a patch of grass" },
};

export default function NewWorldDialog({ onCreate, onCancel }) {
  const [name, setName] = useState("My Town");
  const [size, setSize] = useState("M");
  const [starter, setStarter] = useState("island");

  const create = () => {
    const { width, height } = SIZES[size];
    onCreate(createBlankWorld({ name: name.trim() || "Untitled", width, height, starter }));
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <Box theme="w" className="panel">
        <h2>NEW WORLD</h2>
        <div className="row">
          <label>NAME</label>
          <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus
            onKeyDown={(e) => e.key === "Enter" && create()} />
        </div>
        <div className="row">
          <label>BOARD SIZE</label>
          <div className="choice-group">
            {Object.entries(SIZES).map(([k, s]) => (
              <button key={k} className={`choice ${size === k ? "active" : ""}`} onClick={() => setSize(k)}>
                {s.label}<small>{s.width}×{s.height}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <label>STARTER</label>
          <div className="choice-group">
            {Object.entries(STARTERS).map(([k, s]) => (
              <button key={k} className={`choice ${starter === k ? "active" : ""}`} onClick={() => setStarter(k)}>
                {s.label}<small>{s.note}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="panel-actions">
          <Banner className="small" onClick={onCancel}>CANCEL</Banner>
          <Banner className="small" onClick={create}>CREATE</Banner>
        </div>
      </Box>
    </div>
  );
}
