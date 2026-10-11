import React, { useEffect, useRef, useState } from "react";
import "./AadhaarCardPrinter.css"; // shared idc-* look
import "./PassportPhotoPrinter.css";

import {
  A4,
  MARGIN_MM,
  DPI,
  PHOTO_SIZES,
  COPY_OPTIONS,
  GAP_OPTIONS,
  computeSheet,
  defaultCrop,
  faceCrop,
  moveBox,
  resizeBox,
} from "./passportLayout";

import {
  DEFAULT_ADJUST,
  applyAdjustments,
  autoAdjust,
} from "./idCardEnhance";

import {
  BG_PRESETS,
  DEFAULT_BG,
  replaceBackground,
} from "./passportBackground";

// The Word builder (and the `docx` package) loads only on download.
const loadDocxBuilder = () => import("./passportPhotoDocx");

const MAX_IMAGE_SIDE = 4200;
const SHEET_PREVIEW_PX_PER_MM = 2.4;

const SLIDERS = [
  ["brightness", "Brightness", -100, 100],
  ["contrast", "Contrast", -100, 100],
  ["saturation", "Saturation", -100, 100],
  ["warmth", "Warmth", -100, 100],
  ["sharpness", "Clarity", 0, 100],
  ["smooth", "Smoothing", 0, 100],
];

const ICONS = {
  spark: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"],
  undo: ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5"],
  download: ["M12 4v12", "m7 11 5 5 5-5", "M5 20h14"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 12h10l1-12", "M9 7V4h6v3"],
  find: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "m20 20-4-4"],
  rotate: ["M21 12a9 9 0 1 1-3-6.7L21 8", "M21 3v5h-5"],
  scissors: [
    "M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    "M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    "M20 4 8.12 15.88",
    "M14.47 14.48 20 20",
    "M8.12 8.12 12 12",
  ],
};

const Icon = ({ name, size = 15 }) => (
  <svg
    className="idc-icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {ICONS[name].map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);

// ------------------------------------------------------------
// Image helpers
// ------------------------------------------------------------
const readImageFile = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const longest = Math.max(image.naturalWidth, image.naturalHeight);
      const ratio = longest > MAX_IMAGE_SIDE ? MAX_IMAGE_SIDE / longest : 1;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * ratio);
      canvas.height = Math.round(image.naturalHeight * ratio);

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      URL.revokeObjectURL(url);
      resolve(canvas);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be opened."));
    };

    image.src = url;
  });

const rotateCanvas = (canvas) => {
  const rotated = document.createElement("canvas");
  rotated.width = canvas.height;
  rotated.height = canvas.width;

  const ctx = rotated.getContext("2d");
  ctx.translate(rotated.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, 0, 0);

  return rotated;
};

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not read the photo.")),
      type,
      quality
    );
  });

// find the biggest face with the browser's FaceDetector (Chrome / Edge / Android)
// returns { x, y, w, h } in source pixels, or null when it is not available
const detectFace = async (source) => {
  if (typeof window === "undefined" || !("FaceDetector" in window)) return null;

  try {
    const longest = Math.max(source.width, source.height);
    const ratio = longest > 1200 ? 1200 / longest : 1;

    const small = document.createElement("canvas");
    small.width = Math.round(source.width * ratio);
    small.height = Math.round(source.height * ratio);
    small.getContext("2d").drawImage(source, 0, 0, small.width, small.height);

    const detector = new window.FaceDetector({
      fastMode: false,
      maxDetectedFaces: 5,
    });
    const faces = await detector.detect(small);

    if (!faces.length) return null;

    const best = faces.reduce((a, b) =>
      b.boundingBox.width * b.boundingBox.height >
      a.boundingBox.width * a.boundingBox.height
        ? b
        : a
    ).boundingBox;

    return {
      x: best.x / ratio,
      y: best.y / ratio,
      w: best.width / ratio,
      h: best.height / ratio,
    };
  } catch (detectError) {
    return null;
  }
};

