// ============================================================
// ID CARD PRINT  -  document layout detection (no imports, no DOM)
//   * detectLayout : finds the FRONT and BACK card on a page
//   * DOC_TYPES    : list for the "Document type" chips
//
// Works on small RGBA pixels (ImageData.data), returns fractions
// of the page (0..1):  { type, front, back, auto }
//
//   e-Aadhaar letter : cards sit at the bottom (fixed template)
//   e-PAN            : one wide strip (front + back touching) -> split
//   e-Voter (EPIC)   : two separate cards near the top
//   anything else    : any two similar card-shaped blocks side by side
// ============================================================

export const DOC_TYPES = [
  ["auto", "Auto detect"],
  ["aadhaar", "Aadhaar"],
  ["pan", "e-PAN"],
  ["voter", "Voter ID"],
];

const CARD_RATIO = 85.6 / 53.98; // 1.586

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// ------------------------------------------------------------
// 1. "ink" mask: anything that is not (almost) white paper
// ------------------------------------------------------------
function buildMask(rgba, w, h) {
  const mask = new Uint8Array(w * h);

  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    if (rgba[i + 3] < 128) continue;

    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (lum < 225 || Math.max(r, g, b) - Math.min(r, g, b) > 28) mask[p] = 1;
  }

  return mask;
}

// ------------------------------------------------------------
// 2. Remove page-wide thin lines (dashed "cut here" lines, the
//    divider of the Aadhaar letter ...) so they do not glue
//    everything into one big block. Works on a copy.
// ------------------------------------------------------------
function removeLongLines(mask, w, h) {
  const out = Uint8Array.from(mask);

  const rowCount = new Uint32Array(h);
  const rowMin = new Int32Array(h).fill(w);
  const rowMax = new Int32Array(h).fill(-1);
  const colCount = new Uint32Array(w);
  const colMin = new Int32Array(w).fill(h);
  const colMax = new Int32Array(w).fill(-1);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      rowCount[y] += 1;
      colCount[x] += 1;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      if (y < colMin[x]) colMin[x] = y;
      if (y > colMax[x]) colMax[x] = y;
    }
  }

  const gap = Math.max(3, Math.round(h * 0.005));
  const gapX = Math.max(3, Math.round(w * 0.005));
  const at = (arr, i, n) => arr[clamp(i, 0, n - 1)];

  for (let y = 0; y < h; y += 1) {
    const span = rowMax[y] - rowMin[y];
    if (
      span > w * 0.7 &&
      rowCount[y] > w * 0.25 &&
      at(rowCount, y - gap, h) < w * 0.12 &&
      at(rowCount, y + gap, h) < w * 0.12
    ) {
      out.fill(0, y * w, y * w + w);
    }
  }

  for (let x = 0; x < w; x += 1) {
    const span = colMax[x] - colMin[x];
    if (
      span > h * 0.7 &&
      colCount[x] > h * 0.25 &&
      at(colCount, x - gapX, w) < h * 0.12 &&
      at(colCount, x + gapX, w) < h * 0.12
    ) {
      for (let y = 0; y < h; y += 1) out[y * w + x] = 0;
    }
  }

  return out;
}

// ------------------------------------------------------------
// 3. Grow the mask a little so text + logos of one card join up
// ------------------------------------------------------------
function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);

  // horizontal pass (prefix sums)
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    const sum = new Uint32Array(w + 1);
    for (let x = 0; x < w; x += 1) sum[x + 1] = sum[x] + mask[row + x];
    for (let x = 0; x < w; x += 1) {
      const a = Math.max(0, x - r);
      const b = Math.min(w, x + r + 1);
      tmp[row + x] = sum[b] - sum[a] > 0 ? 1 : 0;
    }
  }

  // vertical pass
  for (let x = 0; x < w; x += 1) {
    const sum = new Uint32Array(h + 1);
    for (let y = 0; y < h; y += 1) sum[y + 1] = sum[y] + tmp[y * w + x];
    for (let y = 0; y < h; y += 1) {
      const a = Math.max(0, y - r);
      const b = Math.min(h, y + r + 1);
      out[y * w + x] = sum[b] - sum[a] > 0 ? 1 : 0;
    }
  }

  return out;
}

