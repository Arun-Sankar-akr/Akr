// ============================================================
// PASSPORT PHOTO PRINT  -  layout + crop helpers (no imports)
//   * PHOTO_SIZES / COPY_OPTIONS : the choices shown in the UI
//   * computeSheet : how many photos fit on A4 and in which grid
//   * defaultCrop / faceCrop : first crop box for a new upload
//   * moveBox / resizeBox    : drag a crop box (aspect ratio locked)
// All crop boxes are in PIXELS of the uploaded image: { x, y, w, h }
// ============================================================

export const A4 = { w: 210, h: 297 }; // mm
export const MARGIN_MM = 10;
export const DPI = 300; // resolution of the photo that goes in the Word file

export const PHOTO_SIZES = [
  { id: "35x45", label: "35 x 45 mm  (Passport / most visas)", w: 35, h: 45 },
  { id: "51x51", label: "51 x 51 mm  (2 x 2 in, US visa / OCI)", w: 51, h: 51 },
  { id: "25x35", label: "25 x 35 mm  (small)", w: 25, h: 35 },
  { id: "20x25", label: "20 x 25 mm  (stamp size)", w: 20, h: 25 },
];

export const COPY_OPTIONS = [
  { id: 4, label: "4" },
  { id: 8, label: "8" },
  { id: 12, label: "12" },
  { id: "full", label: "Full A4" },
];

export const GAP_OPTIONS = [1, 2, 4]; // mm between photos

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// ------------------------------------------------------------
// Sheet grid
//   fixed counts (4 / 8 / 12) use up to 4 columns, picking the
//   column count that gives a full last row where possible
//   "full" fills the whole page
// ------------------------------------------------------------
export function computeSheet({ w, h, gap, copies }) {
  const usableW = A4.w - MARGIN_MM * 2;
  const usableH = A4.h - MARGIN_MM * 2 - 2; // 2 mm spare so Word never adds a blank page

  const cellW = w + gap;
  const cellH = h + gap;

  const maxCols = Math.max(1, Math.floor(usableW / cellW));
  const maxRows = Math.max(1, Math.floor(usableH / cellH));
  const capacity = maxCols * maxRows;

  if (copies === "full") {
    return {
      cols: maxCols,
      rows: maxRows,
      count: capacity,
      capacity,
      cellW,
      cellH,
      trimmed: false,
    };
  }

  const count = Math.min(copies, capacity);

  let cols = Math.min(maxCols, 4);
  for (let c = cols; c >= 2; c -= 1) {
    if (count % c === 0) {
      cols = c;
      break;
    }
  }
  cols = Math.min(cols, count);

  return {
    cols,
    rows: Math.ceil(count / cols),
    count,
    capacity,
    cellW,
    cellH,
    trimmed: copies > capacity,
  };
}

// ------------------------------------------------------------
// First crop box
// ------------------------------------------------------------
// no face found: biggest box of the right shape, kept a little high
export function defaultCrop(imgW, imgH, aspect) {
  let h = Math.min(imgH, imgW / aspect);
  let w = h * aspect;

  const x = (imgW - w) / 2;
  const y = clamp(imgH * 0.4 - h / 2, 0, imgH - h);

  return { x, y, w, h };
}

// face found: head fills about 70-75 % of the photo height
export function faceCrop(face, imgW, imgH, aspect) {
  let h = face.h * 1.9;
  let w = h * aspect;

  const shrink = Math.min(1, imgH / h, imgW / w);
  h *= shrink;
  w *= shrink;

  const cx = face.x + face.w / 2;
  const cy = face.y + face.h / 2;

  return {
    x: clamp(cx - w / 2, 0, imgW - w),
    y: clamp(cy - h * 0.47, 0, imgH - h),
    w,
    h,
  };
}

// ------------------------------------------------------------
// Dragging (dx, dy in image pixels)
// ------------------------------------------------------------
export function moveBox(box, dx, dy, imgW, imgH) {
  return {
    ...box,
    x: clamp(box.x + dx, 0, imgW - box.w),
    y: clamp(box.y + dy, 0, imgH - box.h),
  };
}

// corner handles only: the opposite corner stays fixed, the shape stays locked
export function resizeBox(box, handle, dx, dy, aspect, imgW, imgH) {
  const minW = Math.max(40 * aspect, imgW * 0.06);
  const right = box.x + box.w;
  const bottom = box.y + box.h;

  const west = handle.includes("w");
  const north = handle.includes("n");

  // how wide may the box grow before it leaves the image
  const roomX = west ? right : imgW - box.x;
  const roomY = (north ? bottom : imgH - box.y) * aspect;
  const maxW = Math.max(minW, Math.min(roomX, roomY));

  // use the larger of the two movements so either direction feels natural
  const moveW = west ? -dx : dx;
  const moveH = (north ? -dy : dy) * aspect;
  const move = Math.abs(moveW) >= Math.abs(moveH) ? moveW : moveH;

  const w = clamp(box.w + move, minW, maxW);
  const h = w / aspect;

  return {
    x: west ? right - w : box.x,
    y: north ? bottom - h : box.y,
    w,
    h,
  };
}
