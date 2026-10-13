// ============================================================
// ID CARD PRINT  -  phone photo clean-up
//   * detectPhotoQuad    : finds the card (4 corners) in a camera photo
//   * straightenWithQuad : flattens any 4 corners into a straight,
//                          clean card (shadows + dark edges removed)
//   * prepareCardPhoto   : detect + straighten in one step
//   * fullQuad / isSingleCard : small helpers
//
// The maths works on plain RGBA arrays (testable without a
// browser). Only the last block at the bottom touches <canvas>.
//
// A "quad" is [[x, y] x4] in pixels: top-left, top-right,
// bottom-right, bottom-left of the card inside the photo.
// ============================================================

const CARD_RATIO = 85.6 / 53.98; // 1.586

const ANALYSIS_SIDE = 640; // the photo is looked at in this size only
const MAX_OUT_SIDE = 3600; // straightened card never gets bigger

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

// ------------------------------------------------------------
// 1. Find the card
// ------------------------------------------------------------

// Otsu threshold of a 256-bin histogram -> { thr, gap }
function otsu(hist, total) {
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) sumAll += i * hist[i];

  let wBack = 0;
  let sumBack = 0;
  let best = -1;
  let thr = 128;
  let gap = 0;

  for (let t = 0; t < 256; t += 1) {
    wBack += hist[t];
    if (!wBack) continue;

    const wFore = total - wBack;
    if (!wFore) break;

    sumBack += t * hist[t];
    const meanBack = sumBack / wBack;
    const meanFore = (sumAll - sumBack) / wFore;
    const between = wBack * wFore * (meanBack - meanFore) ** 2;

    if (between > best) {
      best = between;
      thr = t;
      gap = meanFore - meanBack;
    }
  }

  return { thr, gap };
}

// grow a 0/1 mask by r pixels (box shaped, prefix sums = fast)
function dilateMask(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    const sum = new Uint32Array(w + 1);
    for (let x = 0; x < w; x += 1) sum[x + 1] = sum[x] + mask[row + x];
    for (let x = 0; x < w; x += 1) {
      tmp[row + x] = sum[Math.min(w, x + r + 1)] - sum[Math.max(0, x - r)] > 0 ? 1 : 0;
    }
  }

  for (let x = 0; x < w; x += 1) {
    const sum = new Uint32Array(h + 1);
    for (let y = 0; y < h; y += 1) sum[y + 1] = sum[y] + tmp[y * w + x];
    for (let y = 0; y < h; y += 1) {
      out[y * w + x] = sum[Math.min(h, y + r + 1)] - sum[Math.max(0, y - r)] > 0 ? 1 : 0;
    }
  }

  return out;
}

function erodeMask(mask, w, h, r) {
  const inverted = mask.map((v) => 1 - v);
  return dilateMask(inverted, w, h, r).map((v) => 1 - v);
}

// every 0 that cannot reach the picture border becomes 1
// (text, photo and logos inside the card stop being "holes")
function fillHoles(mask, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;

  const push = (p) => {
    if (!mask[p] && !outside[p]) {
      outside[p] = 1;
      stack[top] = p;
      top += 1;
    }
  };

  for (let x = 0; x < w; x += 1) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    push(y * w);
    push(y * w + w - 1);
  }

  while (top) {
    top -= 1;
    const p = stack[top];
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }

  return outside.map((v) => 1 - v);
}

// biggest connected block -> { area, left[], right[] } (per row)
function biggestBlob(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);

  const walk = (start, onPixel) => {
    let top = 0;
    stack[top] = start;
    top += 1;
    seen[start] = 1;

    while (top) {
      top -= 1;
      const p = stack[top];
      onPixel(p);

      const x = p % w;
      const next = [];
      if (x > 0) next.push(p - 1);
      if (x < w - 1) next.push(p + 1);
      if (p >= w) next.push(p - w);
      if (p < w * (h - 1)) next.push(p + w);

      for (let k = 0; k < next.length; k += 1) {
        const n = next[k];
        if (mask[n] && !seen[n]) {
          seen[n] = 1;
          stack[top] = n;
          top += 1;
        }
      }
    }
  };

  let bestStart = -1;
  let bestArea = 0;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;

    let area = 0;
    walk(start, () => {
      area += 1;
    });

    if (area > bestArea) {
      bestArea = area;
      bestStart = start;
    }
  }

  if (bestStart < 0) return null;

  // second walk over the winner only: left / right edge of each row
  seen.fill(0);
  const left = new Int32Array(h).fill(w);
  const right = new Int32Array(h).fill(-1);

  walk(bestStart, (p) => {
    const x = p % w;
    const y = (p - x) / w;
    if (x < left[y]) left[y] = x;
    if (x > right[y]) right[y] = x;
  });

  return { area: bestArea, left, right };
}

