// ============================================================
// ID CARD PRINT  -  image enhance helpers (no imports)
//   * DEFAULT_ADJUST   : "no change" settings
//   * applyAdjustments : edits a canvas in place
//   * autoAdjust       : looks at a card and suggests settings
// ============================================================

export const DEFAULT_ADJUST = {
  exposure: 0, // -100..100  (+-2 stops)
  brightness: 0, // -100..100
  contrast: 0, // -100..100
  highlights: 0, // -100..100
  shadows: 0, // -100..100
  saturation: 0, // -100..100
  warmth: 0, // -100..100
  sharpness: 0, // 0..100
  smooth: 0, // 0..100  (soften noise / jpeg blocks, used for the photo)
  black: 0, // 0..50   black point (levels)
  white: 100, // 50..100 white point (levels)
  mono: false, // black & white
};

export const isDefaultAdjust = (a) =>
  Object.keys(DEFAULT_ADJUST).every((key) => a[key] === DEFAULT_ADJUST[key]);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// one 256-entry table for a colour channel (fast: no per-pixel maths)
function buildLut(a, shift) {
  const lut = new Uint8ClampedArray(256);

  const low = a.black / 100;
  const high = Math.max(low + 0.05, a.white / 100);
  const gain = Math.pow(2, a.exposure / 50);
  const bright = a.brightness / 200;
  const contrast = a.contrast >= 0 ? 1 + a.contrast / 100 : 1 + a.contrast / 130;
  const shadows = (a.shadows / 100) * 0.35;
  const highlights = (a.highlights / 100) * 0.35;

  for (let i = 0; i < 256; i += 1) {
    let x = clamp01((i / 255 - low) / (high - low));

    // exposure in linear light
    if (gain !== 1) x = clamp01(Math.pow(Math.pow(x, 2.2) * gain, 1 / 2.2));

    x = clamp01(x + bright);

    // lift / pull the dark and the bright parts
    const inv = 1 - x;
    x = clamp01(x + shadows * inv * inv + highlights * x * x);

    x = (x - 0.5) * contrast + 0.5 + shift;

    lut[i] = Math.round(clamp01(x) * 255);
  }

  return lut;
}

function sharpen(data, width, height, amount) {
  const src = new Uint8ClampedArray(data);
  const k = amount * 0.6;
  const stride = width * 4;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * stride + x * 4;

      for (let c = 0; c < 3; c += 1) {
        const p = i + c;
        data[p] =
          src[p] * (1 + 4 * k) -
          k * (src[p - 4] + src[p + 4] + src[p - stride] + src[p + stride]);
      }
    }
  }
}

function smoothen(data, width, height, amount) {
  const src = new Uint8ClampedArray(data);
  const stride = width * 4;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * stride + x * 4;

      for (let c = 0; c < 3; c += 1) {
        const p = i + c;
        const avg =
          (src[p - stride - 4] + src[p - stride] + src[p - stride + 4] +
            src[p - 4] + src[p] + src[p + 4] +
            src[p + stride - 4] + src[p + stride] + src[p + stride + 4]) / 9;

        data[p] = src[p] * (1 - amount) + avg * amount;
      }
    }
  }
}

// rect (optional) = { x, y, w, h } in pixels -> only that part is edited
export function applyAdjustments(canvas, a, rect) {
  if (!a || isDefaultAdjust(a)) return;

  const rx = rect ? rect.x : 0;
  const ry = rect ? rect.y : 0;
  const width = rect ? rect.w : canvas.width;
  const height = rect ? rect.h : canvas.height;

  const ctx = canvas.getContext("2d");
  const image = ctx.getImageData(rx, ry, width, height);
  const d = image.data;

  const warm = (a.warmth / 100) * 0.08;
  const lutR = buildLut(a, warm);
  const lutG = buildLut(a, 0);
  const lutB = buildLut(a, -warm);

  const sat = 1 + a.saturation / 100;
  const useSat = a.saturation !== 0;

  for (let i = 0; i < d.length; i += 4) {
    let r = lutR[d[i]];
    let g = lutG[d[i + 1]];
    let b = lutB[d[i + 2]];

    if (a.mono) {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = y;
    } else if (useSat) {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      r = y + (r - y) * sat;
      g = y + (g - y) * sat;
      b = y + (b - y) * sat;
    }

    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }

  if (a.smooth > 0) smoothen(d, width, height, a.smooth / 100);
  if (a.sharpness > 0) sharpen(d, width, height, a.sharpness / 100);

  ctx.putImageData(image, rx, ry);
}

