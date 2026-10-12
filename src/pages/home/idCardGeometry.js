// ============================================================
// ID CARD PRINT  -  crop geometry helpers (no heavy imports)
//   * detectContentBox : finds where the letter sits on the page
//   * defaultBoxes     : front / back card positions (Aadhaar letter)
//   * applyDrag        : move / resize a crop box
// ============================================================

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// ------------------------------------------------------------
// 1. Find the printed area of the page (ignores white margins)
//    rgba = ImageData.data, returns fractions of the page (0..1)
// ------------------------------------------------------------
export function detectContentBox(rgba, width, height) {
  const cols = new Uint32Array(width);
  const rows = new Uint32Array(height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < 128) continue;

      const luminance =
        0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];

      if (luminance < 200) {
        cols[x] += 1;
        rows[y] += 1;
      }
    }
  }

  const needCol = Math.max(2, Math.round(height * 0.004));
  const needRow = Math.max(2, Math.round(width * 0.004));

  let x0 = 0;
  let x1 = width - 1;
  let y0 = 0;
  let y1 = height - 1;

  while (x0 < width && cols[x0] < needCol) x0 += 1;
  while (x1 > x0 && cols[x1] < needCol) x1 -= 1;
  while (y0 < height && rows[y0] < needRow) y0 += 1;
  while (y1 > y0 && rows[y1] < needRow) y1 -= 1;

  const box = {
    x: x0 / width,
    y: y0 / height,
    w: (x1 + 1 - x0) / width,
    h: (y1 + 1 - y0) / height,
  };

  // Nothing sensible found -> use the whole page
  if (!(box.w > 0.3 && box.h > 0.3)) return { x: 0, y: 0, w: 1, h: 1 };

  return box;
}

// ------------------------------------------------------------
// 2. Front card = bottom-left, back card = bottom-right
//    of the Aadhaar letter (positions are relative to the letter)
// ------------------------------------------------------------
export function defaultBoxes(content) {
  const place = (fx, fy, fw, fh) => ({
    x: content.x + fx * content.w,
    y: content.y + fy * content.h,
    w: fw * content.w,
    h: fh * content.h,
  });

  return {
    front: place(0, 0.735, 0.495, 0.265),
    back: place(0.503, 0.735, 0.497, 0.265),
  };
}

// ------------------------------------------------------------
// 3. Drag helpers (all values are fractions of the page)
// ------------------------------------------------------------
const MIN_SIZE = 0.05;

export function applyDrag(box, mode, dx, dy) {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.w;
  let bottom = box.y + box.h;

  if (mode === "move") {
    left = clamp(left + dx, 0, 1 - box.w);
    top = clamp(top + dy, 0, 1 - box.h);
    right = left + box.w;
    bottom = top + box.h;
  } else {
    if (mode.includes("w")) left = clamp(left + dx, 0, right - MIN_SIZE);
    if (mode.includes("e")) right = clamp(right + dx, left + MIN_SIZE, 1);
    if (mode.includes("n")) top = clamp(top + dy, 0, bottom - MIN_SIZE);
    if (mode.includes("s")) bottom = clamp(bottom + dy, top + MIN_SIZE, 1);
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}