// convex hull (monotone chain) of [x, y] points
function convexHull(points) {
  const pts = points
    .slice()
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower = [];
  pts.forEach((p) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  });

  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

const polygonArea = (pts) => {
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
};

const isConvex = (pts) => {
  let sign = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (z !== 0) {
      const s = z > 0 ? 1 : -1;
      if (sign && s !== sign) return false;
      sign = s;
    }
  }
  return true;
};

// 4 points -> top-left, top-right, bottom-right, bottom-left
function orderQuad(pts) {
  const byY = pts.slice().sort((a, b) => a[1] - b[1]);
  const top = byY.slice(0, 2).sort((a, b) => a[0] - b[0]);
  const bottom = byY.slice(2).sort((a, b) => a[0] - b[0]);
  return [top[0], top[1], bottom[1], bottom[0]];
}

// smallest rotated rectangle around the hull (fallback shape)
function minAreaRect(hull) {
  let best = null;

  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;

    hull.forEach(([x, y]) => {
      const u = x * cos + y * sin;
      const v = -x * sin + y * cos;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    });

    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) {
      best = { area, cos, sin, u0, u1, v0, v1 };
    }
  }

  const back = (u, v) => [u * best.cos - v * best.sin, u * best.sin + v * best.cos];
  return orderQuad([
    back(best.u0, best.v0),
    back(best.u1, best.v0),
    back(best.u1, best.v1),
    back(best.u0, best.v1),
  ]);
}

/**
 * Look for the card / paper in a camera photo.
 * Returns [[x,y] x4] (pixels of this image) or null when the picture
 * is a clean scan (white all around) or no card-like block is found.
 */
export function findCardQuad(rgba, w, h) {
  const total = w * h;
  const score = new Uint8Array(total);
  const hist = new Uint32Array(256);

  // "paper score": bright AND colourless. A tan table, a yellow
  // object or a dark floor all score low, white paper scores high.
  for (let p = 0, i = 0; p < total; p += 1, i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const s = clamp(Math.round(lum - 2.0 * chroma), 0, 255);
    score[p] = s;
    hist[s] += 1;
  }

  // a scan / screenshot already has white all round -> nothing to do
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  let ringWhite = 0;
  let ringTotal = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) {
        x = w - ring - 1;
        continue;
      }
      const i = (y * w + x) * 4;
      const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      const chroma = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) - Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
      ringTotal += 1;
      if (lum > 232 && chroma < 22) ringWhite += 1;
    }
  }

  if (ringTotal && ringWhite / ringTotal > 0.75) return null;

  const first = otsu(hist, total);
  if (first.gap < 35) return null; // no clear "bright card on darker ground"
  let thr = first.thr;

  // a light table / cloth can still sit above the first split: split the
  // bright half once more and keep only the whitest part (the paper)
  const upper = new Uint32Array(256);
  let upperTotal = 0;
  for (let v = thr + 1; v < 256; v += 1) {
    upper[v] = hist[v];
    upperTotal += hist[v];
  }
  if (upperTotal) {
    const second = otsu(upper, upperTotal);
    if (second.gap > 35 && upperTotal - 0 > total * 0.05) thr = second.thr;
  }

  let mask = new Uint8Array(total);
  for (let p = 0; p < total; p += 1) mask[p] = score[p] > thr ? 1 : 0;

  // close small gaps (coloured stripes touching the edge), then fill the inside
  const r = Math.max(2, Math.round(Math.max(w, h) * 0.016));
  mask = erodeMask(dilateMask(mask, w, h, r), w, h, r);
  mask = fillHoles(mask, w, h);

  // then cut thin bright bridges (glare, table highlights) off the card
  const cut = Math.max(2, Math.round(Math.max(w, h) * 0.02));
  mask = dilateMask(erodeMask(mask, w, h, cut), w, h, cut);

  const blob = biggestBlob(mask, w, h);
  if (!blob) return null;

  const areaFrac = blob.area / total;
  if (areaFrac < 0.08) return null;

  // hull of the block (left / right end of every row)
  const points = [];
  for (let y = 0; y < h; y += 1) {
    if (blob.right[y] < 0) continue;
    points.push([blob.left[y], y]);
    points.push([blob.right[y] + 1, y]);
  }

  const hull = convexHull(points);
  if (hull.length < 3) return null;

  // corners = the hull points furthest out along the 4 diagonals
  const pick = (fn) => hull.reduce((a, p) => (fn(p) > fn(a) ? p : a));
  let quad = [
    pick((p) => -(p[0] + p[1])), // top-left
    pick((p) => p[0] - p[1]), // top-right
    pick((p) => p[0] + p[1]), // bottom-right
    pick((p) => p[1] - p[0]), // bottom-left
  ];

  const edge = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const minEdge = Math.max(w, h) * 0.1;
  const edgesOk = (q) => q.every((p, i) => edge(p, q[(i + 1) % 4]) > minEdge);

  if (!isConvex(quad) || !edgesOk(quad) || polygonArea(quad) < 1) {
    quad = minAreaRect(hull);
  }

  const quadArea = polygonArea(quad);
  if (!edgesOk(quad) || blob.area / quadArea < 0.8) return null;

  // the card fills the whole picture already -> nothing to crop
  if (quadArea / total > 0.93) return null;

  // pull the corners in a touch so no background is left at the edges
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4;
  const cy = quad.reduce((s, p) => s + p[1], 0) / 4;

  return quad.map(([x, y]) => [cx + (x - cx) * 0.996, cy + (y - cy) * 0.996]);
}