// bounding boxes (pixels) of the connected blocks
function blocks(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const list = [];
  const stack = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;

    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;

    stack.push(start);
    seen[start] = 1;

    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p - x) / w;

      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;

      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }

    list.push({ x0, y0, x1: x1 + 1, y1: y1 + 1 });
  }

  return list;
}

// ------------------------------------------------------------
// 4. How "card like" is a block?  (filled enough + has an edge)
// ------------------------------------------------------------
function cardness(ink, w, h, b) {
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;

  let filled = 0;
  for (let y = b.y0; y < b.y1; y += 1) {
    for (let x = b.x0; x < b.x1; x += 1) filled += ink[y * w + x];
  }
  const density = filled / (bw * bh);

  // share of the outline that touches ink (within 2 px)
  const t = 2;
  const touch = (x, y) => {
    for (let dy = -t; dy <= t; dy += 1) {
      for (let dx = -t; dx <= t; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && ink[yy * w + xx]) return 1;
      }
    }
    return 0;
  };

  let hit = 0;
  let total = 0;
  for (let x = b.x0; x < b.x1; x += 2) {
    hit += touch(x, b.y0) + touch(x, b.y1 - 1);
    total += 2;
  }
  for (let y = b.y0; y < b.y1; y += 2) {
    hit += touch(b.x0, y) + touch(b.x1 - 1, y);
    total += 2;
  }

  return { density, edge: hit / total };
}

const toFraction = (b, w, h) => ({
  x: b.x0 / w,
  y: b.y0 / h,
  w: (b.x1 - b.x0) / w,
  h: (b.y1 - b.y0) / h,
});

// ------------------------------------------------------------
// 5a. Newer e-PAN layout: the two cards sit inside a tinted panel
//     (dashed border + a line of instructions on top). Cut out
//     only the cards: they are the parts that differ from the panel.
//     Returns { front, back } (pixel boxes) or null.
// ------------------------------------------------------------
function innerCards(rgba, w, s) {
  const ring = Math.max(2, Math.round(Math.min(s.bw, s.bh) * 0.03));

  const chan = [[], [], []];
  for (let y = s.y0; y < s.y1; y += 1) {
    for (let x = s.x0; x < s.x1; x += 1) {
      const edge =
        x < s.x0 + ring || x >= s.x1 - ring || y < s.y0 + ring || y >= s.y1 - ring;
      if (!edge) continue;
      const i = (y * w + x) * 4;
      chan[0].push(rgba[i]);
      chan[1].push(rgba[i + 1]);
      chan[2].push(rgba[i + 2]);
    }
  }

  const median = (list) => list.sort((a, b) => a - b)[list.length >> 1];
  const bg = chan.map(median);

  const differs = (x, y) => {
    const i = (y * w + x) * 4;
    return (
      Math.abs(rgba[i] - bg[0]) +
        Math.abs(rgba[i + 1] - bg[1]) +
        Math.abs(rgba[i + 2] - bg[2]) >
      40
    );
  };

  const runs = (flags, maxGap) => {
    const list = [];
    let start = -1;
    let last = -1;
    for (let i = 0; i <= flags.length; i += 1) {
      if (i < flags.length && flags[i]) {
        if (start < 0) start = i;
        last = i;
      } else if (start >= 0 && (i === flags.length || i - last > maxGap)) {
        list.push([start, last + 1]);
        start = -1;
      }
    }
    return list;
  };

  // columns that are mostly "card"
  const cols = [];
  for (let x = s.x0; x < s.x1; x += 1) {
    let n = 0;
    for (let y = s.y0; y < s.y1; y += 1) if (differs(x, y)) n += 1;
    cols.push(n / s.bh > 0.4);
  }

  const colRuns = runs(cols, 3)
    .filter((r) => r[1] - r[0] > s.bw * 0.25)
    .sort((a, b) => a[0] - b[0]);

  if (colRuns.length !== 2) return null;

  const boxes = colRuns.map(([a, b]) => {
    const rows = [];
    for (let y = s.y0; y < s.y1; y += 1) {
      let n = 0;
      for (let x = s.x0 + a; x < s.x0 + b; x += 1) if (differs(x, y)) n += 1;
      rows.push(n / (b - a) > 0.5);
    }

    const rowRuns = runs(rows, 3).sort((p, q) => q[1] - q[0] - (p[1] - p[0]));
    if (!rowRuns.length) return null;

    return {
      x0: s.x0 + a,
      x1: s.x0 + b,
      y0: s.y0 + rowRuns[0][0],
      y1: s.y0 + rowRuns[0][1],
    };
  });

  if (boxes.some((b) => !b)) return null;

  const [front, back] = boxes;
  const fh = front.y1 - front.y0;
  const bh = back.y1 - back.y0;
  const fr = (front.x1 - front.x0) / fh;
  const br = (back.x1 - back.x0) / bh;

  const okRatio = (r) => r > 1.4 && r < 1.8;
  if (!okRatio(fr) || !okRatio(br) || Math.abs(fh - bh) > Math.max(fh, bh) * 0.08) {
    return null;
  }

  // must really be tighter than the whole strip, otherwise nothing to do
  const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);
  if (area(front) + area(back) > s.bw * s.bh * 0.93) return null;

  return { front, back };
}

