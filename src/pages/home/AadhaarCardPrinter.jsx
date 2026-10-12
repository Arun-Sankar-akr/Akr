import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./Passwordmodal.css";
import "./AadhaarCardPrinter.css";
import "./theme.css";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { detectContentBox, applyDrag } from "./idCardGeometry";
import { detectLayout, DOC_TYPES } from "./idCardDetect";
import "./idCardPdf"

import {
  DEFAULT_ADJUST,
  applyAdjustments,
  autoAdjust,
  autoPhotoAdjust,
  detectPhotoRect,
} from "./idCardEnhance";

// The Word builder (and the `docx` package) loads only on download.
const loadDocxBuilder = () => import("./idCardDocx");
const loadPdfBuilder = () => import("./idCardPdf");

const MAX_IMAGE_SIDE = 4200;
const PDF_TARGET_WIDTH = 2400;

const BOX_LABEL = { front: "FRONT", back: "BACK", photo: "PHOTO" };

// run "Auto enhance" on every new upload (user can still press Original)
const AUTO_ENHANCE_ON_UPLOAD = true;

const BASIC_SLIDERS = [
  ["exposure", "Exposure", -100, 100],
  ["brightness", "Brightness", -100, 100],
  ["contrast", "Contrast", -100, 100],
  ["highlights", "Highlights", -100, 100],
  ["shadows", "Shadows", -100, 100],
  ["saturation", "Saturation", -100, 100],
  ["sharpness", "Sharpness", 0, 100],
];

const MORE_SLIDERS = [
  ["warmth", "Warmth", -100, 100],
  ["black", "Black point", 0, 50],
  ["white", "White point", 50, 100],
];

const PHOTO_SLIDERS = [
  ["brightness", "Brightness", -100, 100],
  ["contrast", "Contrast", -100, 100],
  ["sharpness", "Clarity", 0, 100],
  ["smooth", "Smoothing", 0, 100],
];

const NO_ADJUST = { front: DEFAULT_ADJUST, back: DEFAULT_ADJUST };

const ICONS = {
  spark: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"],
  undo: ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5"],
  download: ["M12 4v12", "m7 11 5 5 5-5", "M5 20h14"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 12h10l1-12", "M9 7V4h6v3"],
  find: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "m20 20-4-4"],
  eye: [
    "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z",
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  ],
  expand: ["M4 9V4h5", "M20 9V4h-5", "M4 15v5h5", "M20 15v5h-5"],
  close: ["M6 6l12 12", "M18 6 6 18"],
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

// find the person's photo on a front card (page coordinates)
const findPhotoBox = (source, frontBox, type = "aadhaar") => {
  const rect = detectPhotoRect(cropCanvas(source, frontBox), type);

  return {
    x: frontBox.x + rect.x * frontBox.w,
    y: frontBox.y + rect.y * frontBox.h,
    w: rect.w * frontBox.w,
    h: rect.h * frontBox.h,
  };
};

// enhance only the photo part of the cropped front card
const applyPhotoAdjust = (canvas, frontBox, photoBox, adjustment) => {
  const fx = (photoBox.x - frontBox.x) / frontBox.w;
  const fy = (photoBox.y - frontBox.y) / frontBox.h;

  const left = Math.max(0, Math.round(fx * canvas.width));
  const top = Math.max(0, Math.round(fy * canvas.height));
  const right = Math.min(
    canvas.width,
    Math.round((fx + photoBox.w / frontBox.w) * canvas.width)
  );
  const bottom = Math.min(
    canvas.height,
    Math.round((fy + photoBox.h / frontBox.h) * canvas.height)
  );

  if (right - left < 4 || bottom - top < 4) return;

  applyAdjustments(canvas, adjustment, {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  });
};

// cut one box (fractions of the page) out of a full-resolution canvas
const cropCanvas = (source, box) => {
  const sx = Math.round(box.x * source.width);
  const sy = Math.round(box.y * source.height);
  const sw = Math.max(1, Math.round(box.w * source.width));
  const sh = Math.max(1, Math.round(box.h * source.height));

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;

  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sw, sh);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);

  return out;
};

const DOC_NAME = {
  aadhaar: "Aadhaar",
  pan: "e-PAN",
  voter: "Voter ID",
  cards: "2 cards found",
};

// Find the front / back card (and the photo) on a full page.
// type = "auto" | "aadhaar" | "pan" | "voter"
const analyzePage = (canvas, type) => {
  const longest = Math.max(canvas.width, canvas.height);
  const ratio = longest > 900 ? 900 / longest : 1;
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(canvas.width * ratio));
  small.height = Math.max(1, Math.round(canvas.height * ratio));

  const ctx = small.getContext("2d");
  ctx.drawImage(canvas, 0, 0, small.width, small.height);

  const pixels = ctx.getImageData(0, 0, small.width, small.height);
  const content = detectContentBox(pixels.data, small.width, small.height);
  const layout = detectLayout(
    pixels.data,
    small.width,
    small.height,
    content,
    type
  );

  const found = { front: layout.front, back: layout.back };
  found.photo = findPhotoBox(
    canvas,
    found.front,
    layout.type === "cards"
      ? "auto"
      : layout.variant === "panel"
      ? "pan2"
      : layout.type
  );

  return { found, kind: layout.type };
};

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