// ------------------------------------------------------------
// 2. Straighten (perspective warp)
// ------------------------------------------------------------

// solve for the 8 numbers of the perspective transform that maps
// every `from` point to its `to` point
function solveHomography(from, to) {
  const A = [];

  for (let i = 0; i < 4; i += 1) {
    const [u, v] = from[i];
    const [x, y] = to[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }

  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 8; row += 1) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    }
    [A[col], A[pivot]] = [A[pivot], A[col]];

    const d = A[col][col] || 1e-9;
    for (let k = col; k < 9; k += 1) A[col][k] /= d;

    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const f = A[row][col];
      if (!f) continue;
      for (let k = col; k < 9; k += 1) A[row][k] -= f * A[col][k];
    }
  }

  return A.map((row) => row[8]);
}

// size of the straightened card for these 4 corners
export function outputSize(quad) {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let ow = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2;
  let oh = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;

  // a real ID card: use its exact shape (perspective guesses are a bit off)
  const ratio = ow / oh;
  if (Math.abs(ratio - CARD_RATIO) < 0.12) oh = ow / CARD_RATIO;
  else if (Math.abs(1 / ratio - CARD_RATIO) < 0.12) ow = oh / CARD_RATIO;

  const longest = Math.max(ow, oh);
  const k = longest > MAX_OUT_SIDE ? MAX_OUT_SIDE / longest : 1;

  return { w: Math.max(8, Math.round(ow * k)), h: Math.max(8, Math.round(oh * k)) };
}

// copy the quad of `src` into `dst` (ow x oh) as a flat rectangle
export function warpPixels(src, sw, sh, quad, dst, ow, oh) {
  const H = solveHomography(
    [
      [0, 0],
      [ow, 0],
      [ow, oh],
      [0, oh],
    ],
    quad
  );

  for (let v = 0; v < oh; v += 1) {
    const vv = v + 0.5;

    for (let u = 0; u < ow; u += 1) {
      const uu = u + 0.5;
      const d = H[6] * uu + H[7] * vv + 1;
      const x = (H[0] * uu + H[1] * vv + H[2]) / d - 0.5;
      const y = (H[3] * uu + H[4] * vv + H[5]) / d - 0.5;

      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;

      const xa = clamp(x0, 0, sw - 1);
      const xb = clamp(x0 + 1, 0, sw - 1);
      const ya = clamp(y0, 0, sh - 1);
      const yb = clamp(y0 + 1, 0, sh - 1);

      const i00 = (ya * sw + xa) * 4;
      const i10 = (ya * sw + xb) * 4;
      const i01 = (yb * sw + xa) * 4;
      const i11 = (yb * sw + xb) * 4;
      const o = (v * ow + u) * 4;

      for (let c = 0; c < 3; c += 1) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bottom = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        dst[o + c] = top * (1 - fy) + bottom * fy;
      }
      dst[o + 3] = 255;
    }
  }
}

