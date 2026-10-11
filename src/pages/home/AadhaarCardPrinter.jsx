import React, { useEffect, useRef, useState } from "react";
import "./AadhaarCardPrinter.css";

import {
  detectContentBox,
  defaultBoxes,
  applyDrag,
} from "./idCardGeometry";

// The Word builder (and the `docx` package) loads only on download.
const loadDocxBuilder = () => import("./idCardDocx");

const MAX_IMAGE_SIDE = 4200;
const PDF_TARGET_WIDTH = 2400;

const BOX_LABEL = { front: "FRONT", back: "BACK" };

// ------------------------------------------------------------
// File readers  ->  one canvas holding the whole page
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

const readPdfFile = async (file) => {
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });

  // e-Aadhaar PDFs are protected with a password
  task.onPassword = (updatePassword, reason) => {
    const retry = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD;

    const password = window.prompt(
      retry
        ? "Wrong password. Please try again:"
        : "This PDF is password protected. Enter the password:"
    );

    if (password === null) {
      task.destroy();
    } else {
      updatePassword(password);
    }
  };

  const pdf = await task.promise;
  const page = await pdf.getPage(1);

  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, Math.max(1, PDF_TARGET_WIDTH / base.width));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  pdf.destroy();

  return canvas;
};

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

const canvasToPng = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Could not read the cropped card."));
        return;
      }

      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });

export default function AadhaarCardPrinter() {
  const inputRef = useRef(null);
  const stageRef = useRef(null);
  const sourceRef = useRef(null); // full-resolution page canvas
  const frontCanvasRef = useRef(null);
  const backCanvasRef = useRef(null);
  const defaultsRef = useRef(null);

  // "letter"   = one Aadhaar letter, front / back are cut out
  // "separate" = two ready-made images (front + back) are merged
  const [tool, setTool] = useState("letter");
  const separateRef = useRef({ front: null, back: null }); // canvases
  const frontInputRef = useRef(null);
  const backInputRef = useRef(null);
  const [separate, setSeparate] = useState({ front: null, back: null });

  const [status, setStatus] = useState("idle"); // idle | loading | ready
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [boxes, setBoxes] = useState(null);
  const [layout, setLayout] = useState("stacked");
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // free the preview image when it is replaced / on leave
  useEffect(
    () => () => {
      if (pageUrl) URL.revokeObjectURL(pageUrl);
    },
    [pageUrl]
  );

  // draw the two cropped cards (full resolution)
  useEffect(() => {
    const source = sourceRef.current;

    if (tool !== "letter" || !source || !boxes) return;

    [
      ["front", frontCanvasRef],
      ["back", backCanvasRef],
    ].forEach(([key, ref]) => {
      const canvas = ref.current;
      if (!canvas) return;

      const box = boxes[key];
      const sx = Math.round(box.x * source.width);
      const sy = Math.round(box.y * source.height);
      const sw = Math.max(1, Math.round(box.w * source.width));
      const sh = Math.max(1, Math.round(box.h * source.height));

      canvas.width = sw;
      canvas.height = sh;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sw, sh);
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    });
  }, [boxes, pageUrl, tool, status]);

  // draw the two uploaded images (merge tool)
  useEffect(() => {
    if (tool !== "separate") return;

    [
      ["front", frontCanvasRef],
      ["back", backCanvasRef],
    ].forEach(([key, ref]) => {
      const source = separateRef.current[key];
      const canvas = ref.current;

      if (!source || !canvas) return;

      canvas.width = source.width;
      canvas.height = source.height;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0);
    });
  }, [tool, separate]);

  // ----------------------------------------------------------
  // Upload
  // ----------------------------------------------------------
  const handleFile = async (file) => {
    if (!file) return;

    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      setError("Please upload a PDF or an image (JPG / PNG).");
      return;
    }

    setError("");
    setStatus("loading");

    try {
      const canvas = isPdf
        ? await readPdfFile(file)
        : await readImageFile(file);

      // look for the letter on a small copy of the page (fast)
      const longest = Math.max(canvas.width, canvas.height);
      const ratio = longest > 900 ? 900 / longest : 1;
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round(canvas.width * ratio));
      small.height = Math.max(1, Math.round(canvas.height * ratio));

      const smallCtx = small.getContext("2d");
      smallCtx.drawImage(canvas, 0, 0, small.width, small.height);

      const pixels = smallCtx.getImageData(0, 0, small.width, small.height);
      const content = detectContentBox(
        pixels.data,
        small.width,
        small.height
      );

      const found = defaultBoxes(content);

      const previewBlob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      );

      sourceRef.current = canvas;
      defaultsRef.current = found;

      setPageUrl(URL.createObjectURL(previewBlob));
      setBoxes(found);
      setFileName(file.name);
      setStatus("ready");
    } catch (readError) {
      console.error("ID card read error:", readError);

      sourceRef.current = null;
      setStatus("idle");
      setError(
        isPdf
          ? "Could not open this PDF. Check the password and try again."
          : readError.message || "Could not read this file."
      );
    }
  };

  const clearFile = () => {
    sourceRef.current = null;
    defaultsRef.current = null;

    setPageUrl("");
    setBoxes(null);
    setFileName("");
    setStatus("idle");
    setError("");

    if (inputRef.current) inputRef.current.value = "";
  };

  // ----------------------------------------------------------
  // Merge tool: front image + back image
  // ----------------------------------------------------------
  const handleSeparateFile = async (which, file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image (JPG / PNG) for the card.");
      return;
    }

    setError("");

    try {
      const canvas = await readImageFile(file);

      separateRef.current = { ...separateRef.current, [which]: canvas };
      setSeparate((current) => ({
        ...current,
        [which]: { name: file.name, turn: 0 },
      }));
    } catch (readError) {
      setError(readError.message || "Could not read this image.");
    }
  };

  const rotateSeparate = (which) => {
    const source = separateRef.current[which];
    if (!source) return;

    separateRef.current = {
      ...separateRef.current,
      [which]: rotateCanvas(source),
    };

    setSeparate((current) => ({
      ...current,
      [which]: { ...current[which], turn: (current[which].turn || 0) + 1 },
    }));
  };

  const removeSeparate = (which) => {
    separateRef.current = { ...separateRef.current, [which]: null };
    setSeparate((current) => ({ ...current, [which]: null }));

    const input = which === "front" ? frontInputRef : backInputRef;
    if (input.current) input.current.value = "";
  };

  const switchTool = (next) => {
    setTool(next);
    setError("");
  };

  // ----------------------------------------------------------
  // Crop box drag / resize
  // ----------------------------------------------------------
  const startDrag = (which, mode) => (event) => {
    event.preventDefault();
    event.stopPropagation();

    const stage = stageRef.current;
    if (!stage || !boxes) return;

    const rect = stage.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startBox = { ...boxes[which] };

    const onMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / rect.width;
      const dy = (moveEvent.clientY - startY) / rect.height;

      setBoxes((current) => ({
        ...current,
        [which]: applyDrag(startBox, mode, dx, dy),
      }));
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
  // Download DOCX
  // ----------------------------------------------------------
  const handleDownload = async () => {
    const frontCanvas = frontCanvasRef.current;
    const backCanvas = backCanvasRef.current;

    if (!frontCanvas || !backCanvas) return;

    if (tool === "separate" && !(separate.front && separate.back)) {
      setError("Please upload both the front and the back image.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const [{ Packer }, { buildIdCardDocument }] = await Promise.all([
        import("docx"),
        loadDocxBuilder(),
      ]);

      const [frontData, backData] = await Promise.all([
        canvasToPng(frontCanvas),
        canvasToPng(backCanvas),
      ]);

      const doc = buildIdCardDocument({
        front: {
          data: frontData,
          width: frontCanvas.width,
          height: frontCanvas.height,
        },
        back: {
          data: backData,
          width: backCanvas.width,
          height: backCanvas.height,
        },
        layout,
        scale: layout === "side" ? 1 : scale,
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = "id-card-front-back.docx";
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (buildError) {
      console.error("ID card docx error:", buildError);
      setError(buildError.message || "Could not create the Word file.");
    } finally {
      setBusy(false);
    }
  };

  const percent = (value) => `${(value * 100).toFixed(3)}%`;

  const canDownload =
    tool === "letter"
      ? status === "ready"
      : Boolean(separate.front && separate.back);

  // ---- right column: previews + print options + download -------
  const renderSide = () => (
    <div className="idc-side">
      <div className="idc-previews">
        {["front", "back"].map((which) => {
          const missing = tool === "separate" && !separate[which];
          const ref = which === "front" ? frontCanvasRef : backCanvasRef;

          return (
            <figure key={which}>
              {missing ? (
                <div className="idc-empty-preview">
                  Upload the {which} image
                </div>
              ) : (
                <canvas ref={ref} />
              )}
              <figcaption>{which === "front" ? "Front" : "Back"}</figcaption>
            </figure>
          );
        })}
      </div>

      <div className="idc-options">
        <div className="idc-option-title">Print layout</div>

        <div className="idc-segment">
          <button
            type="button"
            className={layout === "stacked" ? "active" : ""}
            onClick={() => setLayout("stacked")}
          >
            Front above back
          </button>

          <button
            type="button"
            className={layout === "side" ? "active" : ""}
            onClick={() => setLayout("side")}
          >
            Side by side
          </button>
        </div>

        <label className="idc-select">
          <span>Card size</span>

          <select
            value={layout === "side" ? 1 : scale}
            disabled={layout === "side"}
            onChange={(event) => setScale(Number(event.target.value))}
          >
            <option value={1}>Actual card size (85.6 x 54 mm)</option>
            <option value={1.25}>Larger (125%)</option>
            <option value={1.5}>Extra large (150%)</option>
          </select>
        </label>
      </div>

      <button
        type="button"
        className="idc-download"
        onClick={handleDownload}
        disabled={busy || !canDownload}
      >
        {busy ? "Creating file..." : "Download DOCX (A4)"}
      </button>

      {tool === "letter" && (
        <button type="button" className="idc-ghost wide" onClick={clearFile}>
          Remove file
        </button>
      )}
    </div>
  );

  // ---- one upload slot of the merge tool ----------------------
  const renderSlot = (which) => {
    const slot = separate[which];
    const inputRef = which === "front" ? frontInputRef : backInputRef;
    const title = which === "front" ? "Front side" : "Back side";

    return (
      <div className={`idc-slot ${which}${slot ? " filled" : ""}`}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) =>
            handleSeparateFile(which, event.target.files?.[0])
          }
        />

        <div
          className="idc-slot-body"
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleSeparateFile(which, event.dataTransfer.files?.[0]);
          }}
        >
          <div className="idc-drop-icon" aria-hidden="true">
            <svg
              width="24"
              height="24"
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
            <strong>{title}</strong>
            <span>
              {slot ? slot.name : "Click or drop the card image here"}
            </span>
          </div>
        </div>

        {slot && (
          <div className="idc-slot-actions">
            <button
              type="button"
              className="idc-ghost"
              onClick={() => rotateSeparate(which)}
            >
              Rotate
            </button>

            <button
              type="button"
              className="idc-ghost"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </button>

            <button
              type="button"
              className="idc-ghost"
              onClick={() => removeSeparate(which)}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="idc">
      <div className="idc-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tool === "letter"}
          className={tool === "letter" ? "active" : ""}
          onClick={() => switchTool("letter")}
        >
          Aadhaar letter
          <small>Auto split front / back</small>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tool === "separate"}
          className={tool === "separate" ? "active" : ""}
          onClick={() => switchTool("separate")}
        >
          Front &amp; back images
          <small>Merge two images</small>
        </button>
      </div>

      {tool === "letter" && (
        <>
          <div
            className={`idc-drop${dragOver ? " over" : ""}`}
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
              accept="application/pdf,image/*"
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
                  ? "Reading file..."
                  : fileName || "Upload Aadhaar letter (PDF or image)"}
              </strong>
              <span>
                Front and back are separated automatically. Drag a file here
                or click to choose.
              </span>
            </div>
          </div>

          <p className="idc-privacy">
            The file is processed inside your browser and is never uploaded.
          </p>

          {error && <div className="idc-error">{error}</div>}

          {status === "ready" && boxes && (
            <div className="idc-workspace">
              <div className="idc-editor">
                <div className="idc-editor-head">
                  <div>
                    <strong>Check the crop</strong>
                    <span>
                      Drag a box, or its corners, if a card is not cut
                      properly.
                    </span>
                  </div>

                  <button
                    type="button"
                    className="idc-ghost"
                    onClick={() => setBoxes(defaultsRef.current)}
                  >
                    Reset
                  </button>
                </div>

                <div className="idc-stage" ref={stageRef}>
                  <img
                    src={pageUrl}
                    alt="Uploaded document"
                    draggable={false}
                  />

                  {["front", "back"].map((which) => (
                    <div
                      key={which}
                      className={`idc-box ${which}`}
                      style={{
                        left: percent(boxes[which].x),
                        top: percent(boxes[which].y),
                        width: percent(boxes[which].w),
                        height: percent(boxes[which].h),
                      }}
                      onPointerDown={startDrag(which, "move")}
                    >
                      <span className="idc-box-label">
                        {BOX_LABEL[which]}
                      </span>

                      {["nw", "ne", "sw", "se"].map((handle) => (
                        <i
                          key={handle}
                          className={`idc-handle ${handle}`}
                          onPointerDown={startDrag(which, handle)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {renderSide()}
            </div>
          )}
        </>
      )}

      {tool === "separate" && (
        <>
          <p className="idc-privacy">
            Upload the front and the back of the card. Both images are
            processed inside your browser and are never uploaded.
          </p>

          {error && <div className="idc-error">{error}</div>}

          <div className="idc-workspace">
            <div className="idc-editor idc-slots">
              {renderSlot("front")}
              {renderSlot("back")}
            </div>

            {renderSide()}
          </div>
        </>
      )}
    </div>
  );
}