// ---- custom password dialog (the component registers itself here) ----
let passwordRequester = null;

const askPassword = (retry) =>
  new Promise((resolve) => {
    if (!passwordRequester) {
      resolve(window.prompt("This PDF is password protected. Enter the password:"));
      return;
    }

    passwordRequester({ retry, resolve });
  });

// Tell a password problem apart from any other PDF problem
const pdfErrorMessage = (error) => {
  if (error?.name === "PasswordException") {
    return "Wrong or missing password. e-Aadhaar: first 4 letters of your name in CAPITALS + birth year (e.g. RAME1990). e-PAN: date of birth as DDMMYYYY.";
  }

  return `Could not open this PDF: ${error?.message || "unknown error"}`;
};

const readPdfFile = async (file) => {
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });

  // e-Aadhaar / e-PAN PDFs are usually protected with a password
  task.onPassword = async (updatePassword, reason) => {
    const retry = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
    const password = await askPassword(retry);

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

  // newer pdfjs versions: free memory through the loading task
  try {
    await task.destroy();
  } catch {
    // cleanup only - ignore
  }

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

// JPEG bytes for the PDF (white behind any transparent pixel)
const canvasToJpeg = (canvas) =>
  new Promise((resolve, reject) => {
    const flat = document.createElement("canvas");
    flat.width = canvas.width;
    flat.height = canvas.height;

    const ctx = flat.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);

    flat.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("Could not read the cropped card."));
          return;
        }

        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      "image/jpeg",
      0.95
    );
  });