// ------------------------------------------------------------
// 3. Clean: shadows, colour cast, dark edges
// ------------------------------------------------------------

// max over a sliding window (rows, then columns)
function maxFilter(src, w, h, rx, ry) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let m = 0;
      const a = Math.max(0, x - rx);
      const b = Math.min(w - 1, x + rx);
      for (let k = a; k <= b; k += 1) if (src[y * w + k] > m) m = src[y * w + k];
      tmp[y * w + x] = m;
    }
  }

  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      let m = 0;
      const a = Math.max(0, y - ry);
      const b = Math.min(h - 1, y + ry);
      for (let k = a; k <= b; k += 1) if (tmp[k * w + x] > m) m = tmp[k * w + x];
      out[y * w + x] = m;
    }
  }

  return out;
}

function blurMap(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let s = 0;
      let n = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k += 1) {
        s += src[y * w + k];
        n += 1;
      }
      tmp[y * w + x] = s / n;
    }
  }

  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      let s = 0;
      let n = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k += 1) {
        s += tmp[k * w + x];
        n += 1;
      }
      out[y * w + x] = s / n;
    }
  }

  return out;
}

/**
 * Edits the straightened card in place:
 *   1. evens out light  - shadows and dim corners become paper white
 *   2. removes a yellow / blue colour cast (mildly)
 *   3. paints any dark background left at the border white
 */
export function cleanCardPixels(d, w, h) {
  // --- 1. light map: how bright is the paper around each spot? ---
  const f = Math.max(1, Math.floor(Math.max(w, h) / 300));
  const sw = Math.ceil(w / f);
  const sh = Math.ceil(h / f);

  const lum = new Float32Array(sw * sh);
  const count = new Uint16Array(sw * sh);

  for (let y = 0; y < h; y += 1) {
    const sy = Math.floor(y / f);
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const s = sy * sw + Math.floor(x / f);
      lum[s] += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      count[s] += 1;
    }
  }
  for (let s = 0; s < lum.length; s += 1) lum[s] /= count[s] || 1;

  // The window is wider than the person's photo, so a dark face is
  // never mistaken for a shadow: the white paper around it wins.
  const grown = maxFilter(
    lum,
    sw,
    sh,
    Math.max(2, Math.round(sw * 0.13)),
    Math.max(2, Math.round(sh * 0.13))
  );
  const light = blurMap(grown, sw, sh, Math.max(1, Math.round(sw * 0.03)));

  const gain = new Float32Array(sw * sh);
  for (let s = 0; s < gain.length; s += 1) {
    gain[s] = clamp(250 / Math.max(light[s], 40), 1, 2.6);
  }

  for (let y = 0; y < h; y += 1) {
    const fy = clamp((y + 0.5) / f - 0.5, 0, sh - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;

    for (let x = 0; x < w; x += 1) {
      const fx = clamp((x + 0.5) / f - 0.5, 0, sw - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;

      const g =
        (gain[y0 * sw + x0] * (1 - tx) + gain[y0 * sw + x1] * tx) * (1 - ty) +
        (gain[y1 * sw + x0] * (1 - tx) + gain[y1 * sw + x1] * tx) * ty;

      const i = (y * w + x) * 4;
      d[i] *= g;
      d[i + 1] *= g;
      d[i + 2] *= g;
    }
  }

  // --- 2. mild white balance from the brightest 35% of the card ---
  const bins = new Uint32Array(256);
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 60000)));

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      bins[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])] += 1;
    }
  }

  let seen = 0;
  const all = bins.reduce((a, b) => a + b, 0);
  let cut = 255;
  for (let v = 255; v >= 0; v -= 1) {
    seen += bins[v];
    if (seen >= all * 0.35) {
      cut = v;
      break;
    }
  }

  const mean = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] >= cut) {
        mean[0] += d[i];
        mean[1] += d[i + 1];
        mean[2] += d[i + 2];
        n += 1;
      }
    }
  }

  if (n) {
    const m = mean.map((v) => v / n);
    if (Math.max(...m) / Math.max(1, Math.min(...m)) < 1.5) {
      const k = m.map((v) => clamp(250 / Math.max(v, 1), 0.92, 1.18));
      for (let i = 0; i < d.length; i += 4) {
        d[i] *= k[0];
        d[i + 1] *= k[1];
        d[i + 2] *= k[2];
      }
    }
  }

  // --- 3. dark background left in the outer margin -> white ---
  const margin = Math.max(3, Math.round(Math.min(w, h) * 0.04));
  const lumAt = (p) => {
    const i = p * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };

  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;

  const seed = (p) => {
    if (!visited[p] && lumAt(p) < 200) {
      visited[p] = 1;
      stack[top] = p;
      top += 1;
    }
  };

  for (let x = 0; x < w; x += 1) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    seed(y * w);
    seed(y * w + w - 1);
  }

  const grow = (p) => {
    if (visited[p]) return;
    const x = p % w;
    const y = (p - x) / w;
    if (x >= margin && x < w - margin && y >= margin && y < h - margin) return;
    if (lumAt(p) >= 215) return;
    visited[p] = 1;
    stack[top] = p;
    top += 1;
  };

  while (top) {
    top -= 1;
    const p = stack[top];
    const i = p * 4;
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;

    const x = p % w;
    if (x > 0) grow(p - 1);
    if (x < w - 1) grow(p + 1);
    if (p >= w) grow(p - w);
    if (p < w * (h - 1)) grow(p + w);
  }
}

