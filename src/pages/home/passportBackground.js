// ============================================================
// PASSPORT PHOTO PRINT  -  background colour changer (no imports)
//
// Works fully in the browser, no AI model and no upload:
//   1. finds the background colour from the edges of the photo
//   2. flood-fills inwards from the edges while the colour stays
//      close to it (so the person is never touched)
//   3. soft edge + colour clean-up, then paints the new colour
//
// Best with a plain wall / sheet behind the person.
// ============================================================

export const BG_PRESETS = [
    { id: "white", label: "White", color: "#ffffff" },
    { id: "offwhite", label: "Off-white", color: "#f3f1ec" },
    { id: "lightblue", label: "Light blue", color: "#cfe3f6" },
    { id: "blue", label: "Blue", color: "#4a7ec2" },
    { id: "red", label: "Red", color: "#c8372d" },
    { id: "grey", label: "Light grey", color: "#e2e4e8" },
];

export const DEFAULT_BG = {
    on: false,
    color: "#ffffff",
    sensitivity: 40, // 0..100  higher = removes more of the old background
    smooth: 40, // 0..100  edge softness
};

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

export const hexToRgb = (hex) => {
    const value = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    const n = value ? parseInt(value[1], 16) : 0xffffff;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (r, g, b) =>
    `#${[r, g, b]
        .map((v) => Math.round(v).toString(16).padStart(2, "0"))
        .join("")}`;

// "redmean" colour distance: closer to what the eye sees than plain RGB
const distance = (r1, g1, b1, r2, g2, b2) => {
    const rm = (r1 + r2) / 2;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;

    return Math.sqrt(
        (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db
    );
};

// median colour of the top and side edges (hair / shoulders are ignored)
function estimateBackground(d, w, h) {
    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    let total = 0;

    const add = (x, y) => {
        const i = (y * w + x) * 4;
        hist[0][d[i]] += 1;
        hist[1][d[i + 1]] += 1;
        hist[2][d[i + 2]] += 1;
        total += 1;
    };

    const topRows = Math.max(2, Math.round(h * 0.05));
    const sideCols = Math.max(2, Math.round(w * 0.05));
    const sideRows = Math.round(h * 0.6);

    for (let y = 0; y < topRows; y += 1) for (let x = 0; x < w; x += 1) add(x, y);

    for (let y = topRows; y < sideRows; y += 1) {
        for (let x = 0; x < sideCols; x += 1) {
            add(x, y);
            add(w - 1 - x, y);
        }
    }

    const median = (counts) => {
        let sum = 0;
        for (let v = 0; v < 256; v += 1) {
            sum += counts[v];
            if (sum >= total / 2) return v;
        }
        return 255;
    };

    return [median(hist[0]), median(hist[1]), median(hist[2])];
}

// small box blur of a 0..1 mask (radius 1 = 3x3, done in two passes)
function blurMask(mask, w, h, radius) {
    if (radius < 1) return mask;

    const tmp = new Float32Array(mask.length);
    const out = new Float32Array(mask.length);
    const span = radius * 2 + 1;

    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            let sum = 0;
            for (let k = -radius; k <= radius; k += 1) {
                const xx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
                sum += mask[y * w + xx];
            }
            tmp[y * w + x] = sum / span;
        }
    }

    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            let sum = 0;
            for (let k = -radius; k <= radius; k += 1) {
                const yy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
                sum += tmp[yy * w + x];
            }
            out[y * w + x] = sum / span;
        }
    }

    return out;
}

// ------------------------------------------------------------
// Edits RGBA data in place. Returns the detected old background
// colour as "#rrggbb".
// ------------------------------------------------------------
export function replaceBackgroundData(d, w, h, options) {
    const [nr, ng, nb] = hexToRgb(options.color);
    const [br, bg, bb] = estimateBackground(d, w, h);

    const hi = 25 + options.sensitivity * 2.5; // fully background up to here
    const lo = hi * 0.5; // fully person below here, soft in between

    const dist = new Float32Array(w * h);
    for (let p = 0; p < w * h; p += 1) {
        dist[p] = distance(d[p * 4], d[p * 4 + 1], d[p * 4 + 2], br, bg, bb);
    }

    // flood fill from every edge pixel that looks like the background
    const reach = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let top = 0;

    const push = (p) => {
        if (!reach[p] && dist[p] <= hi) {
            reach[p] = 1;
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

    while (top > 0) {
        top -= 1;
        const p = stack[top];
        const x = p % w;

        if (x > 0) push(p - 1);
        if (x < w - 1) push(p + 1);
        if (p >= w) push(p - w);
        if (p < w * (h - 1)) push(p + w);
    }

    // 1 = background, 0 = person, soft values on the edge
    let mask = new Float32Array(w * h);
    for (let p = 0; p < w * h; p += 1) {
        if (!reach[p]) continue;

        const t = (dist[p] - lo) / (hi - lo);
        mask[p] = t <= 0 ? 1 : t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
    }

    mask = blurMask(mask, w, h, Math.round((options.smooth / 100) * 2));

    // paint the new colour; clean the old colour out of the edge pixels
    for (let p = 0; p < w * h; p += 1) {
        const a = mask[p];
        if (a <= 0.003) continue;

        const i = p * 4;
        const keep = 1 - a;

        if (keep < 0.01) {
            d[i] = nr;
            d[i + 1] = ng;
            d[i + 2] = nb;
            continue;
        }

        const k = Math.max(keep, 0.3);
        const fr = clamp255((d[i] - (1 - k) * br) / k);
        const fg = clamp255((d[i + 1] - (1 - k) * bg) / k);
        const fb = clamp255((d[i + 2] - (1 - k) * bb) / k);

        d[i] = keep * fr + a * nr;
        d[i + 1] = keep * fg + a * ng;
        d[i + 2] = keep * fb + a * nb;
    }

    return toHex(br, bg, bb);
}

// canvas wrapper: edits the whole canvas, returns the old colour
export function replaceBackground(canvas, options) {
    const ctx = canvas.getContext("2d");
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const found = replaceBackgroundData(
        image.data,
        canvas.width,
        canvas.height,
        options
    );

    ctx.putImageData(image, 0, 0);

    return found;
}