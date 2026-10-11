// ============================================================
// PASSPORT PHOTO PRINT  -  Word (.docx) builder
// Loaded only when the user clicks "Download", so the `docx`
// package is not part of the first page load.
//
// The photos sit in a borderless table with fixed cell sizes, so
// every copy prints at the exact passport size (e.g. 35 x 45 mm)
// and the grid stays tidy when edited in Word.
// ============================================================

import {
  Document,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  TableLayoutType,
  HeightRule,
  VerticalAlign,
  LineRuleType,
} from "docx";

import { A4, MARGIN_MM, computeSheet } from "./passportLayout";

const MM_TO_PX = 96 / 25.4; // docx image size is in pixels (96 dpi)
const MM_TO_TWIP = 56.6929;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
};

const twip = (mm) => Math.round(mm * MM_TO_TWIP);

// ------------------------------------------------------------
//    photo  = { data: Uint8Array (jpeg), width, height }
//    size   = { w, h }  in mm
//    copies = 4 | 8 | 12 | "full"
//    gap    = mm between photos
// ------------------------------------------------------------
export function buildPassportDocument({ photo, size, copies, gap }) {
  const sheet = computeSheet({ w: size.w, h: size.h, gap, copies });

  const cellW = twip(sheet.cellW);
  const cellH = twip(sheet.cellH);

  const picture = () =>
    new ImageRun({
      type: "jpg",
      data: photo.data,
      transformation: {
        width: size.w * MM_TO_PX,
        height: size.h * MM_TO_PX,
      },
      altText: {
        title: "Passport photo",
        description: "Passport photo",
        name: "Passport photo",
      },
    });

  const cell = (filled) =>
    new TableCell({
      width: { size: cellW, type: WidthType.DXA },
      borders: NO_BORDERS,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          run: { size: 2 }, // tiny paragraph mark, so no extra line height
          children: filled ? [picture()] : [],
        }),
      ],
    });

  const rows = [];
  let placed = 0;

  for (let r = 0; r < sheet.rows; r += 1) {
    const cells = [];

    for (let c = 0; c < sheet.cols; c += 1) {
      cells.push(cell(placed < sheet.count));
      placed += 1;
    }

    rows.push(
      new TableRow({
        cantSplit: true,
        height: { value: cellH, rule: HeightRule.EXACT },
        children: cells,
      })
    );
  }

  const table = new Table({
    alignment: AlignmentType.CENTER,
    width: { size: cellW * sheet.cols, type: WidthType.DXA },
    columnWidths: Array.from({ length: sheet.cols }, () => cellW),
    layout: TableLayoutType.FIXED,
    borders: {
      ...NO_BORDERS,
      insideHorizontal: NO_BORDER,
      insideVertical: NO_BORDER,
    },
    rows,
  });

  // Word always keeps one paragraph after a table: make it 1 pt high
  const tail = new Paragraph({
    spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
    children: [new TextRun({ text: "", size: 2 })],
  });

  const margin = twip(MARGIN_MM);

  return new Document({
    creator: "Passport Photo Print",
    title: `Passport photos - ${size.w} x ${size.h} mm`,
    sections: [
      {
        properties: {
          page: {
            size: { width: twip(A4.w), height: twip(A4.h) },
            margin: {
              top: margin,
              right: margin,
              bottom: margin,
              left: margin,
            },
          },
        },
        children: [table, tail],
      },
    ],
  });
}