// ------------------------------------------------------------
// 4. Canvas helpers (the only part that needs a browser)
// ------------------------------------------------------------

// the 4 corners of a whole image, optionally pulled in by `inset` (0..0.5)
export const fullQuad = (canvas, inset = 0) => {
  const dx = canvas.width * inset;
  const dy = canvas.height * inset;
  const { width: W, height: H } = canvas;

  return [
    [dx, dy],
    [W - dx, dy],
    [W - dx, H - dy],
    [dx, H - dy],
  ];
};

// is this straightened picture ONE card side (landscape ID card)?
export const isSingleCard = (canvas) => {
  const ratio = canvas.width / canvas.height;
  return ratio > 1.3 && ratio < 1.9;
};

// look for a card in a camera photo -> quad (photo pixels) or null
export function detectPhotoQuad(canvas) {
  const longest = Math.max(canvas.width, canvas.height);
  const ratio = longest > ANALYSIS_SIDE ? ANALYSIS_SIDE / longest : 1;

  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(canvas.width * ratio));
  small.height = Math.max(1, Math.round(canvas.height * ratio));

  const ctx = small.getContext("2d");
  ctx.drawImage(canvas, 0, 0, small.width, small.height);

  const { data } = ctx.getImageData(0, 0, small.width, small.height);
  const quad = findCardQuad(data, small.width, small.height);

  if (!quad) return null;

  return quad.map(([x, y]) => [
    (x / small.width) * canvas.width,
    (y / small.height) * canvas.height,
  ]);
}

// cut the 4 corners out of `source` as a flat card; clean = remove shadow / dark edges
export function straightenWithQuad(source, quad, { clean = true } = {}) {
  const src = source
    .getContext("2d")
    .getImageData(0, 0, source.width, source.height);

  const size = outputSize(quad);
  const out = document.createElement("canvas");
  out.width = size.w;
  out.height = size.h;

  const ctx = out.getContext("2d");
  const image = ctx.createImageData(size.w, size.h);

  warpPixels(src.data, source.width, source.height, quad, image.data, size.w, size.h);
  if (clean) cleanCardPixels(image.data, size.w, size.h);

  ctx.putImageData(image, 0, 0);
  return out;
}

// detect + straighten + clean. Returns { canvas, quad } or null
export function prepareCardPhoto(canvas, options) {
  const quad = detectPhotoQuad(canvas);
  if (!quad) return null;

  return { quad, canvas: straightenWithQuad(canvas, quad, options) };
}