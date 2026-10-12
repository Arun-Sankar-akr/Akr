const CARD_WIDTH_MM = 85.6;
const A4_W_MM = 210;
const A4_H_MM = 297;
const GAP_MM = 10;
const PT = 72 / 25.4; // mm -> PDF points

const cardSizeMm = (card, scale) => {
  const w = CARD_WIDTH_MM * scale;
  return { w, h: (w * card.height) / card.width };
};

const text = (value) => new TextEncoder().encode(value);

export function buildIdCardPdf({ front, back, layout = "stacked", scale = 1 }) {
  const sideBySide = layout === "side";
  const marginMm = sideBySide ? 12 : 20;
  const s = sideBySide ? 1 : scale;

  const f = cardSizeMm(front, s);
  const b = cardSizeMm(back, s);

  let fp;
  let bp;

  if (sideBySide) {
    const startX = Math.max(0, (A4_W_MM - (f.w + GAP_MM + b.w)) / 2);
    fp = { x: startX, y: marginMm };
    bp = { x: startX + f.w + GAP_MM, y: marginMm };
  } else {
    fp = { x: (A4_W_MM - f.w) / 2, y: marginMm };
    bp = { x: (A4_W_MM - b.w) / 2, y: marginMm + f.h + GAP_MM };
  }

  const pageW = (A4_W_MM * PT).toFixed(2);
  const pageH = (A4_H_MM * PT).toFixed(2);

  // draw one image: PDF origin is the bottom-left corner
  const place = (name, pos, size) => {
    const w = (size.w * PT).toFixed(2);
    const h = (size.h * PT).toFixed(2);
    const x = (pos.x * PT).toFixed(2);
    const y = ((A4_H_MM - pos.y - size.h) * PT).toFixed(2);
    return `q ${w} 0 0 ${h} ${x} ${y} cm /${name} Do Q\n`;
  };

  const content = place("Im1", fp, f) + place("Im2", bp, b);

  const image = (card) => [
    text(
      `<< /Type /XObject /Subtype /Image /Width ${card.width} /Height ${card.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${card.data.length} >>\nstream\n`
    ),
    card.data,
    text("\nendstream"),
  ];

  const objects = [
    [text("<< /Type /Catalog /Pages 2 0 R >>")],
    [text("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")],
    [
      text(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
          `/Resources << /XObject << /Im1 5 0 R /Im2 6 0 R >> >> /Contents 4 0 R >>`
      ),
    ],
    [text(`<< /Length ${content.length} >>\nstream\n${content}endstream`)],
    image(front),
    image(back),
  ];

  const chunks = [text("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n")];
  const offsets = [];
  let length = chunks[0].length;

  objects.forEach((parts, index) => {
    offsets.push(length);

    const open = text(`${index + 1} 0 obj\n`);
    const close = text("\nendobj\n");

    [open, ...parts, close].forEach((chunk) => {
      chunks.push(chunk);
      length += chunk.length;
    });
  });

  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  xref +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${length}\n%%EOF`;

  chunks.push(text(xref));

  return new Blob(chunks, { type: "application/pdf" });
}