// ------------------------------------------------------------
// Auto enhance: work out black / white point from the histogram,
// brighten dark photos, add a little contrast / colour / sharpness
// ------------------------------------------------------------
export function autoAdjust(canvas) {
  const longest = Math.max(canvas.width, canvas.height);
  const ratio = longest > 400 ? 400 / longest : 1;

  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(canvas.width * ratio));
  small.height = Math.max(1, Math.round(canvas.height * ratio));

  const ctx = small.getContext("2d");
  ctx.drawImage(canvas, 0, 0, small.width, small.height);

  const { data } = ctx.getImageData(0, 0, small.width, small.height);

  const hist = new Uint32Array(256);
  let total = 0;

  for (let i = 0; i < data.length; i += 4) {
    const y = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    );
    hist[y] += 1;
    total += 1;
  }

  const percentile = (p) => {
    const goal = total * p;
    let sum = 0;

    for (let i = 0; i < 256; i += 1) {
      sum += hist[i];
      if (sum >= goal) return i;
    }

    return 255;
  };

  let black = Math.min(40, Math.round((percentile(0.005) / 255) * 100));
  let white = Math.max(60, Math.round((percentile(0.995) / 255) * 100));

  if (white - black < 20) {
    black = 0;
    white = 100;
  }

  // brightness of the middle of the card after the levels stretch
  const mid = percentile(0.5) / 255;
  const median = clamp01((mid - black / 100) / ((white - black) / 100));

  let exposure = 0;
  let shadows = 0;

  if (median < 0.45) {
    exposure = Math.min(
      60,
      Math.round(Math.log2(0.5 / Math.max(0.05, median)) * 50)
    );
    shadows = 15;
  }

  return {
    ...DEFAULT_ADJUST,
    black,
    white,
    exposure,
    shadows,
    contrast: 8,
    saturation: 8,
    sharpness: 20,
  };
}

// ------------------------------------------------------------
// Photo of the person on the front of an Aadhaar card
//   findPhotoRect  : pure helper, returns { x, y, w, h } as
//                    fractions of the card (0..1)
//   detectPhotoRect: same, reads a canvas holding the cropped card
//   autoPhotoAdjust: stronger "make it clear" settings for the photo
// ------------------------------------------------------------
const PHOTO_FALLBACK = { x: 0.1, y: 0.21, w: 0.22, h: 0.42 };

// where to look for the person's photo on each kind of card
//   win      = search window [x0, x1, y0, y1] as fractions of the card
//   fallback = used when nothing photo-like is found
//   dark     = only treat dark pixels as "photo" (cards with a coloured background)
const PHOTO_HINTS = {
  aadhaar: { win: [0.04, 0.4, 0.16, 0.78], fallback: PHOTO_FALLBACK },
  voter: {
    win: [0.03, 0.4, 0.3, 0.98],
    fallback: { x: 0.05, y: 0.42, w: 0.22, h: 0.5 },
    dark: true,
  },
  // newer e-PAN: photo is on the left of the front card, QR on the right
  pan2: {
    win: [0, 1, 0, 1],
    fallback: { x: 0.03, y: 0.2, w: 0.16, h: 0.3 },
    fixed: true,
  },
  pan: {
    win: [0.6, 1, 0.4, 1],
    fallback: { x: 0.7, y: 0.575, w: 0.235, h: 0.36 },
    fixed: true, // the photo sits in the same place on every e-PAN
  },
};

