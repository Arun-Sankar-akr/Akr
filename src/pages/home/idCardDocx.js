import {
  Document,
  Paragraph,
  ImageRun,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  TextWrappingSide,
} from "docx";

const CARD_WIDTH_MM = 85.6;
const A4_WIDTH_MM = 210;
const GAP_MM = 10; // space between the two cards

const MM_TO_PX = 96 / 25.4; // docx image size is in pixels (96 dpi)
const MM_TO_TWIP = 56.6929;
const MM_TO_EMU = 36000; // floating position is in EMU

// card size in mm for a given scale
const cardSizeMm = (card, scale) => {
  const w = CARD_WIDTH_MM * scale;
  return { w, h: (w * card.height) / card.width };
};

// Floating picture: placed at (xMm, yMm) from the top-left corner
// of the PAGE, wrapped "square" so it can be dragged anywhere.
const cardImage = (card, label, scale, xMm, yMm) => {
  const size = cardSizeMm(card, scale);

  return new ImageRun({
    type: "png",
    data: card.data,
    transformation: {
      width: Math.round(size.w * MM_TO_PX),
      height: Math.round(size.h * MM_TO_PX),
    },
    floating: {
      horizontalPosition: {
        relative: HorizontalPositionRelativeFrom.PAGE,
        offset: Math.round(xMm * MM_TO_EMU),
      },
      verticalPosition: {
        relative: VerticalPositionRelativeFrom.PAGE,
        offset: Math.round(yMm * MM_TO_EMU),
      },
      wrap: {
        type: TextWrappingType.SQUARE,
        side: TextWrappingSide.BOTH_SIDES,
      },
      allowOverlap: true,
      lockAnchor: false,
      behindDocument: false,
    },
    altText: {
      title: label,
      description: label,
      name: label,
    },
  });
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

  // side by side keeps the real card size, stacked uses the chosen scale
  const s = sideBySide ? 1 : scale;
  const f = cardSizeMm(front, s);
  const b = cardSizeMm(back, s);

  let frontPos;
  let backPos;

  if (sideBySide) {
    const total = f.w + GAP_MM + b.w;
    const startX = Math.max(0, (A4_WIDTH_MM - total) / 2);

    frontPos = { x: startX, y: marginMm };
    backPos = { x: startX + f.w + GAP_MM, y: marginMm };
  } else {
    frontPos = { x: (A4_WIDTH_MM - f.w) / 2, y: marginMm };
    backPos = { x: (A4_WIDTH_MM - b.w) / 2, y: marginMm + f.h + GAP_MM };
  }

  // each floating picture is anchored to its own paragraph
  const children = [
    new Paragraph({
      children: [
        cardImage(front, "Front side", s, frontPos.x, frontPos.y),
      ],
    }),
    new Paragraph({
      children: [cardImage(back, "Back side", s, backPos.x, backPos.y)],
    }),
  ];

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