// crop the box out of the source at print resolution (300 dpi)
//   bg (optional) = { on, color, sensitivity, smooth } -> new background colour
const buildPhotoCanvas = (source, crop, size, adjust, bg) => {
  const width = Math.round((size.w / 25.4) * DPI);
  const height = Math.round((size.h / 25.4) * DPI);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;

  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);

  applyAdjustments(out, adjust);

  // colours are painted last, so the chosen background stays exact
  if (bg && bg.on) out.detectedBg = replaceBackground(out, bg);

  return out;
};

// ------------------------------------------------------------
// Cut lines: thin dashed line in the CENTRE of every gap,
// with a small scissors at the start of each line.
// ------------------------------------------------------------
const CUT_COLOR = "#6b7280";

// scissors: tip at (0,0), pointing right (+x). s = unit size in px
const drawScissors = (ctx, s, lw) => {
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = lw;
  ctx.strokeStyle = CUT_COLOR;
  ctx.fillStyle = "#ffffff";
  ctx.lineCap = "round";

  // two crossing blades
  ctx.beginPath();
  ctx.moveTo(-3.4 * s, -0.8 * s);
  ctx.lineTo(0, 0.7 * s);
  ctx.moveTo(-3.4 * s, 0.8 * s);
  ctx.lineTo(0, -0.7 * s);
  ctx.stroke();

  // two finger rings
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.arc(-3.4 * s, side * 0.8 * s, 0.55 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
};

const drawCutLines = (ctx, sheet, k) => {
  const EXT = 1.5; // mm the line runs past the outer photos
  const lw = Math.max(0.6, 0.12 * k);
  const startX = (A4.w - sheet.cols * sheet.cellW) / 2;
  const rows = Math.ceil(sheet.count / sheet.cols);
  const rowCount = (r) => Math.min(sheet.cols, sheet.count - r * sheet.cols);

  const scissorSize = (room) => Math.min(0.7, (room - 0.3) / 3.95); // mm
  const sLeft = scissorSize(startX - EXT);
  const sTop = scissorSize(MARGIN_MM - EXT);

  ctx.save();
  ctx.strokeStyle = CUT_COLOR;
  ctx.lineWidth = lw;
  ctx.lineCap = "butt";

  // horizontal lines (between rows + top + bottom)
  for (let b = 0; b <= rows; b += 1) {
    const cols = Math.max(
      b > 0 ? rowCount(b - 1) : 0,
      b < rows ? rowCount(b) : 0
    );
    const y = (MARGIN_MM + b * sheet.cellH) * k;
    const x1 = (startX - EXT) * k;
    const x2 = (startX + cols * sheet.cellW + EXT) * k;

    ctx.setLineDash([1.6 * k, 1.1 * k]);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();

    if (sLeft >= 0.3) {
      ctx.save();
      ctx.translate(x1, y);
      drawScissors(ctx, sLeft * k, lw);
      ctx.restore();
    }
  }

  // vertical lines (between photos + left + right)
  for (let c = 0; c <= sheet.cols; c += 1) {
    let last = -1;
    for (let r = 0; r < rows; r += 1) {
      if (c === 0 || rowCount(r) >= c) last = r;
    }
    if (last < 0) continue;

    const x = (startX + c * sheet.cellW) * k;
    const y1 = (MARGIN_MM - EXT) * k;
    const y2 = (MARGIN_MM + (last + 1) * sheet.cellH + EXT) * k;

    ctx.setLineDash([1.6 * k, 1.1 * k]);
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();

    if (sTop >= 0.3) {
      ctx.save();
      ctx.translate(x, y1);
      ctx.rotate(Math.PI / 2); // scissors point down the line
      drawScissors(ctx, sTop * k, lw);
      ctx.restore();
    }
  }

  ctx.restore();
};

// draw the A4 page with all the copies
//   k = pixels per mm (small for the preview, 300 dpi for the file)
const drawSheet = (canvas, photo, size, sheet, gap, cutLines, k) => {
  canvas.width = Math.round(A4.w * k);
  canvas.height = Math.round(A4.h * k);

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const startX = (A4.w - sheet.cols * sheet.cellW) / 2;

  for (let i = 0; i < sheet.count; i += 1) {
    const col = i % sheet.cols;
    const row = Math.floor(i / sheet.cols);

    const x = (startX + col * sheet.cellW + gap / 2) * k;
    const y = (MARGIN_MM + row * sheet.cellH + gap / 2) * k;

    ctx.drawImage(photo, x, y, size.w * k, size.h * k);
  }

  if (cutLines) drawCutLines(ctx, sheet, k);
};

export default function PassportPhotoPrinter() {
  const inputRef = useRef(null);
  const stageRef = useRef(null);
  const sourceRef = useRef(null); // full-resolution uploaded image
  const faceRef = useRef(null); // detected face (source pixels) or null
  const photoCanvasRef = useRef(null);
  const sheetCanvasRef = useRef(null);

  const [status, setStatus] = useState("idle"); // idle | loading | ready
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [faceFound, setFaceFound] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [sizeId, setSizeId] = useState(PHOTO_SIZES[0].id);
  const [crop, setCrop] = useState(null);
  const [adjust, setAdjust] = useState(DEFAULT_ADJUST);
  const [bg, setBg] = useState(DEFAULT_BG);
  const [detectedBg, setDetectedBg] = useState("");

  const [panel, setPanel] = useState("print"); // print | enhance
  const [copies, setCopies] = useState(8);
  const [gap, setGap] = useState(2);
  const [cutLines, setCutLines] = useState(true);
  const [busy, setBusy] = useState(false);

  const size = PHOTO_SIZES.find((item) => item.id === sizeId);
  const aspect = size.w / size.h;
  const sheet = computeSheet({ w: size.w, h: size.h, gap, copies });

  // free the preview image when it is replaced / on leave
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl]
  );

  // redraw the single photo + the A4 preview
  useEffect(() => {
    const source = sourceRef.current;
    const photoCanvas = photoCanvasRef.current;
    const sheetCanvas = sheetCanvasRef.current;

    if (status !== "ready" || !source || !crop || !photoCanvas) return;

    const photo = buildPhotoCanvas(source, crop, size, adjust, bg);

    setDetectedBg(photo.detectedBg || "");

    photoCanvas.width = photo.width;
    photoCanvas.height = photo.height;
    photoCanvas.getContext("2d").drawImage(photo, 0, 0);

    if (sheetCanvas)
      drawSheet(
        sheetCanvas,
        photo,
        size,
        sheet,
        gap,
        cutLines,
        SHEET_PREVIEW_PX_PER_MM
      );
  }, [
    status,
    crop,
    adjust,
    bg,
    size,
    sheet.count,
    sheet.cols,
    gap,
    cutLines,
  ]);

  // ----------------------------------------------------------
  // Upload
  // ----------------------------------------------------------
  const placeCrop = (canvas, nextSize) => {
    const nextAspect = nextSize.w / nextSize.h;
    const face = faceRef.current;

    return face
      ? faceCrop(face, canvas.width, canvas.height, nextAspect)
      : defaultCrop(canvas.width, canvas.height, nextAspect);
  };

  const showImage = async (canvas) => {
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
    setImageUrl(URL.createObjectURL(blob));
  };

  const handleFile = async (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image (JPG / PNG).");
      return;
    }

    setError("");
    setStatus("loading");

    try {
      const canvas = await readImageFile(file);
      const face = await detectFace(canvas);

      sourceRef.current = canvas;
      faceRef.current = face;

      const firstCrop = placeCrop(canvas, size);

      await showImage(canvas);

      setAdjust({
        ...autoAdjust(buildPhotoCanvas(canvas, firstCrop, size, DEFAULT_ADJUST)),
        smooth: 0,
      });
      setCrop(firstCrop);
      setFaceFound(Boolean(face));
      setFileName(file.name);
      setStatus("ready");
    } catch (readError) {
      console.error("Passport photo read error:", readError);

      sourceRef.current = null;
      setStatus("idle");
      setError(readError.message || "Could not read this file.");
    }
  };

  const clearFile = () => {
    sourceRef.current = null;
    faceRef.current = null;

    setImageUrl("");
    setCrop(null);
    setAdjust(DEFAULT_ADJUST);
    setBg(DEFAULT_BG);
    setFileName("");
    setStatus("idle");
    setError("");

    if (inputRef.current) inputRef.current.value = "";
  };

  const changeSize = (nextId) => {
    const nextSize = PHOTO_SIZES.find((item) => item.id === nextId);

    setSizeId(nextId);

    if (sourceRef.current) setCrop(placeCrop(sourceRef.current, nextSize));
  };

  const resetCrop = () => {
    if (sourceRef.current) setCrop(placeCrop(sourceRef.current, size));
  };

  const rotate = async () => {
    const source = sourceRef.current;
    if (!source) return;

    const rotated = rotateCanvas(source);
    sourceRef.current = rotated;

    const face = await detectFace(rotated);
    faceRef.current = face;

    setFaceFound(Boolean(face));
    setCrop(placeCrop(rotated, size));
    await showImage(rotated);
  };

  // ----------------------------------------------------------
  // Crop box drag / resize (shape stays locked)
  // ----------------------------------------------------------
  const startDrag = (mode) => (event) => {
    event.preventDefault();
    event.stopPropagation();

    const stage = stageRef.current;
    const source = sourceRef.current;
    if (!stage || !source || !crop) return;

    const rect = stage.getBoundingClientRect();
    const k = source.width / rect.width; // screen px -> image px
    const startBox = { ...crop };
    const startX = event.clientX;
    const startY = event.clientY;

    const onMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) * k;
      const dy = (moveEvent.clientY - startY) * k;

      setCrop(
        mode === "move"
          ? moveBox(startBox, dx, dy, source.width, source.height)
          : resizeBox(startBox, mode, dx, dy, aspect, source.width, source.height)
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // ----------------------------------------------------------
  // Enhance
  // ----------------------------------------------------------
  const autoEnhance = () => {
    const source = sourceRef.current;
    if (!source || !crop) return;

    setAdjust({
      ...autoAdjust(buildPhotoCanvas(source, crop, size, DEFAULT_ADJUST)),
      smooth: 0,
    });
  };

  const setAdjustValue = (key, value) =>
    setAdjust((current) => ({ ...current, [key]: value }));

  const setBgValue = (key, value) =>
    setBg((current) => ({ ...current, [key]: value }));

  // choosing a colour also switches the background change on
  const pickBgColor = (color) =>
    setBg((current) => ({ ...current, color, on: true }));

  // ----------------------------------------------------------
  // Download DOCX
  // ----------------------------------------------------------
  const handleDownload = async () => {
    const source = sourceRef.current;
    if (!source || !crop) return;

    setBusy(true);
    setError("");

    try {
      const docxLib = await import("docx");

      const photo = buildPhotoCanvas(source, crop, size, adjust, bg);
      let doc;

      if (cutLines) {
        // full A4 page at 300 dpi, cut lines + scissors drawn in the gaps
        const page = document.createElement("canvas");
        drawSheet(page, photo, size, sheet, gap, true, DPI / 25.4);

        const pageBlob = await canvasToBlob(page, "image/jpeg", 0.95);
        const pageData = new Uint8Array(await pageBlob.arrayBuffer());

        const { Document, Paragraph, ImageRun } = docxLib;

        doc = new Document({
          sections: [
            {
              properties: {
                page: {
                  size: { width: 11906, height: 16838 },
                  margin: {
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    header: 0,
                    footer: 0,
                  },
                },
              },
              children: [
                new Paragraph({
                  spacing: { before: 0, after: 0, line: 240 },
                  children: [
                    new ImageRun({
                      data: pageData,
                      type: "jpg",
                      transformation: { width: 793, height: 1122 },
                    }),
                  ],
                }),
              ],
            },
          ],
        });
      } else {
        const { buildPassportDocument } = await loadDocxBuilder();

        const blob = await canvasToBlob(photo, "image/jpeg", 0.95);
        const data = new Uint8Array(await blob.arrayBuffer());

        doc = buildPassportDocument({
          photo: { data, width: photo.width, height: photo.height },
          size,
          copies,
          gap,
        });
      }

      const file = await docxLib.Packer.toBlob(doc);
      const url = URL.createObjectURL(file);

      const link = document.createElement("a");
      link.href = url;
      link.download = `passport-photos-${size.id}-${sheet.count}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (buildError) {
      console.error("Passport docx error:", buildError);
      setError(buildError.message || "Could not create the Word file.");
    } finally {
      setBusy(false);
    }
  };

  const percent = (value, total) => `${((value / total) * 100).toFixed(3)}%`;

  // ----------------------------------------------------------
  // Panels
  // ----------------------------------------------------------
  const renderSwitch = (label, checked, onChange) => (
    <label className="idc-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
      <span>{label}</span>
    </label>
  );

  const renderPrintTab = () => (
    <div className="idc-tab-body">
      <label className="idc-select">
        <span>Photo size</span>

        <select value={sizeId} onChange={(event) => changeSize(event.target.value)}>
          {PHOTO_SIZES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <div className="ppp-field">
        <span className="idc-option-title">Number of copies</span>

        <div className="idc-segment ppp-four">
          {COPY_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={copies === item.id ? "active" : ""}
              onClick={() => setCopies(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <label className="idc-select">
        <span>Space between photos</span>

        <select value={gap} onChange={(event) => setGap(Number(event.target.value))}>
          {GAP_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item} mm
            </option>
          ))}
        </select>
      </label>

      <p className={`ppp-info${sheet.trimmed ? " warn" : ""}`}>
        {sheet.trimmed
          ? `Only ${sheet.count} photos of this size fit on one A4 page.`
          : `${sheet.count} photos  -  ${sheet.cols} x ${sheet.rows}  -  A4 page`}
      </p>
    </div>
  );

  const renderEnhanceTab = () => (
    <div className="idc-tab-body">
      <div className="idc-enhance-actions">
        <button type="button" className="idc-ghost primary" onClick={autoEnhance}>
          <Icon name="spark" /> Auto enhance
        </button>

        <button
          type="button"
          className="idc-ghost"
          onClick={() => setAdjust(DEFAULT_ADJUST)}
        >
          <Icon name="undo" /> Original
        </button>
      </div>

      <div className="idc-slider-grid">
        {SLIDERS.map(([key, label, min, max]) => (
          <label key={key} className="idc-slider">
            <span>
              {label}
              <b>{adjust[key]}</b>
            </span>

            <input
              type="range"
              min={min}
              max={max}
              step={1}
              value={adjust[key]}
              onChange={(event) => setAdjustValue(key, Number(event.target.value))}
              onDoubleClick={() => setAdjustValue(key, DEFAULT_ADJUST[key])}
            />
          </label>
        ))}
      </div>

      {renderSwitch("Black & white", adjust.mono, (value) =>
        setAdjustValue("mono", value)
      )}
    </div>
  );

  const renderBackgroundTab = () => (
    <div className="idc-tab-body">
      {renderSwitch("Change the background colour", bg.on, (value) =>
        setBgValue("on", value)
      )}

      <div className="ppp-swatches" role="group" aria-label="Background colour">
        {BG_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ppp-swatch${
              bg.on && bg.color.toLowerCase() === item.color ? " active" : ""
            }`}
            onClick={() => pickBgColor(item.color)}
            title={item.label}
          >
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
          </button>
        ))}

        <label className="ppp-swatch custom" title="Pick any colour">
          <input
            type="color"
            value={bg.color}
            onChange={(event) => pickBgColor(event.target.value)}
          />
          <span>Custom</span>
        </label>
      </div>

      {bg.on && (
        <>
          <div className="idc-slider-grid">
            {[
              ["sensitivity", "Remove more", 0, 100],
              ["smooth", "Soft edge", 0, 100],
            ].map(([key, label, min, max]) => (
              <label key={key} className="idc-slider">
                <span>
                  {label}
                  <b>{bg[key]}</b>
                </span>

                <input
                  type="range"
                  min={min}
                  max={max}
                  step={1}
                  value={bg[key]}
                  onChange={(event) => setBgValue(key, Number(event.target.value))}
                  onDoubleClick={() => setBgValue(key, DEFAULT_BG[key])}
                />
              </label>
            ))}
          </div>

          <p className="idc-hint">
            {detectedBg && (
              <span className="ppp-detected">
                Old background found:
                <i style={{ background: detectedBg }} />
              </span>
            )}
            Works best with a plain wall or sheet behind the person. If old
            background is left, raise <b>Remove more</b>. If part of the
            person disappears, lower it.
          </p>
        </>
      )}
    </div>
  );

  const source = sourceRef.current;

  return (
    <div className="idc ppp">
      <div
        className={`idc-drop${dragOver ? " over" : ""}${
          status === "ready" ? " compact" : ""
        }`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => handleFile(event.target.files?.[0])}
        />

        <div className="idc-drop-icon" aria-hidden="true">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 16V4" />
            <path d="m7 9 5-5 5 5" />
            <path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
          </svg>
        </div>

        <div className="idc-drop-text">
          <strong>
            {status === "loading"
              ? "Reading photo..."
              : fileName || "Upload a photo (JPG or PNG)"}
          </strong>
          <span>
            It is cropped and resized to passport size automatically. Drag a
            photo here or click to choose.
          </span>
        </div>
      </div>

      <p className="idc-privacy">
        Private: the photo is processed in your browser, never uploaded.
      </p>

      {error && <div className="idc-error">{error}</div>}

      {status === "ready" && crop && source && (
        <div className="idc-workspace">
          <div className="idc-editor">
            <div className="idc-editor-head">
              <div>
                <strong>Check the crop</strong>
                <span>
                  {faceFound
                    ? "Face found. Move the box or its corners to fine-tune."
                    : "Move the box so the head fills the dotted oval."}
                </span>
              </div>

              <div className="ppp-head-tools">
                <button type="button" className="idc-ghost" onClick={rotate}>
                  <Icon name="rotate" /> Rotate
                </button>

                <button type="button" className="idc-ghost" onClick={resetCrop}>
                  <Icon name="find" /> Auto crop
                </button>
              </div>
            </div>

            <div
              className="idc-stage"
              ref={stageRef}
              style={{ "--ppp-ratio": source.width / source.height }}
            >
              <img src={imageUrl} alt="Uploaded photo" draggable={false} />

              <div
                className="idc-box idc-side-front ppp-crop"
                style={{
                  left: percent(crop.x, source.width),
                  top: percent(crop.y, source.height),
                  width: percent(crop.w, source.width),
                  height: percent(crop.h, source.height),
                }}
                onPointerDown={startDrag("move")}
              >
                <span className="idc-box-label">
                  {size.w} x {size.h} MM
                </span>

                <span className="ppp-guide" aria-hidden="true" />

                {["nw", "ne", "sw", "se"].map((handle) => (
                  <i
                    key={handle}
                    className={`idc-handle ${handle}`}
                    onPointerDown={startDrag(handle)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="idc-side">
            <div className="ppp-previews">
              <figure>
                <canvas ref={photoCanvasRef} />
                <figcaption>
                  Photo {size.w} x {size.h} mm
                </figcaption>
              </figure>

              <figure>
                <canvas ref={sheetCanvasRef} />
                <figcaption>A4 sheet - {sheet.count} photos</figcaption>
              </figure>
            </div>

            <div className="idc-panel">
              <div className="idc-panel-tabs" role="tablist">
                {[
                  ["print", "Size & copies"],
                  ["enhance", "Enhance"],
                  ["background", "Background"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={panel === key}
                    className={panel === key ? "active" : ""}
                    onClick={() => setPanel(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {panel === "print"
                ? renderPrintTab()
                : panel === "enhance"
                ? renderEnhanceTab()
                : renderBackgroundTab()}
            </div>

            <label className={`ppp-cut${cutLines ? " on" : ""}`}>
              <input
                type="checkbox"
                checked={cutLines}
                onChange={(event) => setCutLines(event.target.checked)}
              />
              <i className="ppp-check" aria-hidden="true" />
              <span className="ppp-cut-text">
                <b>
                  <Icon name="scissors" size={14} /> Add cut lines
                </b>
                <small>Thin dashed line in the centre of each gap</small>
              </span>
            </label>

            <div className="idc-actions two">
              <button
                type="button"
                className="idc-download"
                onClick={handleDownload}
                disabled={busy}
              >
                <Icon name="download" size={17} />
                {busy ? "Creating file..." : "Download DOCX (A4)"}
              </button>

              <button
                type="button"
                className="idc-ghost icon-only"
                onClick={clearFile}
                title="Remove photo"
                aria-label="Remove photo"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}