// ------------------------------------------------------------
// 5. Generic detector: two cards side by side, or one wide strip
// ------------------------------------------------------------
function findCards(rgba, w, h) {
  const ink = buildMask(rgba, w, h);
  const clean = removeLongLines(ink, w, h);
  const r = Math.max(2, Math.round(w * 0.004));
  const grown = dilate(clean, w, h, r);

  // the grown block is `r` px bigger than the real ink on each side
  const shrink = (b) => ({
    x0: b.x0 > 0 ? b.x0 + r : 0,
    y0: b.y0 > 0 ? b.y0 + r : 0,
    x1: b.x1 < w ? b.x1 - r : w,
    y1: b.y1 < h ? b.y1 - r : h,
  });

  const all = blocks(grown, w, h).map(shrink).map((b) => {
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    return { ...b, bw, bh, ratio: bw / bh };
  });

  const singles = [];
  const strips = [];

  all.forEach((b) => {
    if (b.bh < h * 0.07) return;

    const widthFrac = b.bw / w;
    const single =
      b.ratio > 1.3 && b.ratio < 1.9 && widthFrac > 0.2 && widthFrac < 0.56;
    const strip =
      b.ratio > 2.5 && b.ratio < 4.0 && widthFrac > 0.5 && widthFrac < 0.99;

    if (!single && !strip) return;

    const c = cardness(ink, w, h, b);
    if (c.density < 0.2 || c.edge < 0.7) return;

    (single ? singles : strips).push({ ...b, ...c });
  });

  // two similar cards, same height, side by side
  let bestPair = null;
  for (let i = 0; i < singles.length; i += 1) {
    for (let j = 0; j < singles.length; j += 1) {
      const a = singles[i];
      const b = singles[j];
      if (a === b || a.x0 >= b.x0) continue;

      const sameTop = Math.abs(a.y0 - b.y0) < h * 0.04;
      const sameHeight = Math.abs(a.bh - b.bh) < Math.max(a.bh, b.bh) * 0.15;
      const sameWidth = a.bw / b.bw > 0.75 && a.bw / b.bw < 1.33;
      const gapX = b.x0 - a.x1;

      if (!sameTop || !sameHeight || !sameWidth) continue;
      if (gapX < -w * 0.01 || gapX > w * 0.15) continue;

      const score = a.bw * a.bh + b.bw * b.bh;
      if (!bestPair || score > bestPair.score) bestPair = { a, b, score };
    }
  }

  if (bestPair) {
    return { kind: "pair", front: bestPair.a, back: bestPair.b };
  }

  // one strip: front + back touching -> cut at the emptiest column
  if (strips.length) {
    const s = strips.sort((p, q) => q.bw * q.bh - p.bw * p.bh)[0];
    const mid = (s.x0 + s.x1) / 2;
    const from = Math.round(s.x0 + s.bw * 0.35);
    const to = Math.round(s.x0 + s.bw * 0.65);

    let cut = Math.round(mid);
    let least = Infinity;

    for (let x = from; x <= to; x += 1) {
      let count = 0;
      for (let y = s.y0; y < s.y1; y += 1) count += ink[y * w + x];
      const score = count / s.bh + (Math.abs(x - mid) / s.bw) * 0.1;
      if (score < least) {
        least = score;
        cut = x;
      }
    }

    const inner = innerCards(rgba, w, s);
    if (inner) {
      return { kind: "strip", variant: "panel", front: inner.front, back: inner.back };
    }

    return {
      kind: "strip",
      front: { ...s, x1: cut },
      back: { ...s, x0: cut },
    };
  }

  return null;
}

