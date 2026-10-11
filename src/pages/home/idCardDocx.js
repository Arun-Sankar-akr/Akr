// ============================================================
// ID CARD PRINT  -  Word (.docx) builder
// Loaded only when the user clicks "Download", so the `docx`
// package is not part of the first page load.
// ============================================================

import {
  Document,
  Paragraph,
  ImageRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  TableLayoutType,
} from "docx";

// ------------------------------------------------------------
// Word document (A4)
//    front / back = { data: Uint8Array (png), width, height }
//    layout       = "stacked" | "side"
//    scale        = 1 (real card size 85.6 x 54 mm), 1.25, 1.5
// ------------------------------------------------------------
const CARD_WIDTH_MM = 85.6;
const MM_TO_PX = 96 / 25.4; // docx image size is in pixels (96 dpi)
const MM_TO_TWIP = 56.6929;

const cardImage = (card, label, scale) => {
  const widthPx = CARD_WIDTH_MM * scale * MM_TO_PX;
  const heightPx = (widthPx * card.height) / card.width;

  return new ImageRun({
    type: "png",
    data: card.data,
    transformation: {
      width: Math.round(widthPx),
      height: Math.round(heightPx),
    },
    altText: {
      title: label,
      description: label,
      name: label,
    },
  });
};

const NO_BORDER = {
  style: BorderStyle.NONE,
  size: 0,
  color: "FFFFFF",
};

const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
};

export function buildIdCardDocument({
  front,
  back,
  layout = "stacked",
  scale = 1,
}) {
  const sideBySide = layout === "side";
  const marginMm = sideBySide ? 12 : 20;
  const margin = Math.round(marginMm * MM_TO_TWIP);

  let children;

  if (sideBySide) {
    const usable = Math.round((210 - marginMm * 2) * MM_TO_TWIP);
    const half = Math.floor(usable / 2);

    const cell = (card, label) =>
      new TableCell({
        width: { size: half, type: WidthType.DXA },
        borders: NO_BORDERS,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [cardImage(card, label, 1)],
          }),
        ],
      });

    children = [
      new Table({
        width: { size: half * 2, type: WidthType.DXA },
        columnWidths: [half, half],
        layout: TableLayoutType.FIXED,
        borders: {
          ...NO_BORDERS,
          insideHorizontal: NO_BORDER,
          insideVertical: NO_BORDER,
        },
        rows: [
          new TableRow({
            children: [cell(front, "Front side"), cell(back, "Back side")],
          }),
        ],
      }),
    ];
  } else {
    children = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
        children: [cardImage(front, "Front side", scale)],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [cardImage(back, "Back side", scale)],
      }),
    ];
  }

  return new Document({
    creator: "ID Card Print",
    title: "ID card - front and back",
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: {
              top: margin,
              right: margin,
              bottom: margin,
              left: margin,
            },
          },
        },
        children,
      },
    ],
  });
}
