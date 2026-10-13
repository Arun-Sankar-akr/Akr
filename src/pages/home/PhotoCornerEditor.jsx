import React, { useEffect, useRef, useState } from "react";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const CORNER_NAMES = ["Top left", "Top right", "Bottom right", "Bottom left"];

// Free-size crop for a phone photo: four corners that can be dragged
// anywhere, so a tilted or slanted card can be selected exactly.
//   quad     : [[x, y] x4] in photo pixels (TL, TR, BR, BL)
//   onCommit : called with the new quad when a corner is released
export default function PhotoCornerEditor({
  src,
  width,
  height,
  quad,
  busy = false,
  onCommit,
}) {
  const stageRef = useRef(null);

  const toFractions = (q) => q.map(([x, y]) => [x / width, y / height]);
  const [points, setPoints] = useState(() => toFractions(quad));

  useEffect(() => {
    setPoints(toFractions(quad));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quad, width, height]);

  const startDrag = (index) => (event) => {
    event.preventDefault();
    event.stopPropagation();

    const stage = stageRef.current;
    if (!stage || busy) return;

    const rect = stage.getBoundingClientRect();
    let latest = points;

    const onMove = (moveEvent) => {
      const x = clamp((moveEvent.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((moveEvent.clientY - rect.top) / rect.height, 0, 1);

      latest = latest.map((p, i) => (i === index ? [x, y] : p));
      setPoints(latest);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      onCommit(latest.map(([x, y]) => [x * width, y * height]));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const polygon = points.map(([x, y]) => `${x},${y}`).join(" ");
  const shade =
    "M0 0H1V1H0Z " +
    points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ") +
    " Z";

  return (
    <div className={`idc-corners${busy ? " busy" : ""}`} ref={stageRef}>
      <img src={src} alt="Uploaded photo" draggable={false} />

      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <path d={shade} className="shade" fillRule="evenodd" />
        <polygon points={polygon} className="edge" vectorEffect="non-scaling-stroke" />
      </svg>

      {points.map(([x, y], index) => (
        <button
          key={CORNER_NAMES[index]}
          type="button"
          className="idc-corner"
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          onPointerDown={startDrag(index)}
          aria-label={`${CORNER_NAMES[index]} corner`}
        />
      ))}
    </div>
  );
}