// ------------------------------------------------------------
// 6. Fixed templates (fractions of the page). Used when the page
//    is the Aadhaar letter, or when the person picks a type.
// ------------------------------------------------------------
export function aadhaarTemplate(content) {
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

const PAN_TEMPLATE = {
  front: { x: 0.088, y: 0.778, w: 0.424, h: 0.19 },
  back: { x: 0.518, y: 0.778, w: 0.468, h: 0.19 },
};

const VOTER_TEMPLATE = {
  front: { x: 0.052, y: 0.102, w: 0.419, h: 0.189 },
  back: { x: 0.55, y: 0.102, w: 0.414, h: 0.189 },
};

// ------------------------------------------------------------
// 7. Main entry
//    type = "auto" | "aadhaar" | "pan" | "voter"
//    content = page content box (fractions), from detectContentBox
//    returns { type, front, back, auto }
// ------------------------------------------------------------
export function detectLayout(rgba, w, h, content, type = "auto") {
  const found = findCards(rgba, w, h);

  const pad = (box) => {
    const px = 0.002;
    const py = 0.002;
    const x = clamp(box.x - px, 0, 1);
    const y = clamp(box.y - py, 0, 1);
    return {
      x,
      y,
      w: clamp(box.w + 2 * px, 0.02, 1 - x),
      h: clamp(box.h + 2 * py, 0.02, 1 - y),
    };
  };

  const fromFound = (guess) => ({
    type: guess,
    front: pad(toFraction(found.front, w, h)),
    back: pad(toFraction(found.back, w, h)),
    variant: found.variant,
    auto: true,
  });

  if (type === "auto") {
    if (found?.kind === "strip") return fromFound("pan");
    if (found?.kind === "pair") {
      const top = found.front.y0 / h;
      return fromFound(top < 0.4 ? "voter" : "cards");
    }

    return { type: "aadhaar", ...aadhaarTemplate(content), auto: true };
  }

  if (type === "aadhaar") {
    return { type, ...aadhaarTemplate(content), auto: false };
  }

  // person picked PAN / Voter: use what was found if it has the
  // right shape, otherwise the typical position of that document
  if (type === "pan" && found?.kind === "strip") return { ...fromFound("pan"), auto: false };
  if (type === "voter" && found?.kind === "pair") return { ...fromFound("voter"), auto: false };

  const template = type === "pan" ? PAN_TEMPLATE : VOTER_TEMPLATE;
  return { type, front: { ...template.front }, back: { ...template.back }, auto: false };
}

export { CARD_RATIO };