const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
  // password dialog
  const [pwdAsk, setPwdAsk] = useState(null); // { retry, resolve }
  const [pwdValue, setPwdValue] = useState("");
  const [pwdShow, setPwdShow] = useState(false);
  const pwdInputRef = useRef(null);

  useEffect(() => {
    passwordRequester = (request) => {
      setPwdValue("");
      setPwdShow(false);
      setPwdAsk(request);
    };

    return () => {
      passwordRequester = null;
    };
  }, []);

  useEffect(() => {
    if (!pwdAsk) return undefined;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    pwdInputRef.current?.focus();

    return () => {
      document.body.style.overflow = previous;
    };
  }, [pwdAsk]);

  const closePassword = (value) => {
    pwdAsk?.resolve(value);
    setPwdAsk(null);
  };

  const submitPassword = (event) => {
    event.preventDefault();
    if (pwdValue.trim()) closePassword(pwdValue.trim());
  };

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

  // enhance settings for each card + which card the sliders edit
  const [adjust, setAdjust] = useState(NO_ADJUST);
  const [editSide, setEditSide] = useState("both");
  const [panel, setPanel] = useState("enhance"); // enhance | photo | print
  const [activeSlot, setActiveSlot] = useState("front"); // merge tool
  const [viewSide, setViewSide] = useState("front"); // which card the big preview shows
  const [compare, setCompare] = useState(""); // original image while holding "compare"
  const [zoom, setZoom] = useState(null); // full-screen before / after
  const photoBeforeRef = useRef(null);
  const photoAfterRef = useRef(null);

  // person's photo on the front card
  const [photoOn, setPhotoOn] = useState(true);
  const [photoAdjust, setPhotoAdjust] = useState(DEFAULT_ADJUST);

  // merge tool: editable crop box + preview image for each side
  const [sepBoxes, setSepBoxes] = useState({ front: null, back: null });
  const [sepUrls, setSepUrls] = useState({ front: "", back: "" });
  const sepUrlRef = useRef({ front: "", back: "" });
  const sepDefaultsRef = useRef({ front: null, back: null });
  const frontStageRef = useRef(null);
  const backStageRef = useRef(null);
  const sepStageRefs = { front: frontStageRef, back: backStageRef };

  const [status, setStatus] = useState("idle"); // idle | loading | ready
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [boxes, setBoxes] = useState(null);
  const [layout, setLayout] = useState("stacked");
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [dlMenu, setDlMenu] = useState(false); // PDF / Word chooser
  const [dragOver, setDragOver] = useState(false);
  const [docType, setDocType] = useState("auto"); // auto | aadhaar | pan | voter
  const [detected, setDetected] = useState(""); // what "auto" found

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

      applyAdjustments(canvas, adjust[key]);

      if (key === "front" && photoOn && boxes.photo) {
        applyPhotoAdjust(canvas, box, boxes.photo, photoAdjust);
      }
    });
  }, [boxes, pageUrl, tool, status, adjust, photoOn, photoAdjust]);

  // free the merge-tool preview images when leaving the page
  useEffect(
    () => () => {
      Object.values(sepUrlRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    },
    []
  );

  // draw the two cropped images (merge tool, full resolution)
  useEffect(() => {
    if (tool !== "separate") return;

    [
      ["front", frontCanvasRef],
      ["back", backCanvasRef],
    ].forEach(([key, ref]) => {
      const source = separateRef.current[key];
      const box = sepBoxes[key];
      const canvas = ref.current;

      if (!source || !box || !canvas) return;

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

      applyAdjustments(canvas, adjust[key]);

      if (key === "front" && photoOn && sepBoxes.photo) {
        applyPhotoAdjust(canvas, box, sepBoxes.photo, photoAdjust);
      }
    });
  }, [tool, separate, sepBoxes, adjust, photoOn, photoAdjust]);

  // before / after strip for the person's photo (Photo tab)
  useEffect(() => {
    if (panel !== "photo" || !photoOn) return;

    const before = photoBeforeRef.current;
    const after = photoAfterRef.current;
    const frontCanvas = frontCanvasRef.current;
    const source =
      tool === "letter" ? sourceRef.current : separateRef.current.front;
    const frontBox = tool === "letter" ? boxes?.front : sepBoxes.front;
    const photo = tool === "letter" ? boxes?.photo : sepBoxes.photo;

    if (!before || !after || !frontCanvas || !source || !frontBox || !photo) {
      return;
    }

    const px = Math.round(photo.x * source.width);
    const py = Math.round(photo.y * source.height);
    const pw = Math.max(1, Math.round(photo.w * source.width));
    const ph = Math.max(1, Math.round(photo.h * source.height));

    before.width = pw;
    before.height = ph;
    before.getContext("2d").drawImage(source, px, py, pw, ph, 0, 0, pw, ph);

    const fx = (photo.x - frontBox.x) / frontBox.w;
    const fy = (photo.y - frontBox.y) / frontBox.h;
    const left = Math.max(0, Math.round(fx * frontCanvas.width));
    const top = Math.max(0, Math.round(fy * frontCanvas.height));
    const width = Math.max(
      1,
      Math.min(
        frontCanvas.width - left,
        Math.round((photo.w / frontBox.w) * frontCanvas.width)
      )
    );
    const height = Math.max(
      1,
      Math.min(
        frontCanvas.height - top,
        Math.round((photo.h / frontBox.h) * frontCanvas.height)
      )
    );

    after.width = pw;
    after.height = ph;
    after
      .getContext("2d")
      .drawImage(frontCanvas, left, top, width, height, 0, 0, pw, ph);
  }, [
    panel,
    photoOn,
    tool,
    boxes,
    sepBoxes,
    adjust,
    photoAdjust,
    status,
    separate,
  ]);

  // Esc closes the full-screen preview
  useEffect(() => {
    if (!zoom) return undefined;

    const onKey = (event) => {
      if (event.key === "Escape") setZoom(null);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

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

      // find the cards (Aadhaar letter / e-PAN / e-Voter) on the page
      const { found, kind } = analyzePage(canvas, "auto");
      setDocType("auto");
      setDetected(kind);

      const previewBlob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      );

      sourceRef.current = canvas;
      defaultsRef.current = found;

      setAdjust(
        AUTO_ENHANCE_ON_UPLOAD
          ? {
              front: autoAdjust(cropCanvas(canvas, found.front)),
              back: autoAdjust(cropCanvas(canvas, found.back)),
            }
          : NO_ADJUST
      );

      setPhotoAdjust(
        AUTO_ENHANCE_ON_UPLOAD
          ? autoPhotoAdjust(cropCanvas(canvas, found.photo))
          : DEFAULT_ADJUST
      );

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
          ? pdfErrorMessage(readError)
          : readError.message || "Could not read this file."
      );
    }
  };

  const clearFile = () => {
    sourceRef.current = null;
    defaultsRef.current = null;

    setPageUrl("");
    setAdjust(NO_ADJUST);
    setPhotoAdjust(DEFAULT_ADJUST);
    setBoxes(null);
    setFileName("");
    setStatus("idle");
    setError("");
    setDocType("auto");
    setDetected("");

    if (inputRef.current) inputRef.current.value = "";
  };

  // person picked another document type -> find the cards again
  const changeDocType = (next) => {
    const canvas = sourceRef.current;
    if (!canvas) return;

    const { found, kind } = analyzePage(canvas, next);

    setDocType(next);
    setDetected(kind);
    defaultsRef.current = found;

    setAdjust(
      AUTO_ENHANCE_ON_UPLOAD
        ? {
            front: autoAdjust(cropCanvas(canvas, found.front)),
            back: autoAdjust(cropCanvas(canvas, found.back)),
          }
        : NO_ADJUST
    );
    setPhotoAdjust(
      AUTO_ENHANCE_ON_UPLOAD
        ? autoPhotoAdjust(cropCanvas(canvas, found.photo))
        : DEFAULT_ADJUST
    );
    setBoxes(found);
  };

  // ----------------------------------------------------------
  // Merge tool: front image + back image
  // ----------------------------------------------------------
  // find the card on a small copy of the image (fast)
  const detectCardBox = (canvas) => {
    const longest = Math.max(canvas.width, canvas.height);
    const ratio = longest > 900 ? 900 / longest : 1;
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(canvas.width * ratio));
    small.height = Math.max(1, Math.round(canvas.height * ratio));

    const ctx = small.getContext("2d");
    ctx.drawImage(canvas, 0, 0, small.width, small.height);

    const pixels = ctx.getImageData(0, 0, small.width, small.height);
    return detectContentBox(pixels.data, small.width, small.height);
  };

  // store a page canvas for one side, with its preview + default crop
  const prepareSeparate = async (which, canvas, name) => {
    const box = detectCardBox(canvas);
    const photoBox =
      which === "front" ? findPhotoBox(canvas, box, "auto") : null;

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    const url = URL.createObjectURL(blob);

    if (sepUrlRef.current[which]) {
      URL.revokeObjectURL(sepUrlRef.current[which]);
    }
    sepUrlRef.current = { ...sepUrlRef.current, [which]: url };

    separateRef.current = { ...separateRef.current, [which]: canvas };
    sepDefaultsRef.current = { ...sepDefaultsRef.current, [which]: box };

    // a new file (not a rotate) starts with fresh enhance settings
    if (name) {
      setAdjust((current) => ({
        ...current,
        [which]: AUTO_ENHANCE_ON_UPLOAD
          ? autoAdjust(cropCanvas(canvas, box))
          : DEFAULT_ADJUST,
      }));
    }

    setSepUrls((current) => ({ ...current, [which]: url }));
    setSepBoxes((current) => ({
      ...current,
      [which]: box,
      ...(photoBox ? { photo: photoBox } : {}),
    }));
    sepDefaultsRef.current = {
      ...sepDefaultsRef.current,
      ...(photoBox ? { photo: photoBox } : {}),
    };

    if (photoBox && name) {
      setPhotoAdjust(
        AUTO_ENHANCE_ON_UPLOAD
          ? autoPhotoAdjust(cropCanvas(canvas, photoBox))
          : DEFAULT_ADJUST
      );
    }

    setSeparate((current) => ({
      ...current,
      [which]: { name: name || current[which]?.name || "" },
    }));
  };

  const handleSeparateFile = async (which, file) => {
    if (!file) return;

    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);

    if (!isPdf && !file.type.startsWith("image/")) {
      setError("Please upload an image (JPG / PNG) or a PDF for the card.");
      return;
    }

    setError("");

    try {
      const canvas = isPdf
        ? await readPdfFile(file)
        : await readImageFile(file);

      await prepareSeparate(which, canvas, file.name);
    } catch (readError) {
      setError(
        isPdf
          ? pdfErrorMessage(readError)
          : readError.message || "Could not read this image."
      );
    }
  };

  const rotateSeparate = async (which) => {
    const source = separateRef.current[which];
    if (!source) return;

    await prepareSeparate(which, rotateCanvas(source));
  };

  const resetSeparateCrop = (which) => {
    setSepBoxes((current) => ({
      ...current,
      [which]: sepDefaultsRef.current[which],
      ...(which === "front" ? { photo: sepDefaultsRef.current.photo } : {}),
    }));
  };

  const removeSeparate = (which) => {
    if (sepUrlRef.current[which]) {
      URL.revokeObjectURL(sepUrlRef.current[which]);
    }
    sepUrlRef.current = { ...sepUrlRef.current, [which]: "" };
    separateRef.current = { ...separateRef.current, [which]: null };
    sepDefaultsRef.current = { ...sepDefaultsRef.current, [which]: null };

    setSepUrls((current) => ({ ...current, [which]: "" }));
    setAdjust((current) => ({ ...current, [which]: DEFAULT_ADJUST }));
    setSepBoxes((current) => ({
      ...current,
      [which]: null,
      ...(which === "front" ? { photo: null } : {}),
    }));
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
  const trackPointer = (event, stage, onDelta) => {
    const rect = stage.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;

    const onMove = (moveEvent) => {
      onDelta(
        (moveEvent.clientX - startX) / rect.width,
        (moveEvent.clientY - startY) / rect.height
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

  const startDrag = (which, mode) => (event) => {
    event.preventDefault();
    event.stopPropagation();

    const stage = stageRef.current;
    if (!stage || !boxes) return;

    const startBox = { ...boxes[which] };

    trackPointer(event, stage, (dx, dy) => {
      setBoxes((current) => ({
        ...current,
        [which]: applyDrag(startBox, mode, dx, dy),
      }));
    });
  };

  // same drag / resize for the merge tool's crop box
  const startSepDrag = (which, mode) => (event) => {
    event.preventDefault();
    event.stopPropagation();

    const stage = sepStageRefs[which === "photo" ? "front" : which].current;
    const box = sepBoxes[which];
    if (!stage || !box) return;

    const startBox = { ...box };

    trackPointer(event, stage, (dx, dy) => {
      setSepBoxes((current) => ({
        ...current,
        [which]: applyDrag(startBox, mode, dx, dy),
      }));
    });
  };

  // ----------------------------------------------------------
  // Download  (format = "pdf" | "docx")
  // ----------------------------------------------------------
  const handleDownload = async (format) => {
    setDlMenu(false);

    const frontCanvas = frontCanvasRef.current;
    const backCanvas = backCanvasRef.current;

    if (!frontCanvas || !backCanvas) return;

    if (tool === "separate" && !(separate.front && separate.back)) {
      setError("Please upload both the front and the back image.");
      return;
    }

    setBusy(true);
    setError("");

    const options = {
      layout,
      scale: layout === "side" ? 1 : scale,
    };

    try {
      if (format === "pdf") {
        const [{ buildIdCardPdf }, frontData, backData] = await Promise.all([
          loadPdfBuilder(),
          canvasToJpeg(frontCanvas),
          canvasToJpeg(backCanvas),
        ]);

        const blob = buildIdCardPdf({
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
          ...options,
        });

        saveBlob(blob, "id-card-front-back.pdf");
      } else {
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
          ...options,
        });

        saveBlob(await Packer.toBlob(doc), "id-card-front-back.docx");
      }
    } catch (buildError) {
      console.error("ID card download error:", buildError);
      setError(
        buildError.message ||
          `Could not create the ${format === "pdf" ? "PDF" : "Word"} file.`
      );
    } finally {
      setBusy(false);
    }
  };

  // close the PDF / Word chooser on outside click or Esc
  useEffect(() => {
    if (!dlMenu) return undefined;

    const onDown = (event) => {
      if (!event.target.closest?.(".idc-dl")) setDlMenu(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setDlMenu(false);
    };

    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [dlMenu]);

  const percent = (value) => `${(value * 100).toFixed(3)}%`;

  const canDownload =
    tool === "letter"
      ? status === "ready"
      : Boolean(separate.front && separate.back);

  // ----------------------------------------------------------
  // Enhance (auto + manual)
  // ----------------------------------------------------------
  const sidesOf = (side) => (side === "both" ? ["front", "back"] : [side]);

  const currentCrop = (which) => {
    const source =
      tool === "letter" ? sourceRef.current : separateRef.current[which];
    const box = tool === "letter" ? boxes?.[which] : sepBoxes[which];

    return source && box ? cropCanvas(source, box) : null;
  };

  const autoEnhance = () => {
    const updates = {};

    sidesOf(editSide).forEach((which) => {
      const crop = currentCrop(which);
      if (crop) updates[which] = autoAdjust(crop);
    });

    setAdjust((current) => ({ ...current, ...updates }));
  };

  const resetEnhance = () => {
    const updates = {};
    sidesOf(editSide).forEach((which) => {
      updates[which] = DEFAULT_ADJUST;
    });

    setAdjust((current) => ({ ...current, ...updates }));
  };

  const setAdjustValue = (key, value) => {
    setAdjust((current) => {
      const next = { ...current };

      sidesOf(editSide).forEach((which) => {
        next[which] = { ...current[which], [key]: value };
      });

      return next;
    });
  };

  // ---- person's photo ----
  const photoBoxOf = () => (tool === "letter" ? boxes?.photo : sepBoxes.photo);
  const frontBoxOf = () => (tool === "letter" ? boxes?.front : sepBoxes.front);
  const frontSourceOf = () =>
    tool === "letter" ? sourceRef.current : separateRef.current.front;

  const setPhotoBox = (box) => {
    if (tool === "letter") setBoxes((current) => ({ ...current, photo: box }));
    else setSepBoxes((current) => ({ ...current, photo: box }));
  };

  const findPhoto = () => {
    const source = frontSourceOf();
    const front = frontBoxOf();
    if (!source || !front) return null;

    const box = findPhotoBox(source, front);
    setPhotoBox(box);

    return box;
  };

  const autoPhoto = () => {
    const source = frontSourceOf();
    const box = photoBoxOf();

    if (source && box) setPhotoAdjust(autoPhotoAdjust(cropCanvas(source, box)));
  };

  // ---- big preview: hold to compare / full-screen zoom ----
  const originalUrlOf = (which) => {
    const crop = currentCrop(which);
    return crop ? crop.toDataURL("image/jpeg", 0.92) : "";
  };

  const startCompare = (event) => {
    event.preventDefault();
    setCompare(originalUrlOf(viewSide));
  };

  const stopCompare = () => setCompare("");

  const openZoom = () => {
    const canvas = (viewSide === "front" ? frontCanvasRef : backCanvasRef)
      .current;
    if (!canvas) return;

    setZoom({
      side: viewSide,
      mode: "edited",
      edited: canvas.toDataURL("image/png"),
      original: originalUrlOf(viewSide),
    });
  };

  const renderRange = (key, label, min, max, value, onChange, onReset) => (
    <label key={key} className="idc-slider">
      <span>
        {label}
        <b>{value}</b>
      </span>

      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onDoubleClick={onReset}
      />
    </label>
  );

  const renderPhotoSlider = ([key, label, min, max]) =>
    renderRange(
      key,
      label,
      min,
      max,
      photoAdjust[key],
      (value) => setPhotoAdjust((current) => ({ ...current, [key]: value })),
      () =>
        setPhotoAdjust((current) => ({
          ...current,
          [key]: DEFAULT_ADJUST[key],
        }))
    );

  const renderSlider = ([key, label, min, max]) => {
    const shown = adjust[editSide === "back" ? "back" : "front"];

    return renderRange(
      key,
      label,
      min,
      max,
      shown[key],
      (value) => setAdjustValue(key, value),
      () => setAdjustValue(key, DEFAULT_ADJUST[key])
    );
  };

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

  // ---- tab: Enhance ----
  const renderEnhanceTab = () => {
    const shown = adjust[editSide === "back" ? "back" : "front"];

    return (
      <div className="idc-tab-body">
        <div className="idc-segment three small">
          {[
            ["both", "Both"],
            ["front", "Front"],
            ["back", "Back"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={editSide === value ? "active" : ""}
              onClick={() => setEditSide(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="idc-enhance-actions">
          <button type="button" className="idc-ghost primary" onClick={autoEnhance}>
            <Icon name="spark" /> Auto enhance
          </button>

          <button type="button" className="idc-ghost" onClick={resetEnhance}>
            <Icon name="undo" /> Original
          </button>
        </div>

        <div className="idc-slider-grid">
          {BASIC_SLIDERS.map(renderSlider)}

          {renderSwitch("Black & white", shown.mono, (value) =>
            setAdjustValue("mono", value)
          )}
        </div>

        <details className="idc-more">
          <summary>More adjustments</summary>

          <div className="idc-slider-grid">{MORE_SLIDERS.map(renderSlider)}</div>
        </details>
      </div>
    );
  };

  // ---- tab: Photo ----
  const renderPhotoTab = () => (
    <div className="idc-tab-body">
      {renderSwitch("Make the person's photo clear", photoOn, setPhotoOn)}

      {photoOn ? (
        <>
          <p className="idc-hint">
            Drag the orange PHOTO box on the front crop onto the photo.
          </p>

          <div className="idc-photo-compare">
            <figure>
              <canvas ref={photoBeforeRef} />
              <figcaption>Before</figcaption>
            </figure>

            <figure>
              <canvas ref={photoAfterRef} />
              <figcaption>After</figcaption>
            </figure>
          </div>

          <div className="idc-enhance-actions">
            <button type="button" className="idc-ghost primary" onClick={autoPhoto}>
              <Icon name="spark" /> Auto photo
            </button>

            <button type="button" className="idc-ghost" onClick={findPhoto}>
              <Icon name="find" /> Find photo
            </button>
          </div>

          <div className="idc-slider-grid">
            {PHOTO_SLIDERS.map(renderPhotoSlider)}
          </div>

          <button
            type="button"
            className="idc-ghost wide"
            onClick={() => setPhotoAdjust(DEFAULT_ADJUST)}
          >
            <Icon name="undo" /> Original photo
          </button>
        </>
      ) : (
        <p className="idc-hint">Photo enhance is off.</p>
      )}
    </div>
  );

  // ---- tab: Print ----
  const renderPrintTab = () => (
    <div className="idc-tab-body">
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
  );

  // ---- right column: previews + tabs + download ----------------
  const renderSide = () => {
    const hasImage =
      tool === "letter"
        ? status === "ready"
        : Boolean(separate.front || separate.back);

    const showPhotoTab = tool === "letter" || Boolean(separate.front);

    const tabs = [
      ["enhance", "Enhance"],
      ...(showPhotoTab ? [["photo", "Photo"]] : []),
      ["print", "Print"],
    ];

    const active = tabs.some(([key]) => key === panel) ? panel : "enhance";

    return (
      <div className="idc-side">
        <div className="idc-viewer">
          <div className="idc-viewer-bar">
            <div className="idc-segment small">
              {[
                ["front", "Front"],
                ["back", "Back"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={viewSide === value ? "active" : ""}
                  onClick={() => setViewSide(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="idc-viewer-tools">
              <button
                type="button"
                className="idc-ghost"
                title="Press and hold to see the original"
                onPointerDown={startCompare}
                onPointerUp={stopCompare}
                onPointerLeave={stopCompare}
                onPointerCancel={stopCompare}
                onContextMenu={(event) => event.preventDefault()}
                disabled={tool === "separate" && !separate[viewSide]}
              >
                <Icon name="eye" /> Hold: original
              </button>

              <button
                type="button"
                className="idc-ghost"
                onClick={openZoom}
                disabled={tool === "separate" && !separate[viewSide]}
              >
                <Icon name="expand" /> Zoom
              </button>
            </div>
          </div>

          <div className="idc-viewer-stage">
            {["front", "back"].map((which) => {
              const missing = tool === "separate" && !separate[which];
              const ref = which === "front" ? frontCanvasRef : backCanvasRef;

              return (
                <figure
                  key={which}
                  className={viewSide === which ? "" : "hidden"}
                >
                  {missing ? (
                    <div className="idc-empty-preview">
                      Add the {which} image to see it here
                    </div>
                  ) : (
                    <canvas ref={ref} />
                  )}
                </figure>
              );
            })}

            {compare && (
              <img className="idc-compare-img" src={compare} alt="Original" />
            )}

            <span className={`idc-badge${compare ? " original" : ""}`}>
              {compare ? "ORIGINAL" : "EDITED"}
            </span>
          </div>
        </div>

        <div className="idc-panel">
          <div className="idc-panel-tabs" role="tablist">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active === key}
                className={active === key ? "active" : ""}
                onClick={() => setPanel(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {active === "print"
            ? renderPrintTab()
            : !hasImage
            ? <p className="idc-hint pad">Upload a card image to start editing.</p>
            : active === "photo"
            ? renderPhotoTab()
            : renderEnhanceTab()}
        </div>

        <div className={`idc-actions${tool === "letter" ? " two" : ""}`}>
          <div className="idc-dl">
            <button
              type="button"
              className="idc-download"
              onClick={() => setDlMenu((open) => !open)}
              disabled={busy || !canDownload}
              aria-haspopup="menu"
              aria-expanded={dlMenu}
            >
              <Icon name="download" size={17} />
              {busy ? "Creating file..." : "Download (A4)"}
            </button>

            {dlMenu && (
              <div className="idc-dl-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleDownload("pdf")}
                >
                  <strong>PDF</strong>
                  <span>Best for printing, opens anywhere</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleDownload("docx")}
                >
                  <strong>Word (.docx)</strong>
                  <span>Editable, move the cards if needed</span>
                </button>
              </div>
            )}
          </div>

          {tool === "letter" && (
            <button
              type="button"
              className="idc-ghost icon-only"
              onClick={clearFile}
              title="Remove file"
              aria-label="Remove file"
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      </div>
    );
  };

  // ---- one upload slot of the merge tool ----------------------
  const renderSlot = (which) => {
    const slot = separate[which];
    const inputRef = which === "front" ? frontInputRef : backInputRef;
    const title = which === "front" ? "Front side" : "Back side";

    return (
      <div className={`idc-slot idc-side-${which}${slot ? " filled" : ""}`}>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
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
              {slot ? slot.name : "Click or drop the card image (or PDF) here"}
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
              onClick={() => resetSeparateCrop(which)}
            >
              Reset crop
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

        {slot && sepBoxes[which] && sepUrls[which] && (
          <div className="idc-slot-editor">
            <div className="idc-editor-head">
              <div>
                <strong>Check the {which} crop</strong>
                <span>
                  Drag the box, or its corners, to select the card area.
                </span>
              </div>
            </div>

            <div className="idc-stage" ref={sepStageRefs[which]}>
              <img
                src={sepUrls[which]}
                alt={`Uploaded ${which} image`}
                draggable={false}
              />

              {(which === "front" && photoOn && sepBoxes.photo
                ? ["front", "photo"]
                : [which]
              ).map((key) => (
                <div
                  key={key}
                  className={`idc-box idc-side-${key}`}
                  style={{
                    left: percent(sepBoxes[key].x),
                    top: percent(sepBoxes[key].y),
                    width: percent(sepBoxes[key].w),
                    height: percent(sepBoxes[key].h),
                  }}
                  onPointerDown={startSepDrag(key, "move")}
                >
                  <span className="idc-box-label">{BOX_LABEL[key]}</span>

                  {["nw", "n", "ne", "w", "e", "sw", "s", "se"].map((handle) => (
                    <i
                      key={handle}
                      className={`idc-handle ${handle}`}
                      onPointerDown={startSepDrag(key, handle)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const passwordModal = pwdAsk
    ? createPortal(
        <div
          className="pwd-overlay"
          role="presentation"
          onKeyDown={(e) => e.key === "Escape" && closePassword(null)}
        >
          <form
            className="pwd-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwd-title"
            onSubmit={submitPassword}
          >
            <div className="pwd-icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </div>

            <h2 id="pwd-title">Password required</h2>
            <p className="pwd-sub">
              This PDF is protected. Enter its password to open it.
            </p>

            {pwdAsk.retry && (
              <div className="pwd-error">
                That password did not work. Please check it and try again.
              </div>
            )}

            <div className="pwd-field">
              <input
                ref={pwdInputRef}
                type={pwdShow ? "text" : "password"}
                value={pwdValue}
                onChange={(e) => setPwdValue(e.target.value)}
                placeholder="Enter password"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck="false"
              />
              <button
                type="button"
                className="pwd-eye"
                onClick={() => setPwdShow(!pwdShow)}
                aria-label={pwdShow ? "Hide password" : "Show password"}
              >
                {pwdShow ? "Hide" : "Show"}
              </button>
            </div>

            <ul className="pwd-hints">
              <li>
                <b>e-Aadhaar</b>
                <span>First 4 letters of your name in CAPITALS + birth year, e.g. <code>RAME1990</code></span>
              </li>
              <li>
                <b>e-PAN</b>
                <span>Date of birth as <code>DDMMYYYY</code></span>
              </li>
            </ul>

            <div className="pwd-actions">
              <button type="button" className="pwd-btn ghost" onClick={() => closePassword(null)}>
                Cancel
              </button>
              <button type="submit" className="pwd-btn primary" disabled={!pwdValue.trim()}>
                Unlock
              </button>
            </div>

            <p className="pwd-note">🔒 Your password stays in your browser.</p>
          </form>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="idc">
      {passwordModal}
      <div className="idc-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tool === "letter"}
          className={tool === "letter" ? "active" : ""}
          onClick={() => switchTool("letter")}
        >
          Full-size document
          <small>Aadhaar · Voter · PAN to card size</small>
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
                  : fileName || "Upload document (PDF or image)"}
              </strong>
              <span>
                Front and back are cut out automatically. Drag a file here
                or click to choose.
              </span>
            </div>
          </div>

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

                <div className="idc-types" role="group" aria-label="Document type">
                  <span className="idc-types-label">Document</span>
                  {DOC_TYPES.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`idc-type${docType === key ? " on" : ""}`}
                      aria-pressed={docType === key}
                      onClick={() => changeDocType(key)}
                    >
                      {label}
                      {key === "auto" && docType === "auto" && detected
                        ? ` · ${DOC_NAME[detected]}`
                        : ""}
                    </button>
                  ))}
                </div>

                <div className="idc-stage" ref={stageRef}>
                  <img
                    src={pageUrl}
                    alt="Uploaded document"
                    draggable={false}
                  />

                  {(photoOn && boxes.photo
                    ? ["front", "back", "photo"]
                    : ["front", "back"]
                  ).map((which) => (
                    <div
                      key={which}
                      className={`idc-box idc-side-${which}`}
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

                      {["nw", "n", "ne", "w", "e", "sw", "s", "se"].map((handle) => (
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
            Add the front and the back of the card. Private: processed in your
            browser, never uploaded.
          </p>

          {error && <div className="idc-error">{error}</div>}

          <div className="idc-workspace">
            <div className="idc-editor idc-slots">
              <div className="idc-slot-tabs" role="tablist">
                {["front", "back"].map((which) => (
                  <button
                    key={which}
                    type="button"
                    role="tab"
                    aria-selected={activeSlot === which}
                    className={`idc-side-${which}${
                      activeSlot === which ? " active" : ""
                    }`}
                    onClick={() => setActiveSlot(which)}
                  >
                    <i className="dot" aria-hidden="true" />
                    {which === "front" ? "Front side" : "Back side"}
                    <small>{separate[which] ? "Added ✓" : "Not added"}</small>
                  </button>
                ))}
              </div>

              {renderSlot(activeSlot)}
            </div>

            {renderSide()}
          </div>
        </>
      )}

      {zoom && (
        <div
          className="idc-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setZoom(null)}
        >
          <div
            className="idc-lightbox-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="idc-lightbox-bar">
              <div className="idc-segment three small">
                {[
                  ["edited", "Edited"],
                  ["original", "Original"],
                  ["both", "Side by side"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={zoom.mode === value ? "active" : ""}
                    onClick={() =>
                      setZoom((current) => ({ ...current, mode: value }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="idc-ghost icon-only"
                onClick={() => setZoom(null)}
                aria-label="Close"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className={`idc-lightbox-body${zoom.mode === "both" ? " both" : ""}`}>
              {zoom.mode !== "original" && (
                <figure>
                  <img src={zoom.edited} alt="Edited card" />
                  <figcaption>Edited</figcaption>
                </figure>
              )}

              {zoom.mode !== "edited" && (
                <figure>
                  <img src={zoom.original} alt="Original card" />
                  <figcaption>Original</figcaption>
                </figure>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}