const longestRun = (flags, maxGap) => {
  let best = null;
  let start = -1;
  let last = -1;

  for (let i = 0; i <= flags.length; i += 1) {
    if (i < flags.length && flags[i]) {
      if (start < 0) start = i;
      last = i;
    } else if (start >= 0 && (i === flags.length || i - last > maxGap)) {
      if (!best || last - start > best[1] - best[0]) best = [start, last];
      start = -1;
    }
  }

  return best;
};

// returns { x, y, w, h } or null when no photo-like block is found
function searchPhoto(data, w, h, hint) {
  const x0 = Math.round(w * hint.win[0]);
  const x1 = Math.round(w * hint.win[1]);
  const y0 = Math.round(h * hint.win[2]);
  const y1 = Math.round(h * hint.win[3]);

  const filled = (x, y) => {
    const i = (y * w + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (hint.dark) return lum < 150;

    return lum < 215 || Math.max(r, g, b) - Math.min(r, g, b) > 30;
  };

  // columns that are mostly "photo" inside the search window
  const cols = [];
  for (let x = x0; x < x1; x += 1) {
    let count = 0;
    for (let y = y0; y < y1; y += 1) if (filled(x, y)) count += 1;
    cols.push(count / (y1 - y0) > (hint.dark ? 0.25 : 0.4));
  }

  const colRun = longestRun(cols, 2);
  if (!colRun) return null;

  const left = x0 + colRun[0];
  const right = x0 + colRun[1] + 1;

  const rows = [];
  for (let y = y0; y < y1; y += 1) {
    let count = 0;
    for (let x = left; x < right; x += 1) if (filled(x, y)) count += 1;
    rows.push(count / (right - left) > (hint.dark ? 0.3 : 0.5));
  }

  const rowRun = longestRun(rows, 2);
  if (!rowRun) return null;

  const top = y0 + rowRun[0];
  const bottom = y0 + rowRun[1] + 1;

  const rect = {
    x: left / w,
    y: top / h,
    w: (right - left) / w,
    h: (bottom - top) / h,
  };

  // a passport photo is a little taller than wide - otherwise guess
  const ratio = (rect.h * h) / (rect.w * w);

  if (rect.w < 0.1 || rect.w > 0.42 || rect.h < 0.22 || ratio < 1 || ratio > 1.8) {
    return null;
  }

  return rect;
}

// type = "aadhaar" | "voter" | "pan" | "auto" (try them one by one)
export function findPhotoRect(data, w, h, type = "aadhaar") {
  const order = type === "auto" ? ["aadhaar", "voter"] : [type];

  for (const name of order) {
    const hint = PHOTO_HINTS[name] || PHOTO_HINTS.aadhaar;
    if (hint.fixed) return { ...hint.fallback };
    const rect = searchPhoto(data, w, h, hint);
    if (rect) return rect;
  }

  const hint = PHOTO_HINTS[order[0]] || PHOTO_HINTS.aadhaar;
  return { ...hint.fallback };
}

export function detectPhotoRect(canvas, type = "aadhaar") {
  const longest = Math.max(canvas.width, canvas.height);
  const ratio = longest > 500 ? 500 / longest : 1;

  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(canvas.width * ratio));
  small.height = Math.max(1, Math.round(canvas.height * ratio));

  const ctx = small.getContext("2d");
  ctx.drawImage(canvas, 0, 0, small.width, small.height);

  const { data } = ctx.getImageData(0, 0, small.width, small.height);

  return findPhotoRect(data, small.width, small.height, type);
}

export function autoPhotoAdjust(canvas) {
  return {
    ...autoAdjust(canvas),
    contrast: 12,
    saturation: 6,
    sharpness: 55,
    smooth: 15,
  };
}